/**
 * Flow channels. Spec 004 RF-14 to RF-20, acceptance 5-7.
 *
 * The point of splitting flows out of the ship view was that a diagram can show
 * topology and a margin overlay cannot. So these tests are mostly about
 * *structure*: that every gauge has a channel, that a loop is drawn as a loop,
 * and above all that no figure here contradicts the figure the rest of the UI
 * shows for the same thing.
 */
import { describe, expect, it } from 'vitest'
import {
  applyCommand,
  createWorld,
  flowChannels,
  lifeSupportView,
  powerView,
  type SimState,
} from '../src/index.js'

const T0 = Date.UTC(2200, 0, 1)
const world = () => createWorld(20260726, T0)
const channel = (s: SimState, key: string) => flowChannels(s).find((c) => c.key === key)!

/** Exactly the gauges the Life tab renders, plus power from the status bar. */
const LIFE_GAUGES = [
  'Cabin CO2',
  'Cabin temperature',
  'Oxygen',
  'Water',
  'Food',
  'Propellant',
  'Spares',
]

describe('every gauge has a channel and every channel has a gauge', () => {
  it('covers the Life tab exactly, plus power', () => {
    // RF-14, acceptance 5.
    const labels = flowChannels(world()).map((c) => c.label)
    expect(new Set(labels).size).toBe(labels.length)
    for (const gauge of LIFE_GAUGES) expect(labels).toContain(gauge)
    expect(labels).toContain('Power')
    expect(labels).toHaveLength(LIFE_GAUGES.length + 1)
  })

  it('gives every channel the same grammar', () => {
    // RF-15: learn one, read the rest.
    for (const c of flowChannels(world())) {
      expect(c.nodes.length).toBeGreaterThan(0)
      expect(c.footnote.length).toBeGreaterThan(10)
      expect(c.nodes.some((n) => n.role === 'buffer')).toBe(true)
      for (const n of c.nodes) {
        expect(n.magnitude).toBeGreaterThanOrEqual(0)
        expect(n.name).toBeTruthy()
        expect(n.where).toBeTruthy()
      }
    }
  })

  it('names parts and crew, never decks', () => {
    // RF-16. The overlay could only ever say "deck 2"; this has to do better.
    const power = channel(world(), 'power')
    expect(power.nodes.some((n) => n.name === 'Beacon-4 Fission Plant')).toBe(true)
    expect(power.nodes.some((n) => n.partId === 'life.oxygen.electrolysis')).toBe(true)
    expect(channel(world(), 'o2').nodes.some((n) => n.id === 'crew')).toBe(true)
  })
})

describe('the numbers agree with the rest of the UI', () => {
  it('reports the same power balance as the status bar', () => {
    // SV-14 still applies: a link you can see is a number you could read.
    const s = world()
    expect(channel(s, 'power').net).toBeCloseTo(powerView(s).netKw, 9)
  })

  it('reports the same water balance as the Life gauge', () => {
    const s = world()
    const water = channel(s, 'water')
    const life = lifeSupportView(s)
    expect(water.horizonDays).toBeCloseTo(life.waterDays, 6)
    expect(water.level!.value).toBeCloseTo(life.waterKg, 9)
  })

  it('reports the same oxygen horizon as the Life gauge', () => {
    const s = world()
    expect(channel(s, 'o2').horizonDays).toBeCloseTo(lifeSupportView(s).o2Days, 6)
  })

  it('ranks consumers so the biggest is first', () => {
    // RF-16: finding what to switch off should be one look, not a survey.
    const consumers = channel(world(), 'power').nodes.filter((n) => n.role === 'consumer')
    const magnitudes = consumers.map((n) => n.magnitude)
    expect(magnitudes).toEqual([...magnitudes].sort((a, b) => b - a))
    expect(consumers[0]!.magnitude).toBeGreaterThan(0)
  })
})

describe('water is a loop, and that is the point', () => {
  it('draws the recycler as a return, not as a consumer', () => {
    // RF-17. A bar gauge can report 86% closure; only a diagram can show why.
    const water = channel(world(), 'water')
    const returns = water.nodes.filter((n) => n.role === 'return')
    expect(returns).toHaveLength(1)
    expect(returns[0]!.partId).toBe('life.water.recycler')
    expect(returns[0]!.magnitude).toBeGreaterThan(0)
  })

  it('removes the return when the recycler stops', () => {
    // Acceptance 6.
    let s = world()
    const before = channel(s, 'water')
    s = applyCommand(s, {
      at: s.now,
      command: { kind: 'SET_PART_ENABLED', partId: 'life.water.recycler', enabled: false },
    })
    const after = channel(s, 'water')

    expect(after.nodes.find((n) => n.role === 'return')!.magnitude).toBe(0)
    expect(after.nodes.find((n) => n.role === 'return')!.idle).toBe(true)
    // And the tank drains far faster for it.
    expect(after.horizonDays).toBeLessThan(before.horizonDays / 3)
  })

  it('states the counterfactual, in days', () => {
    // RF-18: say what the horizon becomes if the key part stops.
    const water = channel(world(), 'water')
    expect(water.counterfactual).toMatch(/Recycler offline: −\d+\.\d kg\/day, \d+ days of tank\./)
  })

  it('shows the hydroponics draw as food rather than as loss', () => {
    // The 2 kg/day the rack locks into plants is why closure reads 86% and not
    // 97%. That is the whole reason this channel earns a diagram.
    const rack = channel(world(), 'water').nodes.find(
      (n) => n.partId === 'life.hydroponics.lamps',
    )!
    expect(rack.role).toBe('consumer')
    expect(rack.note).toMatch(/food, not loss/)
  })
})

describe('channels that are not rates say so', () => {
  it('treats propellant as a budget', () => {
    // RF-19: a tank that empties only during a burn has no meaningful kg/day.
    const prop = channel(world(), 'propellant')
    expect(prop.net).toBe(0)
    expect(prop.horizonDays).toBe(Infinity)
    expect(prop.footnote).toMatch(/budget, not a rate/)
    expect(prop.level!.value).toBeGreaterThan(0)
  })

  it('shows spares as a locker with claims on it', () => {
    let s = world()
    expect(channel(s, 'spares').nodes.filter((n) => n.role === 'consumer')).toHaveLength(0)

    s = applyCommand(s, {
      at: s.now,
      command: { kind: 'QUEUE_WORK_ORDER', partId: 'life.scrubber.co2', orderKind: 'service' },
    })
    const claims = channel(s, 'spares').nodes.filter((n) => n.role === 'consumer')
    expect(claims).toHaveLength(1)
    expect(claims[0]!.name).toBe('CO2 Scrubber')
    expect(claims[0]!.magnitude).toBe(1)
  })
})

describe('switching things off shows up honestly', () => {
  it('marks a stopped part idle rather than dropping it', () => {
    // A part you switched off must stay visible: it is still installed, and
    // "where did it go" is a worse question than "why is it grey".
    let s = world()
    s = applyCommand(s, {
      at: s.now,
      command: { kind: 'SET_PART_ENABLED', partId: 'life.hydroponics.lamps', enabled: false },
    })
    const rack = channel(s, 'food').nodes.find((n) => n.partId === 'life.hydroponics.lamps')!
    expect(rack.idle).toBe(true)
    expect(rack.magnitude).toBe(0)
  })

  it('moves the power balance the way the status bar does', () => {
    let s = world()
    s = applyCommand(s, {
      at: s.now,
      command: { kind: 'SET_PART_ENABLED', partId: 'engine.ntr.preheat', enabled: true },
    })
    expect(channel(s, 'power').net).toBeCloseTo(powerView(s).netKw, 9)
    expect(channel(s, 'power').net).toBeLessThan(0)
    expect(channel(s, 'power').footnote).toMatch(/bank is covering/)
  })
})
