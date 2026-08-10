/**
 * Lambert's problem. Design doc §5.1, §5.2, §1 pillar 2.
 *
 * The test that matters is the first one: at the moment a Hohmann transfer is
 * the right answer, Lambert has to *be* Hohmann. A solver that agrees with the
 * textbook where the textbook applies, and says something different everywhere
 * else, is the whole claim -- and it is the only way to know the difference
 * everywhere else is the geometry rather than a bug.
 */
import { describe, expect, it } from 'vitest'
import {
  MU_SUN,
  bodyAngleAt,
  bodyPositionAt,
  bodyVelocityAt,
  hohmannTransfer,
  phaseAngleForTransfer,
} from '../src/orbits.js'
import { interplanetaryLeg, lambert, orbitFrom, orbitStateAt } from '../src/lambert.js'
import { DAY } from '../src/time.js'

/** Signed angle wrapped to (-pi, pi]. */
function wrapPi(radians: number): number {
  const a = (((radians + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  return a - Math.PI
}

/**
 * The first departure at or after `from` where the classical phase angle is
 * met -- which is to say, where Hohmann is the right answer.
 */
function windowAt(fromBody: string, toBody: string, from = 0): number {
  const wanted = phaseAngleForTransfer(fromBody, toBody)
  const rate =
    (2 * Math.PI) / (686.98 * DAY) - (2 * Math.PI) / (365.256 * DAY)
  const miss = wrapPi(bodyAngleAt(toBody, from) - bodyAngleAt(fromBody, from) - wanted)
  const synodic = (2 * Math.PI) / Math.abs(rate)
  return from + (((-miss / rate) % synodic) + synodic) % synodic
}

describe('Lambert reproduces the textbook where the textbook applies', () => {
  it('costs what a Hohmann costs, when a Hohmann is what the geometry wants', () => {
    // Earth to Mars at the window. Same time of flight, same two circular
    // orbits -- so the transfer Lambert finds has to be the Hohmann ellipse and
    // the burns have to add to the same figure. Within a metre per second on
    // five and a half kilometres of it.
    const hohmann = hohmannTransfer('earth', 'mars')
    const departAt = windowAt('earth', 'mars')
    const leg = interplanetaryLeg('earth', 'mars', departAt, hohmann.durationS)!

    expect(leg).toBeDefined()
    expect(leg.deltaVMs).toBeCloseTo(hohmann.deltaVMs, 0)
    expect(leg.orbit.semiMajorAxisM).toBeCloseTo(hohmann.semiMajorAxisM, -3)
    expect(leg.orbit.eccentricity).toBeCloseTo(hohmann.eccentricity, 6)
  })

  it('and the same inbound, which is where a stretched ellipse got it wrong', () => {
    const hohmann = hohmannTransfer('mars', 'earth')
    // Mars to Earth wants its own phase; solve it the same way.
    const wanted = phaseAngleForTransfer('mars', 'earth')
    const rate = (2 * Math.PI) / (365.256 * DAY) - (2 * Math.PI) / (686.98 * DAY)
    const miss = wrapPi(bodyAngleAt('earth', 0) - bodyAngleAt('mars', 0) - wanted)
    const synodic = (2 * Math.PI) / Math.abs(rate)
    const departAt = ((((-miss / rate) % synodic) + synodic) % synodic)

    const leg = interplanetaryLeg('mars', 'earth', departAt, hohmann.durationS)!
    expect(leg.deltaVMs).toBeCloseTo(hohmann.deltaVMs, 0)
  })

  it('actually arrives at the target, which the old arc did not', () => {
    // The point of the whole exercise. The ellipse ends where the body will be,
    // not half a turn from where the ship left.
    for (const departAt of [0, 40 * DAY, 300 * DAY]) {
      const flightS = 220 * DAY
      const leg = interplanetaryLeg('earth', 'mars', departAt, flightS)!
      const end = orbitStateAt(leg.orbit, flightS).position
      const mars = bodyPositionAt('mars', departAt + flightS)
      // A metre, on a distance of 230 million kilometres.
      expect(Math.hypot(end.x - mars.x, end.y - mars.y)).toBeLessThan(1)
    }
  })

  it('starts at the departure body, to the metre', () => {
    const leg = interplanetaryLeg('earth', 'ceres', 0, 400 * DAY)!
    const start = orbitStateAt(leg.orbit, 0).position
    const earth = bodyPositionAt('earth', 0)
    expect(Math.hypot(start.x - earth.x, start.y - earth.y)).toBeLessThan(1)
  })
})

describe('a crossing off its window costs what that costs', () => {
  it('is dearest a half synodic period from the window, and cheapest at it', () => {
    // The number the decision was always supposed to be made on. Departing
    // opposite the window is not slightly worse, it is a different journey.
    const flightS = hohmannTransfer('earth', 'mars').durationS
    const open = windowAt('earth', 'mars')
    const synodic = 779.9 * DAY

    const atWindow = interplanetaryLeg('earth', 'mars', open, flightS)!.deltaVMs
    const opposite = interplanetaryLeg('earth', 'mars', open + synodic / 2, flightS)!.deltaVMs

    expect(atWindow).toBeLessThan(opposite)
    expect(opposite / atWindow).toBeGreaterThan(2)
  })

  it('comes back round: one synodic period later is the same crossing', () => {
    const flightS = hohmannTransfer('earth', 'mars').durationS
    const open = windowAt('earth', 'mars')
    const synodic = 779.9 * DAY
    const now = interplanetaryLeg('earth', 'mars', open, flightS)!.deltaVMs
    const later = interplanetaryLeg('earth', 'mars', open + synodic, flightS)!.deltaVMs
    // Not identical -- the synodic period is not exact to the second -- but the
    // same crossing to within a per cent.
    expect(Math.abs(later - now) / now).toBeLessThan(0.01)
  })

  it('charges for haste, at the window where the comparison is fair', () => {
    const open = windowAt('earth', 'mars')
    const slow = hohmannTransfer('earth', 'mars').durationS
    const costs = [1, 0.85, 0.65].map(
      (fraction) => interplanetaryLeg('earth', 'mars', open, slow * fraction)!.deltaVMs,
    )
    expect(costs[1]!).toBeGreaterThan(costs[0]!)
    expect(costs[2]!).toBeGreaterThan(costs[1]!)
  })
})

describe('the solver is the kind a simulation can be built on', () => {
  it('gives the same answer every time it is asked', () => {
    // Determinism is not a nicety here: offline catch-up replays events and
    // has to land on the same state (§7.2, §8.2).
    const once = interplanetaryLeg('earth', 'ceres', 123456, 500 * DAY)!
    const twice = interplanetaryLeg('earth', 'ceres', 123456, 500 * DAY)!
    expect(twice.deltaVMs).toBe(once.deltaVMs)
    expect(twice.orbit.semiMajorAxisM).toBe(once.orbit.semiMajorAxisM)
  })

  it('says no rather than guessing, when there is no such orbit', () => {
    // A flight time far too short for a closed orbit. An option that cannot be
    // flown is information (TR-3b); a plausible number for it is not.
    expect(interplanetaryLeg('earth', 'ceres', 0, DAY)).toBeUndefined()
    expect(lambert({ x: 1, y: 0 }, { x: 2, y: 0 }, 10, MU_SUN)).toBeUndefined()
    expect(interplanetaryLeg('earth', 'mars', 0, 0)).toBeUndefined()
  })

  it('round-trips a state vector through elements and back', () => {
    // Everything drawn and every number read comes off these elements, so a
    // conversion that quietly loses the orbit would be invisible until the
    // picture was wrong.
    const at = bodyPositionAt('earth', 0)
    const v = bodyVelocityAt('earth', 0)
    const orbit = orbitFrom(at, v, MU_SUN)!
    const back = orbitStateAt(orbit, 0)
    expect(back.position.x).toBeCloseTo(at.x, 3)
    expect(back.position.y).toBeCloseTo(at.y, 3)
    expect(back.velocity.x).toBeCloseTo(v.x, 6)
    expect(back.velocity.y).toBeCloseTo(v.y, 6)
    // A circular orbit round-trips to a circular orbit.
    expect(orbit.eccentricity).toBeLessThan(1e-9)
  })

  it('propagates a body around its own orbit', () => {
    const at = bodyPositionAt('mars', 0)
    const v = bodyVelocityAt('mars', 0)
    const orbit = orbitFrom(at, v, MU_SUN)!
    for (const days of [50, 200, 686.98]) {
      const there = orbitStateAt(orbit, days * DAY)
      const truth = bodyPositionAt('mars', days * DAY)
      // The orbit is exactly the right *shape*: a circular orbit propagates to
      // the same radius for ever, to a metre in 228 million kilometres.
      expect(there.radiusM).toBeCloseTo(Math.hypot(truth.x, truth.y), 0)

      // Along the track it drifts, and the drift is in the data rather than in
      // the solver: `bodies.json` states both a semi-major axis and a period,
      // and for Mars they disagree by 12.5 parts per million (Ceres by 923).
      // This propagates on Kepler's third law from the axis, `bodyPositionAt`
      // on the stated period, so they separate at exactly that rate -- 1,300 km
      // over fifty days. Stating a number that can be derived is how the two
      // come to disagree; the ports had the same fault and had it taken out.
      const drift = Math.hypot(there.position.x - truth.x, there.position.y - truth.y)
      const alongTrack = Math.hypot(truth.x, truth.y) * 2 * Math.PI * (days / 686.98)
      expect(drift / alongTrack).toBeLessThan(3e-5)
    }
  })
})
