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
