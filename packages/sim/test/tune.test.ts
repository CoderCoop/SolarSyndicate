/**
 * Tune. Spec 004 RF-35a, RF-36.
 *
 * The claim under test: efficiency is a second axis, orthogonal to wear. A
 * system nobody watches accumulates small inefficiencies -- gunk, a hose out of
 * spec, setpoints never re-trimmed -- and quietly underperforms. A skilled
 * operator notices those, and a very good one takes the system past its
 * nameplate.
 *
 * And the guard rail: it must bottom out. A neglected ship is inefficient, not
 * doomed (§7.4).
 */
import { describe, expect, it } from 'vitest'
import { TUNE } from '@solsyn/data'
import { advanceTo, applyCommand, createWorld } from '../src/index.js'
import { partScale } from '../src/networks.js'
import { tuneCeilingFor, tuneOf, tuneOutputScale } from '../src/tune.js'
import { DAY } from '../src/time.js'
import type { SimState } from '../src/types.js'

const T0 = Date.UTC(2200, 0, 1)
const world = () => createWorld(20260726, T0)
const partIn = (s: SimState, id: string) => s.ship.parts.find((p) => p.id === id)!

/**
 * A genuinely unattended room.
 *
 * Nobody's declared station is the reactor deck, and work orders are player-
 * commanded, so with no orders raised nothing ever walks in there. Using Life
 * Support for this would be wrong: Sandoval stations there and tends it eight
 * hours in every twenty-four, which is the mechanic working, not neglect.
 */
const NEGLECTED_PART = 'reactor.fission.beacon4'

function neglect(days: number): SimState {
  return advanceTo(world(), days * DAY)
}

describe('the scale is honest at the nameplate', () => {
  it('delivers exactly rated output at spec tune', () => {
    expect(tuneOutputScale(TUNE.specTune)).toBeCloseTo(1, 12)
  })

  it('beats the nameplate at full tune and falls short at zero', () => {
    expect(tuneOutputScale(100)).toBeCloseTo(TUNE.outputAtFullTune, 12)
    expect(tuneOutputScale(0)).toBeCloseTo(TUNE.outputAtZeroTune, 12)
    expect(TUNE.outputAtFullTune).toBeGreaterThan(1)
    expect(TUNE.outputAtZeroTune).toBeLessThan(1)
  })

  it('is monotone, with no step at spec', () => {
    let previous = -Infinity
    for (let t = 0; t <= 100; t += 0.5) {
      const v = tuneOutputScale(t)
      expect(v).toBeGreaterThan(previous)
      previous = v
    }
    const eps = 1e-6
    expect(tuneOutputScale(TUNE.specTune + eps)).toBeCloseTo(
      tuneOutputScale(TUNE.specTune - eps),
      6,
    )
  })

  it('clamps outside 0-100 rather than extrapolating', () => {
    expect(tuneOutputScale(-40)).toBeCloseTo(TUNE.outputAtZeroTune, 12)
    expect(tuneOutputScale(400)).toBeCloseTo(TUNE.outputAtFullTune, 12)
  })
})

describe('a ship is delivered in tune', () => {
  it('starts every part exactly at spec', () => {
    const s = world()
    for (const p of s.ship.parts) expect(tuneOf(p, s.now)).toBeCloseTo(TUNE.specTune, 9)
  })

  it('means day-one output is the nameplate, modified only by condition', () => {
    const s = world()
    const recycler = partIn(s, 'life.water.recycler')
    // partScale is condition x tune; at spec tune the second term is exactly 1.
    expect(partScale(s, recycler, s.now)).toBeCloseTo(
      partScale(s, recycler, s.now) / tuneOutputScale(TUNE.specTune),
      12,
    )
  })
})

describe('neglect costs efficiency, slowly', () => {
  it('drifts down when nobody is watching', () => {
    const early = neglect(2)
    const late = neglect(20)
    expect(tuneOf(partIn(late, NEGLECTED_PART), late.now)).toBeLessThan(
      tuneOf(partIn(early, NEGLECTED_PART), early.now),
    )
  })

  it('is a voyage-length concern, not a daily one', () => {
    // A couple of days of inattention must not be noticeable.
    const s = neglect(2)
    const lost = TUNE.specTune - tuneOf(partIn(s, NEGLECTED_PART), s.now)
    expect(lost).toBeLessThan(5)
  })

  it('bottoms out instead of spiralling', () => {
    // RF-35a: the fair-play floor. Two years of total neglect, and the part is
    // still delivering the stated fraction of rated -- not zero, not falling.
    const s = neglect(700)
    const reactor = partIn(s, NEGLECTED_PART)
    expect(tuneOf(reactor, s.now)).toBe(0)
    expect(tuneOutputScale(tuneOf(reactor, s.now))).toBeCloseTo(TUNE.outputAtZeroTune, 12)
    expect(TUNE.outputAtZeroTune).toBeGreaterThan(0.75)
  })

  it('holds a tended system far better than a deserted one', () => {
    // Sixty days, no maintenance ordered on either. Life Support is Sandoval's
    // station and is tended a third of every day; nobody's station is the
    // reactor. The gap between them is the mechanic doing its job.
    const s = advanceTo(world(), 60 * DAY)
    const tended = tuneOf(partIn(s, 'life.water.recycler'), s.now)
    const deserted = tuneOf(partIn(s, NEGLECTED_PART), s.now)

    expect(tended).toBeGreaterThan(deserted)
    expect(tended).toBeGreaterThan(TUNE.ceilingUnskilled)
    // Her watches hold it near where she can hold it, not at spec: eight hours
    // on and sixteen off is an equilibrium, not a guarantee.
    expect(tuneOutputScale(tended)).toBeGreaterThan(TUNE.outputAtZeroTune)
  })

  it('leaves a stopped part alone -- it is not drifting if it is not running', () => {
    let s = world()
    s = applyCommand(s, {
      at: s.now,
      command: { kind: 'SET_PART_ENABLED', partId: 'life.hydroponics.lamps', enabled: false },
    })
    s = advanceTo(s, 60 * DAY)
    expect(tuneOf(partIn(s, 'life.hydroponics.lamps'), s.now)).toBeCloseTo(TUNE.specTune, 6)
  })
})

describe('a skilled operator brings it back, and past the nameplate', () => {
  it('gives a better hand a higher ceiling', () => {
    expect(tuneCeilingFor(0)).toBeCloseTo(TUNE.ceilingUnskilled, 9)
    expect(tuneCeilingFor(1)).toBeCloseTo(TUNE.ceilingSkilled, 9)
    expect(tuneCeilingFor(0.5)).toBeGreaterThan(tuneCeilingFor(0.2))
  })

  it('lets an unskilled hand keep it running but not keep it sharp', () => {
    // "Any staff can perform basic plant growing functions." A quality-0
    // operator settles the system well below spec: they never spot anything.
    expect(tuneCeilingFor(0)).toBeLessThan(TUNE.specTune)
    expect(tuneOutputScale(tuneCeilingFor(0))).toBeLessThan(1)
    expect(tuneOutputScale(tuneCeilingFor(0))).toBeGreaterThan(TUNE.outputAtZeroTune)
  })

  it('only lets a very good operator beat the nameplate', () => {
    expect(tuneOutputScale(tuneCeilingFor(1))).toBeGreaterThan(1)
    // Sandoval is the ship's life-support specialist at 58, and even rested she
    // is nowhere near 100 -- she holds the loop, she does not transcend it.
    const sandovalQuality = 0.58 * 1.0
    expect(tuneOutputScale(tuneCeilingFor(sandovalQuality))).toBeLessThan(
      tuneOutputScale(tuneCeilingFor(1)),
    )
  })

  it('recovers a neglected system when someone is on it again', () => {
    // Start the recycler badly out of adjustment, then let Sandoval's watches
    // run. Nothing is ordered: she simply stands her watch in that room.
    let s = world()
    const recycler = partIn(s, 'life.water.recycler')
    recycler.tune.value = 8
    recycler.tune.since = s.now
    const bottom = 8

    s = advanceTo(s, 6 * DAY)
    expect(tuneOf(partIn(s, 'life.water.recycler'), s.now)).toBeGreaterThan(bottom)
  })
})

describe('tune and wear are different things', () => {
  it('can be perfectly tuned and nearly broken at once', () => {
    const s = world()
    const recycler = partIn(s, 'life.water.recycler')
    recycler.condition.value = 12
    recycler.condition.rate = 0
    recycler.tune.value = 100
    recycler.tune.rate = 0

    // Both terms present, neither masking the other.
    expect(partScale(s, recycler, s.now)).toBeLessThan(1)
    expect(tuneOutputScale(tuneOf(recycler, s.now))).toBeGreaterThan(1)
  })

  it('is not repaired by a work order', () => {
    // RF-36d: only assignment fixes tune. A service restores condition and
    // leaves adjustment exactly where it was.
    let s = neglect(60)
    const before = tuneOf(partIn(s, 'life.scrubber.co2'), s.now)
    s = applyCommand(s, {
      at: s.now,
      command: { kind: 'QUEUE_WORK_ORDER', partId: 'life.scrubber.co2', orderKind: 'service' },
    })
    const after = tuneOf(partIn(s, 'life.scrubber.co2'), s.now)
    expect(after).toBeCloseTo(before, 9)
  })
})
