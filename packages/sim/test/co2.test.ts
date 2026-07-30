/**
 * Cabin CO2. Design doc §3.2, §1 pillar 2 (honest numbers).
 *
 * The bug this exists to prevent: with the scrubbers comfortably ahead of four
 * people, cabin CO2 read *exactly zero* and stayed there. Nothing physical
 * reaches zero. A sorbent bed does not strip a gas out of an atmosphere -- it
 * reaches equilibrium with its own sorbent, and the ISS runs somewhere around
 * 2,000-3,000 ppm with its scrubbers working perfectly.
 *
 * Zero ppm is worse than a wrong number: it is a reading the player can see is
 * impossible, in the one figure §1 pillar 2 promises is real.
 */
import { describe, expect, it } from 'vitest'
import { content } from '@solsyn/data'
import { advanceTo, applyCommand, createWorld, lifeSupportView } from '../src/index.js'
import { DAY } from '../src/time.js'

const T0 = Date.UTC(2200, 0, 1)
/**
 * With the captain's standing order lifted.
 *
 * §7.4's safe mode repairs whatever is causing an emergency, which is exactly
 * the confound here: these tests measure what bad air *does*, and a ship that
 * fixes its own scrubber halfway through is measuring the response instead.
 * The response has its own tests in `emergency.test.ts`.
 */
const world = () => {
  const s = createWorld(20260726, T0)
  s.ship.standingOrders.safeMode = false
  return s
}

/** Earth ambient, roughly. Nothing aboard should ever read below this. */
const EARTH_AMBIENT_PPM = 420

describe('cabin CO2 never reaches zero', () => {
  it('holds above ambient with the scrubbers winning easily', () => {
    // Four people against a scrubber rated for more than four people. The old
    // model drove this to 0.0 ppm within a day.
    for (const days of [1, 2, 5, 10, 30]) {
      const s = advanceTo(world(), days * DAY)
      const ppm = lifeSupportView(s).co2Ppm
      expect(ppm).toBeGreaterThan(EARTH_AMBIENT_PPM)
    }
  })

  it('settles at a floor rather than drifting toward it forever', () => {
    const a = lifeSupportView(advanceTo(world(), 10 * DAY)).co2Ppm
    const b = lifeSupportView(advanceTo(world(), 60 * DAY)).co2Ppm
    // Fifty more days changes it by less than a tenth: this is an equilibrium,
    // not a slow slide to nothing.
    expect(Math.abs(b - a) / a).toBeLessThan(0.1)
  })

  it('lands in the range a real closed cabin runs at', () => {
    // ISS sits around 2,000-3,000 ppm with CDRA working. A near-future ship
    // with hydroponics helping should be under that, and nowhere near Earth.
    const ppm = lifeSupportView(advanceTo(world(), 20 * DAY)).co2Ppm
    expect(ppm).toBeGreaterThan(800)
    expect(ppm).toBeLessThan(3000)
  })

  it('declares the floor in data, not in code', () => {
    // Constitution VIII. Every scrubbing part states the lowest partial
    // pressure it can hold.
    const scrubbers = content.parts.filter((p) => p.provides.co2ScrubKgPerDay)
    expect(scrubbers.length).toBeGreaterThan(0)
    for (const p of scrubbers) {
      expect(p.provides.co2FloorPpm).toBeGreaterThan(EARTH_AMBIENT_PPM)
    }
  })
})

describe('the floor is the scrubbers, and moves with them', () => {
  it('rises when the best remover stops', () => {
    // The rack pulls the cabin lower than the amine bed manages alone, so
    // switching it off should raise the floor the ship settles at.
    const withRack = advanceTo(world(), 20 * DAY)
    let s = applyCommand(world(), {
      at: 0,
      command: { kind: 'SET_PART_ENABLED', partId: 'life.hydroponics.lamps', enabled: false },
    })
    s = advanceTo(s, 20 * DAY)

    expect(lifeSupportView(s).co2Ppm).toBeGreaterThan(lifeSupportView(withRack).co2Ppm)
  })

  it('lets CO2 climb without limit when nothing is removing it', () => {
    // The floor is a property of the scrubbers. With none running there is no
    // floor, and four people fill the cabin -- which is the failure mode §7.4
    // insists must be visible rather than silent.
    let s = structuredClone(world())
    for (const p of s.ship.parts) {
      if (p.id === 'life.scrubber.co2' || p.id === 'life.hydroponics.lamps') {
        p.broken = true
        p.enabled = false
      }
    }
    const before = lifeSupportView(s).co2Ppm
    s = advanceTo(s, 4 * DAY)
    const after = lifeSupportView(s).co2Ppm

    expect(after).toBeGreaterThan(before * 5)
    expect(after).toBeGreaterThan(10000) // well into "crew are slowing down"
  })

  it('never reads a clamp instead of a measurement', () => {
    // A ship delivered *below* its own floor would have its very first CO2
    // reading be the clamp rather than the gas actually in the cabin. It is
    // delivered slightly dirty instead, and settles down to the floor.
    const fresh = world()
    expect(fresh.ship.resources.co2.value).toBeGreaterThan(fresh.ship.resources.co2.min)

    const settled = advanceTo(fresh, 30 * DAY)
    const co2 = settled.ship.resources.co2
    expect(co2.value).toBeGreaterThanOrEqual(co2.min - 1e-9)
    // And it fell to get there, rather than being pushed up.
    expect(lifeSupportView(settled).co2Ppm).toBeLessThan(lifeSupportView(fresh).co2Ppm)
  })
})
