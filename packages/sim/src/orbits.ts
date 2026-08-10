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
 * Where a port is, about the body it orbits. Design doc §5.1, §5.2.
 *
 * A port used to be a radius and nothing else — a ring with no position on it —
 * so the chart drew departure at zero and the destination opposite, and said in
 * a comment that the angles were the drawing's own. That was honest and it was
 * also the reason the two frames could not agree: heliocentrically the ship sat
 * at Earth's centre for five days while the world's own frame had her out on an
 * arc, and nothing could reconcile them because one of the two had no bearing
 * to reconcile *to*.
 *
 * **The period is derived, not stated.** Kepler's third law about the body's
 * real µ — the same µ the crossing between two of its ports is priced with —
 * so the drawn position and the priced transfer are the same object. Luna comes
 * out at 27.46 days against an observed 27.32, the half per cent being the
 * two-body approximation that ignores her own mass; a stated 27.32 would look
 * more accurate and would put her where the transfer maths does not think she
 * is, which is the worse error of the two.
 */
export function circularPeriodS(mu: number, radiusM: number): number {
  return 2 * Math.PI * Math.sqrt(radiusM ** 3 / mu)
}

/** Orbital period of a port about its body, seconds. */
export function portPeriodS(portId: string): number {
  const port = getPort(portId)
  return circularPeriodS(getBody(port.bodyId).muM3S2, port.orbitRadiusKm * 1000)
}

/** How fast it goes round, radians per second. */
export function portRateRadS(portId: string): number {
  return (2 * Math.PI) / portPeriodS(portId)
}

/** Angular position of a port about its body at `t`, radians. */
export function portAngleAt(portId: string, t: GameTime): number {
  return getPort(portId).phaseAtEpochRad + portRateRadS(portId) * t
}

/** Position of a port *relative to its body*, metres. */
export function portPositionAt(portId: string, t: GameTime): Vec2 {
  const r = getPort(portId).orbitRadiusKm * 1000
  const angle = portAngleAt(portId, t)
  return { x: r * Math.cos(angle), y: r * Math.sin(angle) }
}

/** Its velocity about the body, m/s — prograde, a quarter turn ahead. */
export function portVelocityAt(portId: string, t: GameTime): Vec2 {
  const port = getPort(portId)
  const r = port.orbitRadiusKm * 1000
  const speed = Math.sqrt(getBody(port.bodyId).muM3S2 / r)
  const angle = portAngleAt(portId, t)
  return { x: -speed * Math.sin(angle), y: speed * Math.cos(angle) }
}

/** Signed angle wrapped to (-pi, pi]. */
function wrapPi(radians: number): number {
  const a = ((radians + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI)
  return a - Math.PI
}

/**
 * How long the ship coasts in her parking orbit before the departure burn.
 *
 * Once the ports have real positions, a crossing between two of them stops
 * being available at any instant: the ellipse sweeps a fixed angle in a fixed
 * time, so the target has to *already* be where the far end will be. Departing
 * on the player's whim and arriving wherever the ellipse happened to finish
 * would draw a ship sailing past an empty ring, which is precisely the kind of
 * picture §1 pillar 2 exists to forbid.
 *
 * The wait is bounded by the synodic period of the two orbits, and in this
 * system that is small — Gateway goes round in 92.5 minutes, so leaving for
 * Luna is never more than about an hour and a half away. That is why it is
 * absorbed into the crossing rather than offered as a decision: a launch window
 * you can always meet inside two hours is not gameplay, it is arithmetic. The
 * interplanetary ones, which run to months, are (§5.1) and are reported as
 * windows rather than waited out silently.
 *
 * Closed form: both angles are linear in time, so the miss closes at a constant
 * rate and the first departure that works is one division.
 */
export function phasingWaitS(
  fromPortId: string,
  toPortId: string,
  at: GameTime,
  semiMajorMultiplier: number,
): number {
  const from = getPort(fromPortId)
  const to = getPort(toPortId)
  // Between bodies the geometry is the launch window proper, and waiting it out
  // without saying so would hide months inside a crossing.
  if (from.bodyId !== to.bodyId || from.id === to.id) return 0

  const mu = getBody(from.bodyId).muM3S2
  const leg = stretchedBetween(
    mu,
    from.orbitRadiusKm * 1000,
    to.orbitRadiusKm * 1000,
    semiMajorMultiplier,
  )
  // How far round the ellipse carries her. A minimum-energy leg sweeps half a
  // turn; a stretched one reaches the target orbit before its far apsis and
  // sweeps less, which moves the window.
  const sweep = transferStateAt(leg, mu, leg.durationS).sweptRad

  const drift = portRateRadS(toPortId) - portRateRadS(fromPortId)
  if (drift === 0) return 0

  // Where the target will be when the ship gets there, against where she will
  // be. Zero means go now.
  const miss = wrapPi(
    portAngleAt(toPortId, at + leg.durationS) - (portAngleAt(fromPortId, at) + sweep),
  )
  const synodicS = (2 * Math.PI) / Math.abs(drift)
  return (((-miss / drift) % synodicS) + synodicS) % synodicS
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
  /** Eccentricity of the transfer ellipse. */
  eccentricity: number
  /**
   * Mean anomaly at the moment of departure: 0 leaving from periapsis (any
   * outbound leg), pi leaving from apoapsis (any inbound one).
   *
   * Carried on the transfer rather than re-derived by each caller because it
   * is the one piece of the geometry that cannot be recovered from `a` and `e`
   * alone, and getting it wrong is silent -- it puts the ship on the right
   * ellipse at the wrong end of it.
   */
  departureAnomalyRad: number
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
    eccentricity: Math.abs(r2 - r1) / (r1 + r2),
    // The minimum-energy ellipse touches both orbits at its apsides, so an
    // outbound ship leaves from periapsis and an inbound one from apoapsis.
    departureAnomalyRad: r2 >= r1 ? 0 : Math.PI,
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

/**
 * `stretchedTransfer` in terms of two radii about any primary.
 *
 * **The stretch pushes the far end of the ellipse past the target orbit**, in
 * whichever direction shortens the fall. Outbound that raises apoapsis above
 * `r2`; inbound it lowers periapsis *below* `r2`, so the ship crosses the
 * target orbit on the way down instead of kissing it at the bottom. Both cases
 * are one rule -- move the free apsis away from the target by the same
 * `(multiplier - 1) x (r1 + r2)` -- and both reduce to Hohmann at 1.
 *
 * Scaling the semi-major axis up in *both* directions, which is what this did
 * for two milestones, is only right outbound. Inbound it produced an ellipse
 * whose periapsis sat above the destination: the express profile cost more
 * delta-v, took *longer* than minimum energy, and described a trajectory that
 * never reached the target orbit at all. That is exactly the fake choice TR-3b
 * forbids, and it is unmissable now that the chart draws what was chosen.
 */
export function stretchedBetween(
  mu: number,
  r1: number,
  r2: number,
  semiMajorMultiplier: number,
): Transfer {
  const outbound = r2 >= r1
  const reach = (Math.max(1, semiMajorMultiplier) - 1) * (r1 + r2)
  // The apsis the ship does *not* depart from. Clamped off zero because a
  // periapsis at the centre of the primary is not a trajectory; at the
  // multipliers the astrogator offers it never comes close.
  const farApsis = outbound ? r2 + reach : Math.max(r2 * 0.05, r2 - reach)
  const a = (r1 + farApsis) / 2

  // Departure is at an apsis either way, so the first burn is purely
  // tangential: prograde to raise apoapsis, retrograde to drop periapsis.
  const v1 = Math.sqrt(mu * (2 / r1 - 1 / a))
  const burn1 = Math.abs(v1 - Math.sqrt(mu / r1))

  // Arrival: speed from vis-viva, split into tangential and radial by
  // conservation of angular momentum.
  const h = r1 * v1
  const v2 = Math.sqrt(Math.max(0, mu * (2 / r2 - 1 / a)))
  const vTangential = h / r2
  const vRadial = Math.sqrt(Math.max(0, v2 * v2 - vTangential * vTangential))
  const vCirc2 = Math.sqrt(mu / r2)
  const burn2 = Math.hypot(vTangential - vCirc2, vRadial)

  // Time of flight, through the eccentric anomaly at the crossing of r2.
  const e = Math.abs(1 - r1 / a)
  const cosE = e === 0 ? 1 : (a - r2) / (a * e)
  const E = Math.acos(Math.max(-1, Math.min(1, cosE)))
  const crossing = E - e * Math.sin(E)
  // Outbound the ship climbs from periapsis to that crossing. Inbound it falls
  // from apoapsis and meets the same radius on the descending branch, which is
  // the mirror of the crossing about the apsidal line -- hence pi minus it.
  const sweptMeanAnomaly = outbound ? crossing : Math.PI - crossing

  return {
    deltaVMs: burn1 + burn2,
    durationS: sweptMeanAnomaly * Math.sqrt(a ** 3 / mu),
    semiMajorAxisM: a,
    eccentricity: e,
    departureAnomalyRad: outbound ? 0 : Math.PI,
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
 * Solve Kepler's equation for the eccentric anomaly. Design §5.2.
 *
 * Newton on E - e·sin E = M, from a sensible guess. The ellipses here are
 * mild, so this converges in a handful of steps; the loop is bounded either
 * way, which keeps it deterministic (§7.2).
 */
export function eccentricAnomaly(meanAnomaly: number, e: number): number {
  let E = e < 0.8 ? meanAnomaly : Math.PI
  for (let i = 0; i < 24; i++) {
    const delta = (E - e * Math.sin(E) - meanAnomaly) / (1 - e * Math.cos(E))
    E -= delta
    if (Math.abs(delta) < 1e-12) break
  }
  return E
}

/** Where a ship is on a transfer, `sinceS` seconds after it departed. */
export interface TransferState {
  /** Distance from the primary, metres. */
  radiusM: number
  /** Angle swept since departure, radians. Zero at the moment of departure. */
  sweptRad: number
  /** Angle from periapsis, radians. The orbital element, not the sweep. */
  trueAnomalyRad: number
  /** Speed relative to the primary, m/s. Vis-viva at this radius. */
  speedMs: number
  /**
   * Velocity split about the local horizontal: `radialMs` is outward-positive,
   * `transverseMs` is along the direction of travel.
   *
   * Kept as components rather than a bearing because that is what the chart
   * needs to point an arrow, and what tells a player whether the ship is
   * climbing or falling -- which is most of what a transfer *is*. Both come
   * from the angular momentum, so they agree with the vis-viva speed exactly
   * rather than approximately.
   */
  radialMs: number
  transverseMs: number
  /**
   * Angle between velocity and local horizontal, radians. Positive climbing
   * away from the primary, negative falling toward it, zero at either apsis.
   */
  flightPathAngleRad: number
}

/**
 * Position on a transfer ellipse as a function of time since departure.
 *
 * The one place that turns a `Transfer` into where the ship actually is, so
 * the telemetry readout and the star chart cannot disagree about it. It takes
 * the departure anomaly from the transfer rather than assuming periapsis:
 * an inbound ship leaves from the *high* end of its ellipse, and starting it
 * at periapsis reports the fastest point of the orbit at the slowest moment
 * of the crossing.
 *
 * Closed form in time, which is the property offline catch-up rests on (§8.2).
 */
export function transferStateAt(
  transfer: Transfer,
  mu: number,
  sinceS: number,
): TransferState {
  const { semiMajorAxisM: a, eccentricity: e, departureAnomalyRad } = transfer
  const meanAnomaly = departureAnomalyRad + Math.max(0, sinceS) * Math.sqrt(mu / a ** 3)
  const E = eccentricAnomaly(meanAnomaly, e)

  // True anomaly from eccentric anomaly, the usual half-angle form. It stays
  // continuous through apoapsis, which is where an inbound leg starts.
  const nu =
    2 *
    Math.atan2(
      Math.sqrt(1 + e) * Math.sin(E / 2),
      Math.sqrt(1 - e) * Math.cos(E / 2),
    )

  // Specific angular momentum. Constant along the orbit, which is what makes
  // the two velocity components exact rather than differenced off vis-viva.
  const h = Math.sqrt(Math.max(0, mu * a * (1 - e * e)))
  const radialMs = h === 0 ? 0 : ((mu / h) * e * Math.sin(nu))
  const transverseMs = h === 0 ? 0 : (mu / h) * (1 + e * Math.cos(nu))

  // Departure is at an apsis, where true and mean anomaly coincide -- so the
  // sweep since departure is just the difference.
  return {
    radiusM: a * (1 - e * Math.cos(E)),
    sweptRad: nu - departureAnomalyRad,
    trueAnomalyRad: nu,
    speedMs: Math.hypot(radialMs, transverseMs),
    radialMs,
    transverseMs,
    flightPathAngleRad: Math.atan2(radialMs, transverseMs),
  }
}

/**
 * Speed and heading of a body on its circular orbit, m/s.
 *
 * The berthed case. A ship alongside is not stationary -- she is doing 29.8
 * km/s round the sun with Earth, and a chart that reports 0 while the dot
 * visibly moves is telling the player something false about the frame it is
 * drawn in.
 */
export function bodyVelocityAt(bodyId: string, t: GameTime): Vec2 {
  const r = getBody(bodyId).orbitRadiusAu * AU
  const speed = Math.sqrt(MU_SUN / r)
  const angle = bodyAngleAt(bodyId, t)
  // Prograde: the tangent, a quarter turn ahead of the radius.
  return { x: -speed * Math.sin(angle), y: speed * Math.cos(angle) }
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
