/**
 * Lambert's problem, and the transfers built on it. Design doc §5.1, §5.2.
 *
 * A Hohmann transfer answers "what is the cheapest way between two circular
 * orbits", and it answers it for a departure at exactly the right moment. The
 * game priced every crossing that way and let the player leave whenever they
 * liked, so the two halves disagreed: the chart drew an arc that ended half a
 * turn from where the ship left, the target was wherever its own orbit had put
 * it, and the two were the same point only by luck. §5.1 says **launch windows
 * are real gameplay**; a cost that ignores the window is the one thing that
 * cannot be true of.
 *
 * Lambert asks the honest question instead: *given where the ship is now, where
 * the target will be in T, and T, what orbit connects them* — and then the two
 * burns are just the difference between that orbit's velocity and the two
 * bodies' own. Depart near the window and it reproduces Hohmann to the metre
 * per second, which is the test that pins it. Depart a quarter of a synodic
 * period early and it says what that costs, which is the number the decision
 * was always supposed to be made on.
 *
 * Universal variables (Bate, Mueller and White), Newton on `z` with a bisection
 * bracket behind it. Bounded iterations either way so it stays deterministic
 * (§7.2) and can never spin: a solver that usually converges is not something
 * offline catch-up can be built on.
 */
import { MU_SUN, bodyPositionAt, bodyVelocityAt, eccentricAnomaly, type Vec2 } from './orbits.js'
import type { GameTime } from './time.js'

/** Stumpff C. The series near zero, where the closed forms lose their digits. */
function stumpffC(z: number): number {
  if (z > 1e-6) return (1 - Math.cos(Math.sqrt(z))) / z
  if (z < -1e-6) return (Math.cosh(Math.sqrt(-z)) - 1) / -z
  return 1 / 2 - z / 24 + (z * z) / 720
}

/** Stumpff S. */
function stumpffS(z: number): number {
  if (z > 1e-6) {
    const s = Math.sqrt(z)
    return (s - Math.sin(s)) / s ** 3
  }
  if (z < -1e-6) {
    const s = Math.sqrt(-z)
    return (Math.sinh(s) - s) / s ** 3
  }
  return 1 / 6 - z / 120 + (z * z) / 5040
}

/**
 * The half-turn transfer, solved on its own terms. Design doc §5.2.
 *
 * Two points exactly opposite the primary are apsides of every ellipse through
 * them, so the family is one parameter wide: pick the eccentricity and the
 * flight time follows. It rises monotonically from the Hohmann half-period —
 * departure at periapsis, arrival at apoapsis, which *is* the Hohmann transfer
 * — up to unbounded as the ellipse stretches, so bisection is enough and a
 * flight time shorter than the Hohmann one honestly has no such orbit.
 */
function halfTurn(
  from: Vec2,
  to: Vec2,
  r1: number,
  r2: number,
  flightS: number,
  mu: number,
): LambertArc | undefined {
  const p = (2 * r1 * r2) / (r1 + r2)
  // e·cos(nu) at departure, fixed by the two radii alone.
  const k = (r2 - r1) / (r1 + r2)
  const h = Math.sqrt(mu * p)

  /** Flight time from departure to the point opposite, for this ellipse. */
  const timeFor = (a: number): number => {
    const e = Math.sqrt(Math.max(0, 1 - p / a))
    const cosNu = e === 0 ? 1 : Math.max(-1, Math.min(1, k / e))
    // Outbound climbs from periapsis, inbound falls from apoapsis: either way
    // the departure is on the half where the radius moves toward the target.
    const nu1 = r2 >= r1 ? Math.acos(cosNu) : -Math.acos(cosNu)
    const anomaly = (nu: number): number => {
      const E = Math.atan2(Math.sqrt(1 - e * e) * Math.sin(nu), e + Math.cos(nu))
      return E - e * Math.sin(E)
    }
    const swept = anomaly(nu1 + Math.PI) - anomaly(nu1)
    const wrapped = ((swept % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
    return wrapped / Math.sqrt(mu / a ** 3)
  }

  // Bracketed on the semi-major axis rather than the eccentricity. They
  // parameterise the same family, but `e` approaching 1 turns `E - e sin E`
  // into a subtraction of two nearly equal numbers: at e = 1 - 1e-9 the flight
  // time came back a factor of thirty *short*, which read as "no such orbit"
  // for a crossing that plainly has one. Growing `a` from the Hohmann ellipse
  // never goes near that.
  //
  // Which way the family runs depends on the direction of travel, and the two
  // are opposites. Outbound, the Hohmann ellipse is the **fastest** half turn
  // there is -- a longer one climbs further and takes longer, 259 days to 512
  // to 1331. Inbound it is the **slowest**: departing past apoapsis on a
  // stretched ellipse means falling, and Mars to Earth runs 259 days down
  // toward an asymptote at 114. Assuming one direction for both is what had a
  // perfectly ordinary inbound crossing reported as impossible.
  const aMin = (r1 + r2) / 2
  const atHohmann = timeFor(aMin)
  const climbing = timeFor(aMin * 1.000001) > atHohmann
  // The Hohmann figure is the end stop of the family, and asking for exactly it
  // -- which is what departing at the window means -- must not fall a rounding
  // error outside the bracket.
  if (climbing && !(flightS >= atHohmann * (1 - 1e-9))) return undefined
  if (!climbing && !(flightS <= atHohmann * (1 + 1e-9))) return undefined

  let lo = aMin
  let hi = aMin
  let bracketed = false
  for (let i = 0; i < 60; i++) {
    hi *= 2
    const t = timeFor(hi)
    if (Number.isFinite(t) && (climbing ? t >= flightS : t <= flightS)) {
      bracketed = true
      break
    }
    lo = hi
  }
  // Past the end of the family: inbound this is a crossing slower than the
  // asymptote, which is a trajectory that does not exist rather than one the
  // ship cannot afford.
  if (!bracketed) return undefined

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    const t = timeFor(mid)
    const short = climbing ? t < flightS : t > flightS
    if (!Number.isFinite(t) || short) lo = mid
    else hi = mid
    if ((hi - lo) / hi < 1e-15) break
  }
  const a = (lo + hi) / 2
  const e = Math.sqrt(Math.max(0, 1 - p / a))
  const cosNu = e === 0 ? 1 : Math.max(-1, Math.min(1, k / e))
  const nu1 = r2 >= r1 ? Math.acos(cosNu) : -Math.acos(cosNu)

  const speeds = (nu: number) => ({
    radial: (mu / h) * e * Math.sin(nu),
    transverse: (mu / h) * (1 + e * Math.cos(nu)),
  })
  const at = (position: Vec2, nu: number): Vec2 => {
    const theta = Math.atan2(position.y, position.x)
    const { radial, transverse } = speeds(nu)
    return {
      x: radial * Math.cos(theta) - transverse * Math.sin(theta),
      y: radial * Math.sin(theta) + transverse * Math.cos(theta),
    }
  }
  return {
    departureVelocity: at(from, nu1),
    arrivalVelocity: at(to, nu1 + Math.PI),
  }
}

export interface LambertArc {
  /** Velocity on the transfer at departure, m/s. */
  departureVelocity: Vec2
  /** And at arrival. */
  arrivalVelocity: Vec2
}

/**
 * The orbit through two positions in a given time.
 *
 * Prograde only, and the short way round: both are true of every crossing this
 * game flies, and offering the retrograde branch would be offering a
 * trajectory no contract could pay for.
 *
 * Returns undefined when the geometry has no such orbit — the two points
 * exactly opposite, where the plane of the transfer is undefined, or a flight
 * time the solver cannot close. Callers treat that as an option that cannot be
 * flown rather than substituting something plausible.
 */
export function lambert(
  from: Vec2,
  to: Vec2,
  flightS: number,
  mu: number,
): LambertArc | undefined {
  if (!(flightS > 0)) return undefined
  const r1 = Math.hypot(from.x, from.y)
  const r2 = Math.hypot(to.x, to.y)
  if (r1 === 0 || r2 === 0) return undefined

  const cross = from.x * to.y - from.y * to.x
  const dot = from.x * to.x + from.y * to.y
  let dNu = Math.atan2(Math.abs(cross), dot)
  // Prograde: going the long way round when the target is "behind" is what
  // makes the sweep more than half a turn, which is exactly what an inbound
  // crossing does.
  if (cross < 0) dNu = 2 * Math.PI - dNu

  // Exactly half a turn is where the universal-variable form gives up: `A`
  // carries a factor of sin(dNu), which is zero there. It is also precisely the
  // Hohmann geometry -- the one departure the whole game is built around -- so
  // it gets solved directly rather than declared impossible. Everywhere within
  // a hair of it the general form is perfectly well behaved: an hour either
  // side of the Earth-Mars window it returns 5593.59 m/s against the textbook's
  // 5593.6, so this branch is a point, not a neighbourhood.
  if (Math.abs(Math.sin(dNu)) < 1e-9) {
    return Math.cos(dNu) < 0 ? halfTurn(from, to, r1, r2, flightS, mu) : undefined
  }

  const A = Math.sin(dNu) * Math.sqrt((r1 * r2) / (1 - Math.cos(dNu)))
  if (!Number.isFinite(A) || A === 0) return undefined

  const yOf = (z: number): number => {
    const C = stumpffC(z)
    return r1 + r2 + (A * (z * stumpffS(z) - 1)) / Math.sqrt(C)
  }
  const timeOf = (z: number): number => {
    const y = yOf(z)
    if (y < 0) return Number.NaN
    const C = stumpffC(z)
    const S = stumpffS(z)
    return (y / C) ** 1.5 * S + A * Math.sqrt(y)
  }

  const target = Math.sqrt(mu) * flightS

  // Bracket first. Time of flight rises monotonically with z on the branch
  // this game flies, so a bracket makes the Newton step safe rather than
  // hopeful -- and a solver that can wander is not deterministic in any useful
  // sense.
  let lo = -4 * Math.PI * Math.PI + 1e-6
  let hi = 4 * Math.PI * Math.PI - 1e-6
  // Push `lo` up until y is positive there: with a large A the low end of the
  // range has no orbit at all.
  for (let i = 0; i < 60 && !(yOf(lo) > 0); i++) lo += (hi - lo) * 0.05
  if (!(yOf(lo) > 0)) return undefined
  const tLo = timeOf(lo)
  const tHi = timeOf(hi)
  if (!Number.isFinite(tLo) || !Number.isFinite(tHi)) return undefined
  if (target < tLo || target > tHi) return undefined

  let z = lo + (hi - lo) * 0.5
  for (let i = 0; i < 120; i++) {
    const t = timeOf(z)
    if (!Number.isFinite(t)) {
      lo = z
    } else if (t < target) {
      lo = z
    } else {
      hi = z
    }
    if (Math.abs(hi - lo) < 1e-12) break
    z = lo + (hi - lo) * 0.5
  }

  const y = yOf(z)
  if (!(y > 0)) return undefined

  // Lagrange coefficients. The two velocities follow from them directly, which
  // is why this formulation is worth the Stumpff functions.
  const f = 1 - y / r1
  const g = A * Math.sqrt(y / mu)
  const gDot = 1 - y / r2
  if (g === 0) return undefined

  return {
    departureVelocity: { x: (to.x - f * from.x) / g, y: (to.y - f * from.y) / g },
    arrivalVelocity: { x: (gDot * to.x - from.x) / g, y: (gDot * to.y - from.y) / g },
  }
}

/**
 * A transfer orbit as elements, so it can be drawn and read at any instant.
 *
 * Lambert hands back two velocity vectors; everything the chart and the
 * telemetry want -- radius, speed, flight path angle, where the arc goes -- is
 * a property of the *orbit* those imply. Converting once here is what keeps the
 * picture and the numbers the same object rather than two calculations that
 * agree until one of them is changed.
 */
export interface TransferOrbit {
  semiMajorAxisM: number
  eccentricity: number
  /** Where periapsis points, radians in the chart's own frame. */
  argumentRad: number
  /** True anomaly at departure. */
  trueAnomalyAtDepartureRad: number
  /** Mean anomaly at departure, for propagating forward. */
  meanAnomalyAtDepartureRad: number
  /** Radians per second. */
  meanMotionRadS: number
}

/** Orbital elements from a position and velocity. Closed, elliptical orbits. */
export function orbitFrom(at: Vec2, velocity: Vec2, mu: number): TransferOrbit | undefined {
  const r = Math.hypot(at.x, at.y)
  const v = Math.hypot(velocity.x, velocity.y)
  if (r === 0) return undefined

  const energy = (v * v) / 2 - mu / r
  // Parabolic or hyperbolic: a real trajectory, and not one this game flies or
  // draws. Saying so is better than propagating it with elliptical maths.
  if (energy >= -1e-12) return undefined
  const a = -mu / (2 * energy)

  const rDotV = at.x * velocity.x + at.y * velocity.y
  const scale = v * v - mu / r
  const eVec = {
    x: (scale * at.x - rDotV * velocity.x) / mu,
    y: (scale * at.y - rDotV * velocity.y) / mu,
  }
  const e = Math.hypot(eVec.x, eVec.y)
  if (e >= 1) return undefined
  // A circular orbit has no periapsis to point at; departure itself is as good
  // a reference as any, and every formula below is continuous into it.
  const argumentRad = e < 1e-12 ? Math.atan2(at.y, at.x) : Math.atan2(eVec.y, eVec.x)

  const nu = Math.atan2(at.y, at.x) - argumentRad
  const E = Math.atan2(Math.sqrt(1 - e * e) * Math.sin(nu), e + Math.cos(nu))
  return {
    semiMajorAxisM: a,
    eccentricity: e,
    argumentRad,
    trueAnomalyAtDepartureRad: nu,
    meanAnomalyAtDepartureRad: E - e * Math.sin(E),
    meanMotionRadS: Math.sqrt(mu / a ** 3),
  }
}

/** Where a transfer orbit is, `sinceS` after departure. */
export function orbitStateAt(
  orbit: TransferOrbit,
  sinceS: number,
): { position: Vec2; velocity: Vec2; radiusM: number; speedMs: number; flightPathAngleRad: number } {
  const { semiMajorAxisM: a, eccentricity: e, argumentRad } = orbit
  const M = orbit.meanAnomalyAtDepartureRad + orbit.meanMotionRadS * Math.max(0, sinceS)
  const E = eccentricAnomaly(M, e)
  const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2))
  const radiusM = a * (1 - e * Math.cos(E))
  const angle = argumentRad + nu

  const mu = orbit.meanMotionRadS ** 2 * a ** 3
  const h = Math.sqrt(Math.max(0, mu * a * (1 - e * e)))
  const radialMs = h === 0 ? 0 : (mu / h) * e * Math.sin(nu)
  const transverseMs = h === 0 ? 0 : (mu / h) * (1 + e * Math.cos(nu))

  return {
    position: { x: radiusM * Math.cos(angle), y: radiusM * Math.sin(angle) },
    velocity: {
      x: radialMs * Math.cos(angle) - transverseMs * Math.sin(angle),
      y: radialMs * Math.sin(angle) + transverseMs * Math.cos(angle),
    },
    radiusM,
    speedMs: Math.hypot(radialMs, transverseMs),
    flightPathAngleRad: Math.atan2(radialMs, transverseMs),
  }
}

/**
 * A crossing between two worlds, priced for the geometry it actually has.
 *
 * The two burns are the difference between the transfer's velocity and the
 * body's own at each end — which is what a burn *is*, and what the Hohmann
 * formula was a closed-form shortcut to for one particular departure. Leaving
 * at the wrong moment now costs what leaving at the wrong moment costs.
 */
export interface Leg {
  deltaVMs: number
  departureDeltaVMs: number
  arrivalDeltaVMs: number
  durationS: number
  orbit: TransferOrbit
}

export function interplanetaryLeg(
  fromBodyId: string,
  toBodyId: string,
  departAt: GameTime,
  flightS: number,
): Leg | undefined {
  const from = bodyPositionAt(fromBodyId, departAt)
  const to = bodyPositionAt(toBodyId, departAt + flightS)
  const arc = lambert(from, to, flightS, MU_SUN)
  if (!arc) return undefined

  const orbit = orbitFrom(from, arc.departureVelocity, MU_SUN)
  if (!orbit) return undefined

  const vFrom = bodyVelocityAt(fromBodyId, departAt)
  const vTo = bodyVelocityAt(toBodyId, departAt + flightS)
  const departureDeltaVMs = Math.hypot(
    arc.departureVelocity.x - vFrom.x,
    arc.departureVelocity.y - vFrom.y,
  )
  const arrivalDeltaVMs = Math.hypot(
    vTo.x - arc.arrivalVelocity.x,
    vTo.y - arc.arrivalVelocity.y,
  )

  return {
    deltaVMs: departureDeltaVMs + arrivalDeltaVMs,
    departureDeltaVMs,
    arrivalDeltaVMs,
    durationS: flightS,
    orbit,
  }
}
