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
import { getBody, getContract, getHull, getPort } from '@solsyn/data'
import { pushLog } from './log.js'
import { reconcileArrival } from './reconcile.js'
import { propellantForDeltaV, stretchedBetween, stretchedTransfer } from './orbits.js'
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

  // A ship moving between two orbits around one body never leaves that well,
  // so there is no escape to pay for -- the transfer between the two radii is
  // the entire cost, and it is computed below with the rest of the mechanics.
  const sameBody = from.bodyId === to.bodyId
  const wellDeltaV = sameBody ? 0 : from.escapeDeltaVMs + to.escapeDeltaVMs

  return PROFILES.map((profile) => {
    // Two ports around one body is the same problem as two planets around the
    // sun -- only the primary changes. Solving it with the same vis-viva and
    // Kepler maths is what finally removed the hand-set five-day, 1.59 km/s
    // Luna hop that sat next to honestly derived interplanetary legs for two
    // milestones. The honest figure is 3.91 km/s, and the tank was sized to
    // afford it rather than the price being bent to fit the tank (§5.2).
    const leg = sameBody
      ? stretchedBetween(
          getBody(from.bodyId).muM3S2,
          from.orbitRadiusKm * 1000,
          to.orbitRadiusKm * 1000,
          profile.multiplier,
        )
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
  // Berthed first, so the books settle at the arrival port's prices (TR-19).
  reconcileArrival(state, at)
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
