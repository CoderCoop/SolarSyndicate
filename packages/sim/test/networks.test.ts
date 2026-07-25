/**
 * The five resource networks. Design doc §3.2, §7.4.
 *
 * M1's claim is that the ship is a *system*: a failure in one place has to
 * show up somewhere else, on its own, while nobody is watching. Most of these
 * tests are about that propagation rather than about any single gauge.
 */
import { describe, expect, it } from 'vitest'
import {
  advanceTo,
  applyCommand,
  createWorld,
  lifeSupportView,
  powerView,
  roomViews,
} from '../src/engine.js'
import { DERATE_SCALE, powerBalance } from '../src/networks.js'
import { DAY, HOUR } from '../src/time.js'
import type { SimState } from '../src/types.js'

const SEED = 7
const START_UTC = Date.UTC(2026, 6, 25, 14, 30, 0)

const world = () => createWorld(SEED, START_UTC)

function enable(s: SimState, partId: string, enabled: boolean, dt = HOUR): SimState {
  return applyCommand(s, { at: s.now + dt, command: { kind: 'SET_PART_ENABLED', partId, enabled } })
}

function part(s: SimState, id: string) {
  return s.ship.parts.find((p) => p.id === id)!
}

/** Force a part to fail now, the way a threshold roll would. */
function breakPart(s: SimState, id: string): SimState {
  const next = structuredClone(s)
  const p = next.ship.parts.find((x) => x.id === id)!
  p.broken = true
  p.enabled = false
  // Re-resolve through the public path so rates and events are consistent.
  return applyCommand(next, {
    at: next.now + 1,
    command: { kind: 'SET_PART_ENABLED', partId: 'comms.array', enabled: false },
  })
}

function until(s: SimState, days: number, pred: (s: SimState) => boolean): SimState {
  for (let i = 0; i < days * 24; i++) {
    if (pred(s)) return s
    s = advanceTo(s, s.now + HOUR)
  }
  return s
}

describe('power', () => {
  it('starts with generation ahead of demand, but degraded by a worn plant', () => {
    const v = powerView(world())
    // The reactor is at 79% and the ship has a good engineer aboard, so
    // production lands below the 25.5 kW nameplate but comfortably positive.
    expect(v.productionKw).toBeGreaterThan(23)
    expect(v.productionKw).toBeLessThan(25.5)
    expect(v.demandKw).toBeCloseTo(16.0, 6)
    expect(v.netKw).toBeGreaterThan(0)
  })

  it('room totals add up to the ship total, so a deficit can be traced', () => {
    // §1 pillar 1. If these disagree the player cannot reason about the ship.
    const s = enable(world(), 'engine.ntr.preheat', true)
    const rooms = roomViews(s)
    const total = rooms.reduce((sum, r) => sum + r.netKw, 0)
    expect(total).toBeCloseTo(powerView(s).netKw, 9)
  })

  it('goes into deficit when the engines are brought up', () => {
    const v = powerView(enable(world(), 'engine.ntr.preheat', true))
    expect(v.netKw).toBeLessThan(0)
    expect(v.boundKind).toBe('empty')
    expect(Number.isFinite(v.secondsToBound)).toBe(true)
  })

  it('refuses to switch off a system the crew depend on', () => {
    // §7.4: the ship must not be able to kill its own crew to save power.
    const s = enable(world(), 'life.oxygen.electrolysis', false)
    expect(part(s, 'life.oxygen.electrolysis').enabled).toBe(true)
  })

  it('sheds the lowest-priority load when the battery runs out, and only that', () => {
    let s = enable(world(), 'engine.ntr.preheat', true)
    s = until(s, 12, (x) => x.ship.brownout)

    expect(s.ship.brownout).toBe(true)
    expect(part(s, 'engine.ntr.preheat').shed).toBe(true)
    // The 4.2 kW hydroponics rack was not needed to restore balance.
    expect(part(s, 'life.hydroponics.lamps').enabled).toBe(true)
    for (const id of ['life.scrubber.co2', 'life.oxygen.electrolysis', 'thermal.loop.radiators']) {
      expect(part(s, id).enabled).toBe(true)
    }
    expect(powerView(s).netKw).toBeGreaterThanOrEqual(0)
  })
})

describe('heat', () => {
  it('holds nominal while the radiators can carry the load', () => {
    const v = lifeSupportView(advanceTo(world(), 3 * DAY))
    expect(v.temperatureC).toBeCloseTo(21, 6)
    expect(v.heatMarginKw).toBeGreaterThan(0)
    expect(v.tempStatus).toBe('nominal')
  })

  it('couples to power: running the engines adds their draw to the heat load', () => {
    const before = lifeSupportView(world()).heatInKw
    const after = lifeSupportView(enable(world(), 'engine.ntr.preheat', true)).heatInKw
    // Every watt consumed inside the hull ends up as heat.
    expect(after - before).toBeCloseTo(14, 6)
  })

  it('trips the reactor when the loop cannot reject what the plant makes', () => {
    // §7.4: heat can cook a ship faster than a message reaches it, so the
    // response has to be automatic and bounded.
    let s = breakPart(world(), 'thermal.loop.radiators')
    expect(lifeSupportView(s).heatMarginKw).toBeLessThan(0)

    s = until(s, 4, (x) => x.ship.thermalTrip)
    expect(s.ship.thermalTrip).toBe(true)

    const alert = s.log.find((l) => l.text.includes('Thermal trip'))
    expect(alert).toBeDefined()
    expect(alert!.level).toBe('alert')

    // Derated, but still generating something.
    const v = powerView(s)
    expect(v.productionKw).toBeGreaterThan(0)
    expect(v.productionKw).toBeLessThan(25.5 * DERATE_SCALE + 4)
  })

  it('does not cook the ship while nobody is watching', () => {
    // Walk away for a month with the radiators dead.
    const s = advanceTo(breakPart(world(), 'thermal.loop.radiators'), 30 * DAY)
    const v = lifeSupportView(s)
    expect(s.ship.thermalTrip).toBe(true)
    // Bounded: the derate plus passive hull radiation find an equilibrium
    // rather than climbing to the reservoir's ceiling.
    expect(v.temperatureC).toBeLessThan(50)
    expect(v.temperatureC).toBeGreaterThan(30)
    for (const crew of s.crew) {
      expect(crew.health.value).toBeGreaterThanOrEqual(crew.health.min)
    }
  })
})

describe('atmosphere', () => {
  it('keeps CO2 nominal with the scrubber running', () => {
    const v = lifeSupportView(advanceTo(world(), 5 * DAY))
    expect(v.co2Ppm).toBeLessThan(2500)
    expect(v.co2Status).toBe('nominal')
  })

  it('climbs to dangerous levels within days if the scrubber fails', () => {
    const s = advanceTo(breakPart(world(), 'life.scrubber.co2'), 3 * DAY)
    const v = lifeSupportView(s)
    expect(v.co2Ppm).toBeGreaterThan(10000)
    expect(v.co2Status).toBe('critical')
  })

  it('bad air makes the crew worse at their jobs -- the coupling that matters', () => {
    // A failure has to propagate into something the player already watches.
    const healthy = world()
    const choking = advanceTo(breakPart(world(), 'life.scrubber.co2'), 4 * DAY)

    const onWatch = (s: SimState) => s.crew.filter((c) => c.activity === 'watch')
    expect(onWatch(choking).length).toBeGreaterThan(0)

    const before = Math.max(...healthy.crew.map((c) => c.health.value))
    const after = Math.max(...choking.crew.map((c) => c.health.value))
    expect(after).toBeLessThan(before)
  })

  it('never lets the crew fall below the M1 health floor', () => {
    // §7.4 bounded decay. Mortality is an M3 system (§4.5), not an M1 accident.
    const s = advanceTo(breakPart(world(), 'life.scrubber.co2'), 90 * DAY)
    for (const crew of s.crew) {
      expect(crew.health.value).toBeGreaterThanOrEqual(10)
    }
  })
})

describe('water', () => {
  it('is a four-year problem with the recycler, and a three-week one without', () => {
    // The recycler is second-hand at 68%, so closure is well short of its
    // 97% nameplate -- worn parts underperform before they fail (§3.3).
    const closed = lifeSupportView(world())
    expect(closed.recycleFraction).toBeGreaterThan(0.8)
    expect(closed.recycleFraction).toBeLessThan(0.97)
    expect(closed.waterDays).toBeGreaterThan(200)

    const open = lifeSupportView(breakPart(world(), 'life.water.recycler'))
    expect(open.recycleFraction).toBe(0)
    expect(open.waterDays).toBeLessThan(60)
    expect(open.waterDays).toBeGreaterThan(20)
  })
})

describe('the crew are a load, not a headcount', () => {
  it('consumption tracks what people are actually doing', () => {
    const s = world()
    const balanceAt = (x: SimState) => powerBalance(x, x.now)
    expect(balanceAt(s).demandKw).toBeGreaterThan(0)

    // Across a day the watch rotates, so the metabolic load changes without
    // anyone touching a control.
    const loads = new Set<number>()
    let t = s
    for (let i = 0; i < 3; i++) {
      t = advanceTo(t, t.now + 8 * HOUR)
      loads.add(Math.round(lifeSupportView(t).heatInKw * 100))
    }
    expect(loads.size).toBeGreaterThan(1)
  })
})
