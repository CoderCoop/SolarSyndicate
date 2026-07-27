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
  return hohmannBetween(
    MU_SUN,
    getBody(fromBody).orbitRadiusAu * AU,
    getBody(toBody).orbitRadiusAu * AU,
  )
}

/**
 * The same transfer, stated in terms of two radii about any primary.
 *
 * Written this way because the crossing between two ports around one planet is
 * *the same problem* as the crossing between two planets around the sun -- only
 * the gravitational parameter changes. Giving the in-system case its own
 * formula is what let a hardcoded five-day, 1.59 km/s Luna hop sit next to
 * honestly derived interplanetary legs for two milestones.
 */
export function hohmannBetween(mu: number, r1: number, r2: number): Transfer {
  const a = (r1 + r2) / 2
  const burn1 = Math.sqrt(mu / r1) * (Math.sqrt((2 * r2) / (r1 + r2)) - 1)
  const burn2 = Math.sqrt(mu / r2) * (1 - Math.sqrt((2 * r1) / (r1 + r2)))

  return {
    deltaVMs: Math.abs(burn1) + Math.abs(burn2),
    durationS: Math.PI * Math.sqrt(a ** 3 / mu),
    semiMajorAxisM: a,
  }
}

/**
 * A transfer on an ellipse larger than the Hohmann one. Spec 002 TR-2, TR-3.
 *
 * Raising the semi-major axis past the minimum-energy value buys a shorter
 * flight and costs delta-v twice over: a bigger departure burn, and an arrival
 * where the ship crosses the target's orbit rather than kissing it tangentially,
 * so the second burn has to kill a radial component as well as match speed.
 *
 * This is real two-body mechanics rather than a fudge factor -- vis-viva for the
 * speeds, Kepler's equation for the time -- and it reduces exactly to
 * `hohmannTransfer` when the multiplier is 1. What it does *not* do is solve for
 * a departure that also arrives where the target will be; that is a Lambert
 * problem, and §5.1 already states that phasing is handled by windows rather
 * than by targeting.
 */
export function stretchedTransfer(
  fromBody: string,
  toBody: string,
  semiMajorMultiplier: number,
): Transfer {
  return stretchedBetween(
    MU_SUN,
    getBody(fromBody).orbitRadiusAu * AU,
    getBody(toBody).orbitRadiusAu * AU,
    semiMajorMultiplier,
  )
}

/** `stretchedTransfer` in terms of two radii about any primary. */
export function stretchedBetween(
  mu: number,
  r1: number,
  r2: number,
  semiMajorMultiplier: number,
): Transfer {
  const hohmannA = (r1 + r2) / 2
  const a = hohmannA * Math.max(1, semiMajorMultiplier)

  // Departure is at periapsis, so the first burn is purely tangential.
  const vPeri = Math.sqrt(mu * (2 / r1 - 1 / a))
  const burn1 = Math.abs(vPeri - Math.sqrt(mu / r1))

  // Arrival: speed from vis-viva, split into tangential and radial by
  // conservation of angular momentum.
  const h = r1 * vPeri
  const v2 = Math.sqrt(Math.max(0, mu * (2 / r2 - 1 / a)))
  const vTangential = h / r2
  const vRadial = Math.sqrt(Math.max(0, v2 * v2 - vTangential * vTangential))
  const vCirc2 = Math.sqrt(mu / r2)
  const burn2 = Math.hypot(vTangential - vCirc2, vRadial)

  // Time of flight from periapsis to r2, through the eccentric anomaly.
  const e = 1 - r1 / a
  const cosE = e === 0 ? 1 : (a - r2) / (a * e)
  const E = Math.acos(Math.max(-1, Math.min(1, cosE)))
  const meanAnomaly = E - e * Math.sin(E)

  return {
    deltaVMs: burn1 + burn2,
    durationS: meanAnomaly * Math.sqrt(a ** 3 / mu),
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

// ---------------------------------------------------------------------------
// Where the ship is on the ellipse, and how fast
// ---------------------------------------------------------------------------

/**
 * Radius on an ellipse, `sinceS` seconds after periapsis. Design §5.2.
 *
 * Kepler's equation, solved by Newton. Both transfer profiles depart at the
 * periapsis of their transfer ellipse, so departure time *is* periapsis time
 * and no extra state has to be stored to place the ship: position is a
 * closed-form function of time, which is the property §8.2 rests on.
 */
export function radiusAtTime(mu: number, a: number, e: number, sinceS: number): number {
  const n = Math.sqrt(mu / (a * a * a))
  const m = n * sinceS
  // Newton on E - e·sin E = M. Converges in a handful of steps for e < 0.9,
  // and a fixed iteration count keeps it deterministic (§7.2).
  let ecc = m
  for (let i = 0; i < 12; i++) {
    const f = ecc - e * Math.sin(ecc) - m
    const df = 1 - e * Math.cos(ecc)
    ecc -= f / df
  }
  return a * (1 - e * Math.cos(ecc))
}

/** Speed at radius `r` on an ellipse of semi-major axis `a`. Vis-viva. */
export function speedOnEllipse(mu: number, r: number, a: number): number {
  return Math.sqrt(Math.max(0, mu * (2 / r - 1 / a)))
}

/**
 * The two burns a transfer is actually flown as, in m/s.
 *
 * Not a detail: it is the answer to "does the ship accelerate for half the
 * distance and decelerate for the other half". It does not. A nuclear-thermal
 * ship burns hard at each end and coasts for everything in between — the
 * continuous-thrust profile belongs to the fusion-torch tier (§3.4), which is
 * a long way off.
 *
 * The arrival figure treats both velocities as along-track. True for a
 * Hohmann, where the transfer meets the target orbit tangentially; slightly
 * optimistic for the stretched profiles, which cross it at an angle. The sum
 * the ship is actually charged for stays the honest one from `Transfer`.
 */
export function burnSplit(
  mu: number,
  r1: number,
  r2: number,
  semiMajorAxisM: number,
): { departureMs: number; arrivalMs: number } {
  const a = semiMajorAxisM
  return {
    departureMs: Math.abs(speedOnEllipse(mu, r1, a) - Math.sqrt(mu / r1)),
    arrivalMs: Math.abs(Math.sqrt(mu / r2) - speedOnEllipse(mu, r2, a)),
  }
}
