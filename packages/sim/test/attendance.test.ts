/**
 * Attendance. Spec 004 RF-27 to RF-39, acceptance 12-15.
 *
 * The rule the design turns on: a part's rated figures are what it delivers
 * with *nobody attending it*, so an unattended ship runs to spec forever and
 * §7.4's ban on punishing absence holds by construction. Presence is upside --
 * a little output, and mostly slower wear.
 *
 * These tests exist to stop that inverting into a penalty later.
 */
import { describe, expect, it } from 'vitest'
import {
  advanceTo,
  applyCommand,
  createWorld,
  lifeSupportView,
  type SimState,
} from '../src/index.js'
import { attendanceFor, wearScaleFor } from '../src/attendance.js'
import { partScale } from '../src/networks.js'
import { wearRatePerSecond } from '../src/wear.js'
import { DAY, HOUR, type GameTime } from '../src/time.js'

const T0 = Date.UTC(2200, 0, 1)
/**
 * Attendance in isolation, with the standing order lifted.
 *
 * A ship that services itself is a confound here: these tests measure what
 * *presence* buys, and a completed service moves condition by 32 points, which
 * swamps the few points an attended watch is worth over the same hours. It also
 * takes the hand being measured off their station and puts them on a job.
 */
const world = () => {
  const s = createWorld(20260726, T0)
  s.ship.standingOrders.autoService = false
  return s
}

/** Move everyone onto a watch, so a chosen hour is attended or deserted. */
function setWatches(state: SimState, watch: 'A' | 'B' | 'C'): SimState {
  let s = state
  for (const c of s.crew) {
    s = applyCommand(s, { at: s.now, command: { kind: 'SET_CREW_WATCH', crewId: c.id, watch } })
  }
  return s
}

const partIn = (s: SimState, id: string) => s.ship.parts.find((p) => p.id === id)!

describe('presence is required', () => {
  it('gives an empty room no attendance at all', () => {
    // 04:00 -- only the A watch is up, and nobody's station is Cargo.
    const s = advanceTo(world(), 4 * HOUR)
    const a = attendanceFor(s, 'cargo', s.now)
    expect(a.attended).toBe(false)
    expect(a.quality).toBe(0)
  })

  it('ignores a skilled hand who is asleep in that room', () => {
    // B watch runs 08:00-16:00 and sleeps 00:00-08:00, so at 04:00 the whole
    // crew is unconscious in Quarters -- present, and worth nothing.
    let s = setWatches(world(), 'B')
    s = advanceTo(s, 4 * HOUR)
    expect(s.crew.every((c) => c.activity === 'sleep')).toBe(true)

    const quarters = attendanceFor(s, 'quarters', s.now)
    expect(quarters.attended).toBe(false)
    expect(quarters.quality).toBe(0)
  })

  it('counts a hand on watch at their station', () => {
    // Sandoval keeps C watch and stations in Life Support; 17:00 is her watch.
    const s = advanceTo(world(), 17 * HOUR)
    const a = attendanceFor(s, 'life-support', s.now)
    expect(a.attended).toBe(true)
    expect(a.quality).toBeGreaterThan(0)
    expect(a.crewId).toBe('crew.sandoval')
  })
})

/**
 * Compare attended against deserted at the *same instant*, so condition is
 * identical on both sides and the only difference is who is standing there.
 * Comparing two different times would confound attendance with wear.
 */
function pair(t: GameTime): { deserted: SimState; tended: SimState } {
  const base = advanceTo(world(), t)
  const deserted = structuredClone(base)
  for (const c of deserted.crew) c.activity = 'off'
  const tended = structuredClone(base)
  for (const c of tended.crew) c.activity = c.id === 'crew.sandoval' ? 'watch' : 'off'
  return { deserted, tended }
}

describe('rated means unattended', () => {
  it('holds loop closure at exactly the part rating when nobody is on the loop', () => {
    const { deserted } = pair(4 * HOUR)
    expect(attendanceFor(deserted, 'life-support', deserted.now).attended).toBe(false)

    // The recycler is rated 0.97, derated only by condition and tune. There is
    // no separate crew term: a fresh ship sits at spec tune, so day one is the
    // nameplate whether or not anybody is watching.
    const recycler = partIn(deserted, 'life.water.recycler')
    const expected = 0.97 * partScale(deserted, recycler, deserted.now)
    expect(lifeSupportView(deserted).recycleFraction).toBeCloseTo(expected, 12)
  })

  it('never lets attendance push closure below the rating', () => {
    const { deserted, tended } = pair(4 * HOUR)
    expect(lifeSupportView(tended).recycleFraction).toBeGreaterThanOrEqual(
      lifeSupportView(deserted).recycleFraction,
    )
  })

  it('leaves an unattended loop steady apart from its own wear', () => {
    // A month of desertion changes closure only as much as condition changed.
    const early = pair(4 * HOUR).deserted
    const late = pair(4 * HOUR + 30 * DAY).deserted
    for (const s of [early, late]) {
      const r = partIn(s, 'life.water.recycler')
      expect(lifeSupportView(s).recycleFraction).toBeCloseTo(0.97 * partScale(s, r, s.now), 12)
    }
  })
})

describe('attendance improves the loop, but not instantly', () => {
  it('does not move closure the moment someone walks in', () => {
    // Efficiency lives in tune now (RF-36), which is a level, not a switch.
    // At the same instant with the same tune, who is standing there makes no
    // difference at all -- the difference accumulates.
    const { deserted, tended } = pair(4 * HOUR)
    expect(lifeSupportView(tended).recycleFraction).toBeCloseTo(
      lifeSupportView(deserted).recycleFraction,
      12,
    )
  })

  it('gives a tired hand less than a rested one', () => {
    // RF-28. Same person, same station, same instant; only fatigue differs.
    const { tended } = pair(4 * HOUR)
    const restedQuality = attendanceFor(tended, 'life-support', tended.now).quality

    const tired = structuredClone(tended)
    const sandoval = tired.crew.find((c) => c.id === 'crew.sandoval')!
    sandoval.fatigue.value = 95
    sandoval.fatigue.rate = 0
    sandoval.fatigue.since = tired.now
    const tiredQuality = attendanceFor(tired, 'life-support', tired.now).quality

    expect(tiredQuality).toBeLessThan(restedQuality)
    expect(tiredQuality).toBeGreaterThan(0)
  })
})

describe('attendance mostly buys condition', () => {
  it('wears an attended room more slowly than a deserted one', () => {
    const deserted = advanceTo(world(), 4 * HOUR)
    const tended = advanceTo(world(), 17 * HOUR)

    const scrubber = 'life.scrubber.co2'
    const slow = Math.abs(wearRatePerSecond(tended, partIn(tended, scrubber), tended.now))
    const fast = Math.abs(wearRatePerSecond(deserted, partIn(deserted, scrubber), deserted.now))

    expect(slow).toBeLessThan(fast)
  })

  it('keeps the unattended penalty mild -- drift, not a cliff', () => {
    // RF-37: 1.15x unattended, 0.55x at skill 100. Never punitive.
    expect(wearScaleFor({ attended: false, quality: 0 })).toBeCloseTo(1.15, 9)
    expect(wearScaleFor({ attended: true, quality: 0 })).toBeCloseTo(1.0, 9)
    expect(wearScaleFor({ attended: true, quality: 1 })).toBeCloseTo(0.55, 9)
    // Monotone in between, and always inside the stated band.
    for (const q of [0.2, 0.4, 0.6, 0.8]) {
      const scale = wearScaleFor({ attended: true, quality: q })
      expect(scale).toBeLessThan(1.0)
      expect(scale).toBeGreaterThan(0.55)
    }
  })

  it('is a bigger lever on wear than on output', () => {
    // The design claim: presence buys condition, not throughput. A skill-100
    // hand cuts wear by 45% and lifts closure by 3 points.
    const wearGain = 1.0 - wearScaleFor({ attended: true, quality: 1 })
    expect(wearGain).toBeGreaterThan(0.4)

    const deserted = advanceTo(world(), 4 * HOUR)
    const tended = advanceTo(world(), 17 * HOUR)
    const closureGain =
      lifeSupportView(tended).recycleFraction - lifeSupportView(deserted).recycleFraction
    expect(closureGain).toBeLessThan(0.05)
  })
})

describe('no specialist gets paid for sleeping', () => {
  it('does not reward a skilled hand stationed in another room', () => {
    // Okonkwo (71 mechanics) stations in Machinery. Put her on the A watch so
    // she is awake at 04:00, and check Life Support is still deserted.
    let s = world()
    s = applyCommand(s, {
      at: s.now,
      command: { kind: 'SET_CREW_WATCH', crewId: 'crew.okonkwo', watch: 'A' },
    })
    s = advanceTo(s, 4 * HOUR)

    expect(attendanceFor(s, 'machinery', s.now).attended).toBe(true)
    expect(attendanceFor(s, 'life-support', s.now).attended).toBe(false)
  })

  it('follows a work order into the room being worked on', () => {
    // RF-27: an active job counts as being stationed there.
    let s = world()
    s = applyCommand(s, {
      at: s.now,
      command: { kind: 'QUEUE_WORK_ORDER', partId: 'life.scrubber.co2', orderKind: 'service' },
    })
    const order = s.workOrders.find((w) => w.partId === 'life.scrubber.co2')!
    expect(order.status).toBe('active')
    expect(attendanceFor(s, 'life-support', s.now).crewId).toBe(order.assignedCrewId)
  })
})
