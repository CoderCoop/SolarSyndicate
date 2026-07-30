/**
 * A ship whose crew is gone. Design doc §7.4, §4.5.
 *
 * §7.4's sentence is the specification: "The ship survives. Crew are mortal;
 * the campaign is not. Hull loss is not in v1 (a dead-crew ship gets
 * recovered/towed at ruinous cost)."
 *
 * Nothing implemented it, so the last casualty left a working vessel nobody
 * could crew. These tests exist to stop that coming back, because it is the
 * kind of dead end nobody finds until they have already lost a crew.
 */
import { describe, expect, it } from 'vitest'
import {
  advanceTo,
  applyCommand,
  berths,
  createWorld,
  crewViews,
  dailyWagesCr,
  hiringHall,
  transferOptions,
  workOrderViews,
} from '../src/index.js'
import { isDerelict, towFeeCr } from '../src/recovery.js'
import { DAY, HOUR } from '../src/time.js'
import type { SimState } from '../src/types.js'

const START_UTC = Date.UTC(2026, 6, 25, 14, 30, 0)
const world = (seed = 7) => createWorld(seed, START_UTC)

/** Put everybody a few hours from the floor, in air that is killing them. */
function dying(s: SimState): SimState {
  const next = structuredClone(s)
  const scrubber = next.ship.parts.find((p) => p.id === 'life.scrubber.co2')!
  scrubber.broken = true
  scrubber.enabled = false
  // Straight to the lethal band rather than waiting three months for it.
  next.ship.resources.co2.value = next.ship.resources.co2.max
  for (const c of next.crew) {
    c.health.value = 1
    c.health.since = next.now
  }
  return applyCommand(next, {
    at: next.now + 1,
    command: { kind: 'SET_PART_ENABLED', partId: 'comms.array', enabled: false },
  })
}

/** Run until nobody is left alive, or give up. */
function untilDerelict(s: SimState): SimState {
  for (let i = 0; i < 24 * 30 && !isDerelict(s); i++) s = advanceTo(s, s.now + HOUR)
  return s
}

describe('the dead stop counting as crew', () => {
  it('gives up their berths, so the ship can be crewed again', () => {
    // This was the dead end: on a hull whose berths were full, replacing a lost
    // crew was blocked by the people who had died on it.
    const lost = untilDerelict(dying(world()))
    const b = berths(lost)
    expect(b.used).toBe(0)
    expect(b.free).toBe(b.total)
    expect(hiringHall(lost).some((c) => c.hireable)).toBe(true)
  })

  it('come off the payroll', () => {
    const before = dailyWagesCr(world())
    expect(before).toBeGreaterThan(0)
    expect(dailyWagesCr(untilDerelict(dying(world())))).toBe(0)
  })

  it('come off the roster rather than reporting for watch', () => {
    // They were still publishing "On watch" and "Asleep", and standing at their
    // stations in the ship view.
    expect(crewViews(world())).toHaveLength(4)
    expect(crewViews(untilDerelict(dying(world())))).toHaveLength(0)
  })

  it('release the jobs nobody is left to do', () => {
    const lost = untilDerelict(dying(world()))
    expect(workOrderViews(lost)).toHaveLength(0)
  })
})

describe('a derelict is recovered rather than stranded', () => {
  it('is towed in, berthed, and billed against the hull', () => {
    const lost = untilDerelict(dying(world()))
    expect(isDerelict(lost)).toBe(true)
    expect(lost.ship.docked).toBe(true)
    expect(lost.ship.recovered).toBe(true)

    const fee = towFeeCr(lost)
    expect(fee).toBe(Math.round(430_000 * 0.18))
    const bill = lost.ledger.find((e) => e.reason.startsWith('Recovery and tow'))
    expect(bill).toBeDefined()
    expect(bill!.credits).toBe(-fee)
  })

  it('leaves a desk that can still trade its way back (TR-21)', () => {
    // Ruinous, not a wall. The fee is meant to be the worst thing that happens
    // to a desk, and still a debt rather than the end of the campaign.
    const lost = untilDerelict(dying(world()))
    expect(towFeeCr(lost)).toBeGreaterThan(50_000)
    // Hiring is still possible, which is the thing that makes it recoverable.
    expect(hiringHall(lost).some((c) => c.hireable)).toBe(true)
  })

  it('says what happened, in the log, naming the ship and the port', () => {
    const lost = untilDerelict(dying(world()))
    const salvage = lost.log.find((e) => /under salvage/.test(e.text))
    expect(salvage).toBeDefined()
    expect(salvage!.level).toBe('alert')
    expect(salvage!.text).toContain('Ariadne')
  })

  it('fires once, however long the ship sits there', () => {
    let lost = untilDerelict(dying(world()))
    const billsAfterLoss = lost.ledger.filter((e) => e.reason.startsWith('Recovery and tow')).length
    lost = advanceTo(lost, lost.now + 30 * DAY)
    expect(lost.ledger.filter((e) => e.reason.startsWith('Recovery and tow'))).toHaveLength(
      billsAfterLoss,
    )
    expect(billsAfterLoss).toBe(1)
  })
})

describe('a derelict under way does not fly itself home', () => {
  /** Book and cast off on the Luna run, then lose the crew mid-crossing. */
  function underWayThenLost(): SimState {
    let s = world()
    s = applyCommand(s, {
      at: s.now,
      command: { kind: 'ACCEPT_CONTRACT', contractId: 'contract.luna.parts' },
    })
    const option = transferOptions(s).find((o) => o.feasible)!
    s = applyCommand(s, { at: s.now, command: { kind: 'DEPART', optionId: option.id } })
    expect(s.voyage).toBeDefined()
    return untilDerelict(dying(s))
  }

  it('ends the voyage instead of arriving with nobody aboard', () => {
    const lost = underWayThenLost()
    expect(lost.voyage).toBeUndefined()
    expect(lost.queue.some((e) => e.kind === 'ARRIVE')).toBe(false)
  })

  it('forfeits the contract rather than settling it as delivered', () => {
    // The cargo did not arrive. Letting ARRIVE fire would have berthed her and
    // reconciled the books as though the run had been completed (TR-19).
    const lost = underWayThenLost()
    expect(lost.contract).toBeUndefined()
    expect(lost.ship.cargoKg).toBe(0)
    expect(lost.log.some((e) => /contract is forfeit/i.test(e.text))).toBe(true)
    expect(lost.ledger.some((e) => /allowance|payment/i.test(e.reason))).toBe(false)
  })

  it('takes her to the port she was bound for', () => {
    const lost = underWayThenLost()
    expect(lost.ship.docked).toBe(true)
    expect(lost.ship.portId).toBe('port.tranquillity')
  })
})

describe('one signature releases her', () => {
  it('clears salvage as soon as somebody is aboard', () => {
    let lost = untilDerelict(dying(world()))
    expect(lost.ship.recovered).toBe(true)

    const candidate = hiringHall(lost).find((c) => c.hireable)!
    lost = applyCommand(lost, {
      at: lost.now,
      command: { kind: 'HIRE_CREW', crewId: candidate.id },
    })

    expect(lost.ship.recovered).toBe(false)
    expect(isDerelict(lost)).toBe(false)
    expect(crewViews(lost)).toHaveLength(1)
    expect(lost.log.some((e) => /released from salvage/.test(e.text))).toBe(true)
  })

  it('puts her back to work: the new hand can be given a job', () => {
    let lost = untilDerelict(dying(world()))
    const candidate = hiringHall(lost).find((c) => c.hireable)!
    lost = applyCommand(lost, {
      at: lost.now,
      command: { kind: 'HIRE_CREW', crewId: candidate.id },
    })
    lost = applyCommand(lost, {
      at: lost.now + HOUR,
      command: { kind: 'QUEUE_WORK_ORDER', partId: 'life.scrubber.co2', orderKind: 'repair' },
    })
    expect(workOrderViews(lost)).toHaveLength(1)
  })
})
