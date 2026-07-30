/**
 * What the atmosphere does to a person. Design doc §1 pillar 2, §3.2, §7.4.
 *
 * These are checkable against published limits, which is the point: OSHA, NIOSH
 * and NASA all publish the numbers, so a CO2 model that disagrees with them is
 * wrong in a way anybody can look up. §1 pillar 2 says the numbers are real,
 * and hypercapnia is one of the few hazards here a player might recognise.
 */
import { describe, expect, it } from 'vitest'
import {
  CO2_BANDS,
  O2_BANDS,
  co2Exposure,
  environmentAt,
  o2Exposure,
  storesExposure,
  thermalExposure,
  worseOf,
  type Severity,
} from '../src/physiology.js'
import { advanceTo, applyCommand, createWorld, lifeSupportView } from '../src/engine.js'
import { DAY, HOUR } from '../src/time.js'
import type { SimState } from '../src/types.js'

/**
 * With the captain's standing order lifted.
 *
 * §7.4's safe mode repairs whatever is causing an emergency, which is exactly
 * the confound here: these tests measure what bad air *does*, and a ship that
 * fixes its own scrubber halfway through is measuring the response instead.
 * The response has its own tests in `emergency.test.ts`.
 */
const world = () => {
  const s = createWorld(7, Date.UTC(2026, 6, 25, 14, 30, 0))
  s.ship.standingOrders.safeMode = false
  return s
}

function breakPart(s: SimState, id: string): SimState {
  const next = structuredClone(s)
  next.ship.parts.find((x) => x.id === id)!.broken = true
  next.ship.parts.find((x) => x.id === id)!.enabled = false
  return applyCommand(next, {
    at: next.now + 1,
    command: { kind: 'SET_PART_ENABLED', partId: 'comms.array', enabled: false },
  })
}

describe('carbon dioxide follows the published limits', () => {
  it('is clear at the levels a working cabin actually sits at', () => {
    // The ISS runs 2,000-3,000 ppm and nobody is ill; a sorbent bed cannot
    // strip a gas to zero, so "nominal" has to include a few thousand ppm or
    // the ship would be permanently in the red for working correctly.
    expect(co2Exposure(400).severity).toBe('nominal')
    expect(co2Exposure(900).severity).toBe('nominal')
    expect(co2Exposure(2400).severity).toBe('noticeable')
  })

  it('turns harmful at the occupational limit, not before', () => {
    // OSHA PEL is 5,000 ppm over eight hours. Below it, nobody loses health.
    expect(co2Exposure(4999).healthPerDay).toBe(0)
    expect(co2Exposure(5000).healthPerDay).toBeLessThan(0)
    expect(co2Exposure(5000).severity).toBe('impaired')
  })

  it('is immediately dangerous to life at the NIOSH figure', () => {
    // IDLH is 4%. At that point somebody is not working slowly, they are not
    // working -- and the model has to say so rather than scaling toward zero.
    expect(co2Exposure(39000).capacity).toBeGreaterThan(0)
    expect(co2Exposure(40000).severity).toBe('incapacitating')
    expect(co2Exposure(40000).capacity).toBe(0)
  })

  it('kills at the concentrations that kill', () => {
    // 7-10% is unconsciousness in minutes and convulsions after.
    expect(co2Exposure(60000).severity).toBe('incapacitating')
    expect(co2Exposure(70000).severity).toBe('lethal')
    expect(co2Exposure(120000).healthPerDay).toBeLessThan(-500)
  })

  it('gets worse, never better, as the air does', () => {
    let previousCapacity = Infinity
    let previousHealth = Infinity
    for (const band of CO2_BANDS) {
      expect(band.capacity).toBeLessThanOrEqual(previousCapacity)
      expect(band.healthPerDay).toBeLessThanOrEqual(previousHealth)
      previousCapacity = band.capacity
      previousHealth = band.healthPerDay
    }
  })

  it('costs capacity long before it costs health', () => {
    // The point of the whole ladder: bad air makes people useless well before
    // it makes them ill, which is what makes a failed scrubber show up in the
    // numbers the player already watches (§3.2).
    const early = co2Exposure(2500)
    expect(early.healthPerDay).toBe(0)
    expect(early.capacity).toBeLessThan(0.9)
  })
})

describe('oxygen is judged by partial pressure', () => {
  it('is nominal at spacecraft cabin pressure', () => {
    // ISS runs about 21.4 kPa; sea level is 21.2.
    expect(o2Exposure(21.2).severity).toBe('nominal')
    expect(o2Exposure(19).severity).toBe('nominal')
  })

  it('impairs below the altitude a pilot needs oxygen at', () => {
    expect(o2Exposure(16).severity).toBe('impaired')
    // NASA's operational floor, roughly 9,500 ft equivalent.
    expect(o2Exposure(12.7).severity).toBe('dangerous')
  })

  it('takes people out around nine kilopascals', () => {
    expect(o2Exposure(11).capacity).toBe(0)
    expect(o2Exposure(9).severity).toBe('lethal')
    expect(o2Exposure(6).healthPerDay).toBeLessThan(-500)
  })

  it('is a falling ladder, ordered worst first', () => {
    let previous = -Infinity
    for (const band of O2_BANDS) {
      expect(band.from).toBeGreaterThan(previous)
      previous = band.from
    }
  })
})

describe('temperature cuts both ways', () => {
  it('leaves a comfortable cabin alone', () => {
    expect(thermalExposure(21).severity).toBe('nominal')
    expect(thermalExposure(24).severity).toBe('nominal')
  })

  it('escalates through heat stress to heat stroke', () => {
    expect(thermalExposure(29).severity).toBe('noticeable')
    expect(thermalExposure(32).severity).toBe('impaired')
    expect(thermalExposure(36).severity).toBe('dangerous')
    expect(thermalExposure(41).capacity).toBe(0)
  })

  it('handles a ship that has gone cold, which the old model could not', () => {
    // There was no cold case at all: a ship losing its reactor got colder and
    // colder and the crew were rated comfortable the whole way down.
    expect(thermalExposure(15).severity).toBe('impaired')
    expect(thermalExposure(10).severity).toBe('dangerous')
    expect(thermalExposure(1).severity).toBe('lethal')
  })
})

describe('hazards combine rather than compete', () => {
  it('multiplies capacity and adds harm', () => {
    const s = world()
    // Bad air and a hot ship together.
    s.ship.resources.heat.value = 33
    s.ship.resources.heat.rate = 0
    s.ship.resources.co2.value = s.ship.resources.co2.max
    s.ship.resources.co2.rate = 0

    const env = environmentAt(s, s.now)
    const co2 = env.exposures.find((e) => e.hazard === 'co2')!
    const heat = env.exposures.find((e) => e.hazard === 'heat')!

    expect(env.capacity).toBeCloseTo(co2.capacity * heat.capacity, 9)
    expect(env.healthPerDay).toBeCloseTo(co2.healthPerDay + heat.healthPerDay, 9)
  })

  it('reports the worst hazard first, so a dispatch can name the right one', () => {
    const s = world()
    s.ship.resources.heat.value = 29 // noticeable
    s.ship.resources.heat.rate = 0
    s.ship.resources.co2.value = s.ship.resources.co2.max // far worse
    s.ship.resources.co2.rate = 0

    const env = environmentAt(s, s.now)
    expect(env.exposures[0]!.hazard).toBe('co2')
    expect(env.severity).toBe(env.exposures[0]!.severity)
  })

  it('costs a working ship nothing but the CO2 it cannot scrub', () => {
    // A sorbent bed cannot strip a gas to zero, so a healthy cabin sits at a
    // few thousand ppm -- and the literature really does find a small
    // cognitive cost there. What must hold is that it is *only* that: no
    // health cost, and a capacity within a few per cent of nameplate.
    const env = environmentAt(advanceTo(world(), 2 * DAY), 2 * DAY)
    expect(env.severity).toBe('noticeable')
    expect(env.exposures.every((e) => e.hazard === 'co2')).toBe(true)
    expect(env.healthPerDay).toBe(0)
    expect(env.capacity).toBeGreaterThan(0.9)
    expect(env.incapacitating).toBe(false)
  })

  it('orders severities consistently', () => {
    const ladder: Severity[] = [
      'nominal',
      'noticeable',
      'impaired',
      'dangerous',
      'incapacitating',
      'lethal',
    ]
    for (let i = 1; i < ladder.length; i++) {
      expect(worseOf(ladder[i - 1]!, ladder[i]!)).toBe(ladder[i])
      expect(worseOf(ladder[i]!, ladder[i - 1]!)).toBe(ladder[i])
    }
  })

  it('starves slower than it suffocates', () => {
    // Rule of threes: minutes without air, days without water, weeks without
    // food. The ordering is what matters -- a ship in trouble loses its air
    // long before its pantry is the problem.
    const [water] = storesExposure(0, 10)
    const [food] = storesExposure(10, 0)
    expect(Math.abs(water!.healthPerDay)).toBeGreaterThan(Math.abs(food!.healthPerDay))
    expect(Math.abs(co2Exposure(70000).healthPerDay)).toBeGreaterThan(
      Math.abs(water!.healthPerDay),
    )
  })
})

describe('a failed scrubber is felt, in order', () => {
  it('takes the crew down the ladder rather than off a cliff', () => {
    // The whole reason for the rework: there used to be two states above
    // nominal, so a scrubber failure went from "fine" to "losing nine health a
    // day" with nothing in between and no name for either.
    const seen = new Set<Severity>()
    let s = breakPart(world(), 'life.scrubber.co2')
    for (let h = 0; h < 24 * 10; h++) {
      s = advanceTo(s, s.now + HOUR)
      seen.add(environmentAt(s, s.now).severity)
    }
    expect(seen.has('noticeable')).toBe(true)
    expect(seen.has('impaired')).toBe(true)
    expect(seen.has('dangerous')).toBe(true)
  })

  it('stops the watch working before it hurts anybody', () => {
    let s = breakPart(world(), 'life.scrubber.co2')
    let firstCapacityLoss: number | undefined
    let firstHealthLoss: number | undefined
    for (let h = 0; h < 24 * 20 && firstHealthLoss === undefined; h++) {
      s = advanceTo(s, s.now + HOUR)
      const env = environmentAt(s, s.now)
      if (firstCapacityLoss === undefined && env.capacity < 1) firstCapacityLoss = s.now
      if (firstHealthLoss === undefined && env.healthPerDay < 0) firstHealthLoss = s.now
    }
    expect(firstCapacityLoss).toBeDefined()
    expect(firstHealthLoss).toBeDefined()
    expect(firstCapacityLoss!).toBeLessThan(firstHealthLoss!)
  })

  it('is reported by the life-support readout at the same stage', () => {
    const s = advanceTo(breakPart(world(), 'life.scrubber.co2'), 4 * DAY)
    const view = lifeSupportView(s)
    const env = environmentAt(s, s.now)
    expect(view.co2Ppm).toBeGreaterThan(10000)
    expect(env.severity).not.toBe('nominal')
  })
})
