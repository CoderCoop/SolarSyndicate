/**
 * Money and port prices. Spec 002 TR-19, and the foundation for TR-16 to TR-21.
 *
 * The ledger exists so that efficiency has a consequence. Every mechanic built
 * for M1 and spec 004 -- loop closure, tune, attendance, upgrade tiers -- has
 * been moving numbers that nothing counted. Credits are what will count them.
 *
 * Prices differ by port and the differences follow from where the ports are:
 * Ceres sits on ice, so water is cheap there and dear at Gateway. Where you top
 * up is meant to be a decision, not a formality.
 */
import { describe, expect, it } from 'vitest'
import { content, frictionBetween, priceAt } from '@solsyn/data'
import {
  advanceTo,
  applyCommand,
  createWorld,
  creditOutcome,
  guildViews,
  ledgerView,
  transferOptions,
  STANDING_DELTA,
} from '../src/index.js'
import { DAY } from '../src/time.js'
import type { SimState } from '../src/types.js'

const T0 = Date.UTC(2200, 0, 1)
const world = () => createWorld(20260726, T0)

const spend = (s: SimState, credits: number, reason: string): SimState =>
  applyCommand(s, { at: s.now, command: { kind: 'SPEND', credits, reason } })

describe('the guild keeps a ledger', () => {
  it('starts a desk with an operating budget', () => {
    const s = world()
    expect(ledgerView(s).credits).toBeGreaterThan(0)
  })

  it('records what was spent and why, not just the balance', () => {
    // §1: the player is an institution. An institution has books.
    let s = world()
    const opening = ledgerView(s).credits
    s = spend(s, 12_000, 'Spares, Gateway')

    const view = ledgerView(s)
    expect(view.credits).toBe(opening - 12_000)
    expect(view.entries[0]!.credits).toBe(-12_000)
    expect(view.entries[0]!.reason).toBe('Spares, Gateway')
  })

  it('credits as well as debits', () => {
    let s = world()
    const opening = ledgerView(s).credits
    s = spend(s, -4_500, 'Resupply underrun, Ceres')
    expect(ledgerView(s).credits).toBe(opening + 4_500)
  })

  it('lets the balance go negative rather than refusing', () => {
    // TR-21: a shortfall comes out of the money and is never a wall. A ship
    // that cannot undock because it is overdrawn is a stranded ship, which
    // §7.4 forbids.
    let s = world()
    s = spend(s, ledgerView(s).credits + 50_000, 'A catastrophically bad week')
    expect(ledgerView(s).credits).toBeLessThan(0)
  })

  it('moves only at events, so catch-up lands where live play would', () => {
    // Money is a stock, not a rate. Wages *do* draw it down over time -- but
    // only on the day roll, never by integration -- so fast-forwarding forty
    // days in one jump must give exactly what forty separate days give. That
    // equality is the property; "unchanged" stopped being it the moment there
    // was a payroll.
    const start = spend(world(), 30_000, 'Refit deposit')

    const oneJump = advanceTo(start, 40 * DAY)

    let stepped = start
    for (let day = 1; day <= 40; day += 1) stepped = advanceTo(stepped, day * DAY)

    expect(ledgerView(oneJump).credits).toBe(ledgerView(stepped).credits)
    expect(ledgerView(oneJump).entries.length).toBe(ledgerView(stepped).entries.length)
  })

  it('draws the payroll down day by day, and says so in the books', () => {
    const before = ledgerView(world()).credits
    const after = advanceTo(world(), 10 * DAY)

    expect(ledgerView(after).credits).toBeLessThan(before)
    const wageEntries = ledgerView(after).entries.filter((e) => /wages/i.test(e.reason))
    expect(wageEntries.length).toBe(10)
    for (const entry of wageEntries) expect(entry.credits).toBeLessThan(0)
  })
})

describe('ports price what they have', () => {
  it('prices every consumable at every port', () => {
    for (const port of content.ports) {
      for (const key of ['water', 'o2', 'food', 'spares', 'propellant'] as const) {
        expect(priceAt(port.id, key)).toBeGreaterThan(0)
      }
    }
  })

  it('sells water cheaply where the water is', () => {
    // Ceres is an ice body; Gateway hauls everything up a gravity well.
    expect(priceAt('port.ceres', 'water')).toBeLessThan(priceAt('port.gateway', 'water'))
  })

  it('sells food dearly where nothing grows', () => {
    // The Belt imports its calories. Earth orbit does not.
    expect(priceAt('port.ceres', 'food')).toBeGreaterThan(priceAt('port.gateway', 'food'))
  })

  it('makes somewhere the best place for each thing', () => {
    // If one port were cheapest at everything, routing would have one answer
    // and the prices would be decoration.
    const cheapest = (key: 'water' | 'o2' | 'food' | 'spares' | 'propellant') =>
      [...content.ports].sort((a, b) => priceAt(a.id, key) - priceAt(b.id, key))[0]!.id
    const winners = new Set(
      (['water', 'o2', 'food', 'spares', 'propellant'] as const).map(cheapest),
    )
    expect(winners.size).toBeGreaterThan(1)
  })

  it('keeps prices in data, not in code', () => {
    for (const port of content.ports) {
      expect(port.prices).toBeDefined()
      expect(Object.keys(port.prices).length).toBeGreaterThanOrEqual(5)
    }
  })
})

describe('delivering for one guild is never neutral to the rest', () => {
  /** Standing with everybody, after `deliver` runs against a fresh world. */
  function after(deliver: (s: SimState) => void): Record<string, number> {
    const s = world()
    deliver(s)
    return Object.fromEntries(guildViews(s).map((g) => [g.id, g.standing]))
  }

  it('charges a rival for the credit you earned elsewhere (§6.1)', () => {
    // The Crew tab has claimed this since M3 under a sim in which only the
    // letting guild ever moved -- a promise the game made and did not keep.
    const standing = after((s) => {
      creditOutcome(s, 'guild.helios', STANDING_DELTA.delivered, s.now, 'Delivered.')
    })
    expect(standing['guild.helios']).toBe(STANDING_DELTA.delivered)
    // Three quarters opposed: a combine and the union that services its hulls.
    expect(standing['guild.wrightworks']).toBe(
      -Math.round(STANDING_DELTA.delivered * frictionBetween('guild.helios', 'guild.wrightworks')),
    )
    expect(standing['guild.wrightworks']).toBeLessThan(0)
  })

  it('leaves the guilds that have no quarrel with the client alone', () => {
    // Engineers and scientists want mostly the same things, and the data says
    // so at zero rather than by omission.
    const standing = after((s) => {
      creditOutcome(s, 'guild.wrightworks', STANDING_DELTA.delivered, s.now, 'Delivered.')
    })
    expect(frictionBetween('guild.wrightworks', 'guild.meridian')).toBe(0)
    expect(standing['guild.meridian'] ?? 0).toBe(0)
  })

  it('pays nobody for a job done badly', () => {
    // The load-bearing half of the rule. If failure paid rivals, the cheapest
    // route to standing with Wrightworks would be to sign Helios contracts and
    // abandon them for a fee, over and over.
    for (const bad of [STANDING_DELTA.deliveredLate, STANDING_DELTA.abandoned]) {
      const standing = after((s) => {
        creditOutcome(s, 'guild.helios', bad, s.now, 'Badly.')
      })
      expect(standing['guild.helios']).toBe(bad)
      for (const id of ['guild.wrightworks', 'guild.meridian', 'guild.drift']) {
        expect(standing[id] ?? 0, `${id} profited from a failure`).toBe(0)
      }
    }
  })

  it('reaches the books through an actual run, not only through the helper', () => {
    // End to end: fly the Luna contract, which Tranquillity Yards let, and the
    // Combine notices. Same path the settlement takes.
    let s = world()
    s = applyCommand(s, {
      at: s.now,
      command: { kind: 'ACCEPT_CONTRACT', contractId: 'contract.luna.parts' },
    })
    const option = transferOptions(s)
      .filter((o) => o.feasible && o.onTime)
      .sort((a, b) => a.deltaVMs - b.deltaVMs)[0]!
    s = applyCommand(s, { at: s.now, command: { kind: 'DEPART', optionId: option.id } })
    s = advanceTo(s, s.voyage!.arrivesAt + 60)

    const standing = Object.fromEntries(guildViews(s).map((g) => [g.id, g.standing]))
    expect(standing['guild.wrightworks']).toBe(STANDING_DELTA.delivered)
    expect(standing['guild.helios']).toBeLessThan(0)
  })

  it('states a rivalry for every pair, so the panel can explain itself', () => {
    for (const g of guildViews(world())) {
      if (g.own) {
        expect(g.friction).toBeUndefined()
      } else {
        expect(g.friction).toBeGreaterThanOrEqual(0)
        expect(g.frictionWhy?.length ?? 0).toBeGreaterThan(20)
      }
    }
  })
})
