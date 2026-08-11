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
import { getBody } from '@solsyn/data'
import {
  AU,
  MU_SUN,
  bodyPositionAt,
  bodyVelocityAt,
  hohmannBetween,
  hohmannTransfer,
  synodicPeriodDays,
} from '../src/orbits.js'
import { interplanetaryLeg, lambert, orbitFrom, orbitStateAt } from '../src/lambert.js'
import { nextWindowS } from '../src/voyage.js'
import { DAY } from '../src/time.js'

/**
 * The cheapest departure at or after `from`, found the way the game finds it.
 *
 * It used to be the classical phase-angle formula. That formula is exact for
 * circular coplanar orbits and only for those -- the moment the planets got
 * their real ellipses it started naming an instant that is near the window and
 * not at it, which is precisely why `nextWindowS` is a search.
 */
function windowAt(fromBody: string, toBody: string, from = 0): number {
  return from + nextWindowS(fromBody, toBody, from, hohmannTransfer(fromBody, toBody).durationS)
}

/**
 * Two points on circles, half a turn apart: the textbook's own geometry.
 *
 * Stated here rather than taken from two planets, because the planets are on
 * ellipses now and a Hohmann between circles is no longer what their geometry
 * wants. The claim being tested is about the *solver* -- that it agrees with
 * the closed form where the closed form applies -- so the circles are the
 * honest way to ask it.
 */
function circularHop(r1: number, r2: number) {
  const hohmann = hohmannBetween(MU_SUN, r1, r2)
  // Departure at one apsis of the transfer, arrival half a turn later at the
  // other. True whichever way the crossing runs.
  const from = { x: r1, y: 0 }
  const to = { x: -r2, y: 0 }
  const arc = lambert(from, to, hohmann.durationS, MU_SUN)!
  /** A body's own velocity on a circle through `p`: prograde, perpendicular. */
  const circular = (p: { x: number; y: number }, r: number) => {
    const speed = Math.sqrt(MU_SUN / r)
    return { x: (-p.y / r) * speed, y: (p.x / r) * speed }
  }
  const vFrom = circular(from, r1)
  const vTo = circular(to, r2)
  const deltaVMs =
    Math.hypot(arc.departureVelocity.x - vFrom.x, arc.departureVelocity.y - vFrom.y) +
    Math.hypot(vTo.x - arc.arrivalVelocity.x, vTo.y - arc.arrivalVelocity.y)
  return { hohmann, arc, deltaVMs, from }
}

describe('Lambert reproduces the textbook where the textbook applies', () => {
  it('costs what a Hohmann costs, when a Hohmann is what the geometry wants', () => {
    // Two circular orbits at Earth's and Mars' semi-major axes, half a turn
    // apart, over the Hohmann time of flight -- so the transfer Lambert finds
    // has to be the Hohmann ellipse and the burns have to add to the same
    // figure. Within a metre per second on five and a half kilometres of it.
    const r1 = getBody('earth').semiMajorAxisAu * AU
    const r2 = getBody('mars').semiMajorAxisAu * AU
    const { hohmann, arc, deltaVMs, from } = circularHop(r1, r2)

    expect(deltaVMs).toBeCloseTo(hohmann.deltaVMs, 0)
    const orbit = orbitFrom(from, arc.departureVelocity, MU_SUN)!
    expect(orbit.semiMajorAxisM).toBeCloseTo(hohmann.semiMajorAxisM, -3)
    expect(orbit.eccentricity).toBeCloseTo(hohmann.eccentricity, 6)
  })

  it('and the same inbound, which is where a stretched ellipse got it wrong', () => {
    const r1 = getBody('mars').semiMajorAxisAu * AU
    const r2 = getBody('earth').semiMajorAxisAu * AU
    const { hohmann, deltaVMs } = circularHop(r1, r2)
    expect(deltaVMs).toBeCloseTo(hohmann.deltaVMs, 0)
  })

  it('costs more than the circular textbook once the planets are on ellipses', () => {
    // Not a defect: a Hohmann between two circles at the mean radii is an
    // approximation to a crossing between two ellipses, and the approximation
    // is cheap because it never has to change the shape of an orbit, only its
    // size. Mars at e=0.0934 arrives somewhere the circle is not.
    const hohmann = hohmannTransfer('earth', 'mars')
    const leg = interplanetaryLeg('earth', 'mars', windowAt('earth', 'mars'), hohmann.durationS)!
    expect(leg.deltaVMs).toBeGreaterThan(hohmann.deltaVMs)
    expect(leg.deltaVMs).toBeLessThan(hohmann.deltaVMs * 1.35)
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
    const synodic = synodicPeriodDays('earth', 'mars') * DAY
    const now = interplanetaryLeg('earth', 'mars', open, flightS)!.deltaVMs
    const later = interplanetaryLeg('earth', 'mars', open + synodic, flightS)!.deltaVMs
    const opposite = interplanetaryLeg('earth', 'mars', open + synodic / 2, flightS)!.deltaVMs

    // It used to be within a per cent, because two circles coming back to the
    // same phase come back to the same crossing exactly. Two ellipses do not:
    // the phase recurs at a different point of each world's own year, so one
    // window is cheaper than the next. That is the real reason Mars windows are
    // not all equal, and it is worth about a tenth here.
    expect(Math.abs(later - now) / now).toBeLessThan(0.15)
    // What has to hold is that it is a window at all -- far below the crossing
    // half a synodic period away, which is the one nobody can afford.
    expect(later).toBeLessThan(opposite / 2)
  })

  it('charges for haste, at the window where the comparison is fair', () => {
    // Measured against the cheapest crossing at that departure rather than
    // against the circular-Hohmann time. Those coincided while the planets were
    // circles; on ellipses the best time of flight at a given instant is its
    // own number, and comparing to the wrong baseline made a *faster* transfer
    // look cheaper than the slow one -- which read as haste being free.
    const open = windowAt('earth', 'mars')
    const hohmannS = hohmannTransfer('earth', 'mars').durationS
    const costAt = (s: number) => interplanetaryLeg('earth', 'mars', open, s)!.deltaVMs
    let slow = hohmannS
    for (let f = 0.6; f <= 1.4; f += 0.02) {
      if (costAt(hohmannS * f) < costAt(slow)) slow = hohmannS * f
    }

    const costs = [1, 0.85, 0.65].map((fraction) => costAt(slow * fraction))
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
    // And the ellipse comes back as the ellipse it went in as, rather than
    // being quietly rounded to a circle -- which is what this asserted while
    // Earth had no eccentricity to lose.
    expect(orbit.eccentricity).toBeCloseTo(getBody('earth').eccentricity, 6)
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
