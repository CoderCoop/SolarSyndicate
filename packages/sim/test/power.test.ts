/**
 * Power network behaviour. Design doc §3.2, §7.4.
 */
import { describe, expect, it } from 'vitest'
import { advanceTo, applyCommand, createWorld, powerView, roomViews } from '../src/engine.js'
import { DAY, HOUR } from '../src/time.js'
import type { SimState } from '../src/types.js'

const SEED = 7
const START_UTC = Date.UTC(2026, 6, 25, 14, 30, 0)

const world = () => createWorld(SEED, START_UTC)

function enable(s: SimState, partId: string, enabled: boolean, dt = HOUR): SimState {
  return applyCommand(s, { at: s.now + dt, command: { kind: 'SET_PART_ENABLED', partId, enabled } })
}

/** Advance until a predicate holds, or give up after `days`. */
function until(s: SimState, days: number, pred: (s: SimState) => boolean): SimState {
  for (let i = 0; i < days * 24; i++) {
    if (pred(s)) return s
    s = advanceTo(s, s.now + HOUR)
  }
  return s
}

describe('power balance', () => {
  it('starts with the reactor comfortably ahead of demand', () => {
    const v = powerView(world())
    expect(v.productionKw).toBeCloseTo(25.5, 6) // 22.0 reactor + 3.5 solar
    expect(v.demandKw).toBeCloseTo(16.0, 6) // everything but engine preheat
    expect(v.netKw).toBeGreaterThan(0)
    expect(v.boundKind).toBe('full')
  })

  it('goes into deficit when the engines are brought up', () => {
    const v = powerView(enable(world(), 'engine.ntr.preheat', true))
    expect(v.netKw).toBeCloseTo(-4.5, 6)
    expect(v.boundKind).toBe('empty')
    expect(v.secondsToBound).toBeGreaterThan(0)
    expect(Number.isFinite(v.secondsToBound)).toBe(true)
  })

  it('charges to full and then stops, wasting the surplus', () => {
    const s = advanceTo(world(), world().now + 5 * DAY)
    const v = powerView(s)
    expect(v.batteryKwh).toBeCloseTo(v.batteryCapacityKwh, 6)
    expect(v.boundKind).toBe('none')
    expect(s.log.some((l) => l.text.includes('full charge'))).toBe(true)
  })

  it('refuses to switch off a part the crew depend on', () => {
    // §7.4: the ship must not be able to kill its own crew to save power.
    const s = enable(world(), 'life.oxygen.electrolysis', false)
    const scrubber = s.ship.parts.find((p) => p.id === 'life.oxygen.electrolysis')!
    expect(scrubber.enabled).toBe(true)
  })
})

describe('load shedding', () => {
  it('sheds the lowest-priority loads when the battery runs out', () => {
    let s = enable(world(), 'engine.ntr.preheat', true)
    s = until(s, 10, (x) => x.ship.brownout)

    expect(s.ship.brownout).toBe(true)

    const preheat = s.ship.parts.find((p) => p.id === 'engine.ntr.preheat')!
    expect(preheat.enabled).toBe(false)
    expect(preheat.shed).toBe(true)

    // Critical life support was never a candidate.
    for (const id of ['life.scrubber.co2', 'life.oxygen.electrolysis', 'thermal.loop.pumps']) {
      expect(s.ship.parts.find((p) => p.id === id)!.enabled).toBe(true)
    }
  })

  it('sheds only as much as it needs to', () => {
    let s = enable(world(), 'engine.ntr.preheat', true)
    s = until(s, 10, (x) => x.ship.brownout)

    // Dropping the 14 kW preheat alone restores a positive balance, so the
    // 4.2 kW hydroponics lamps should have survived.
    expect(s.ship.parts.find((p) => p.id === 'life.hydroponics.lamps')!.enabled).toBe(true)
    expect(powerView(s).netKw).toBeGreaterThanOrEqual(0)
  })

  it('writes a dispatch the player can read on their return', () => {
    // §7.4: "return is a story", not a wall of red numbers.
    let s = enable(world(), 'engine.ntr.preheat', true)
    s = until(s, 10, (x) => x.ship.brownout)

    const alert = s.log.find((l) => l.level === 'alert')
    expect(alert).toBeDefined()
    expect(alert!.text).toContain('Brownout')
    expect(alert!.text).toContain('NTR Preheat')
  })

  it('recovers on command and starts charging again', () => {
    let s = enable(world(), 'engine.ntr.preheat', true)
    s = until(s, 10, (x) => x.ship.brownout)
    s = applyCommand(s, { at: s.now + HOUR, command: { kind: 'RESET_BROWNOUT' } })

    expect(s.ship.brownout).toBe(false)
    // Restoring the shed load puts us straight back into deficit -- the player
    // has to actually fix the underlying problem.
    expect(powerView(s).netKw).toBeCloseTo(-4.5, 6)

    s = enable(s, 'engine.ntr.preheat', false)
    expect(powerView(s).netKw).toBeGreaterThan(0)
  })

  it('shedding happens unattended, and the world stays sane afterwards', () => {
    let s = enable(world(), 'engine.ntr.preheat', true)
    // Walk away for a fortnight.
    s = advanceTo(s, s.now + 14 * DAY)

    expect(s.ship.brownout).toBe(true)
    const v = powerView(s)
    expect(v.netKw).toBeGreaterThanOrEqual(0)
    expect(v.batteryKwh).toBeGreaterThan(0) // recharged after shedding
    expect(v.batteryKwh).toBeLessThanOrEqual(v.batteryCapacityKwh + 1e-9)
  })
})

describe('room views', () => {
  it('orders rooms as a vertical stack, nose first', () => {
    // §3.1: the cross-section is a tall stack; decks must come out in order.
    const rooms = roomViews(world())
    expect(rooms.map((r) => r.id)).toEqual([
      'bridge',
      'quarters',
      'life-support',
      'cargo',
      'machinery',
      'reactor',
      'engines',
    ])
    expect(rooms.map((r) => r.deck)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('reports each room net power, so the player can trace a deficit', () => {
    const rooms = roomViews(world())
    const reactor = rooms.find((r) => r.id === 'reactor')!
    expect(reactor.netKw).toBeCloseTo(25.5, 6)

    const life = rooms.find((r) => r.id === 'life-support')!
    expect(life.netKw).toBeCloseTo(-(1.2 + 3.6 + 0.9 + 4.2), 6)

    const total = rooms.reduce((sum, r) => sum + r.netKw, 0)
    expect(total).toBeCloseTo(powerView(world()).netKw, 6)
  })
})
