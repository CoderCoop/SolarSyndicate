/**
 * Orbits and transfers. Design doc §5.1, §5.2.
 *
 * Deliberately simple, honestly derived. Bodies travel circular coplanar
 * orbits at their real radii and periods, so a position is a closed-form
 * function of time (constitution V, VI) and catch-up never needs to integrate
 * anything. Transfers are Hohmann conics, which are the cheapest two-burn
 * solution between circular orbits and cost what textbooks say they cost.
 *
 * What this does not model: inclination, eccentricity, n-body perturbation,
 * or continuous low thrust. Those are simplifications the game states rather
 * than hides — and the numbers that survive them are the ones the player
 * actually spends.
 */
import { getBody, getPort } from '@solsyn/data'
import { DAY, type GameTime } from './time.js'

/** Standard gravitational parameter of the Sun, m^3/s^2. */
export const MU_SUN = 1.32712440018e20

/** Metres in an astronomical unit. */
export const AU = 1.495978707e11

/** Standard gravity, m/s^2 — the constant in the rocket equation. */
export const G0 = 9.80665

export interface Vec2 {
  x: number
  y: number
}

/** Angular position of a body, radians, at game time `t`. */
export function bodyAngleAt(bodyId: string, t: GameTime): number {
  const body = getBody(bodyId)
  const periodS = body.orbitPeriodDays * DAY
  return body.phaseAtEpochRad + (2 * Math.PI * t) / periodS
}

/** Heliocentric position in metres at game time `t`. */
export function bodyPositionAt(bodyId: string, t: GameTime): Vec2 {
  const r = getBody(bodyId).orbitRadiusAu * AU
  const angle = bodyAngleAt(bodyId, t)
  return { x: r * Math.cos(angle), y: r * Math.sin(angle) }
}

/** Straight-line distance between two bodies, metres. */
export function distanceBetweenBodiesAt(a: string, b: string, t: GameTime): number {
  const pa = bodyPositionAt(a, t)
  const pb = bodyPositionAt(b, t)
  return Math.hypot(pa.x - pb.x, pa.y - pb.y)
}

/**
 * Distance between two ports. Ports sharing a body are co-located at this
 * scale: Luna is a rounding error next to an astronomical unit, and pretending
 * otherwise would imply a precision the rest of the model does not have.
 */
export function portSeparationAt(portA: string, portB: string, t: GameTime): number {
  const a = getPort(portA)
  const b = getPort(portB)
  if (a.bodyId === b.bodyId) return 0
  return distanceBetweenBodiesAt(a.bodyId, b.bodyId, t)
}

export interface Transfer {
  /** Heliocentric cost of both burns, m/s. Excludes escaping either port. */
  deltaVMs: number
  /** Time of flight, game seconds. */
  durationS: number
  /** Semi-major axis of the transfer ellipse, metres. */
  semiMajorAxisM: number
}

/**
 * The classic two-burn transfer between circular orbits: raise apoapsis to
 * meet the target, then circularise on arrival.
 */
export function hohmannTransfer(fromBody: string, toBody: string): Transfer {
  const r1 = getBody(fromBody).orbitRadiusAu * AU
  const r2 = getBody(toBody).orbitRadiusAu * AU
  const a = (r1 + r2) / 2

  const burn1 = Math.sqrt(MU_SUN / r1) * (Math.sqrt((2 * r2) / (r1 + r2)) - 1)
  const burn2 = Math.sqrt(MU_SUN / r2) * (1 - Math.sqrt((2 * r1) / (r1 + r2)))

  return {
    deltaVMs: Math.abs(burn1) + Math.abs(burn2),
    durationS: Math.PI * Math.sqrt(a ** 3 / MU_SUN),
    semiMajorAxisM: a,
  }
}

/**
 * Where the target must be, relative to the origin, at the moment of
 * departure — the reason launch windows exist rather than being flavour.
 *
 * The ship arrives half an orbit of the transfer ellipse later, so the target
 * has to be positioned to arrive at the same place at the same time.
 */
export function phaseAngleForTransfer(fromBody: string, toBody: string): number {
  const target = getBody(toBody)
  const { durationS } = hohmannTransfer(fromBody, toBody)
  const targetPeriodS = target.orbitPeriodDays * DAY
  // Angle the target sweeps during the flight, subtracted from the half-turn
  // the ship makes.
  const swept = (2 * Math.PI * durationS) / targetPeriodS
  return Math.PI - swept
}

/** How often the same departure geometry comes round again, in days. */
export function synodicPeriodDays(bodyA: string, bodyB: string): number {
  const a = getBody(bodyA).orbitPeriodDays
  const b = getBody(bodyB).orbitPeriodDays
  if (a === b) return Infinity
  return Math.abs(1 / (1 / a - 1 / b))
}

/**
 * Propellant for a manoeuvre, by the rocket equation.
 *
 * Exponential in delta-v, which is why a slightly faster transfer is so much
 * dearer than it looks, and why cargo is never free (TR-10).
 */
export function propellantForDeltaV(
  wetMassKg: number,
  deltaVMs: number,
  ispS: number,
): number {
  const exhaustVelocity = ispS * G0
  const massRatio = Math.exp(deltaVMs / exhaustVelocity)
  return wetMassKg * (1 - 1 / massRatio)
}

/** Inverse: the delta-v a given propellant load buys. */
export function deltaVForPropellant(
  wetMassKg: number,
  propellantKg: number,
  ispS: number,
): number {
  if (propellantKg >= wetMassKg) return Infinity
  return ispS * G0 * Math.log(wetMassKg / (wetMassKg - propellantKg))
}
