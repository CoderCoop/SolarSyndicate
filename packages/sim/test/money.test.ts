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
import { content, priceAt } from '@solsyn/data'
import { advanceTo, applyCommand, createWorld, ledgerView } from '../src/index.js'
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

  it('survives a catch-up unchanged, because money is not a rate', () => {
    let s = spend(world(), 30_000, 'Refit deposit')
    const before = ledgerView(s).credits
    s = advanceTo(s, 40 * DAY)
    expect(ledgerView(s).credits).toBe(before)
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
