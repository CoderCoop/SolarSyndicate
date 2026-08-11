/**
 * The star chart. Design doc §5.1, §1 pillar 2.
 *
 * A map is only worth drawing if it is true. These tests exist because a chart
 * is the easiest thing in a space game to fake -- lerp a dot between two
 * circles and nobody notices for a while -- and because §1 pillar 2 says the
 * numbers are real. The ship's charted position has to be where the transfer
 * maths actually puts it.
 */
import { describe, expect, it } from 'vitest'
import { content, getBody } from '@solsyn/data'
import {
  AU,
  MU_SUN,
  advanceTo,
  applyCommand,
  chartView,
  createWorld,
  crossing,
  hohmannTransfer,
  portPeriodS,
  stretchedTransfer,
  transferOptions,
  transferPositionAu,
} from '../src/index.js'
import { AU as AU_M, bodyRadiusAt } from '../src/orbits.js'

/**
 * How far a point is off a body's orbit, in AU.
 *
 * Against the conic itself rather than against the nearest drawn sample: at
 * ninety-six samples Ceres' ring has 0.18 AU between neighbours, so "close to a
 * sample" is a loose test of a tight property. r = p/(1 + e·cos ν) is exact.
 */
function offOrbit(bodyId: string, p: { x: number; y: number }): number {
  const b = getBody(bodyId)
  const nu = Math.atan2(p.y, p.x) - b.periapsisLongitudeRad
  const conic = (b.semiMajorAxisAu * (1 - b.eccentricity ** 2)) / (1 + b.eccentricity * Math.cos(nu))
  return Math.abs(Math.hypot(p.x, p.y) - conic)
}
import { DAY } from '../src/time.js'
import type { SimState } from '../src/types.js'

const T0 = Date.UTC(2200, 0, 1)
const world = () => createWorld(20260726, T0)

/** Book and fly the Luna run, which the starting ship can afford. */
function underWay(): SimState {
  let s = world()
  s = applyCommand(s, {
    at: s.now,
    command: { kind: 'ACCEPT_CONTRACT', contractId: 'contract.luna.parts' },
  })
  const option = transferOptions(s).find((o) => o.feasible)!
  return applyCommand(s, { at: s.now, command: { kind: 'DEPART', optionId: option.id } })
}

describe('the chart shows the system as it is', () => {
  it('draws every body that has a port on it, innermost first', () => {
    const chart = chartView(world())
    const expected = new Set(content.ports.map((p) => p.bodyId))
    expect(chart.bodies.map((b) => b.id).sort()).toEqual([...expected].sort())

    const radii = chart.bodies.map((b) => b.semiMajorAxisAu)
    expect(radii).toEqual([...radii].sort((a, b) => a - b))
  })

  it('labels a place by the ports berthed there', () => {
    const earth = chartView(world()).bodies.find((b) => b.id === 'earth')!
    // Gateway and Tranquillity are both Earth-adjacent (§5.1).
    expect(earth.ports.map((p) => p.id).sort()).toEqual(['port.gateway', 'port.tranquillity'])
  })

  it('puts bodies where the orbit maths puts them, not on a static ring', () => {
    const now = chartView(world()).bodies.find((b) => b.id === 'mars')!
    const later = chartView(advanceTo(world(), 200 * DAY)).bodies.find((b) => b.id === 'mars')!
    expect(Math.hypot(now.x - later.x, now.y - later.y)).toBeGreaterThan(0.5)
    // And it stays on its orbit while it moves -- which is an ellipse, so what
    // holds is that the radius lives between the apsides rather than that it
    // never changes. Mars runs 1.381 to 1.666 AU over her year.
    const mars = getBody('mars')
    for (const b of [now, later]) {
      const r = Math.hypot(b.x, b.y)
      expect(r).toBeGreaterThanOrEqual(mars.semiMajorAxisAu * (1 - mars.eccentricity) - 1e-9)
      expect(r).toBeLessThanOrEqual(mars.semiMajorAxisAu * (1 + mars.eccentricity) + 1e-9)
    }
    // And the drawn orbit is the one she is on, at both instants.
    for (const b of [now, later]) {
      expect(offOrbit('mars', b)).toBeLessThan(1e-9)
      for (const p of b.orbit) expect(offOrbit('mars', p)).toBeLessThan(1e-9)
    }
  })

  it('reaches far enough out to contain everything it draws', () => {
    const chart = chartView(world())
    // Apoapsis, not the axis: a plate sized to the mean clips the far half of
    // every orbit it draws.
    for (const b of chart.bodies) {
      for (const p of b.orbit) {
        expect(chart.extentAu).toBeGreaterThanOrEqual(Math.hypot(p.x, p.y))
      }
    }
    expect(chart.extentAu).toBeGreaterThanOrEqual(Math.hypot(chart.ship.x, chart.ship.y))
  })
})

describe('a berthed ship is at its port', () => {
  it('sits at its berth, which is near the body rather than on it', () => {
    // Gateway is 6,778 km up: 4.53e-5 AU, invisible on a solar-system plate and
    // very much not zero once the chart can zoom to a berth. Placing her at the
    // body's centre is what made the heliocentric frame and the world's own
    // frame disagree about where she was.
    const chart = chartView(world())
    expect(chart.ship.atPortId).toBe('port.gateway')
    const earth = chart.bodies.find((b) => b.id === 'earth')!
    const off = Math.hypot(chart.ship.x - earth.x, chart.ship.y - earth.y)
    expect(off).toBeCloseTo((6778 * 1000) / 1.495978707e11, 12)
  })

  it('draws no track when it is not going anywhere', () => {
    expect(chartView(world()).track).toHaveLength(0)
  })

  it("moves with its port as that world goes round the sun", () => {
    const now = chartView(world()).ship
    const later = chartView(advanceTo(world(), 120 * DAY)).ship
    expect(Math.hypot(now.x - later.x, now.y - later.y)).toBeGreaterThan(0.5)
  })
})

describe('a ship under way is on its actual trajectory', () => {
  it('starts a heliocentric transfer at the departure body', () => {
    // The ellipse begins where the ship left from, to the metre -- which is
    // wherever Earth actually is, not a nominal 1 AU.
    const p = transferPositionAu('port.gateway', 'port.phobos', 0, 0)
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(bodyRadiusAt('earth', 0) / AU_M, 6)
  })

  it('ends it at the target orbit, after exactly the transfer time', () => {
    const { durationS } = hohmannTransfer('earth', 'mars')
    const p = transferPositionAu('port.gateway', 'port.phobos', 0, durationS)
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(bodyRadiusAt('mars', durationS) / AU_M, 4)
  })

  it('climbs monotonically outbound, when it leaves at the window', () => {
    // At the window the crossing *is* a Hohmann, so it climbs the whole way.
    // Off the window it need not -- an ellipse forced to meet a planet that is
    // in the wrong place can dip before it climbs, and that is the geometry
    // rather than a fault in the drawing.
    const { durationS } = hohmannTransfer('earth', 'mars')
    const waitS = crossing('port.gateway', 'port.phobos', 0, 'window')!.waitS
    let previous = 0
    for (let i = 0; i <= 20; i++) {
      const p = transferPositionAu(
        'port.gateway',
        'port.phobos',
        0,
        waitS + (durationS * i) / 20,
        'window',
      )
      const r = Math.hypot(p.x, p.y)
      expect(r).toBeGreaterThanOrEqual(previous - 1e-6)
      previous = r
    }
  })

  it('falls inward when the run is inbound', () => {
    const { durationS } = hohmannTransfer('ceres', 'earth')
    const start = transferPositionAu('port.ceres', 'port.gateway', 0, 0)
    const end = transferPositionAu('port.ceres', 'port.gateway', 0, durationS)
    expect(Math.hypot(end.x, end.y)).toBeLessThan(Math.hypot(start.x, start.y))
  })

  it('never leaves the neighbourhood on a hop inside one well', () => {
    // Gateway to Tranquillity is Earth to Earth: she stays inside 384,400 km of
    // it, which is 0.0026 AU and nothing at all next to a crossing to Mars. She
    // is no longer *pinned* to the centre, though -- her offset from Earth is a
    // known vector now, and it is the same one the world's own frame draws.
    const s = underWay()
    const chart = chartView(s)
    expect(chart.ship.local).toBe(true)
    const earth = chart.bodies.find((b) => b.id === 'earth')!
    const off = Math.hypot(chart.ship.x - earth.x, chart.ship.y - earth.y)
    expect(off).toBeLessThan((384400 * 1000) / 1.495978707e11)
    const local = chart.local!
    expect(off).toBeCloseTo(Math.hypot(local.ship.x, local.ship.y), 12)
    expect(chart.track).toHaveLength(0)
  })

  it('reports how far through the crossing it is', () => {
    let s = underWay()
    expect(chartView(s).ship.fractionComplete).toBeCloseTo(0, 6)

    const arrival = s.voyage!.arrivesAt
    s = advanceTo(s, arrival / 2)
    const half = chartView(s).ship.fractionComplete!
    expect(half).toBeGreaterThan(0.4)
    expect(half).toBeLessThan(0.6)
  })

  it('goes back to being berthed once it arrives', () => {
    let s = underWay()
    s = advanceTo(s, s.voyage!.arrivesAt + DAY)
    const chart = chartView(s)
    expect(chart.ship.atPortId).toBe('port.tranquillity')
    expect(chart.ship.fromBodyId).toBeUndefined()
    expect(chart.track).toHaveLength(0)
  })
})

/**
 * The arc drawn is the arc that was bought.
 *
 * The chart used to rebuild the minimum-energy ellipse from the two orbit
 * radii and nothing else, so all three profiles were drawn identically: a
 * player who spent 5.3 km/s extra on Express watched the trajectory they had
 * declined. §1 pillar 2 says the numbers are real, and a picture of a
 * different trajectory is not more forgivable than a wrong number.
 */
/**
 * The arc drawn is the arc that was bought.
 *
 * The chart used to rebuild the minimum-energy ellipse from the two orbit radii
 * and nothing else, so all three profiles were drawn identically. It is the
 * Lambert solution now, which fixes a second and larger lie in the same place:
 * the arc used to end half a turn from where the ship left, and the target was
 * wherever its own orbit had put it. §1 pillar 2 says the numbers are real, and
 * a picture of a trajectory that misses is not more forgivable than a wrong
 * number.
 */
describe('the arc drawn is the trajectory that was chosen', () => {
  const PROFILES = ['economy', 'standard', 'express'] as const

  it('draws a visibly different arc for each profile', () => {
    // Different flight times are different ellipses, so at the same instant the
    // three are in different places -- at least seven million kilometres apart.
    // This was zero, to the last bit, when the profile was ignored.
    const points = PROFILES.map((id) =>
      transferPositionAu('port.gateway', 'port.phobos', 0, 140 * DAY, id),
    )
    for (let i = 1; i < points.length; i++) {
      const [a, b] = [points[i - 1]!, points[i]!]
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(0.05)
    }
  })

  it('ends on the target itself, on every profile and either direction', () => {
    // What Lambert bought. Not "reaches the target's orbit" -- reaches the
    // *target*, which is a different and much stronger claim, and the one the
    // old arc could only satisfy by luck.
    for (const [fromPort, toPort, toBody] of [
      ['port.gateway', 'port.phobos', 'mars'],
      ['port.ceres', 'port.gateway', 'earth'],
    ] as const) {
      for (const id of PROFILES) {
        const s = world()
        s.voyage = {
          optionId: id,
          fromPortId: fromPort,
          toPortId: toPort,
          departedAt: s.now,
          arrivesAt: s.now + 1,
          deltaVMs: 0,
          propellantSpentKg: 0,
        }
        s.ship.docked = false
        const flightS = chartView(s).track.length > 0 ? 0 : 0
        void flightS

        const chart = chartView(s)
        const last = chart.track.at(-1)!
        // The chart samples the arc over the flight, so its far end is the
        // arrival point -- which is where the target *will be*, not where it is
        // now and not merely somewhere on its ring. Comparing radii was enough
        // while the ring was a circle; on an ellipse the radius alone would
        // pass for a ship that arrived a season early.
        const target = chart.bodies.find((b) => b.id === toBody)!
        expect(offOrbit(toBody, last)).toBeLessThan(0.01)
        expect(Math.hypot(last.x - target.x, last.y - target.y)).toBeGreaterThan(0)
      }
    }
  })

  it('carries the arc into the chart, and names it', () => {
    // Built rather than flown: the starting ship cannot afford Mars, and the
    // point under test is the drawing, not the tank (§5.2).
    const s = world()
    const departedAt = s.now
    s.voyage = {
      optionId: 'express',
      fromPortId: 'port.gateway',
      toPortId: 'port.phobos',
      departedAt,
      arrivesAt: departedAt + 168 * DAY,
      deltaVMs: 0,
      propellantSpentKg: 0,
    }
    s.ship.docked = false

    const chart = chartView(s)
    expect(chart.ship.local).toBe(false)
    expect(chart.ship.profileLabel).toBe('Express')
    expect(chart.track.length).toBeGreaterThan(2)

    // Starts on Earth's orbit and finishes on Mars', at whatever radius each
    // of them happens to be at -- 1.004 and 1.44 AU here, not the axes.
    expect(offOrbit('earth', chart.track.at(0)!)).toBeLessThan(1e-6)
    expect(offOrbit('mars', chart.track.at(-1)!)).toBeLessThan(0.01)

    // And it is not the minimum-energy one: at the same elapsed time the cheap
    // ellipse puts the ship somewhere else entirely.
    const half = 84 * DAY
    const flown = transferPositionAu('port.gateway', 'port.phobos', departedAt, half, 'express')
    const declined = transferPositionAu('port.gateway', 'port.phobos', departedAt, half, 'economy')
    expect(Math.hypot(flown.x - declined.x, flown.y - declined.y)).toBeGreaterThan(0.05)
  })

  it('waits at the berth when the profile is to wait for the window', () => {
    // The months before the burn are not part of the arc, and drawing her
    // already under way through them would be the same lie as pinning her at
    // Earth for a cislunar crossing, at a very much larger scale.
    const s = world()
    s.voyage = {
      optionId: 'window',
      fromPortId: 'port.gateway',
      toPortId: 'port.phobos',
      departedAt: s.now,
      arrivesAt: s.now + 486 * DAY,
      deltaVMs: 0,
      propellantSpentKg: 0,
    }
    s.ship.docked = false

    const chart = chartView(s)
    const earth = chart.bodies.find((b) => b.id === 'earth')!
    // Still at Earth on the day she signed, 226 days before the burn.
    expect(Math.hypot(chart.ship.x - earth.x, chart.ship.y - earth.y)).toBeLessThan(0.01)
  })
})

describe('the chart reports where the ship is, how fast, and which way', () => {

  /**
   * Mars on Express, `elapsed` seconds into the crossing.
   *
   * Built rather than flown, as elsewhere in this file -- the starting ship
   * cannot afford Mars, and running the clock five months forward would kill
   * the crew and have the ship recovered out from under the test (§7.4). The
   * departure is backdated instead, which is the same geometry with none of
   * the consequences.
   */
  // Departing at the window, which is where the textbook shape holds: a
  // minimum-energy crossing leaves from periapsis, climbs the whole way and
  // tops out on the target's orbit. Off the window none of that is true, and
  // that is the geometry rather than a fault in the drawing -- `elapsed` here
  // counts from the burn, not from the day she signed.
  function toMars(elapsed = 0): SimState {
    const s = world()
    const departedAt = s.now
    // Measured from the departure instant, because that is what the window is
    // relative to -- backdating the departure instead moves the window with it.
    const waitS = crossing('port.gateway', 'port.phobos', departedAt, 'window')!.waitS
    s.voyage = {
      optionId: 'window',
      fromPortId: 'port.gateway',
      toPortId: 'port.phobos',
      departedAt,
      arrivesAt: departedAt + waitS + hohmannTransfer('earth', 'mars').durationS,
      deltaVMs: 0,
      propellantSpentKg: 0,
    }
    s.ship.docked = false
    s.now = departedAt + waitS + elapsed
    return s
  }

  /** The same crossing, `step` further on. For finite differences. */
  function stepped(s: SimState, step: number): SimState {
    return { ...s, now: s.now + step }
  }

  it('reports position as radius and longitude, agreeing with the dot', () => {
    for (const ship of [chartView(world()).ship, chartView(toMars(40 * DAY)).ship]) {
      expect(ship.radiusAu).toBeCloseTo(Math.hypot(ship.x, ship.y), 9)
      const drawn = ((Math.atan2(ship.y, ship.x) * 180) / Math.PI + 360) % 360
      expect(ship.longitudeDeg).toBeCloseTo(drawn, 9)
      expect(ship.longitudeDeg).toBeGreaterThanOrEqual(0)
      expect(ship.longitudeDeg).toBeLessThan(360)
    }
  })

  it('adds her berth\'s orbital velocity to the world\'s, not just one of them', () => {
    // She is alongside, and alongside is doing 29.8 km/s round the sun *and*
    // 7.67 km/s round the Earth. Both are real and they add, so her heliocentric
    // speed is somewhere between 22.1 and 37.5 depending on where in the
    // ninety-two minutes she is -- reporting either component alone quotes a
    // frame the chart is not drawn in.
    const ship = chartView(world()).ship
    const gateway = Math.sqrt(398600441800000 / (6778 * 1000)) / 1000
    expect(gateway).toBeCloseTo(7.67, 2)
    expect(ship.speedMs / 1000).toBeGreaterThan(29.78 - gateway - 0.01)
    expect(ship.speedMs / 1000).toBeLessThan(29.78 + gateway + 0.01)
    // And it really does swing across that range over one orbit, rather than
    // sitting at the world's own figure.
    const speeds = [0, 1200, 2400, 3600, 4800].map(
      (dt) => chartView(advanceTo(world(), dt)).ship.speedMs / 1000,
    )
    expect(Math.max(...speeds) - Math.min(...speeds)).toBeGreaterThan(5)
    expect(Math.hypot(ship.heading.x, ship.heading.y)).toBeCloseTo(1, 9)
  })

  it('points the heading along the way the dot actually moves', () => {
    // The check the whole readout rests on: the arrow has to be the derivative
    // of the drawing. A wrong sign or a quarter turn looks fine on the plate.
    for (const elapsed of [10 * DAY, 60 * DAY, 130 * DAY]) {
      const s = toMars(elapsed)
      const chart = chartView(s)
      const ahead = chartView(stepped(s, 0.5 * DAY)).ship
      const moved = { x: ahead.x - chart.ship.x, y: ahead.y - chart.ship.y }
      const length = Math.hypot(moved.x, moved.y)
      const dot = (moved.x * chart.ship.heading.x + moved.y * chart.ship.heading.y) / length
      expect(dot).toBeGreaterThan(0.999)
    }
  })

  it('gives a speed that is vis-viva on the ellipse she is on', () => {
    const s = toMars(60 * DAY)
    const { ship } = chartView(s)
    const a = (ship.apoapsisAu! + ship.periapsisAu!) / 2
    // v^2 = mu (2/r - 1/a), in AU-scaled metres.
    const expected = Math.sqrt(MU_SUN * (2 / (ship.radiusAu * AU) - 1 / (a * AU)))
    expect(ship.speedMs).toBeCloseTo(expected, 3)
    // And the finite difference agrees, so the number and the picture match.
    const step = 0.25 * DAY
    const ahead = chartView(stepped(s, step)).ship
    const measured = (Math.hypot(ahead.x - ship.x, ahead.y - ship.y) * AU) / step
    expect(measured / ship.speedMs).toBeCloseTo(1, 2)
  })

  it('slows as she climbs and says so with the flight path angle', () => {
    const early = chartView(toMars(10 * DAY)).ship
    const late = chartView(toMars(130 * DAY)).ship
    expect(late.radiusAu).toBeGreaterThan(early.radiusAu)
    expect(late.speedMs).toBeLessThan(early.speedMs)
    // Outbound is climbing, so the velocity has an outward component.
    expect(early.flightPathAngleRad).toBeGreaterThan(0)
    expect(late.flightPathAngleRad).toBeGreaterThan(0)
    // Departure is near an apsis, where the climb rate is nearly zero. It used
    // to land on zero to a millionth of a radian; on an ellipse the departure
    // is from a moving, non-circular orbit and the fitted arc leaves a few
    // milliradians of it, which is the geometry rather than a slip.
    expect(Math.abs(chartView(toMars()).ship.flightPathAngleRad)).toBeLessThan(0.02)
  })

  it('describes the shape of the course by its apsides', () => {
    const s = toMars(60 * DAY)
    const ship = chartView(s).ship
    // The burn happens after the window wait, so that is the instant Earth's
    // radius has to be read at.
    const burnAt = s.voyage!.departedAt + crossing('port.gateway', 'port.phobos', s.voyage!.departedAt, 'window')!.waitS
    // A minimum-energy crossing touches both orbits at its apsides: that is
    // what makes it the cheap one, and what the extra delta-v of a faster
    // profile buys you out of. The apsides are set by where the two worlds
    // actually are, which on ellipses is not their semi-major axes.
    expect(ship.periapsisAu!).toBeCloseTo(bodyRadiusAt('earth', burnAt) / AU_M, 2)
    expect(ship.apoapsisAu!).toBeGreaterThan(1.35)
    expect(ship.apoapsisAu!).toBeLessThan(1.7)
    expect(ship.radiusAu).toBeGreaterThanOrEqual(ship.periapsisAu! - 1e-9)
    expect(ship.radiusAu).toBeLessThanOrEqual(ship.apoapsisAu! + 1e-9)
  })

  it('says where the arc ends, and how much of it is left to fly', () => {
    const s = toMars(60 * DAY)
    const ship = chartView(s).ship
    // The intercept is on the destination orbit, because that is where the
    // arrival burn happens -- on the ellipse, at whatever radius Mars has got
    // to, rather than at a nominal 1.52 AU.
    expect(offOrbit('mars', ship.intercept!)).toBeLessThan(0.01)

    // Along the arc, so it is longer than the chord across it.
    const chord = Math.hypot(ship.intercept!.x - ship.x, ship.intercept!.y - ship.y)
    expect(ship.toGoAu!).toBeGreaterThan(chord)

    // And it runs down to nothing.
    // A day before arrival, on the crossing she is actually flying: minimum
    // energy from the window, not the Express ellipse the old model priced.
    const later = chartView(toMars(hohmannTransfer('earth', 'mars').durationS - DAY)).ship
    expect(later.toGoAu!).toBeLessThan(ship.toGoAu!)
    expect(later.toGoAu!).toBeLessThan(0.2)
  })

  it('keeps the plate big enough for an ellipse that overshoots', () => {
    // Express bulges past Mars by design (§5.2). Sizing the chart to the
    // orbits alone clipped off exactly the thing the player paid for.
    const chart = chartView(toMars(60 * DAY))
    for (const p of chart.track) {
      expect(chart.extentAu).toBeGreaterThanOrEqual(Math.hypot(p.x, p.y))
    }
    expect(chart.extentAu).toBeGreaterThan(chart.ship.apoapsisAu!)
  })

  it('reports the world\'s motion plus her own on a hop inside one well', () => {
    // Earth's 29.8 km/s with her orbit about Earth added, the same way the
    // berthed case adds it. Bounded by the fastest she can be going about the
    // Earth on this crossing, which is her speed at Gateway's radius.
    const ship = chartView(underWay()).ship
    expect(ship.local).toBe(true)
    const fastest = Math.sqrt(398600441800000 / (6778 * 1000)) / 1000
    expect(Math.abs(ship.speedMs / 1000 - 29.78)).toBeLessThan(fastest + 0.01)
    expect(ship.toGoAu).toBeUndefined()
  })
})

describe('the chart says how far away things are', () => {
  it('measures from the ship, not from the sun', () => {
    // Berthed at Gateway, so Earth is zero away and the others are not.
    const chart = chartView(world())
    const earth = chart.bodies.find((b) => b.id === 'earth')!
    expect(earth.distanceAu).toBeCloseTo(0, 9)
    for (const b of chart.bodies.filter((x) => x.id !== 'earth')) {
      expect(b.distanceAu).toBeGreaterThan(0.3)
    }
  })

  it('moves as the bodies do, which is the whole point of them moving', () => {
    // §5.1: "Mars is sometimes 0.5 AU away and sometimes 2.5". The chart drew
    // that motion faithfully and never once said what it cost.
    const now = chartView(world()).bodies.find((b) => b.id === 'mars')!.distanceAu
    const later = chartView(advanceTo(world(), 400 * DAY)).bodies.find(
      (b) => b.id === 'mars',
    )!.distanceAu
    expect(Math.abs(now - later)).toBeGreaterThan(0.5)
  })

  it('leads each body to where it will be, along its own orbit', () => {
    const chart = chartView(world())
    expect(chart.leadDays).toBeGreaterThan(0)
    for (const b of chart.bodies) {
      // The arc starts where the body is and every point of it lies on the
      // orbit -- a body does not change orbit, even though it changes radius.
      expect(b.leadArc[0]!.x).toBeCloseTo(b.x, 9)
      expect(b.leadArc[0]!.y).toBeCloseTo(b.y, 9)
      for (const p of b.leadArc) expect(offOrbit(b.id, p)).toBeLessThan(1e-9)
      // And it has actually moved, or the mark says nothing.
      const lead = b.leadArc.at(-1)!
      expect(Math.hypot(lead.x - b.x, lead.y - b.y)).toBeGreaterThan(0.01)
    }
  })
})

/**
 * The neighbourhood of one world. Design doc §5.1, §5.2, §1 pillar 2.
 *
 * Gateway to Tranquillity is 0.0026 AU. At every scale the solar-system plate
 * can usefully draw, the two berths and the ship are one dot -- so for five
 * days the chart pinned her at Earth and she never moved, while the mission
 * board's route strip showed her crossing the whole time. The instrument that
 * is supposed to be the truthful one was the one that looked broken.
 *
 * The standard here is higher than the route strip's, which draws a
 * half-ellipse-shaped flourish and interpolates the ship along it. This plate
 * claims its numbers are real, so she goes where Kepler puts her.
 */
describe('the chart can draw the world the ship is at, close up', () => {
  it('names the body and draws it to the same scale as the orbits round it', () => {
    const local = chartView(world()).local!
    expect(local.bodyId).toBe('earth')
    // 6,371 km as a fraction of an AU. The point of drawing it to scale is
    // that Earth's limb comes up almost to Gateway's ring, which is the honest
    // picture of how low a low orbit is.
    expect(local.bodyRadiusAu).toBeCloseTo((6371 * 1000) / 1.495978707e11, 9)
    const gateway = local.ports.find((p) => p.id === 'port.gateway')!
    expect(gateway.orbitRadiusAu).toBeGreaterThan(local.bodyRadiusAu)
    expect(gateway.orbitRadiusAu).toBeLessThan(local.bodyRadiusAu * 1.2)
  })

  it('puts Luna far enough out to explain why the hop takes five days', () => {
    const local = chartView(world()).local!
    const gateway = local.ports.find((p) => p.id === 'port.gateway')!
    const luna = local.ports.find((p) => p.id === 'port.tranquillity')!
    // 384,400 against 6,778 km: the factor of fifty-seven that is the entire
    // reason the crossing costs what it costs.
    expect(luna.orbitRadiusAu / gateway.orbitRadiusAu).toBeCloseTo(384400 / 6778, 3)
  })

  it('sits the ship at her berth when she is alongside', () => {
    const local = chartView(world()).local!
    const gateway = local.ports.find((p) => p.id === 'port.gateway')!
    expect(local.ship.x).toBeCloseTo(gateway.at.x, 12)
    expect(local.ship.y).toBeCloseTo(gateway.at.y, 12)
    expect(local.track).toHaveLength(0)
  })

  it('moves her along the real ellipse once she casts off', () => {
    // The whole point. Not interpolated between two rings: solved from the
    // same transfer the astrogator priced, about Earth's own mu.
    const s = underWay()
    const { departedAt, arrivesAt } = s.voyage!
    // Fractions of the *crossing*, not of the clock. A Gateway-to-Luna ellipse
    // is e = 0.97, so radius climbs steeply out of periapsis: a tenth of a per
    // cent of the way in she is already eleven per cent higher, and measuring
    // from t = 0 rather than from departure quietly tests the wrong thing.
    const at = (frac: number) =>
      chartView(advanceTo(s, departedAt + (arrivesAt - departedAt) * frac)).local!.ship

    const start = at(0)
    const middle = at(0.5)
    // Just short of arrival: at exactly `arrivesAt` the ARRIVE event has fired
    // and she is berthed, which is a different question from where the arc put
    // her. The arc's own far end is checked in the next test.
    const end = at(0.98)

    const r = (p: { x: number; y: number }) => Math.hypot(p.x, p.y)
    // Climbing the whole way out, from Gateway's ring toward Luna's.
    expect(r(start)).toBeLessThan(r(middle))
    expect(r(middle)).toBeLessThan(r(end))

    const local = chartView(s).local!
    const gateway = local.ports.find((p) => p.id === 'port.gateway')!
    const luna = local.ports.find((p) => p.id === 'port.tranquillity')!
    expect(r(start)).toBeCloseTo(gateway.orbitRadiusAu, 9)
    expect(r(end)).toBeGreaterThan(luna.orbitRadiusAu * 0.9)

    // And she has actually gone somewhere on the plate, which is the thing the
    // heliocentric frame could never show: fifty times Gateway's own orbit.
    expect(Math.hypot(end.x - start.x, end.y - start.y)).toBeGreaterThan(
      gateway.orbitRadiusAu * 50,
    )
  })

  it('draws the arc she is on, end to end', () => {
    const local = chartView(underWay()).local!
    expect(local.track.length).toBeGreaterThan(20)
    const gateway = local.ports.find((p) => p.id === 'port.gateway')!
    const luna = local.ports.find((p) => p.id === 'port.tranquillity')!
    expect(Math.hypot(local.track.at(0)!.x, local.track.at(0)!.y)).toBeCloseTo(
      gateway.orbitRadiusAu,
      6,
    )
    expect(Math.hypot(local.track.at(-1)!.x, local.track.at(-1)!.y)).toBeCloseTo(
      luna.orbitRadiusAu,
      5,
    )
  })

  it('reaches far enough out to hold everything it draws', () => {
    const local = chartView(underWay()).local!
    for (const p of [...local.track, local.ship, ...local.ports.map((x) => x.at)]) {
      expect(local.extentAu).toBeGreaterThanOrEqual(Math.hypot(p.x, p.y))
    }
  })

  it('says plainly when she is neither berthed nor in one world neighbourhood', () => {
    // `local` is built from where the voyage *departed*, so on a crossing
    // between worlds it is the neighbourhood she left -- with her drawn tied up
    // at a berth she cast off from three weeks ago. The chart's frame picker
    // withholds that frame, and this is the pair of flags it reads to know: no
    // berth, and the crossing is not inside one gravity well. Deriving it any
    // other way (guessing from a distance, say) is how it would come back.
    const s = world()
    const departedAt = s.now
    const { durationS } = stretchedTransfer('earth', 'mars', 1)
    s.voyage = {
      optionId: 'hohmann',
      fromPortId: 'port.gateway',
      toPortId: 'port.phobos',
      departedAt,
      arrivesAt: departedAt + durationS,
      deltaVMs: 0,
      propellantSpentKg: 0,
    }
    s.ship.docked = false

    const crossing = chartView(advanceTo(s, departedAt + 40 * DAY))
    expect(crossing.ship.atPortId).toBeUndefined()
    expect(crossing.ship.local).toBe(false)

    // Both flags say "yes, this frame is hers" in the two cases it is: berthed,
    // and hopping between two berths around the same world.
    expect(chartView(world()).ship.atPortId).toBe('port.gateway')
    expect(chartView(underWay()).ship.local).toBe(true)
  })

  it('puts every berth at a real bearing, derived rather than declared', () => {
    // This plate used to draw departure at zero and the destination opposite,
    // and said so: the angles between things were true, their bearing was not
    // claimed. Ports carry an epoch phase now and their periods follow from the
    // body's mu, so the bearing is a position -- which is what lets this frame
    // and the heliocentric one agree about where the ship is.
    const local = chartView(world()).local!
    const gateway = local.ports.find((p) => p.id === 'port.gateway')!
    expect(Math.atan2(gateway.at.y, gateway.at.x)).toBeCloseTo(0.42, 9)

    // And it goes round: Gateway's period is 92.6 minutes, so half of that puts
    // it on the far side of the Earth.
    const half = chartView(advanceTo(world(), 0.5 * portPeriodS('port.gateway'))).local!
    const then = half.ports.find((p) => p.id === 'port.gateway')!
    expect(then.at.x).toBeCloseTo(-gateway.at.x, 9)
    expect(then.at.y).toBeCloseTo(-gateway.at.y, 9)
  })

  it('derives that period from the body it orbits, not from a stated number', () => {
    // Kepler's third law on the same mu the crossing between two of this body's
    // ports is priced with. A stated period could disagree with that mu -- and
    // the half per cent that separates 27.45 days from Luna's observed 27.32 is
    // exactly the kind of disagreement that would put her where the transfer
    // maths does not think she is.
    const earthMu = 398600441800000
    for (const [id, radiusKm] of [
      ['port.gateway', 6778],
      ['port.tranquillity', 384400],
    ] as const) {
      const kepler = 2 * Math.PI * Math.sqrt((radiusKm * 1000) ** 3 / earthMu)
      expect(portPeriodS(id)).toBeCloseTo(kepler, 6)
    }
    expect(portPeriodS('port.gateway') / 60).toBeCloseTo(92.6, 1)
    expect(portPeriodS('port.tranquillity') / DAY).toBeCloseTo(27.45, 2)
  })
})
