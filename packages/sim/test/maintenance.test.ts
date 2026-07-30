/**
 * Wear, failure and work orders. Design doc §3.3, §4.2, §4.3.
 *
 * This is M1's fun check made testable: does keeping the ship healthy have a
 * shape? The loop under test is condition falls -> output degrades -> a
 * threshold warns -> something fails -> the player orders work -> crew take
 * real time to do it -> the ship recovers.
 */
import { describe, expect, it } from 'vitest'
import {
  advanceTo,
  applyCommand,
  createWorld,
  crewViews,
  powerView,
  roomViews,
  workOrderViews,
} from '../src/engine.js'
import { laborRate } from '../src/crew.js'
import { AUTO_SERVICE_CONDITION, NO_WASTE_CONDITION, serviceWasteAt } from '../src/workorders.js'
import { conditionOutput } from '../src/networks.js'
import { resolveWear } from '../src/wear.js'
import { DAY, HOUR } from '../src/time.js'
import { CONDITION_THRESHOLDS } from '../src/wear.js'
import type { SimState, WorkOrderKind } from '../src/types.js'

const START_UTC = Date.UTC(2026, 6, 25, 14, 30, 0)

/**
 * A world with the standing order lifted.
 *
 * Everything in this file is about the *manual* path -- the player noticing,
 * the player ordering, the crew working it -- and the ship raising its own
 * services would put a second job in every queue under test. The standing order
 * has its own describe block at the foot of the file.
 */
const world = (seed = 11) => {
  const s = createWorld(seed, START_UTC)
  s.ship.standingOrders.autoService = false
  return s
}

function part(s: SimState, id: string) {
  return s.ship.parts.find((p) => p.id === id)!
}

function order(s: SimState, partId: string, orderKind: WorkOrderKind = 'service'): SimState {
  return applyCommand(s, {
    at: s.now + 60,
    command: { kind: 'QUEUE_WORK_ORDER', partId, orderKind },
  })
}

describe('wear', () => {
  it('only accrues while a part is running', () => {
    const s = world()
    const idle = part(s, 'engine.ntr.preheat') // starts offline
    expect(idle.condition.rate).toBe(0)

    const running = part(s, 'life.scrubber.co2')
    expect(running.condition.rate).toBeLessThan(0)
  })

  it('degrades output before it fails outright', () => {
    // §3.3: a component that dies without warning is a trap; one that has been
    // losing output for a week is a decision the player declined to make.
    expect(conditionOutput(100)).toBeCloseTo(1, 6)
    expect(conditionOutput(50)).toBeLessThan(1)
    expect(conditionOutput(0)).toBeGreaterThan(0)

    const fresh = powerView(world()).productionKw
    const worn = structuredClone(world())
    worn.ship.parts.find((p) => p.id === 'reactor.fission.beacon4')!.condition.value = 20
    expect(powerView(worn).productionKw).toBeLessThan(fresh)
  })

  it('warns at thresholds on the way down', () => {
    const s = advanceTo(world(), 40 * DAY)
    const warned = s.log.filter((l) => l.topic === 'upkeep' && /Service takes/.test(l.text))
    expect(warned.length).toBeGreaterThan(0)
    // Each warning names the part, its state, and what it will cost to put
    // right -- the player should never have to go looking for that. The
    // condition itself is the figure, hoisted out of the prose so a column of
    // dispatches can be read down rather than across.
    expect(warned[0]!.text).toMatch(/ is \w+\. Service takes \d+ hours\./)
    expect(warned[0]!.figure).toMatch(/^\d+% condition$/)
    // What arrives first is whichever part is nearest its next threshold, not
    // whichever is in worst condition: the reactor starts at 79% and 75% is
    // only four points away.
    expect(warned[0]!.text).toContain('Beacon-4 Fission Plant')
  })

  it('eventually fails things, and says what it will take to fix', () => {
    const s = advanceTo(world(), 200 * DAY)
    const failures = s.log.filter((l) => l.text.includes('has failed'))
    expect(failures.length).toBeGreaterThan(0)
    expect(failures[0]!.level).toBe('alert')
    expect(failures[0]!.text).toMatch(/\d+ hours and \d+ spares/)
    expect(s.ship.parts.some((p) => p.broken)).toBe(true)
  })

  it('is deterministic: the same seed fails the same things at the same times', () => {
    const a = advanceTo(world(42), 200 * DAY)
    const b = advanceTo(world(42), 200 * DAY)
    const failures = (s: SimState) =>
      s.log.filter((l) => l.text.includes('has failed')).map((l) => `${l.at}:${l.text}`)
    expect(failures(a)).toEqual(failures(b))
    expect(failures(a).length).toBeGreaterThan(0)
  })

  it('gives different worlds different luck', () => {
    const failures = (seed: number) =>
      advanceTo(world(seed), 200 * DAY)
        .log.filter((l) => l.text.includes('has failed'))
        .map((l) => l.text)
    expect(failures(1)).not.toEqual(failures(999))
  })

  it('thresholds are ordered and exhaustive down to zero', () => {
    expect([...CONDITION_THRESHOLDS]).toEqual([...CONDITION_THRESHOLDS].sort((a, b) => b - a))
    expect(CONDITION_THRESHOLDS.at(-1)).toBe(0)
  })
})

describe('work orders', () => {
  it('are raised on command and worked by the best hand on watch', () => {
    const s = order(world(), 'life.scrubber.co2')
    const orders = workOrderViews(s)
    expect(orders).toHaveLength(1)
    expect(orders[0]!.partName).toBe('CO2 Scrubber')
    expect(orders[0]!.required).toBe(5)
    expect(orders[0]!.status).toMatch(/active|queued/)
  })

  it('take real time, and finish', () => {
    let s = order(world(), 'life.scrubber.co2')
    const before = part(s, 'life.scrubber.co2').condition.value

    // Not instant: nothing has happened an hour later.
    s = advanceTo(s, s.now + HOUR)
    expect(workOrderViews(s)).toHaveLength(1)

    s = advanceTo(s, s.now + 6 * DAY)
    expect(workOrderViews(s)).toHaveLength(0)
    expect(part(s, 'life.scrubber.co2').condition.value).toBeGreaterThan(before)
    expect(s.log.some((l) => l.text.includes('serviced CO2 Scrubber'))).toBe(true)
  })

  it('consume spares', () => {
    // Compared against a control, not against the starting figure: alongside
    // the Local, station services are restocking the lockers faster than one
    // service consumes them.
    const s = world()
    const control = advanceTo(s, s.now + 6 * DAY).ship.resources.spares.value
    const worked = advanceTo(order(s, 'life.scrubber.co2'), s.now + 6 * DAY).ship.resources.spares
      .value
    expect(worked).toBeLessThan(control)
    expect(control - worked).toBeCloseTo(1, 6) // the scrubber's serviceSpares
  })

  it('hand over between watches, and change pace with who has the spanner', () => {
    // §4.3: the schedule is the AI. A nine-hour job outlasts a single watch,
    // so it gets picked up by whoever comes on next -- and moves at their
    // speed, not the last hand's.
    let s = order(world(), 'reactor.fission.beacon4') // 9 hours > one 8h watch
    const hands = new Set<string>()
    const rates = new Set<number>()

    for (let i = 0; i < 24; i++) {
      s = advanceTo(s, s.now + HOUR)
      const view = workOrderViews(s)[0]
      if (!view) break
      if (view.assignedName) hands.add(view.assignedName)
      rates.add(Math.round(s.workOrders[0]!.progress.rate * 1e9))
    }

    expect(hands.size).toBeGreaterThan(1)
    expect(rates.size).toBeGreaterThan(1)
  })

  it('turn a failure back into a working system', () => {
    let s = structuredClone(world())
    const scrubber = s.ship.parts.find((p) => p.id === 'life.scrubber.co2')!
    scrubber.broken = true
    scrubber.enabled = false

    s = order(s, 'life.scrubber.co2', 'repair')
    expect(workOrderViews(s)[0]!.kind).toBe('repair')

    s = advanceTo(s, s.now + 12 * DAY)
    expect(part(s, 'life.scrubber.co2').broken).toBe(false)
    expect(part(s, 'life.scrubber.co2').enabled).toBe(true)
    expect(s.log.some((l) => l.text.includes('running again'))).toBe(true)
    // Back in service, and already wearing again from the moment it restarted.
    expect(part(s, 'life.scrubber.co2').condition.value).toBeGreaterThan(50)
  })

  it('refuse to double up on the same part', () => {
    let s = order(world(), 'life.scrubber.co2')
    s = order(s, 'life.scrubber.co2')
    expect(workOrderViews(s)).toHaveLength(1)
  })

  it('block when there are not enough spares', () => {
    const s = structuredClone(world())
    s.ship.resources.spares.value = 0
    const blocked = order(s, 'life.scrubber.co2')
    expect(workOrderViews(blocked)[0]!.status).toBe('blocked')
  })

  it('can be cancelled', () => {
    let s = order(world(), 'life.scrubber.co2')
    const id = workOrderViews(s)[0]!.id
    s = applyCommand(s, { at: s.now + 60, command: { kind: 'CANCEL_WORK_ORDER', workOrderId: id } })
    expect(workOrderViews(s)).toHaveLength(0)
  })

  it('show up on the deck they belong to', () => {
    const s = order(world(), 'life.scrubber.co2')
    const room = roomViews(s).find((r) => r.id === 'life-support')!
    expect(room.parts.find((p) => p.id === 'life.scrubber.co2')!.hasWorkOrder).toBe(true)
  })
})

describe('crew skill is legible in the numbers the player watches', () => {
  it('a better mechanic works faster on the same job (§4.2)', () => {
    // Put each hand on watch in turn and ask how fast they would work.
    const rateFor = (crewId: string) => {
      const s = structuredClone(world())
      for (const c of s.crew) c.activity = c.id === crewId ? 'watch' : 'off'
      const crew = s.crew.find((c) => c.id === crewId)!
      return laborRate(s, crew, s.now)
    }

    const okonkwo = rateFor('crew.okonkwo') // mechanics 71
    const berg = rateFor('crew.berg') // mechanics 14

    expect(okonkwo).toBeGreaterThan(berg)
    expect(okonkwo / berg).toBeGreaterThan(1.5)
  })

  it('slows wear in the room a hand is actually standing watch in', () => {
    // Spec 004 RF-37 replaced the old fleet-wide bonus: skill helps the deck
    // you are on, not every deck at once. Nameplate scrubber wear is 0.52/day.
    const s = world()
    const wearOf = (st: typeof s, id: string) => -part(st, id).condition.rate * DAY

    const deserted = structuredClone(s)
    for (const c of deserted.crew) c.activity = 'off'
    resolveWear(deserted, deserted.now)
    // Nobody on watch anywhere: 1.15x, mild drift rather than a cliff.
    expect(wearOf(deserted, 'life.scrubber.co2')).toBeCloseTo(0.52 * 1.15, 6)

    const tended = structuredClone(s)
    for (const c of tended.crew) {
      // Sandoval keeps lifeSupport 58 and stations in Life Support.
      c.activity = c.id === 'crew.sandoval' ? 'watch' : 'off'
    }
    resolveWear(tended, tended.now)
    expect(wearOf(tended, 'life.scrubber.co2')).toBeLessThan(wearOf(deserted, 'life.scrubber.co2'))
    expect(wearOf(tended, 'life.scrubber.co2')).toBeLessThan(0.52)

    // And she does nothing at all for the reactor, which is not her deck.
    expect(wearOf(tended, 'reactor.fission.beacon4')).toBeCloseTo(
      wearOf(deserted, 'reactor.fission.beacon4'),
      9,
    )
  })

  it('reports what each hand is doing, in words', () => {
    const s = order(world(), 'life.scrubber.co2')
    const views = crewViews(s)
    expect(views).toHaveLength(4)
    expect(views.some((c) => c.doing.startsWith('Servicing'))).toBe(true)
    expect(views.some((c) => c.doing === 'Asleep')).toBe(true)
  })
})

/**
 * The standing order. Design doc §7.3, §3.3.
 *
 * A service puts back a fixed number of condition points and the ceiling clips
 * the rest, so there is a right moment to spend a spare and it is the same
 * moment every time on every part. That is clerical work, not judgement, and
 * §7.3's standing orders are exactly the place to put it.
 */
describe('the ship services itself when a service would not be wasted', () => {
  /** A world with the order left on, which is the shipped default. */
  const tended = (seed = 11) => createWorld(seed, START_UTC)

  /**
   * Every job the order ever raised, finished ones included.
   *
   * `workOrderViews` is the open queue, and a service is five hours of work
   * against days of wear -- so by the time a test has advanced far enough for
   * the crossing to happen, the job it is looking for has usually been done and
   * left the view.
   */
  const raisedByShip = (s: SimState) => s.workOrders.filter((w) => w.auto)

  it('knows the point where the ceiling stops eating the spare', () => {
    // Derived from data, not a second copy of it: a service restores 32, so a
    // part above 68 throws away whatever will not fit.
    expect(NO_WASTE_CONDITION).toBe(68)
    expect(serviceWasteAt(100)).toBe(32)
    expect(serviceWasteAt(NO_WASTE_CONDITION)).toBe(0)
    expect(serviceWasteAt(40)).toBe(0)
  })

  it('raises nothing while every part is still too good to touch', () => {
    const s = tended()
    for (const p of s.ship.parts) p.condition.value = 95
    const later = advanceTo(s, 6 * HOUR)
    expect(workOrderViews(later).filter((o) => o.auto)).toHaveLength(0)
  })

  it('raises one by itself once a part wears past the line', () => {
    const s = tended()
    for (const p of s.ship.parts) p.condition.value = 95
    // Put one part just above the line and let it wear through.
    part(s, 'life.scrubber.co2').condition.value = AUTO_SERVICE_CONDITION + 0.4

    const later = advanceTo(s, 3 * DAY)
    const raised = raisedByShip(later)
    expect(raised).toHaveLength(1)
    expect(raised[0]!.partId).toBe('life.scrubber.co2')

    // And it waited for the line rather than firing on sight: 0.4 points at
    // 0.598 a day is a little under sixteen hours.
    expect(raised[0]!.createdAt).toBeGreaterThan(0.6 * DAY)
    expect(raised[0]!.createdAt).toBeLessThan(0.75 * DAY)
  })

  it('does it while the app is closed, at the moment the line was crossed', () => {
    // The whole point of scheduling it as an event rather than checking on
    // open: catch-up must reach the same state as sitting and watching (§7.2).
    const s = tended()
    for (const p of s.ship.parts) p.condition.value = 95
    part(s, 'life.scrubber.co2').condition.value = AUTO_SERVICE_CONDITION + 0.4

    const watched = advanceTo(advanceTo(advanceTo(s, DAY), 2 * DAY), 4 * DAY)
    const away = advanceTo(s, 4 * DAY)
    expect(workOrderViews(away).map((o) => o.partName).sort()).toEqual(
      workOrderViews(watched).map((o) => o.partName).sort(),
    )
  })

  it('will not raise a job the locker cannot pay for', () => {
    // A blocked job holds a hand that a workable one could have used, so the
    // order declines rather than queueing something it knows will stall.
    const s = tended()
    for (const p of s.ship.parts) p.condition.value = 95
    part(s, 'life.scrubber.co2').condition.value = AUTO_SERVICE_CONDITION + 0.4
    // Under way, so the locker stays empty: alongside the Local it refills at
    // two a day and would have paid for the job before the crossing arrived.
    s.ship.docked = false
    s.ship.resources.spares.value = 0
    s.ship.resources.spares.rate = 0
    s.ship.resources.spares.since = s.now

    const later = advanceTo(s, 3 * DAY)
    expect(raisedByShip(later)).toHaveLength(0)
  })

  it('leaves a part alone when the player has already ordered work on it', () => {
    let s = tended()
    for (const p of s.ship.parts) p.condition.value = 95
    part(s, 'life.scrubber.co2').condition.value = AUTO_SERVICE_CONDITION + 0.4
    s = order(s, 'life.scrubber.co2')

    const later = advanceTo(s, 3 * DAY)
    // Exactly one job on that part, and it is the one the player raised.
    const onScrubber = later.workOrders.filter((w) => w.partId === 'life.scrubber.co2')
    expect(onScrubber).toHaveLength(1)
    expect(onScrubber[0]!.auto).toBe(false)
  })

  it('never orders a repair on its own -- a failure is the player\'s call', () => {
    const s = tended()
    for (const p of s.ship.parts) p.condition.value = 95
    const scrubber = part(s, 'life.scrubber.co2')
    scrubber.condition.value = 20
    scrubber.broken = true
    scrubber.enabled = false

    const later = advanceTo(s, 3 * DAY)
    expect(later.workOrders.filter((w) => w.kind === 'repair')).toHaveLength(0)
  })

  it('stops entirely when the order is lifted, and catches up when it is set', () => {
    let s = tended()
    for (const p of s.ship.parts) p.condition.value = 95
    part(s, 'life.scrubber.co2').condition.value = 40

    s = applyCommand(s, {
      at: s.now,
      command: { kind: 'SET_STANDING_ORDER', order: 'autoService', on: false },
    })
    s = advanceTo(s, 2 * DAY)
    expect(raisedByShip(s)).toHaveLength(0)

    // Setting it does not wait for the next crossing: everything already past
    // the line is picked up at once.
    s = applyCommand(s, {
      at: s.now,
      command: { kind: 'SET_STANDING_ORDER', order: 'autoService', on: true },
    })
    expect(raisedByShip(s).length).toBeGreaterThan(0)
  })
})

describe('the queue is worked in the order the player sets', () => {
  it('starts new work at the back', () => {
    let s = world()
    s = order(s, 'life.scrubber.co2')
    s = order(s, 'thermal.loop.radiators')
    expect(workOrderViews(s).map((o) => o.partName)).toEqual([
      workOrderViews(s)[0]!.partName,
      workOrderViews(s)[1]!.partName,
    ])
    // Two distinct jobs, in the order they were raised.
    expect(new Set(workOrderViews(s).map((o) => o.partName)).size).toBe(2)
  })

  it('moves a job up, and gives it the hand', () => {
    let s = world()
    s = order(s, 'life.scrubber.co2')
    s = order(s, 'thermal.loop.radiators')

    const before = workOrderViews(s)
    const second = before[1]!
    // Before: the older job holds the only free hand.
    expect(before[0]!.assignedName).toBeTruthy()

    s = applyCommand(s, {
      at: s.now,
      command: { kind: 'MOVE_WORK_ORDER', workOrderId: second.id, direction: 'up' },
    })

    const after = workOrderViews(s)
    expect(after[0]!.id).toBe(second.id)
    expect(after[0]!.assignedName).toBeTruthy()
  })

  it('will not move the top job up or the bottom one down', () => {
    let s = world()
    s = order(s, 'life.scrubber.co2')
    s = order(s, 'thermal.loop.radiators')
    const [first, last] = workOrderViews(s)

    const unchanged = workOrderViews(s).map((o) => o.id)
    for (const [id, direction] of [
      [first!.id, 'up'],
      [last!.id, 'down'],
    ] as const) {
      s = applyCommand(s, { at: s.now, command: { kind: 'MOVE_WORK_ORDER', workOrderId: id, direction } })
      expect(workOrderViews(s).map((o) => o.id)).toEqual(unchanged)
    }
  })
})
