/**
 * Upgrade tiers. Spec 004 RF-30. Design doc §3.3, §4.2.
 *
 * The rule the whole attendance model rests on: **equipment sets the base, crew
 * set the multiplier.** Keeping them on separate terms means neither obsoletes
 * the other -- a superb technician cannot substitute for a worn-out recycler,
 * and a new recycler still runs better tended.
 *
 * These tests exist to stop a later balance pass quietly collapsing that: if a
 * tier-3 recycler ever made attendance irrelevant, or a good enough tech made
 * the tier-3 pointless, one half of the design would have gone missing.
 */
import { describe, expect, it } from 'vitest'
import { content, getHull, getPart, upgradesFor } from '@solsyn/data'
import { createWorld, tuneOutputScale } from '../src/index.js'
import { TUNE } from '@solsyn/data'

const T0 = Date.UTC(2200, 0, 1)
const world = () => createWorld(20260726, T0)

describe('a hull is delivered with a stated fit-out', () => {
  it('installs what the hull says, not everything that would fit', () => {
    // Without this, adding a tier-2 scrubber fits both at once.
    const s = world()
    const hull = getHull(s.ship.hullId)
    expect(s.ship.parts.map((p) => p.defId).sort()).toEqual([...hull.fitOut].sort())
    expect(content.parts.length).toBeGreaterThan(hull.fitOut.length)
  })

  it('delivers the entry-level version of every line', () => {
    const hull = getHull(getHull('hull.kestrel').id)
    for (const id of hull.fitOut) expect(getPart(id).tier).toBe(1)
  })

  it('never fits a part into a room the hull does not have', () => {
    for (const hull of content.hulls) {
      for (const id of hull.fitOut) expect(hull.rooms).toContain(getPart(id).roomId)
    }
  })
})

describe('tiers get better, dearer, and less worth it', () => {
  it('offers alternatives for the same job, cheapest first', () => {
    const line = upgradesFor('life.water.recycler')
    expect(line.length).toBeGreaterThan(1)
    expect(line.map((p) => p.tier)).toEqual([1, 2, 3])
    for (let i = 1; i < line.length; i++) {
      expect(line[i]!.priceCr).toBeGreaterThan(line[i - 1]!.priceCr)
    }
  })

  it('raises closure with each recycler tier', () => {
    const closure = upgradesFor('life.water.recycler').map(
      (p) => p.provides.waterRecycleFraction!,
    )
    expect(closure).toEqual([...closure].sort((a, b) => a - b))
    expect(closure[0]).toBeGreaterThan(0.9)
    // No loop is perfect, and content must not pretend one is.
    expect(closure.at(-1)).toBeLessThan(1)
  })

  it('gives diminishing returns, which is how closure actually goes', () => {
    // The last tenths cost more than the first ninety-seven percent. If the
    // gains were linear, buying the top tier would always be correct and the
    // choice would stop being one.
    const line = upgradesFor('life.water.recycler')
    const gain1 = line[1]!.provides.waterRecycleFraction! - line[0]!.provides.waterRecycleFraction!
    const gain2 = line[2]!.provides.waterRecycleFraction! - line[1]!.provides.waterRecycleFraction!
    expect(gain2).toBeLessThan(gain1)

    const spend1 = line[1]!.priceCr - line[0]!.priceCr
    const spend2 = line[2]!.priceCr - line[1]!.priceCr
    expect(gain2 / spend2).toBeLessThan(gain1 / spend1)
  })

  it('makes a better scrubber hold a cleaner cabin, with diminishing returns', () => {
    const line = upgradesFor('life.scrubber.co2')
    const floors = line.map((p) => p.provides.co2FloorPpm!)
    // Lower is better, so this must descend.
    expect(floors).toEqual([...floors].sort((a, b) => b - a))
    const gain1 = floors[0]! - floors[1]!
    const gain2 = floors[1]! - floors[2]!
    expect(gain2).toBeLessThan(gain1)
    // And still nowhere near Earth ambient.
    expect(floors.at(-1)).toBeGreaterThan(420)
  })

  it('charges for the improvement in mass as well as money', () => {
    // §3.3: a better part is a heavier part, and mass is delta-v (§5.2). An
    // upgrade that cost only money would be a free choice.
    for (const lineId of ['life.water.recycler', 'life.scrubber.co2']) {
      const line = upgradesFor(lineId)
      for (let i = 1; i < line.length; i++) {
        expect(line[i]!.massKg).toBeGreaterThan(line[i - 1]!.massKg)
      }
    }
  })
})

describe('equipment sets the base, crew set the multiplier', () => {
  it('keeps the two terms from swallowing each other', () => {
    // The design claim, made checkable. A tier-3 recycler out of tune must
    // still beat a tier-1 in perfect tune -- otherwise hardware is pointless.
    // And a tuned tier-1 must beat an untuned tier-1 -- otherwise crew are.
    const line = upgradesFor('life.water.recycler')
    const base1 = line[0]!.provides.waterRecycleFraction!
    const base3 = line[2]!.provides.waterRecycleFraction!

    const neglected = tuneOutputScale(0)
    const perfect = tuneOutputScale(100)

    expect(base3 * neglected).toBeLessThan(base1 * perfect)
    expect(base1 * perfect).toBeGreaterThan(base1 * neglected)
    // Neither term dominates: the best hardware badly kept is worse than
    // modest hardware well kept, which is the whole point of having both.
    expect(base3 * perfect).toBeGreaterThan(base1 * perfect)
  })

  it('leaves room above spec for a good operator to find', () => {
    // Tune tops out above 1.0, so a well-tended part beats its own nameplate
    // regardless of which tier it is.
    expect(tuneOutputScale(100)).toBeGreaterThan(1)
    expect(tuneOutputScale(TUNE.specTune)).toBeCloseTo(1, 9)
  })
})
