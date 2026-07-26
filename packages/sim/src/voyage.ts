/**
 * Casting off. Spec 002 TR-1 to TR-5, TR-10. Design doc §5.1, §5.2.
 *
 * The astrogator computes and the representative chooses. That division is the
 * whole design: nobody is asked to read a porkchop plot, and nobody is offered
 * a decision the numbers do not actually support.
 *
 * TR-3b -- **no fake choices** -- is the rule that shapes this file. Every
 * option is a real trajectory priced by real mechanics, no two options are the
 * same trade wearing different words, and an option the ship cannot fly is
 * marked infeasible with the reason rather than offered and then refused. A
 * choice the ship cannot take is still information: it tells the player what a
 * bigger tank would buy.
 *
 * Mass is the quiet part. Cargo rides in the wet mass of the rocket equation,
 * so a full hold costs propellant on every burn (TR-10) -- which is what makes
 * the fattest contract not automatically the best one.
 */
import { getContract, getHull, getPort } from '@solsyn/data'
import { pushLog } from './log.js'
import { propellantForDeltaV, stretchedTransfer } from './orbits.js'
import { levelAt, settle } from './resources.js'
import { DAY, formatDuration, type GameTime } from './time.js'
import type { SimState } from './types.js'

/** Specific impulse of the NTR cluster, seconds. Design §3.4. */
export const ENGINE_ISP_S = 1200

/**
 * Reserve the astrogator will not plan into: propellant for one abort or one
 * botched approach. Spending the tank to the last kilo is how ships get
 * stranded, and §7.4 says the game does not do that quietly.
 */
export const PROPELLANT_RESERVE_KG = 900

/**
 * Plane change and insertion for a hop between two orbits around one body.
 * Small next to an escape, and not zero -- arriving somewhere is never free.
 */
export const SAME_BODY_INSERTION_MS = 260

export interface VoyageState {
  optionId: string
  fromPortId: string
  toPortId: string
  departedAt: GameTime
  arrivesAt: GameTime
  deltaVMs: number
  propellantSpentKg: number
}

/** Everything aboard, including cargo -- what the rocket equation acts on. */
export function wetMassKg(state: SimState, t: GameTime): number {
  const hull = getHull(state.ship.hullId)
  const r = state.ship.resources
  return (
    hull.dryMassKg +
    state.ship.cargoKg +
    levelAt(r.propellant, t) +
    levelAt(r.water, t) +
    levelAt(r.food, t) +
    levelAt(r.o2, t)
  )
}

export interface TransferOption {
  id: string
  label: string
  /** What choosing this actually means, in a sentence the desk can act on. */
  summary: string
  deltaVMs: number
  durationS: number
  propellantKg: number
  /** Can the ship fly it with the propellant it has, keeping a reserve? */
  feasible: boolean
  /** Why not, when it cannot. */
  why?: string
  /** Does it land inside the contract's deadline? */
  onTime: boolean
}

/** The trajectories the astrogator works up. Slower is always cheaper. */
const PROFILES = [
  { id: 'economy', label: 'Minimum energy', multiplier: 1 },
  { id: 'standard', label: 'Standard transfer', multiplier: 1.04 },
  { id: 'express', label: 'Express', multiplier: 1.12 },
] as const

/**
 * What the astrogator can offer right now. Empty without a contract: there is
 * nowhere to go, and an option to go nowhere is exactly the fake choice TR-3b
 * forbids.
 */
export function transferOptions(state: SimState): TransferOption[] {
  const held = state.contract
  if (!held || !state.ship.docked) return []
  const def = getContract(held.defId)

  const from = getPort(state.ship.portId)
  const to = getPort(def.toPortId)
  const wet = wetMassKg(state, state.now)
  const available = levelAt(state.ship.resources.propellant, state.now)

  // Two ports around the same body are not two escapes: the ship never leaves
  // that well, it moves between orbits inside it. Charging both escapes would
  // make a Gateway-to-Luna hop cost more than the ship can ever carry, which
  // is how the first version of this priced the opening contract out of reach.
  const sameBody = from.bodyId === to.bodyId
  const wellDeltaV = sameBody
    ? Math.abs(from.escapeDeltaVMs - to.escapeDeltaVMs) + SAME_BODY_INSERTION_MS
    : from.escapeDeltaVMs + to.escapeDeltaVMs

  return PROFILES.map((profile) => {
    // Two ports on one body have no transfer ellipse between them: the whole
    // cost is the wells, and "faster" means a more direct, dearer burn.
    const leg = sameBody
      ? {
          deltaVMs: wellDeltaV * (profile.multiplier - 1) * 4,
          durationS: (5 * DAY) / profile.multiplier ** 3,
        }
      : stretchedTransfer(from.bodyId, to.bodyId, profile.multiplier)

    const deltaVMs = wellDeltaV + leg.deltaVMs
    const propellantKg = propellantForDeltaV(wet, deltaVMs, ENGINE_ISP_S)
    const spare = available - PROPELLANT_RESERVE_KG
    const feasible = propellantKg <= spare
    const durationS = leg.durationS
    const onTime = state.now + durationS <= held.dueAt

    const shortfall = propellantKg - spare
    return {
      id: profile.id,
      label: profile.label,
      summary: summarise(profile.label, deltaVMs, durationS, onTime, held.dueAt, state.now),
      deltaVMs,
      durationS,
      propellantKg,
      feasible,
      ...(feasible
        ? {}
        : {
            why: `Needs ${(shortfall / 1000).toFixed(1)} t more than the tank can spare, keeping ${(PROPELLANT_RESERVE_KG / 1000).toFixed(1)} t in reserve.`,
          }),
      onTime,
    }
  })
}

function summarise(
  label: string,
  deltaVMs: number,
  durationS: number,
  onTime: boolean,
  dueAt: GameTime,
  now: GameTime,
): string {
  const days = Math.round(durationS / DAY)
  const slack = Math.round((dueAt - (now + durationS)) / DAY)
  const timing = onTime
    ? `Beats the deadline by ${slack} days.`
    : `Arrives ${Math.abs(slack)} days late.`
  return `${label}: ${(deltaVMs / 1000).toFixed(1)} km/s over ${days} days. ${timing}`
}

/**
 * Cast off. Spends the propellant, undocks, and schedules the arrival.
 *
 * Deliberately does nothing if the option is not on the table or not flyable:
 * having marked an option infeasible, offering to fly it anyway would make the
 * marking a lie.
 */
export function depart(state: SimState, optionId: string, at: GameTime): boolean {
  const option = transferOptions(state).find((o) => o.id === optionId)
  if (!option || !option.feasible) return false
  const held = state.contract
  if (!held) return false
  const def = getContract(held.defId)

  const propellant = state.ship.resources.propellant
  settle(propellant, at)
  propellant.value = Math.max(0, propellant.value - option.propellantKg)

  state.voyage = {
    optionId: option.id,
    fromPortId: state.ship.portId,
    toPortId: def.toPortId,
    departedAt: at,
    arrivesAt: at + option.durationS,
    deltaVMs: option.deltaVMs,
    propellantSpentKg: option.propellantKg,
  }
  state.ship.docked = false

  pushLog(
    state,
    at,
    'info',
    `Departed ${getPort(state.ship.portId).name} for ${getPort(def.toPortId).name}. ${(option.deltaVMs / 1000).toFixed(1)} km/s, ${(option.propellantKg / 1000).toFixed(1)} t of propellant, ${formatDuration(option.durationS)} under way.`,
  )
  return true
}

/** Arrival. Berths the ship; the books are settled by the reconciliation step. */
export function arrive(state: SimState, at: GameTime): void {
  const voyage = state.voyage
  if (!voyage) return

  state.ship.portId = voyage.toPortId
  state.ship.docked = true
  state.voyage = undefined

  pushLog(state, at, 'info', `Berthed at ${getPort(voyage.toPortId).name}.`)
}

export interface VoyageView extends VoyageState {
  daysRemaining: number
  fractionComplete: number
}

export function voyageView(state: SimState): VoyageView | undefined {
  const v = state.voyage
  if (!v) return undefined
  const total = v.arrivesAt - v.departedAt
  return {
    ...v,
    daysRemaining: (v.arrivesAt - state.now) / DAY,
    fractionComplete: total > 0 ? Math.min(1, (state.now - v.departedAt) / total) : 1,
  }
}
