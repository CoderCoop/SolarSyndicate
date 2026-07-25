/**
 * The architecture-proving tests. Design doc §8.2.
 *
 * M0 exists to prove one claim: that a world advanced across a month of
 * absence is the same world you would have got by watching it the whole time,
 * cheaply and reproducibly. If these tests pass, the offline model (§7.2), the
 * save format (§8.3) and the server-authoritative path (§8.4) are all sound.
 * If they fail, no amount of content will save the design.
 */
import { describe, expect, it } from 'vitest'
import { advanceTo, applyCommand, createWorld, powerView } from '../src/engine.js'
import { stateHash } from '../src/hash.js'
import { DAY, HOUR } from '../src/time.js'
import type { SimState } from '../src/types.js'

const SEED = 20260725
// Deliberately far from any notional universal epoch: a world's day 0 is
// the day it was created, whenever that happens to be.
const START_UTC = Date.UTC(2026, 6, 25, 14, 30, 0)

function world(): SimState {
  return createWorld(SEED, START_UTC)
}

describe('offline catch-up', () => {
  it('is bit-identical whether advanced in one jump or many steps', () => {
    // The keystone property. The player who closes the app for a week and the
    // player who watches for a week must end up in the same world.
    const start = world()
    const target = start.now + 30 * DAY

    const jumped = advanceTo(start, target)

    let stepped = start
    const steps = 700
    for (let i = 1; i <= steps; i++) {
      stepped = advanceTo(stepped, start.now + ((target - start.now) * i) / steps)
    }

    expect(stateHash(stepped)).toBe(stateHash(jumped))
  })

  it('is identical across irregular, unaligned step sizes', () => {
    // Real sessions do not resume on tidy boundaries.
    const start = world()
    const target = start.now + 12 * DAY

    const jumped = advanceTo(start, target)

    let stepped = start
    let t = start.now
    let i = 0
    while (t < target) {
      t = Math.min(target, t + ((i % 7) + 1) * 3037.11)
      stepped = advanceTo(stepped, t)
      i++
    }

    expect(stateHash(stepped)).toBe(stateHash(jumped))
  })

  it('is deterministic: same seed and same window produce the same world', () => {
    const a = advanceTo(world(), 45 * DAY)
    const b = advanceTo(world(), 45 * DAY)
    expect(stateHash(a)).toBe(stateHash(b))
  })

  it('survives a snapshot round-trip unchanged', () => {
    // SimState is the save format (§8.3): it must survive JSON without loss.
    const advanced = advanceTo(world(), 9 * DAY)
    const round = JSON.parse(JSON.stringify(advanced)) as SimState
    expect(stateHash(round)).toBe(stateHash(advanced))

    // ...and continue identically from there.
    const fromRound = advanceTo(round, round.now + 5 * DAY)
    const direct = advanceTo(advanced, advanced.now + 5 * DAY)
    expect(stateHash(fromRound)).toBe(stateHash(direct))
  })

  it('never runs time backwards', () => {
    const start = advanceTo(world(), 2 * DAY)
    const back = advanceTo(start, start.now - DAY)
    expect(back.now).toBe(start.now)
    expect(stateHash(back)).toBe(stateHash(start))
  })

  it('catches up a month in well under the frame budget', () => {
    // §8.5 target: 30 idle days in under a second. Event-driven, so this is a
    // few thousand events, not 2.6 million ticks.
    const start = world()
    const t0 = performance.now()
    advanceTo(start, start.now + 30 * DAY)
    const elapsedMs = performance.now() - t0
    expect(elapsedMs).toBeLessThan(1000)
  })

  it('catches up a decade without falling over', () => {
    // Nobody will do this, but it proves the cost is per-event and not per-tick.
    const start = world()
    const t0 = performance.now()
    const far = advanceTo(start, start.now + 3650 * DAY)
    const elapsedMs = performance.now() - t0
    expect(far.now).toBe(start.now + 3650 * DAY)
    expect(elapsedMs).toBeLessThan(5000)
  })
})

describe('commands', () => {
  it('produce the same world whether applied live or replayed from a snapshot', () => {
    // §8.4: saves are snapshot + command log, so replay must be faithful.
    const start = world()
    const at = start.now + 6 * HOUR

    const live = applyCommand(start, {
      at,
      command: { kind: 'SET_PART_ENABLED', partId: 'engine.ntr.preheat', enabled: true },
    })

    const snapshot = JSON.parse(JSON.stringify(start)) as SimState
    const replayed = applyCommand(snapshot, {
      at,
      command: { kind: 'SET_PART_ENABLED', partId: 'engine.ntr.preheat', enabled: true },
    })

    expect(stateHash(replayed)).toBe(stateHash(live))
  })

  it('do not mutate the state they are given', () => {
    const start = world()
    const before = stateHash(start)
    applyCommand(start, {
      at: start.now + HOUR,
      command: { kind: 'SET_PART_ENABLED', partId: 'comms.array', enabled: false },
    })
    advanceTo(start, start.now + 10 * DAY)
    expect(stateHash(start)).toBe(before)
  })

  it('advance the world to the command timestamp before applying it', () => {
    const start = world()
    const at = start.now + 3 * DAY
    const applied = applyCommand(start, {
      at,
      command: { kind: 'SET_PART_ENABLED', partId: 'comms.array', enabled: false },
    })
    expect(applied.now).toBe(at)
    // Three days of watch-change dispatches happened before the order landed.
    expect(applied.log.filter((l) => l.text.startsWith('Watch change')).length).toBe(3)
  })
})

describe('the battery holds its invariants', () => {
  it('stays within bounds across a long unattended run', () => {
    let s = world()
    // Engine preheat on: the ship now draws more than it makes.
    s = applyCommand(s, {
      at: s.now + HOUR,
      command: { kind: 'SET_PART_ENABLED', partId: 'engine.ntr.preheat', enabled: true },
    })

    for (let day = 1; day <= 60; day++) {
      s = advanceTo(s, s.now + DAY)
      const v = powerView(s)
      expect(v.batteryKwh).toBeGreaterThanOrEqual(-1e-9)
      expect(v.batteryKwh).toBeLessThanOrEqual(v.batteryCapacityKwh + 1e-9)
    }
  })
})
