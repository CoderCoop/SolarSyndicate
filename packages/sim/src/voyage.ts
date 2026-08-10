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
import { beginResupply, endResupply, resupplying } from './resupply.js'
import { reconcileArrival } from './reconcile.js'
import {
  AU,
  G0,
  MU_SUN,
  burnSplit,
  hohmannTransfer,
  phasingWaitS,
  portAngleAt,
  propellantForDeltaV,
  speedOnEllipse,
  stretchedBetween,
  transferStateAt,
  type Transfer,
} from './orbits.js'
import { interplanetaryLeg, orbitStateAt, type TransferOrbit } from './lambert.js'
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

/**
 * The trajectories the astrogator works up. Design doc §5.2, spec TR-3b.
 *
 * A crossing between two worlds is now chosen by **how long it takes**, and the
 * price falls out of the geometry. That is the right way round: the ellipse
 * that connects two moving bodies in a stated time is Lambert's problem and has
 * exactly one answer, whereas stretching a semi-major axis by a multiplier
 * chose a *shape* and left the arrival to land wherever it landed.
 *
 * `timeFraction` is of the Hohmann time between the two orbits, which is a
 * constant per pair and so gives every crossing the same three choices. Near a
 * window slower really is cheaper; far from one the ordering can invert, and
 * saying so in a comment is cheaper than pretending otherwise -- every option
 * carries its own delta-v and the desk can read them.
 *
 * `multiplier` still governs crossings *inside* one gravity well, where the two
 * berths are on fixed rings and stretching the ellipse is exactly what the
 * choice is.
 */
const PROFILES = [
  { id: 'economy', label: 'Minimum energy', multiplier: 1, timeFraction: 1 },
  { id: 'standard', label: 'Standard transfer', multiplier: 1.04, timeFraction: 0.85 },
  { id: 'express', label: 'Express', multiplier: 1.12, timeFraction: 0.65 },
] as const

export type TransferProfile = (typeof PROFILES)[number]

/**
 * Which trajectory a voyage is flying. Exported because the geometry of the
 * crossing belongs to the profile, not to the voyage record -- the chart has
 * to be able to draw the ellipse that was actually chosen rather than assume
 * the minimum-energy one, which is what it did until this was reachable.
 *
 * Falls back to minimum energy so a save written by a build with a profile
 * this one has never heard of still draws something true about the ship.
 */
export function transferProfile(optionId: string): TransferProfile {
  return PROFILES.find((p) => p.id === optionId) ?? PROFILES[0]
}


/**
 * One crossing, solved. Design doc §5.2.
 *
 * The single place a trajectory is worked out, so the astrogator's price, the
 * telemetry readout and the arc on the chart are three readings of one object
 * rather than three calculations that agree until one is changed. Returns
 * undefined when the geometry has no such orbit at all -- which is information
 * (TR-3b), not a reason to substitute something plausible.
 */
export interface Crossing {
  /** Delta-v of the transfer itself, m/s. Excludes escaping either well. */
  deltaVMs: number
  departureDeltaVMs: number
  arrivalDeltaVMs: number
  /** Coast in the parking orbit before the burn. In-well crossings only. */
  waitS: number
  /** Time under the transfer. */
  flightS: number
  /** Both together, which is what the contract's deadline is measured against. */
  durationS: number
  /** The heliocentric ellipse, for a crossing between worlds. */
  orbit?: TransferOrbit
  /** The in-well ellipse, for a crossing between two berths at one world. */
  well?: { leg: Transfer; mu: number; r1: number; r2: number; departureAngleRad: number }
}

export function crossing(
  fromPortId: string,
  toPortId: string,
  departAt: GameTime,
  optionId: string,
): Crossing | undefined {
  const from = getPort(fromPortId)
  const to = getPort(toPortId)
  const profile = transferProfile(optionId)

  if (from.bodyId === to.bodyId) {
    // Two berths around one world. The ellipse is chosen by shape, because both
    // ends sit on fixed rings and the wait for the geometry is minutes.
    const mu = getBody(from.bodyId).muM3S2
    const r1 = from.orbitRadiusKm * 1000
    const r2 = to.orbitRadiusKm * 1000
    const leg = stretchedBetween(mu, r1, r2, profile.multiplier)
    const waitS = phasingWaitS(from.id, to.id, departAt, profile.multiplier)
    const split = burnSplit(mu, r1, r2, leg.semiMajorAxisM)
    return {
      deltaVMs: leg.deltaVMs,
      departureDeltaVMs: split.departureMs,
      arrivalDeltaVMs: split.arrivalMs,
      waitS,
      flightS: leg.durationS,
      durationS: waitS + leg.durationS,
      well: { leg, mu, r1, r2, departureAngleRad: portAngleAt(from.id, departAt + waitS) },
    }
  }

  // Between worlds: the ellipse that connects where she is to where the target
  // will be, in the time this profile buys. Leaving off the window is not
  // forbidden -- it is priced, which is what §5.1 means by launch windows being
  // real gameplay.
  const flightS = hohmannTransfer(from.bodyId, to.bodyId).durationS * profile.timeFraction
  const leg = interplanetaryLeg(from.bodyId, to.bodyId, departAt, flightS)
  if (!leg) return undefined
  return {
    deltaVMs: leg.deltaVMs,
    departureDeltaVMs: leg.departureDeltaVMs,
    arrivalDeltaVMs: leg.arrivalDeltaVMs,
    waitS: 0,
    flightS,
    durationS: flightS,
    orbit: leg.orbit,
  }
}

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
    const solved = crossing(from.id, to.id, state.now, profile.id)
    const spare = available - PROPELLANT_RESERVE_KG

    if (!solved) {
      // No orbit connects the two in that time. Shown rather than dropped, with
      // the reason, because "there is no such trajectory" is a fact about the
      // solar system the player is entitled to (TR-3b).
      return {
        id: profile.id,
        label: profile.label,
        summary: `${profile.label}: no trajectory connects the two in that time.`,
        deltaVMs: 0,
        durationS: 0,
        propellantKg: 0,
        feasible: false,
        why: 'No orbit joins the two worlds over this crossing time.',
        onTime: false,
      }
    }

    const deltaVMs = wellDeltaV + solved.deltaVMs
    const propellantKg = propellantForDeltaV(wet, deltaVMs, ENGINE_ISP_S)
    const feasible = propellantKg <= spare
    const durationS = solved.durationS
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
  // Say what came aboard before the pumps stop, while the stores still hold
  // the numbers to difference against.
  endResupply(state, at, 'Cast off.')
  state.ship.docked = false

  pushLog(
    state,
    at,
    'info',
    'voyage',
    `Departed ${getPort(state.ship.portId).name} for ${getPort(def.toPortId).name}. ${(option.propellantKg / 1000).toFixed(1)} t of propellant, ${formatDuration(option.durationS)} under way.`,
    `${(option.deltaVMs / 1000).toFixed(1)} km/s`,
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

  pushLog(state, at, 'info', 'voyage', `Berthed at ${getPort(voyage.toPortId).name}.`)
  // Berthed first, so the books settle at the arrival port's prices (TR-19).
  reconcileArrival(state, at)

  // Then the pumps, and a line saying so -- after the settlement, or the
  // station's first kilogramme would land inside the crossing it is being
  // measured against.
  if (resupplying(state)) {
    beginResupply(state, at)
    pushLog(
      state,
      at,
      'info',
      'ship',
      `Station services connected at ${getPort(voyage.toPortId).name}. Stores are topping up.`,
    )
  }
}

/** One end of the crossing, as the crew actually experience it. */
export interface Burn {
  kind: 'departure' | 'arrival'
  deltaVMs: number
  durationS: number
  /** Acceleration at the start of the burn, in g. It rises as tanks empty. */
  gees: number
}

export interface VoyageView extends VoyageState {
  daysRemaining: number
  fractionComplete: number
  /**
   * What the ship is doing now.
   *
   * Three states, not a continuum, because a Hohmann-class transfer really is
   * three things: a burn, a long fall, and a burn (§3.4, §5.2). Nothing is
   * under thrust in the middle, and saying so is more honest than inventing a
   * number to fill the gap.
   */
  phase: 'departure' | 'coast' | 'arrival'
  /** Speed relative to the body being orbited, m/s. Real, and it varies. */
  speedMs: number
  /** Thrust now, kN. Zero for all but the first and last minutes. */
  thrustKn: number
  /** Acceleration now, in g. Zero on the coast: the crew are in free fall. */
  gees: number
  burns: Burn[]
}

export function voyageView(state: SimState): VoyageView | undefined {
  const v = state.voyage
  if (!v) return undefined
  const total = v.arrivesAt - v.departedAt
  const elapsed = state.now - v.departedAt

  const from = getPort(v.fromPortId)
  const to = getPort(v.toPortId)
  const sameBody = from.bodyId === to.bodyId
  const profile = transferProfile(v.optionId)

  // Recomputed rather than stored. The trajectory is a pure function of where
  // the ship left, where it is going and which profile was chosen -- all of
  // which the voyage already records -- so putting the geometry in the save
  // would only be a second copy of it to keep in step.
  const solved = crossing(from.id, to.id, v.departedAt, v.optionId)
  const mu = sameBody ? getBody(from.bodyId).muM3S2 : MU_SUN

  // Where she is on that ellipse right now. Between worlds the ellipse is the
  // Lambert solution; in a well it is the stretched one, and the transfer
  // carries which apsis she left from so an inbound leg starts at the slow end
  // rather than being reported at periapsis speed the moment she casts off.
  const flown = Math.max(0, elapsed - (solved?.waitS ?? 0))
  const a = solved?.orbit
    ? solved.orbit.semiMajorAxisM
    : (solved?.well?.leg.semiMajorAxisM ?? 1)
  const r = solved?.orbit
    ? orbitStateAt(solved.orbit, flown).radiusM
    : solved?.well
      ? transferStateAt(solved.well.leg, mu, flown).radiusM
      : (from.orbitRadiusKm * 1000)

  const hull = getHull(state.ship.hullId)
  const wet = wetMassKg(state, state.now)
  const massFlowKgS = (hull.thrustKn * 1000) / (hull.ispS * G0)

  const burns: Burn[] = (['departure', 'arrival'] as const).map((kind) => {
    const deltaVMs =
      kind === 'departure'
        ? (solved?.departureDeltaVMs ?? 0)
        : (solved?.arrivalDeltaVMs ?? 0)
    const propellantKg = propellantForDeltaV(wet, deltaVMs, hull.ispS)
    return {
      kind,
      deltaVMs,
      durationS: propellantKg / massFlowKgS,
      gees: (hull.thrustKn * 1000) / (wet * G0),
    }
  })

  const [departureBurn, arrivalBurn] = burns as [Burn, Burn]
  const phase: VoyageView['phase'] =
    elapsed < departureBurn.durationS
      ? 'departure'
      : state.now > v.arrivesAt - arrivalBurn.durationS
        ? 'arrival'
        : 'coast'
  const burning = phase !== 'coast'

  return {
    ...v,
    daysRemaining: (v.arrivesAt - state.now) / DAY,
    fractionComplete: total > 0 ? Math.min(1, elapsed / total) : 1,
    phase,
    speedMs: speedOnEllipse(mu, r, a),
    thrustKn: burning ? hull.thrustKn : 0,
    gees: burning ? (hull.thrustKn * 1000) / (wet * G0) : 0,
    burns,
  }
}

/** Where the ship is, in one line, for the bar that is always on screen. */
export interface Whereabouts {
  docked: boolean
  /** "Gateway Station", or "Gateway → Tranquillity" under way. */
  place: string
  /** "Berthed" or "Coasting · 1.2 km/s · 0 g". */
  detail: string
  /** 0–1 under way, undefined alongside. */
  fractionComplete?: number
  /** Recovered after losing her crew, and not yet re-crewed (§7.4). */
  salvage?: boolean
}

export function whereabouts(state: SimState): Whereabouts {
  const v = voyageView(state)
  if (!v || state.ship.docked) {
    return {
      docked: true,
      place: getPort(state.ship.portId).name,
      // Salvage outranks anything else the bar could say about her. It is the
      // only state in the game the player cannot trade their way out of
      // without acting, so the always-visible line carries it (§7.4).
      detail: state.ship.recovered
        ? 'Under salvage · no crew aboard'
        : state.contract
          ? 'Berthed · cargo aboard'
          : 'Berthed',
      ...(state.ship.recovered ? { salvage: true } : {}),
    }
  }

  const speed = `${(v.speedMs / 1000).toFixed(2)} km/s`
  const phase =
    v.phase === 'coast'
      ? `Coasting · ${speed} · 0 g`
      : `${v.phase === 'departure' ? 'Departure' : 'Arrival'} burn · ${speed} · ${v.gees.toFixed(2)} g`

  return {
    docked: false,
    place: `${getPort(v.fromPortId).name} → ${getPort(v.toPortId).name}`,
    detail: `${phase} · ${formatDuration(Math.max(0, v.arrivesAt - state.now))} out`,
    fractionComplete: v.fractionComplete,
  }
}
