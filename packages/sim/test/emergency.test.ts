/**
 * The decision window, and what the captain does with it. Design doc §7.4, §4.6.
 *
 * §7.4's rule is "no death without foreshadowing **and a decision**". The
 * physiology built the foreshadowing; this is the decision. The property these
 * tests exist to hold is the one sentence the whole section turns on:
 *
 *   "If margins were sane at departure, safe mode always suffices."
 *
 * Sane margins here means spares in the locker and a hand able to turn a
 * wrench. Given both, a player who closes the app on a failed scrubber must
 * come back to a living crew.
 */
import { describe, expect, it } from 'vitest'
import { advanceTo, applyCommand, createWorld, workOrderViews } from '../src/index.js'
import { environmentAt } from '../src/physiology.js'
import { EMERGENCY_AT } from '../src/emergency.js'
import { DAY, HOUR } from '../src/time.js'
import type { SimState } from '../src/types.js'

const START_UTC = Date.UTC(2026, 6, 25, 14, 30, 0)
const world = (seed = 7) => createWorld(seed, START_UTC)

/** Kill the scrubber, the way a threshold roll would. */
function scrubberDown(s: SimState): SimState {
  const next = structuredClone(s)
  const p = next.ship.parts.find((x) => x.id === 'life.scrubber.co2')!
  p.broken = true
  p.enabled = false
  return applyCommand(next, {
    at: next.now + 1,
    command: { kind: 'SET_PART_ENABLED', partId: 'comms.array', enabled: false },
  })
}

const repairOnScrubber = (s: SimState) =>
  s.workOrders.filter((w) => w.partId === 'life.scrubber.co2' && w.kind === 'repair')

describe('an emergency opens a window', () => {
  it('is raised as soon as the air starts costing health, not when it starts killing', () => {
    // Waiting for `dangerous` would open the window with twelve hours left on
    // a thirteen-hour repair, which is a formality rather than a decision.
    expect(EMERGENCY_AT).toBe('impaired')

    let s = scrubberDown(world())
    expect(s.emergency).toBeUndefined()
    s = advanceTo(s, s.now + 12 * HOUR)

    expect(s.emergency).toBeDefined()
    expect(s.emergency!.hazard).toBe('co2')
    expect(s.emergency!.causePartId).toBe('life.scrubber.co2')
  })

  it('gives the captain a deadline that leaves most of the margin intact', () => {
    const s = advanceTo(scrubberDown(world()), 12 * HOUR)
    const em = s.emergency!
    const window = em.respondBy - em.raisedAt
    expect(window).toBeGreaterThan(0)
    // A quarter of the time the crew have, capped at six hours: whatever the
    // arithmetic says, three quarters of the margin survives the wait.
    expect(window).toBeLessThanOrEqual(6 * HOUR)
  })

  it('says in the dispatch that the captain is going to act, and when', () => {
    const s = advanceTo(scrubberDown(world()), 12 * HOUR)
    const raised = s.log.find((e) => /^Emergency:/.test(e.text))
    expect(raised).toBeDefined()
    expect(raised!.level).toBe('alert')
    expect(raised!.text).toMatch(/stand the ship to in/)
  })

  it('closes itself when the air comes good, without anybody remembering to', () => {
    let s = advanceTo(scrubberDown(world()), 12 * HOUR)
    expect(s.emergency).toBeDefined()

    // Put the scrubber back and clear the cabin.
    const fixed = structuredClone(s)
    const p = fixed.ship.parts.find((x) => x.id === 'life.scrubber.co2')!
    p.broken = false
    p.enabled = true
    fixed.ship.resources.co2.value = 0
    s = applyCommand(fixed, {
      at: fixed.now + 1,
      command: { kind: 'SET_PART_ENABLED', partId: 'comms.array', enabled: true },
    })

    expect(s.emergency).toBeUndefined()
    expect(s.log.some((e) => /emergency is over/.test(e.text))).toBe(true)
  })
})

describe('the desk can answer it', () => {
  it('counts ordering the repair as the answer', () => {
    // The captain's whole response is that job. A player who has already
    // raised it has made the same call sooner.
    let s = advanceTo(scrubberDown(world()), 12 * HOUR)
    s = applyCommand(s, {
      at: s.now,
      command: { kind: 'QUEUE_WORK_ORDER', partId: 'life.scrubber.co2', orderKind: 'repair' },
    })
    expect(s.emergency!.answered).toBe(true)
    expect(s.ship.safeMode).toBeFalsy()
  })

  it('does not stand the ship to once answered', () => {
    let s = advanceTo(scrubberDown(world()), 12 * HOUR)
    s = applyCommand(s, { at: s.now, command: { kind: 'ANSWER_EMERGENCY' } })
    s = advanceTo(s, s.now + 12 * HOUR)
    expect(s.ship.safeMode).toBeFalsy()
  })

  it('leaves it entirely alone when the standing order is lifted', () => {
    const s0 = scrubberDown(world())
    s0.ship.standingOrders.safeMode = false
    const s = advanceTo(s0, 24 * HOUR)
    expect(s.emergency).toBeDefined()
    expect(s.ship.safeMode).toBeFalsy()
    expect(repairOnScrubber(s)).toHaveLength(0)
    // And it says so at the moment the player would need to know.
    expect(s.log.some((e) => /will not act on his own/.test(e.text))).toBe(true)
  })
})

describe('unanswered, the captain stands the ship to', () => {
  const stoodTo = () => advanceTo(scrubberDown(world()), 24 * HOUR)

  it('orders the repair on the thing that is killing them', () => {
    const s = stoodTo()
    expect(s.ship.safeMode).toBe(true)
    expect(repairOnScrubber(s).length).toBeGreaterThan(0)
  })

  it('puts that repair at the head of the queue', () => {
    const s = stoodTo()
    const queue = workOrderViews(s)
    if (queue.length > 1) expect(queue[0]!.partId).toBe('life.scrubber.co2')
  })

  it('sheds what is not keeping anybody alive, and nothing that is', () => {
    const s = stoodTo()
    // Life support and the plant stay up whatever else goes off.
    for (const id of ['life.scrubber.co2', 'life.oxygen.electrolysis', 'thermal.loop.radiators']) {
      expect(s.ship.parts.find((p) => p.id === id)!.shed).toBeFalsy()
    }
    expect(s.ship.parts.some((p) => p.shed)).toBe(true)
  })

  it('secures the idle hands but never the ones doing the work', () => {
    // Measured before this was written: resting the whole crew buys about a
    // quarter more time and costs the thirteen-hour repair, which converts a
    // survivable failure into a certain death slightly later.
    const s = stoodTo()
    const working = s.crew.filter((c) => c.workOrderId)
    for (const c of working) expect(c.activity).not.toBe('sleep')
    expect(s.crew.some((c) => c.activity === 'watch')).toBe(true)
  })

  it('says what it did, in the captain\'s own dispatch', () => {
    const s = stoodTo()
    const stand = s.log.find((e) => /stood the ship to/.test(e.text))
    expect(stand).toBeDefined()
    expect(stand!.level).toBe('alert')
    expect(stand!.text).toMatch(/under repair|head of the queue/)
  })
})

describe('safe mode suffices when the margins were sane (§7.4)', () => {
  it('brings the crew through a failed scrubber with nobody at the desk', () => {
    // The whole point. Spares in the locker, hands aboard, and a player who
    // closed the app: everybody lives.
    const s = advanceTo(scrubberDown(world()), 20 * DAY)

    expect(s.crew.every((c) => !c.dead)).toBe(true)
    expect(s.ship.safeMode).toBe(false)
    expect(s.ship.parts.find((p) => p.id === 'life.scrubber.co2')!.broken).toBe(false)
    expect(environmentAt(s, s.now).severity).toBe('noticeable')
  })

  it('does not, when the player pre-committed to thin margins', () => {
    // §7.4 allows exactly this: "death while unattended can only occur when
    // *you* pre-committed to thin margins". An empty locker under way is that
    // commitment, and the repair cannot be made without spares.
    const s0 = scrubberDown(world())
    s0.ship.docked = false
    s0.ship.resources.spares.value = 0
    s0.ship.resources.spares.rate = 0
    s0.ship.resources.spares.since = s0.now

    const s = advanceTo(s0, 60 * DAY)
    // The emergency was still raised and the captain still tried.
    expect(s.log.some((e) => /^Emergency:/.test(e.text))).toBe(true)
    expect(s.crew.some((c) => c.dead)).toBe(true)
  })

  it('is the difference between four dead and none', () => {
    // The counterfactual, because a survival test can pass for the wrong
    // reason. Same seed, same failure, same twenty days -- the only difference
    // is whether the captain was allowed to act.
    const run = (safeMode: boolean) => {
      const s0 = world()
      s0.ship.standingOrders.safeMode = safeMode
      return advanceTo(scrubberDown(s0), 20 * DAY)
    }

    const withCaptain = run(true)
    const without = run(false)

    expect(withCaptain.crew.filter((c) => c.dead)).toHaveLength(0)
    expect(without.crew.filter((c) => c.dead)).toHaveLength(4)
    expect(withCaptain.ship.parts.find((p) => p.id === 'life.scrubber.co2')!.broken).toBe(false)
    expect(without.ship.parts.find((p) => p.id === 'life.scrubber.co2')!.broken).toBe(true)
  })

  it('stands down by itself once the air is back inside limits', () => {
    const s = advanceTo(scrubberDown(world()), 20 * DAY)
    expect(s.ship.safeMode).toBe(false)
    expect(s.log.some((e) => /Stood down from safe mode/.test(e.text))).toBe(true)
  })
})
