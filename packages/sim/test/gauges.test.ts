/**
 * Green, amber and red on the Life tab. Design doc §3.2, §1 pillar 2.
 *
 * Two claims worth defending. First, that the colours mean something: they are
 * a reading of the crew-impact ladder in `physiology.ts` and of time-to-empty,
 * not a second set of thresholds invented for the panel and free to drift from
 * the model -- which is exactly what the two hand-written ones in `engine.ts`
 * had already started to do.
 *
 * Second, that the picture and the colour agree. A row painted red with its
 * needle sitting in the green band is worse than no colour at all, and it is
 * the failure that a bar drawn from two separate calculations invites.
 */
import { describe, expect, it } from 'vitest'
import { STORES } from '@solsyn/data'
import {
  advanceTo,
  co2Gauge,
  createWorld,
  lifeSupportView,
  propellantGauge,
  sparesGauge,
  statusFor,
  storeGauge,
  tempGauge,
  worseStatus,
  type Gauge,
  type LifeStatus,
} from '../src/index.js'
import { DAY } from '../src/time.js'

const world = () => createWorld(20260726, Date.UTC(2200, 0, 1))

/** Which zone the needle is actually standing in. */
function zoneAtNeedle(g: Gauge): LifeStatus {
  return (g.zones.find((z) => g.fill <= z.until) ?? g.zones.at(-1)!).status
}

describe('a colour is a reading of the impact model, not a second one', () => {
  it('goes amber where health starts costing and red where it costs fast', () => {
    expect(statusFor('nominal')).toBe('nominal')
    // Noticeable costs a few per cent of capacity and no health at all. A gauge
    // that sat amber through every ordinary watch would teach the player to
    // ignore amber, which is the one thing a warning colour must not do.
    expect(statusFor('noticeable')).toBe('nominal')
    expect(statusFor('impaired')).toBe('watch')
    expect(statusFor('dangerous')).toBe('critical')
    expect(statusFor('incapacitating')).toBe('critical')
    expect(statusFor('lethal')).toBe('critical')
  })

  it('puts the CO2 boundaries on the figures a reader would expect', () => {
    // OSHA's 8-hour permissible exposure limit, and NIOSH's ladder above it.
    expect(co2Gauge(1500).status).toBe('nominal')
    expect(co2Gauge(4999).status).toBe('nominal')
    expect(co2Gauge(5000).status).toBe('watch')
    expect(co2Gauge(9999).status).toBe('watch')
    expect(co2Gauge(10000).status).toBe('critical')
  })

  it('bands the cabin at both ends, because a ship can freeze as well as cook', () => {
    // Every gauge on this panel has only ever warned in one direction. The
    // cold table has existed in physiology.ts since it was written and nothing
    // had ever drawn it.
    expect(tempGauge(21).status).toBe('nominal')
    expect(tempGauge(31).status).toBe('watch')
    expect(tempGauge(36).status).toBe('critical')
    expect(tempGauge(15).status).toBe('watch')
    expect(tempGauge(10).status).toBe('critical')

    const zones = tempGauge(21).zones.map((z) => z.status)
    expect(zones).toEqual(['critical', 'watch', 'nominal', 'watch', 'critical'])
  })
})

describe('a store is banded by how long it lasts, not by how full it looks', () => {
  const perDay = 20
  const rate = -perDay / DAY

  it('turns red inside the days it takes to finish a crossing', () => {
    expect(storeGauge(perDay * (STORES.criticalDays - 1), 1000, rate).status).toBe('critical')
    expect(storeGauge(perDay * (STORES.watchDays - 1), 1000, rate).status).toBe('watch')
    expect(storeGauge(perDay * (STORES.watchDays + 1), 1000, rate).status).toBe('nominal')
  })

  it('moves its bands as consumption does', () => {
    // The point of banding on time. The same 300 kg is comfortable with four
    // aboard and thin with eight, and a fixed mark says the same in both.
    const slow = storeGauge(300, 1000, rate)
    const fast = storeGauge(300, 1000, rate * 3)
    const redOf = (g: Gauge) => g.zones[0]!.until
    expect(redOf(fast)).toBeCloseTo(redOf(slow) * 3, 6)
    expect(fast.status).not.toBe(slow.status)
  })

  it('has no red at all when it is filling', () => {
    const filling = storeGauge(10, 1000, +5 / DAY)
    expect(filling.status).toBe('nominal')
    expect(filling.zones).toEqual([{ until: 1, status: 'nominal' }])
  })

  it('turns the locker red when an order cannot be filled', () => {
    // Spares do not drain on a clock; the locker empties when something breaks,
    // and a repair that cannot find spares waits.
    expect(sparesGauge(3, 60, 10).status).toBe('critical')
    expect(sparesGauge(12, 60, 10).status).toBe('watch')
    expect(sparesGauge(10 + STORES.sparesReserve + 1, 60, 10).status).toBe('nominal')
  })

  it('turns the tank red below the reserve the astrogator will not spend', () => {
    // Not "low on fuel": a ship that cannot cast off is stuck, which is a
    // different kind of problem from a ship that cannot go far.
    expect(propellantGauge(800, 32000, 900).status).toBe('critical')
    expect(propellantGauge(2000, 32000, 900).status).toBe('watch')
    expect(propellantGauge(20000, 32000, 900).status).toBe('nominal')
  })
})

describe('the bar and the colour cannot disagree', () => {
  /** Every gauge the panel draws, across states that colour them differently. */
  function allGauges() {
    const fresh = world()

    const month = advanceTo(world(), world().now + 30 * DAY)

    // A ship in trouble on every channel at once, so the red and amber paths
    // are exercised rather than only the green one.
    const bad = world()
    bad.ship.resources.co2.value = 6
    bad.ship.resources.heat.value = 38
    bad.ship.resources.o2.value = 4
    bad.ship.resources.water.value = 40
    bad.ship.resources.water.rate = -25 / DAY
    bad.ship.resources.food.value = 20
    bad.ship.resources.food.rate = -8 / DAY
    bad.ship.resources.propellant.value = 500
    bad.ship.resources.spares.value = 0

    // And one at the cold end, which no other case reaches.
    const cold = world()
    cold.ship.resources.heat.value = 6

    const out: [string, Gauge][] = []
    for (const [name, state] of [
      ['fresh', fresh],
      ['a month in', month],
      ['in trouble', bad],
      ['freezing', cold],
    ] as const) {
      for (const [key, g] of Object.entries(lifeSupportView(state).gauges)) {
        out.push([`${name}/${key}`, g])
      }
    }
    return out
  }

  it('actually reaches every colour across those states, or it proves nothing', () => {
    const seen = new Set(allGauges().map(([, g]) => g.status))
    expect([...seen].sort()).toEqual(['critical', 'nominal', 'watch'])
  })

  it('lays the zones end to end, once, ending at the rim', () => {
    for (const [where, g] of allGauges()) {
      expect(g.zones.length, `${where} has no zones`).toBeGreaterThan(0)
      const ends = g.zones.map((z) => z.until)
      expect(ends, `${where} zones are out of order`).toEqual([...ends].sort((a, b) => a - b))
      expect(ends.at(-1), `${where} zones stop short of the rim`).toBeCloseTo(1, 6)
      // Adjacent runs of the same colour would be two zones drawn as one, which
      // means a boundary is being claimed where there is not one.
      for (let i = 1; i < g.zones.length; i++) {
        expect(g.zones[i]!.status, `${where} repeats a colour`).not.toBe(g.zones[i - 1]!.status)
      }
    }
  })

  it('stands the needle in the band the row is painted', () => {
    // The failure a bar drawn from two calculations invites: a row coloured red
    // with its needle sitting in the green.
    for (const [where, g] of allGauges()) {
      expect(g.fill, `${where} needle is off the track`).toBeGreaterThanOrEqual(0)
      expect(g.fill, `${where} needle is off the track`).toBeLessThanOrEqual(1)
      // Clamped readings are the one exception: past the end of the track the
      // needle pegs and the status is still the true one.
      if (g.fill > 0 && g.fill < 1) {
        expect(zoneAtNeedle(g), `${where} needle is in the wrong band`).toBe(g.status)
      }
    }
  })

  it('takes the worse of the two things wrong with oxygen', () => {
    expect(worseStatus('nominal', 'watch')).toBe('watch')
    expect(worseStatus('critical', 'watch')).toBe('critical')

    // The case the mass reading alone gets wrong: a tank that is not draining
    // at all -- so it lasts for ever and the store band is green -- holding so
    // little that the cabin is already unbreathable. The gauge reads in
    // kilogrammes and the danger is in kilopascals.
    const s = world()
    s.ship.resources.o2.value = 3
    s.ship.resources.o2.rate = 0
    s.ship.resources.o2.since = s.now

    const view = lifeSupportView(s)
    expect(view.o2Days).toBe(Infinity)
    expect(storeGauge(3, 90, 0).status).toBe('nominal')
    expect(view.gauges.o2.status).toBe('critical')

    // And the bar shows it: the pressure boundaries are solved back to masses
    // on the same track, so the needle stands in a red band rather than in a
    // green one on a red row.
    const g = view.gauges.o2
    const zone = (g.zones.find((z) => g.fill <= z.until) ?? g.zones.at(-1)!).status
    expect(zone).toBe('critical')
  })
})
