/**
 * Guilds, halls and payroll. Design doc §4.4, §6.1, §10.1.
 *
 * M3's first slice. The four aboard used to be a fact of the world; they are
 * now a decision with a running cost, which is what turns "who is on watch"
 * from a roster into a budget.
 */
import { describe, expect, it } from 'vitest'
import { getGuild, getHull } from '@solsyn/data'
import {
  advanceTo,
  applyCommand,
  bandOf,
  berths,
  createWorld,
  dailyWagesCr,
  guildViews,
  hiringHall,
  ledgerView,
  standingWith,
  wageFor,
} from '../src/index.js'
import { DAY } from '../src/time.js'
import type { SimState } from '../src/types.js'

const T0 = Date.UTC(2200, 0, 1)
const world = () => createWorld(20260726, T0)

/** At Tranquillity, where Wrightworks keeps its hall. */
function atTheHall(): SimState {
  const s = structuredClone(world())
  s.ship.portId = 'port.tranquillity'
  return advanceTo(s, 0)
}

const hire = (s: SimState, crewId: string): SimState =>
  applyCommand(s, { at: s.now, command: { kind: 'HIRE_CREW', crewId } })

const dismiss = (s: SimState, crewId: string): SimState =>
  applyCommand(s, { at: s.now, command: { kind: 'DISMISS_CREW', crewId } })

describe('the desk flies affiliated', () => {
  it('belongs to a guild from the first moment', () => {
    // §6.1: "ships don't fly free -- they fly affiliated."
    expect(world().guildId).toBe('guild.wrightworks')
    expect(guildViews(world()).find((g) => g.own)?.name).toBe('Wrightworks Guild')
  })

  it('tracks standing with all four, not only its own', () => {
    // Cross-guild friction is the point: delivering for the Institute is not
    // neutral to the Combine.
    expect(guildViews(world())).toHaveLength(4)
    for (const g of guildViews(world())) expect(g.band).toBe('neutral')
  })

  it('moves standing on what was delivered, not what was intended', () => {
    let s = world()
    s = applyCommand(s, {
      at: s.now,
      command: { kind: 'ACCEPT_CONTRACT', contractId: 'contract.luna.parts' },
    })
    const before = standingWith(s, 'guild.wrightworks')
    s = applyCommand(s, { at: s.now, command: { kind: 'ABANDON_CONTRACT' } })

    expect(standingWith(s, 'guild.wrightworks')).toBeLessThan(before)
  })

  it('bands standing into something a person would say', () => {
    expect(bandOf(-80)).toBe('hostile')
    expect(bandOf(0)).toBe('neutral')
    expect(bandOf(70)).toBe('valued')
  })
})

describe('a hall is a place', () => {
  it('has nobody standing in it at a berth without one', () => {
    // The starting port carries the general trade; the deep bench is at the
    // guild's home yard, which is a reason to fly there.
    const here = hiringHall(world()).map((c) => c.id)
    const there = hiringHall(atTheHall()).map((c) => c.id)
    expect(here).not.toEqual(there)
    expect(there.length).toBeGreaterThan(0)
  })

  it('is closed under way', () => {
    const s = structuredClone(atTheHall())
    s.ship.docked = false
    expect(hiringHall(advanceTo(s, 0))).toHaveLength(0)
  })

  it('never offers somebody already aboard', () => {
    const hired = hire(atTheHall(), hiringHall(atTheHall())[0]!.id)
    expect(hiringHall(hired).map((c) => c.id)).not.toContain(hiringHall(atTheHall())[0]!.id)
  })
})

describe('wages are the bill that never stops', () => {
  it('applies the guild wage floor, and shows what was asked separately', () => {
    // §6.1: Wrightworks bargains its people *up*. That is good for the crew and
    // it costs the desk, so both numbers are on the card.
    const candidate = hiringHall(atTheHall())[0]!
    const floor = getGuild('guild.wrightworks').wageFloor

    expect(floor).toBeGreaterThan(1)
    expect(candidate.wageCrPerDay).toBe(Math.round(candidate.asksCrPerDay * floor))
    expect(candidate.wageCrPerDay).toBeGreaterThan(candidate.asksCrPerDay)
  })

  it('draws the payroll on the day roll, once a day', () => {
    const daily = dailyWagesCr(world())
    expect(daily).toBeGreaterThan(0)

    const after = advanceTo(world(), 3 * DAY)
    const paid = ledgerView(after)
      .entries.filter((e) => /wages/i.test(e.reason))
      .reduce((sum, e) => sum + e.credits, 0)

    expect(paid).toBe(-3 * daily)
  })

  it('costs more once there is another mouth on the payroll', () => {
    const before = dailyWagesCr(atTheHall())
    const after = dailyWagesCr(hire(atTheHall(), hiringHall(atTheHall())[0]!.id))
    expect(after).toBeGreaterThan(before)
  })
})

describe('berths are the limit the drawing already stated', () => {
  it('counts the bunks the hull actually has', () => {
    const b = berths(world())
    expect(b.total).toBe(getHull('hull.kestrel').berths)
    expect(b.used).toBe(4)
    expect(b.free).toBe(2)
  })

  it('refuses a hire with no berth free, and says why', () => {
    let s = atTheHall()
    // Fill the two spare bunks.
    for (const c of hiringHall(s).slice(0, 2)) s = hire(s, c.id)
    expect(berths(s).free).toBe(0)

    const blocked = hiringHall(s)
    expect(blocked.length).toBeGreaterThan(0)
    for (const c of blocked) {
      expect(c.hireable).toBe(false)
      expect(c.why).toMatch(/berth/i)
    }

    const attempted = hire(s, blocked[0]!.id)
    expect(attempted.crew).toHaveLength(6)
  })

  it('will not sign someone the desk cannot cover', () => {
    const poor = structuredClone(atTheHall())
    poor.credits = 500
    const offered = hiringHall(advanceTo(poor, 0))
    for (const c of offered) {
      expect(c.hireable).toBe(false)
      expect(c.why).toMatch(/cover/i)
    }
  })
})

describe('letting somebody go', () => {
  it('frees the berth and stops their wage', () => {
    const before = dailyWagesCr(world())
    const after = dismiss(world(), 'crew.berg')

    expect(after.crew).toHaveLength(3)
    expect(berths(after).free).toBe(3)
    expect(dailyWagesCr(after)).toBeLessThan(before)
  })

  it('pays severance under a guild with a wage floor', () => {
    // The union card is worth something on the way out too.
    const after = dismiss(world(), 'crew.berg')
    expect(ledgerView(after).entries.some((e) => /severance/i.test(e.reason))).toBe(true)
    expect(ledgerView(after).credits).toBeLessThan(ledgerView(world()).credits)
  })

  it('never empties the ship, because a derelict is not a challenge', () => {
    let s = world()
    for (const c of [...s.crew]) s = dismiss(s, c.id)
    expect(s.crew.length).toBeGreaterThanOrEqual(1)
  })

  it('puts their unfinished work back on the board', () => {
    let s = applyCommand(world(), {
      at: 0,
      command: { kind: 'QUEUE_WORK_ORDER', partId: 'life.water.recycler', orderKind: 'service' },
    })
    s = advanceTo(s, 3600)
    const holder = s.workOrders.find((o) => o.assignedCrewId)?.assignedCrewId
    if (!holder) return

    const after = dismiss(s, holder)
    expect(after.workOrders.every((o) => o.assignedCrewId !== holder)).toBe(true)
  })
})

describe('wageFor is the one place a wage is computed', () => {
  it('agrees with what the hall quotes', () => {
    const s = atTheHall()
    for (const c of hiringHall(s)) expect(wageFor(s, c.id)).toBe(c.wageCrPerDay)
  })
})
