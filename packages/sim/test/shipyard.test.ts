/**
 * Buying a ship, and what it unlocks. Design doc §5.2, §10.2.
 *
 * The test that matters most in this file is `puts Mars within reach` — the
 * whole point of the hull is that the interplanetary board stops being a wall
 * and starts being a destination. If that ever stops being true, the Albatross
 * is an expensive reskin.
 */
import { describe, expect, it } from 'vitest'
import { getHull, TUNE } from '@solsyn/data'
import {
  advanceTo,
  applyCommand,
  createWorld,
  ledgerView,
  levelAt,
  shipyardOffers,
  transferOptions,
} from '../src/index.js'
import type { SimState } from '../src/types.js'

const T0 = Date.UTC(2200, 0, 1)

/** At the yard, with the money. Getting there is the game; this is the test. */
function atTheYard(credits = 1_200_000): SimState {
  const s = structuredClone(createWorld(20260726, T0))
  s.ship.portId = 'port.tranquillity'
  s.credits = credits
  return advanceTo(s, 0)
}

const buy = (s: SimState, hullId = 'hull.albatross'): SimState =>
  applyCommand(s, { at: s.now, command: { kind: 'PURCHASE_HULL', hullId } })

describe('a yard is a place, not a menu', () => {
  it('sells nothing at a berth without a yard', () => {
    // Gateway is where the ship starts. Buying a hull has to be a reason to fly
    // somewhere, or the map is decoration.
    expect(shipyardOffers(createWorld(20260726, T0))).toHaveLength(0)
  })

  it('sells at Tranquillity, which is the yard', () => {
    expect(shipyardOffers(atTheYard()).map((o) => o.id)).toContain('hull.albatross')
  })

  it('never offers the hull already being flown', () => {
    // TR-3b's rule applied to shopping: an option that changes nothing is a
    // fake choice.
    const owned = buy(atTheYard())
    expect(shipyardOffers(owned).map((o) => o.id)).not.toContain('hull.albatross')
  })

  it('offers nothing at all while under way', () => {
    const s = structuredClone(atTheYard())
    s.ship.docked = false
    expect(shipyardOffers(advanceTo(s, 0))).toHaveLength(0)
  })
})

describe('the price is a difference, not a sticker', () => {
  it('allows the old hull against the new one', () => {
    const offer = shipyardOffers(atTheYard())[0]!
    expect(offer.tradeInCr).toBe(getHull('hull.kestrel').tradeInCr)
    expect(offer.netCr).toBe(offer.priceCr - offer.tradeInCr)
    expect(offer.netCr).toBeLessThan(offer.priceCr)
  })

  it('says how far short the money is, rather than just refusing', () => {
    const offer = shipyardOffers(atTheYard(100_000))[0]!
    expect(offer.affordable).toBe(false)
    expect(offer.why).toMatch(/Short by/)
  })

  it('will not sell what it marked unaffordable', () => {
    // Same rule as an infeasible trajectory: having said no, saying yes anyway
    // would make the marking a lie.
    const poor = atTheYard(100_000)
    expect(buy(poor).ship.hullId).toBe('hull.kestrel')
    expect(ledgerView(buy(poor)).credits).toBe(100_000)
  })

  it('refuses while a contract is aboard, and says why', () => {
    let s = atTheYard()
    s = applyCommand(s, {
      at: s.now,
      command: { kind: 'ACCEPT_CONTRACT', contractId: 'contract.gateway.castings' },
    })
    const offer = shipyardOffers(s)[0]!
    expect(offer.affordable).toBe(false)
    expect(offer.why).toMatch(/cargo aboard/i)
  })

  it('posts both sides of the transaction to the books', () => {
    const before = ledgerView(atTheYard()).credits
    const after = buy(atTheYard())
    const reasons = ledgerView(after).entries.map((e) => e.reason)

    expect(reasons.some((r) => /traded in/i.test(r))).toBe(true)
    expect(reasons.some((r) => /purchased/i.test(r))).toBe(true)
    expect(ledgerView(after).credits).toBe(before - shipyardOffers(atTheYard())[0]!.netCr)
  })
})

describe('a new ship is new', () => {
  it('arrives at its nameplate, so the old ship’s tuning does not come along', () => {
    // The cost of switching that is easy to miss: months of attention on the
    // old recycler are not transferable, and the crew start learning her.
    const s = buy(atTheYard())
    for (const part of s.ship.parts) {
      expect(levelAt(part.condition, s.now)).toBe(100)
      expect(levelAt(part.tune, s.now)).toBe(TUNE.specTune)
      expect(part.broken).toBe(false)
    }
  })

  it('carries the stores across, capped by the new tanks', () => {
    const before = atTheYard()
    const carriedFood = levelAt(before.ship.resources.food, before.now)
    const s = buy(before)

    expect(levelAt(s.ship.resources.food, s.now)).toBeCloseTo(carriedFood, 6)
    // And the tanks themselves are the new hull's.
    expect(s.ship.resources.propellant.max).toBe(getHull('hull.albatross').propellantCapacityKg)
    expect(s.ship.resources.food.max).toBe(getHull('hull.albatross').foodCapacityKg)
  })

  it('keeps the crew, who are not part of the hull', () => {
    expect(buy(atTheYard()).crew).toHaveLength(4)
  })

  it('renames the ship, because it is a different ship', () => {
    const s = buy(atTheYard())
    expect(s.ship.name).toBe('Thessaly')
    expect(s.ship.className).toMatch(/Albatross/)
    expect(s.log.some((l) => /signed for/i.test(l.text))).toBe(true)
  })
})

describe('what the hull is actually for', () => {
  /** At Gateway in the Albatross, tanks full, holding the Mars contract. */
  function readyForMars(): SimState {
    const s = structuredClone(buy(atTheYard()))
    const hull = getHull('hull.albatross')
    s.ship.portId = 'port.gateway'
    s.ship.resources.propellant.value = hull.propellantCapacityKg
    s.ship.resources.food.value = hull.foodCapacityKg
    s.ship.resources.water.value = hull.waterCapacityKg
    s.ship.resources.o2.value = hull.o2CapacityKg
    return applyCommand(advanceTo(s, 0), {
      at: 0,
      command: { kind: 'ACCEPT_CONTRACT', contractId: 'contract.phobos.survey' },
    })
  }

  it('puts Mars within reach, which the Kestrel never was', () => {
    // THE test. Every trajectory to Phobos is blocked in a Kestrel; at least
    // the minimum-energy one has to be flyable in an Albatross, or the ship is
    // an expensive reskin and the board is still a wall.
    const kestrel = applyCommand(createWorld(20260726, T0), {
      at: 0,
      command: { kind: 'ACCEPT_CONTRACT', contractId: 'contract.phobos.survey' },
    })
    expect(transferOptions(kestrel).some((o) => o.feasible)).toBe(false)

    expect(transferOptions(readyForMars()).some((o) => o.feasible)).toBe(true)
  })

  it('reaches it the slow way only, so the window still costs something', () => {
    // Minimum energy fits and the faster ellipses do not. That is the trade the
    // hull is meant to open, not remove: you can go, but not in a hurry.
    const options = transferOptions(readyForMars())
    expect(options.find((o) => o.id === 'economy')!.feasible).toBe(true)
    expect(options.find((o) => o.id === 'express')!.feasible).toBe(false)
  })

  it('carries stores for the crossing it is sold for', () => {
    // The constraint that gates Mars harder than mass ratio does. 259 days of
    // four people eating is the number the pantry has to beat.
    const hull = getHull('hull.albatross')
    const crossingDays = transferOptions(readyForMars()).find((o) => o.id === 'economy')!.durationS / 86_400
    // ~1.8 kg per crew per day gross, less what the rack grows.
    expect(hull.foodCapacityKg).toBeGreaterThan(1.7 * 4 * crossingDays)
    expect(crossingDays).toBeGreaterThan(250)
  })

  it('leaves the Belt out of reach, so there is somewhere left to go', () => {
    const s = structuredClone(readyForMars())
    s.contract = undefined
    const belt = applyCommand(advanceTo(s, 0), {
      at: 0,
      command: { kind: 'ACCEPT_CONTRACT', contractId: 'contract.ceres.medical' },
    })
    expect(transferOptions(belt).some((o) => o.feasible)).toBe(false)
  })
})
