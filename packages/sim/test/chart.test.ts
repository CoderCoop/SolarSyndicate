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
