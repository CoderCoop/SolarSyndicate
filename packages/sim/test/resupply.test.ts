/**
 * Station services. Design doc §3.2, §7.3.
 *
 * Five stores have topped themselves up while alongside since M1 -- it is why
 * the first milestone's tension is failures rather than supply -- and until
 * now nothing said so. No dispatch, no switch. A player could watch the tanks
 * fill and have no way to tell the station from the recycler from a bug.
 */
import { describe, expect, it } from 'vitest'
import {
  ALONGSIDE_RATES,
  advanceTo,
  applyCommand,
  createWorld,
  recentLog,
  transferOptions,
  resupplying,
  type SimState,
} from '../src/index.js'
import { DAY } from '../src/time.js'

const world = () => createWorld(20260726, Date.UTC(2200, 0, 1))

const setResupplyOrder = (s: SimState, on: boolean) =>
  applyCommand(s, { at: s.now, command: { kind: 'SET_STANDING_ORDER', order: 'resupply', on } })

/** Every dispatch since the world began, newest first. */
const dispatches = (s: SimState) => recentLog(s).map((l) => l.text)

describe('the pumps run while alongside, and say that they are', () => {
  it('is on by default, because nobody wants to ask for budgeted water', () => {
    const s = world()
    expect(s.ship.standingOrders.resupply).toBe(true)
    expect(resupplying(s)).toBe(true)
  })

  it('fills the stores at the stated rates', () => {
    // Drain something, then leave her alongside for a day.
    const s = world()
    s.ship.resources.water.value = 400
    const before = s.ship.resources.water.value
    const after = advanceTo(s, s.now + DAY)
    // The recycler is running too, so this is at least the station's share.
    expect(after.ship.resources.water.value).toBeGreaterThan(before)
  })

  it('stops when the order is switched off', () => {
    const s = setResupplyOrder(world(), false)
    expect(resupplying(s)).toBe(false)
    expect(s.ship.resources.spares.rate).toBe(0)
    expect(s.ship.resources.propellant.rate).toBe(0)
  })

  it('and starts again when it is switched back on', () => {
    const s = setResupplyOrder(setResupplyOrder(world(), false), true)
    expect(resupplying(s)).toBe(true)
    expect(s.ship.resources.propellant.rate).toBeGreaterThan(0)
  })

  it('never runs under way, whatever the order says', () => {
    const s = world()
    s.ship.docked = false
    expect(resupplying(s)).toBe(false)
  })
})

describe('and the log says what came aboard', () => {
  it('says so when the switch is thrown, both ways', () => {
    const off = setResupplyOrder(world(), false)
    expect(dispatches(off).some((m) => /disconnected/i.test(m))).toBe(true)

    const on = setResupplyOrder(off, true)
    expect(dispatches(on).some((m) => /connected/i.test(m))).toBe(true)
  })

  it('names the stores and the amounts, in the units each is counted in', () => {
    const drained = world()
    // Empty the tanks so a stay alongside is a delivery worth reporting. Both
    // halves of the reservoir, or `levelAt` keeps extrapolating from the old
    // anchor and the tank is not actually empty (constitution V).
    for (const key of ['water', 'propellant', 'spares'] as const) {
      drained.ship.resources[key].value = key === 'propellant' ? 1000 : key === 'spares' ? 2 : 100
      drained.ship.resources[key].since = drained.now
    }
    // Re-arm the count against the drained tanks: the opening snapshot was
    // taken before this test emptied them.
    const s = setResupplyOrder(setResupplyOrder(drained, false), true)
    const later = setResupplyOrder(advanceTo(s, s.now + 6 * DAY), false)

    const line = dispatches(later).find((m) => /took on/.test(m))!
    expect(line).toBeTruthy()
    // Tonnes for propellant, a count for spares, kilogrammes for the rest --
    // "0.7 t" and "720 kg" are the same number and only one of them is how
    // anybody talks about a tank.
    expect(line).toMatch(/t propellant/)
    expect(line).toMatch(/\d+ spares/)
    expect(line).toMatch(/kg water/)
  })

  it('says nothing when nothing moved', () => {
    // A full ship touching a berth should not produce a dispatch saying so.
    // The log is for things that happened.
    const s = setResupplyOrder(world(), false)
    expect(dispatches(s).some((m) => /took on/.test(m))).toBe(false)
  })

  it('never reports a delivery that rounds to nothing', () => {
    // Filtered on what the line would say rather than on a threshold in
    // kilogrammes: propellant prints in tonnes, so half a kilo of it passed a
    // kilogramme test and rendered as "took on 0.0 t propellant".
    const s = setResupplyOrder(advanceTo(world(), world().now + 60), false)
    for (const line of dispatches(s).filter((m) => /took on/.test(m))) {
      expect(line, 'a delivery was reported as zero').not.toMatch(/took on 0(\.0+)? /)
      expect(line).not.toMatch(/, 0(\.0+)? /)
    }
  })

  it('reports the delivery as a difference, not an accumulator', () => {
    // Constitution V: levels are derived. A running total would drift across
    // catch-up; two readings differenced cannot.
    const s = world()
    s.ship.resources.water.value = 100
    const straight = setResupplyOrder(advanceTo(s, s.now + 5 * DAY), false)

    // The same five days, walked in steps.
    let stepped = world()
    stepped.ship.resources.water.value = 100
    for (let d = 1; d <= 5; d++) stepped = advanceTo(stepped, stepped.now + DAY)
    stepped = setResupplyOrder(stepped, false)

    const amount = (s2: SimState) =>
      Number(/took on ([\d.]+)/.exec(dispatches(s2).find((m) => /took on/.test(m)) ?? '')?.[1] ?? 0)
    expect(amount(stepped)).toBeCloseTo(amount(straight), 0)
  })

  it('keeps the rates in one table, so the log and the balance agree', () => {
    // The flow diagram draws these as nodes and the reservoirs run on them.
    // Two copies of 6 kg/day is how a diagram starts lying about a tank.
    expect(ALONGSIDE_RATES.water).toBeGreaterThan(0)
    expect(Object.keys(ALONGSIDE_RATES).sort()).toEqual([
      'food',
      'o2',
      'propellant',
      'spares',
      'water',
    ])
  })
})

/**
 * The other refill, and the bigger one. Spec 002 TR-17.
 *
 * Delivering a contract fills every store to capacity in one step, because the
 * allowance has just settled what the crossing consumed. That has moved more
 * mass than anything else in the game since M2 and did it in complete silence:
 * five gauges jumped to full and nothing anywhere said why.
 */
describe('delivering a contract fills the tanks, and now says so', () => {
  /** Fly the Luna run and settle it. */
  function delivered(order: boolean): SimState {
    let s = world()
    s = applyCommand(s, {
      at: s.now,
      command: { kind: 'ACCEPT_CONTRACT', contractId: 'contract.luna.parts' },
    })
    const option = transferOptions(s).find((o) => o.feasible)!
    s = applyCommand(s, { at: s.now, command: { kind: 'DEPART', optionId: option.id } })
    if (!order) s = setResupplyOrder(s, false)
    return advanceTo(s, s.voyage!.arrivesAt + 60)
  }

  it('names what came aboard, and where', () => {
    const s = delivered(true)
    const line = dispatches(s).find((m) => /Stores filled/.test(m))!
    expect(line).toBeTruthy()
    expect(line).toMatch(/Tranquillity/)
    // The burn spent about twenty tonnes; that is the headline of this refill.
    expect(line).toMatch(/t propellant/)
  })

  it('and actually fills them', () => {
    const s = delivered(true)
    for (const key of ['water', 'o2', 'food', 'propellant', 'spares'] as const) {
      expect(s.ship.resources[key].value).toBeCloseTo(s.ship.resources[key].max, 6)
    }
  })

  it('leaves them alone when the order says to', () => {
    // A switch that a contract closing can override is not a switch.
    const s = delivered(false)
    expect(s.ship.resources.propellant.value).toBeLessThan(
      s.ship.resources.propellant.max * 0.5,
    )
    expect(dispatches(s).some((m) => /Stores not taken on/.test(m))).toBe(true)
  })

  it('settles the allowance either way, because the crossing still spent it', () => {
    // Declining the stores does not un-spend what the run consumed, and the
    // Guild budgeted for it regardless.
    for (const order of [true, false]) {
      const s = delivered(order)
      expect(s.settlement, `settlement missing with order ${order}`).toBeTruthy()
      expect(s.settlement!.lines.length).toBeGreaterThan(0)
    }
  })
})
