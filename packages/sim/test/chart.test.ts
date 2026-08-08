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
import { content } from '@solsyn/data'
import {
  AU,
  MU_SUN,
  advanceTo,
  applyCommand,
  chartView,
  createWorld,
  hohmannTransfer,
  stretchedTransfer,
  transferOptions,
  transferPositionAu,
} from '../src/index.js'
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

    const radii = chart.bodies.map((b) => b.orbitRadiusAu)
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
    // And it stays on its orbit while it moves.
    for (const b of [now, later]) {
      expect(Math.hypot(b.x, b.y)).toBeCloseTo(b.orbitRadiusAu, 6)
    }
  })

  it('reaches far enough out to contain everything it draws', () => {
    const chart = chartView(world())
    for (const b of chart.bodies) expect(chart.extentAu).toBeGreaterThanOrEqual(b.orbitRadiusAu)
    expect(chart.extentAu).toBeGreaterThanOrEqual(Math.hypot(chart.ship.x, chart.ship.y))
  })
})

describe('a berthed ship is at its port', () => {
  it('sits on the body it is docked at', () => {
    const chart = chartView(world())
    expect(chart.ship.atPortId).toBe('port.gateway')
    const earth = chart.bodies.find((b) => b.id === 'earth')!
    expect(chart.ship.x).toBeCloseTo(earth.x, 9)
    expect(chart.ship.y).toBeCloseTo(earth.y, 9)
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
    // The ellipse begins where the ship left from, to the metre.
    const p = transferPositionAu('earth', 'mars', 0, 0)
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(1, 6)
  })

  it('ends it at the target orbit, after exactly the transfer time', () => {
    const { durationS } = hohmannTransfer('earth', 'mars')
    const p = transferPositionAu('earth', 'mars', 0, durationS)
    const mars = content.bodies.find((b) => b.id === 'mars')!
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(mars.orbitRadiusAu, 4)
  })

  it('climbs monotonically outbound, rather than jumping', () => {
    const { durationS } = hohmannTransfer('earth', 'mars')
    let previous = 0
    for (let i = 0; i <= 20; i++) {
      const p = transferPositionAu('earth', 'mars', 0, (durationS * i) / 20)
      const r = Math.hypot(p.x, p.y)
      expect(r).toBeGreaterThanOrEqual(previous - 1e-9)
      previous = r
    }
  })

  it('falls inward when the run is inbound', () => {
    const { durationS } = hohmannTransfer('ceres', 'earth')
    const start = transferPositionAu('ceres', 'earth', 0, 0)
    const end = transferPositionAu('ceres', 'earth', 0, durationS)
    expect(Math.hypot(end.x, end.y)).toBeLessThan(Math.hypot(start.x, start.y))
  })

  it('never leaves the neighbourhood on a hop inside one well', () => {
    // Gateway to Tranquillity is Earth to Earth. At solar-system scale the
    // ship has not moved, and drawing it halfway to nowhere would be a lie.
    const s = underWay()
    const chart = chartView(s)
    expect(chart.ship.local).toBe(true)
    const earth = chart.bodies.find((b) => b.id === 'earth')!
    expect(chart.ship.x).toBeCloseTo(earth.x, 9)
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
describe('the arc drawn is the trajectory that was chosen', () => {
  const MULTIPLIERS = { economy: 1, standard: 1.04, express: 1.12 } as const

  it('draws a visibly different arc for each profile', () => {
    // 140 days: still short of the Express arrival at 152, so all three are
    // genuinely in flight and the difference is shape rather than one of them
    // having stopped. Every pair is at least seven million kilometres apart --
    // this was zero, to the last bit, when the profile was ignored.
    const points = Object.values(MULTIPLIERS).map((m) =>
      transferPositionAu('earth', 'mars', 0, 140 * DAY, m),
    )
    for (let i = 1; i < points.length; i++) {
      const [a, b] = [points[i - 1]!, points[i]!]
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(0.05)
    }
  })

  it('leaves the departure orbit and reaches the target one, on every profile', () => {
    for (const [from, to] of [
      ['earth', 'mars'],
      ['ceres', 'earth'],
    ] as const) {
      for (const m of Object.values(MULTIPLIERS)) {
        const { durationS } = stretchedTransfer(from, to, m)
        const start = transferPositionAu(from, to, 0, 0, m)
        const end = transferPositionAu(from, to, 0, durationS, m)
        expect(Math.hypot(start.x, start.y)).toBeCloseTo(
          content.bodies.find((b) => b.id === from)!.orbitRadiusAu,
          4,
        )
        expect(Math.hypot(end.x, end.y)).toBeCloseTo(
          content.bodies.find((b) => b.id === to)!.orbitRadiusAu,
          4,
        )
      }
    }
  })

  it('dips inside the destination orbit on a stretched run home', () => {
    // The whole point of paying for a fast inbound leg: perihelion goes below
    // the target so the ship crosses the orbit early. Drawn on the Hohmann
    // conic this was invisible, because the Hohmann conic bottoms out exactly
    // at the destination.
    const { durationS } = stretchedTransfer('ceres', 'earth', 1.12)
    const radii = Array.from({ length: 41 }, (_, i) => {
      const p = transferPositionAu('ceres', 'earth', 0, (durationS * i) / 40, 1.12)
      return Math.hypot(p.x, p.y)
    })
    // Falls the whole way, never climbing back.
    for (let i = 1; i < radii.length; i++) expect(radii[i]!).toBeLessThanOrEqual(radii[i - 1]! + 1e-9)
    // And it is still going down when it crosses Earth's orbit -- the arrival
    // burn catches it there rather than the ellipse levelling out.
    expect(radii.at(-1)!).toBeCloseTo(1, 4)
    expect(radii.at(-2)!).toBeGreaterThan(1)
  })

  it('carries the arc into the chart, and names it', () => {
    // Built rather than flown: the starting ship cannot afford Mars, and the
    // point under test is the drawing, not the tank (§5.2).
    const s = world()
    const departedAt = s.now
    const { durationS } = stretchedTransfer('earth', 'mars', MULTIPLIERS.express)
    s.voyage = {
      optionId: 'express',
      fromPortId: 'port.gateway',
      toPortId: 'port.phobos',
      departedAt,
      arrivesAt: departedAt + durationS,
      deltaVMs: 0,
      propellantSpentKg: 0,
    }
    s.ship.docked = false

    const chart = chartView(s)
    expect(chart.ship.local).toBe(false)
    expect(chart.ship.profileLabel).toBe('Express')
    expect(chart.track.length).toBeGreaterThan(2)

    // The drawn track is the Express ellipse, end to end.
    const first = chart.track.at(0)!
    const last = chart.track.at(-1)!
    expect(Math.hypot(first.x, first.y)).toBeCloseTo(1, 4)
    expect(Math.hypot(last.x, last.y)).toBeCloseTo(1.523679, 4)

    // And it is not the minimum-energy one: at the same elapsed time the cheap
    // ellipse puts the ship somewhere else entirely.
    const half = durationS / 2
    const flown = transferPositionAu('earth', 'mars', departedAt, half, MULTIPLIERS.express)
    const declined = transferPositionAu('earth', 'mars', departedAt, half, MULTIPLIERS.economy)
    expect(Math.hypot(flown.x - declined.x, flown.y - declined.y)).toBeGreaterThan(0.05)
  })
})

/**
 * Launch windows. Design doc §5.1.
 *
 * "Planets *move* -- Mars is sometimes 0.5 AU away and sometimes 2.5, so
 * **launch windows are real gameplay** and the astrogator's job."
 *
 * The maths for this was written and tested in M2 and then referenced by
 * nothing at all, which made it a fact about the simulation rather than
 * gameplay. These tests are about it being reachable and, more importantly,
 * being *right* -- a window that says "227 days" and is wrong is worse than no
 * window, because the player will plan around it.
 */
describe('the chart says when a crossing is worth flying', () => {
  it('offers a window to everywhere but where the ship already is', () => {
    const chart = chartView(world())
    expect(chart.windows.map((w) => w.toBodyId).sort()).toEqual(['ceres', 'mars'])
  })

  it('puts the soonest one first, because that is the one to act on', () => {
    const chart = chartView(world())
    const days = chart.windows.map((w) => w.daysToWindow)
    expect(days).toEqual([...days].sort((a, b) => a - b))
  })

  it('is right: waiting the stated time actually opens it', () => {
    // The check that matters. A window that says 227 days and is wrong is
    // worse than no window, because the player will plan around it.
    const s = world()
    for (const w of chartView(s).windows) {
      const later = chartView(advanceTo(s, s.now + w.daysToWindow * DAY))
      const then = later.windows.find((x) => x.toBodyId === w.toBodyId)!
      expect(Math.abs(then.offByRad)).toBeLessThan(0.02)
      expect(then.open).toBe(true)
    }
  })

  it('comes round again on the synodic period', () => {
    // Earth and Mars line up every 780 days, which is the textbook figure and
    // the reason a missed window is expensive.
    const mars = chartView(world()).windows.find((w) => w.toBodyId === 'mars')!
    expect(mars.synodicDays).toBeGreaterThan(770)
    expect(mars.synodicDays).toBeLessThan(790)
    expect(mars.daysToWindow).toBeLessThanOrEqual(mars.synodicDays)
  })

  it('reports zero days left once it is open', () => {
    const s = world()
    const mars = chartView(s).windows.find((w) => w.toBodyId === 'mars')!
    const atWindow = chartView(advanceTo(s, s.now + mars.daysToWindow * DAY))
    const open = atWindow.windows.find((w) => w.toBodyId === 'mars')!
    expect(open.open).toBe(true)
    expect(open.daysToWindow).toBe(0)
  })
})

/**
 * Ship telemetry. Design doc §5.1, §1 pillar 2.
 *
 * The chart knew where the ship was and nothing else about her -- not how
 * fast, not which way, not where the arc ended. Every one of those numbers
 * already existed in the transfer maths; none of them had ever been read.
 *
 * The test that matters here is the finite-difference one. A velocity that is
 * not the derivative of the drawn position is a decoration, and it is the
 * easiest possible thing to get subtly wrong -- a sign, a frame, a quarter
 * turn -- while still looking plausible on the plate.
 */
describe('the chart reports where the ship is, how fast, and which way', () => {
  const MARS_EXPRESS_S = stretchedTransfer('earth', 'mars', 1.12).durationS

  /**
   * Mars on Express, `elapsed` seconds into the crossing.
   *
   * Built rather than flown, as elsewhere in this file -- the starting ship
   * cannot afford Mars, and running the clock five months forward would kill
   * the crew and have the ship recovered out from under the test (§7.4). The
   * departure is backdated instead, which is the same geometry with none of
   * the consequences.
   */
  function toMars(elapsed = 0): SimState {
    const s = world()
    const departedAt = s.now - elapsed
    s.voyage = {
      optionId: 'express',
      fromPortId: 'port.gateway',
      toPortId: 'port.phobos',
      departedAt,
      arrivesAt: departedAt + MARS_EXPRESS_S,
      deltaVMs: 0,
      propellantSpentKg: 0,
    }
    s.ship.docked = false
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

  it('gives a berthed ship her port\'s orbital velocity, not zero', () => {
    // She is alongside, and alongside is doing 29.8 km/s. Reporting zero would
    // be quoting a frame the chart is not drawn in.
    const ship = chartView(world()).ship
    expect(ship.speedMs / 1000).toBeCloseTo(29.78, 1)
    // Circular orbit: all of it across the radius, none along it.
    expect(ship.flightPathAngleRad).toBe(0)
    expect(ship.heading.x * ship.x + ship.heading.y * ship.y).toBeCloseTo(0, 6)
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
    // Departure is at an apsis, where the climb rate is zero.
    expect(chartView(toMars()).ship.flightPathAngleRad).toBeCloseTo(0, 6)
  })

  it('describes the shape of the course by its apsides', () => {
    const ship = chartView(toMars(60 * DAY)).ship
    // Express throws apoapsis past Mars, which is what the extra delta-v buys.
    expect(ship.periapsisAu).toBeCloseTo(1, 3)
    expect(ship.apoapsisAu!).toBeGreaterThan(1.523679)
    expect(ship.radiusAu).toBeGreaterThanOrEqual(ship.periapsisAu! - 1e-9)
    expect(ship.radiusAu).toBeLessThanOrEqual(ship.apoapsisAu! + 1e-9)
  })

  it('says where the arc ends, and how much of it is left to fly', () => {
    const s = toMars(60 * DAY)
    const ship = chartView(s).ship
    // The intercept is on the destination orbit, because that is where the
    // arrival burn happens.
    expect(Math.hypot(ship.intercept!.x, ship.intercept!.y)).toBeCloseTo(1.523679, 3)

    // Along the arc, so it is longer than the chord across it.
    const chord = Math.hypot(ship.intercept!.x - ship.x, ship.intercept!.y - ship.y)
    expect(ship.toGoAu!).toBeGreaterThan(chord)

    // And it runs down to nothing.
    const later = chartView(toMars(MARS_EXPRESS_S - DAY)).ship
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

  it('reports the body\'s own motion on a hop inside one well', () => {
    // Gateway to Tranquillity does not move at solar-system scale, so the
    // heliocentric telemetry is Earth's -- which is the truth of it, not a
    // placeholder.
    const ship = chartView(underWay()).ship
    expect(ship.local).toBe(true)
    expect(ship.speedMs / 1000).toBeCloseTo(29.78, 1)
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

  it('leads each body to where it will be, on its own orbit', () => {
    const chart = chartView(world())
    expect(chart.leadDays).toBeGreaterThan(0)
    for (const b of chart.bodies) {
      // The lead mark sits on the same circle: a body does not change orbit.
      expect(Math.hypot(b.lead.x, b.lead.y)).toBeCloseTo(b.orbitRadiusAu, 6)
      // And it has actually moved, or the mark says nothing.
      expect(Math.hypot(b.lead.x - b.x, b.lead.y - b.y)).toBeGreaterThan(0.01)
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

  it('says its angles are the transfer own reference, not a modelled sky', () => {
    // The sim does not track where Luna is in its month. Inventing a phase
    // would be a number the player could check and find made up, so the flag
    // is on the data rather than in a comment nobody reads.
    expect(chartView(world()).local!.phaseIsRelative).toBe(true)
  })
})
