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
import { conditionOutput } from '../src/networks.js'
import { resolveWear } from '../src/wear.js'
import { DAY, HOUR } from '../src/time.js'
import { CONDITION_THRESHOLDS } from '../src/wear.js'
import type { SimState, WorkOrderKind } from '../src/types.js'

const START_UTC = Date.UTC(2026, 6, 25, 14, 30, 0)
const world = (seed = 11) => createWorld(seed, START_UTC)

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
    const warned = s.log.filter((l) => l.text.includes('is down to'))
    expect(warned.length).toBeGreaterThan(0)
    // Each warning names the part, where it is, and what it will cost to put
    // right -- the player should never have to go looking for that.
    expect(warned[0]!.text).toMatch(/is down to \d+% — \w+\. Service takes \d+ hours\./)
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
