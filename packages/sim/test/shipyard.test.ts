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
  lastSettlement,
  ledgerView,
  levelAt,
  shipyardOffers,
  surveyShip,
  transferOptions,
  workOrderViews,
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
  it('allows the old hull against the new one, at what it surveys at', () => {
    const offer = shipyardOffers(atTheYard())[0]!
    const book = getHull('hull.kestrel').bookValueCr

    expect(offer.netCr).toBe(offer.priceCr - offer.tradeInCr)
    expect(offer.netCr).toBeLessThan(offer.priceCr)
    // A thirty-one-year-old hauler with a characterful maintenance log does not
    // fetch book, and the offer says so rather than quoting the brochure.
    expect(offer.tradeInCr).toBeLessThan(book)
    expect(offer.tradeInCr).toBe(offer.survey.tradeInCr)
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

describe('neglect is priced when you come to sell', () => {
  /** Drive every system down to `condition`, optionally breaking them. */
  function worn(condition: number, broken = false): SimState {
    const s = structuredClone(atTheYard())
    for (const part of s.ship.parts) {
      part.condition.value = condition
      part.condition.rate = 0
      part.broken = broken
      if (broken) part.enabled = false
    }
    return advanceTo(s, 0)
  }

  it('pays less for a ship that has been run down', () => {
    // The whole point. Before this, skipping repairs banked the unspent spares
    // budget at settlement and the wrecked ship it produced cost nothing.
    const kept = surveyShip(worn(95), 0)
    const run = surveyShip(worn(40), 0)

    expect(run.tradeInCr).toBeLessThan(kept.tradeInCr)
    expect(kept.factor).toBeGreaterThan(run.factor)
  })

  it('deducts again for anything actually failed', () => {
    // A broken system is worse than a worn one: it loses condition on the way
    // down *and* has to be replaced before anyone else will fly her.
    const sameCondition = 20
    const worn20 = surveyShip(worn(sameCondition, false), 0)
    const failed20 = surveyShip(worn(sameCondition, true), 0)

    expect(failed20.brokenCount).toBeGreaterThan(0)
    expect(failed20.tradeInCr).toBeLessThanOrEqual(worn20.tradeInCr)
    expect(failed20.verdict).toMatch(/failed system/)
  })

  it('never pays over book, however well kept', () => {
    const pristine = structuredClone(atTheYard())
    for (const part of pristine.ship.parts) {
      part.condition.value = 100
      part.condition.rate = 0
      part.tune.value = 100
      part.tune.rate = 0
    }
    const survey = surveyShip(advanceTo(pristine, 0), 0)
    expect(survey.factor).toBeLessThanOrEqual(1)
    expect(survey.tradeInCr).toBeLessThanOrEqual(getHull('hull.kestrel').bookValueCr)
  })

  it('still pays something for a wreck, because it is still metal', () => {
    // TR-21's shape again: consequences are financial, never a wall. A ruined
    // ship must not leave the player with an asset worth nothing at all.
    const survey = surveyShip(worn(0, true), 0)
    expect(survey.tradeInCr).toBeGreaterThan(0)
    expect(survey.factor).toBeCloseTo(0.35, 2)
    expect(survey.verdict).toMatch(/failed system/)
  })

  it('weighs wear above tune, since that is what a surveyor measures', () => {
    const base = structuredClone(atTheYard())
    const set = (s: SimState, cond: number, tune: number) => {
      const c = structuredClone(s)
      for (const p of c.ship.parts) {
        p.condition.value = cond
        p.condition.rate = 0
        p.tune.value = tune
        p.tune.rate = 0
      }
      return advanceTo(c, 0)
    }
    const wornButSweet = surveyShip(set(base, 40, 100), 0)
    const soundButDrifted = surveyShip(set(base, 100, 40), 0)

    expect(soundButDrifted.factor).toBeGreaterThan(wornButSweet.factor)
  })

  it('costs real money at the yard, not a rounding error', () => {
    // It has to outweigh what neglect saves elsewhere -- the spares line banks
    // under 10,000 cr on a long crossing, so this cannot be smaller than that.
    const kept = surveyShip(worn(95), 0).tradeInCr
    const run = surveyShip(worn(30), 0).tradeInCr
    expect(kept - run).toBeGreaterThan(30_000)
  })
})

describe('the incentive points the right way', () => {
  /**
   * The invariant this whole mechanic exists for.
   *
   * Before the survey, skipping repairs was *profitable*: the unspent spares
   * budget came back at settlement and the wrecked ship it produced cost
   * nothing on the books. The punishment existed — a broken ship cannot take
   * the next job — but it was entirely deferred, and the settlement read
   * backwards at the moment the player looked at it.
   *
   * Now the ship is an asset that gets surveyed. If this test ever fails, the
   * game is once again paying people to neglect their ship.
   */
  function flyLuna(tend: boolean): { allowanceCr: number; tradeInCr: number } {
    let s = advanceTo(structuredClone(createWorld(20260726, T0)), 0)
    s = applyCommand(s, {
      at: s.now,
      command: { kind: 'ACCEPT_CONTRACT', contractId: 'contract.luna.parts' },
    })
    s = applyCommand(s, {
      at: s.now,
      command: { kind: 'DEPART', optionId: transferOptions(s).find((o) => o.feasible)!.id },
    })

    const arrivesAt = s.voyage!.arrivesAt
    if (tend) {
      // A conscientious desk: look in twice a day, service the worst thing.
      for (let t = s.now + 43_200; t < arrivesAt; t += 43_200) {
        s = advanceTo(s, t)
        if (workOrderViews(s).length > 0) continue
        const worst = [...s.ship.parts]
          .map((p) => ({ p, c: levelAt(p.condition, t) }))
          .sort((a, b) => a.c - b.c)[0]!
        if (worst.p.broken) {
          s = applyCommand(s, { at: t, command: { kind: 'QUEUE_WORK_ORDER', partId: worst.p.id, orderKind: 'repair' } })
        } else if (worst.c < 80) {
          s = applyCommand(s, { at: t, command: { kind: 'QUEUE_WORK_ORDER', partId: worst.p.id, orderKind: 'service' } })
        }
      }
    }

    s = advanceTo(s, arrivesAt + 60)
    return {
      allowanceCr: lastSettlement(s)!.allowanceCr,
      tradeInCr: surveyShip(s, s.now).tradeInCr,
    }
  }

  it('makes neglect cost more than it saves', () => {
    const tended = flyLuna(true)
    const neglected = flyLuna(false)

    // Neglect still banks the unspent maintenance budget -- that part is real.
    expect(neglected.allowanceCr).toBeGreaterThan(tended.allowanceCr)
    // And loses more than that on the ship itself.
    expect(neglected.tradeInCr).toBeLessThan(tended.tradeInCr)

    const gained = neglected.allowanceCr - tended.allowanceCr
    const lost = tended.tradeInCr - neglected.tradeInCr
    expect(lost).toBeGreaterThan(gained)
  })
})
