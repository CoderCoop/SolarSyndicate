/**
 * Contracts and the resupply allowance. Spec 002 TR-16, TR-20.
 *
 * The allowance is the point of this slice. A contract does not merely pay --
 * it states, before you accept it, what the Guild has budgeted for the run.
 * That turns "am I running efficiently" from a number on a gauge into a
 * question with a price on it, and it is what every later slice reconciles
 * against.
 *
 * TR-20 is the requirement most easily lost: the allowance has to be visible
 * *at the board*, next to the payment, because "can I do this inside the
 * budget" is a question asked when choosing, not discovered on arrival.
 */
import { describe, expect, it } from 'vitest'
import { content, getPort } from '@solsyn/data'
import {
  advanceTo,
  applyCommand,
  contractBoard,
  activeContract,
  createWorld,
  hohmannTransfer,
  ledgerView,
} from '../src/index.js'
import { DAY } from '../src/time.js'
import type { SimState } from '../src/types.js'

const T0 = Date.UTC(2200, 0, 1)
const world = () => createWorld(20260726, T0)

const accept = (s: SimState, id: string): SimState =>
  applyCommand(s, { at: s.now, command: { kind: 'ACCEPT_CONTRACT', contractId: id } })

const abandon = (s: SimState): SimState =>
  applyCommand(s, { at: s.now, command: { kind: 'ABANDON_CONTRACT' } })

describe('the board offers work from where the ship actually is', () => {
  it('only lists runs departing this port', () => {
    const s = world()
    const board = contractBoard(s)
    expect(board.length).toBeGreaterThan(0)
    for (const c of board) expect(c.fromPortId).toBe(s.ship.portId)
  })

  it('never offers a run to the port it departs from', () => {
    for (const c of content.contracts) expect(c.toPortId).not.toBe(c.fromPortId)
  })

  it('keeps contracts in data, not in code', () => {
    expect(content.contracts.length).toBeGreaterThan(2)
    for (const c of content.contracts) {
      expect(c.payCr).toBeGreaterThan(0)
      expect(c.cargoKg).toBeGreaterThanOrEqual(0)
      expect(c.deadlineDays).toBeGreaterThan(0)
    }
  })
})

describe('the allowance is stated before you accept', () => {
  it('appears on the board alongside the payment (TR-20)', () => {
    // The whole requirement: answerable when choosing, not on arrival.
    for (const c of contractBoard(world())) {
      expect(c.payCr).toBeGreaterThan(0)
      expect(c.allowance.water).toBeGreaterThan(0)
      expect(c.allowance.o2).toBeGreaterThan(0)
      expect(c.allowance.food).toBeGreaterThan(0)
      expect(c.allowance.propellant).toBeGreaterThan(0)
      expect(c.allowance.spares).toBeGreaterThanOrEqual(0)
    }
  })

  it('scales with how long the Guild thinks the run takes', () => {
    // A longer contract must budget more, or the allowance is arbitrary.
    const board = [...content.contracts].sort((a, b) => a.deadlineDays - b.deadlineDays)
    const short = board[0]!
    const long = board.at(-1)!
    expect(long.deadlineDays).toBeGreaterThan(short.deadlineDays)
    expect(long.allowance.water).toBeGreaterThan(short.allowance.water)
    expect(long.allowance.food).toBeGreaterThan(short.allowance.food)
  })

  it('budgets the crossing, not the deadline', () => {
    // The Guild budgets a competent run, not the worst case. Sizing to the
    // deadline let a fast ship bank a large food credit for flying quickly --
    // which rewards speed rather than efficiency, and swamped the signal the
    // whole mechanic exists to send.
    for (const c of content.contracts) {
      const deadlineCrewDays = 4 * c.deadlineDays
      expect(c.allowance.food).toBeLessThan(1.8 * deadlineCrewDays)
    }
  })

  it('sets a deadline the physics can actually meet', () => {
    // The invariant that would have caught a 96-day deadline on a crossing
    // that takes 259: a contract nobody can deliver is a trap, and TR-3b
    // forbids offering one.
    for (const c of content.contracts) {
      const from = getPort(c.fromPortId)
      const to = getPort(c.toPortId)
      if (from.bodyId === to.bodyId) continue
      const crossing = hohmannTransfer(from.bodyId, to.bodyId).durationS / DAY
      expect(c.deadlineDays).toBeGreaterThan(crossing)
    }
  })

  it('still budgets enough to live on', () => {
    // Sanity against the metabolic anchors (§3.2): 1.8 kg of food per crew per
    // day. A token allowance would make the mechanic theatre in the other
    // direction, so every run must cover at least a short crossing.
    for (const c of content.contracts) {
      expect(c.allowance.food).toBeGreaterThan(1.8 * 4 * 4)
      expect(c.allowance.water).toBeGreaterThan(0)
      expect(c.allowance.propellant).toBeGreaterThan(1_000)
    }
  })
})

describe('accepting takes the cargo aboard', () => {
  it('makes exactly one contract active', () => {
    const s = world()
    const first = contractBoard(s)[0]!
    expect(activeContract(s)).toBeUndefined()

    const taken = accept(s, first.id)
    expect(activeContract(taken)?.id).toBe(first.id)
  })

  it('adds the cargo to the ship, which is mass', () => {
    // §5.2: mass is delta-v. Cargo is never free (TR-10).
    const s = world()
    const first = contractBoard(s).find((c) => c.cargoKg > 0)!
    const taken = accept(s, first.id)
    expect(taken.ship.cargoKg).toBe(first.cargoKg)
  })

  it('refuses a second contract while one is running', () => {
    const s = world()
    const board = contractBoard(s)
    let taken = accept(s, board[0]!.id)
    taken = accept(taken, board[1]!.id)
    expect(activeContract(taken)?.id).toBe(board[0]!.id)
  })

  it('takes the board off the table once a run is under way', () => {
    const s = accept(world(), contractBoard(world())[0]!.id)
    expect(contractBoard(s)).toHaveLength(0)
  })

  it('sets a deadline in game time, not in days-from-nothing', () => {
    const s = world()
    const first = contractBoard(s)[0]!
    const taken = accept(advanceTo(s, 3 * DAY), first.id)
    const active = activeContract(taken)!
    expect(active.dueAt).toBeCloseTo(3 * DAY + first.deadlineDays * DAY, 6)
  })

  it('writes the acceptance into the log', () => {
    const s = accept(world(), contractBoard(world())[0]!.id)
    expect(s.log.some((l) => l.text.includes('Contract accepted'))).toBe(true)
  })
})

describe('abandoning costs money, not the ship', () => {
  it('puts the cargo back and clears the contract', () => {
    let s = accept(world(), contractBoard(world()).find((c) => c.cargoKg > 0)!.id)
    expect(s.ship.cargoKg).toBeGreaterThan(0)

    s = abandon(s)
    expect(activeContract(s)).toBeUndefined()
    expect(s.ship.cargoKg).toBe(0)
  })

  it('charges a penalty rather than refusing', () => {
    // TR-21's shape again: consequences are financial, never a wall.
    const taken = accept(world(), contractBoard(world())[0]!.id)
    const before = ledgerView(taken).credits
    const dropped = abandon(taken)
    expect(ledgerView(dropped).credits).toBeLessThan(before)
    expect(ledgerView(dropped).entries[0]!.reason).toMatch(/abandon/i)
  })

  it('puts the board back afterwards', () => {
    const s = abandon(accept(world(), contractBoard(world())[0]!.id))
    expect(contractBoard(s).length).toBeGreaterThan(0)
  })
})

describe('an accepted contract survives time passing', () => {
  it('is still there, with its deadline, after a long catch-up', () => {
    const first = contractBoard(world())[0]!
    let s = accept(world(), first.id)
    const due = activeContract(s)!.dueAt

    s = advanceTo(s, 20 * DAY)
    expect(activeContract(s)?.id).toBe(first.id)
    expect(activeContract(s)!.dueAt).toBe(due)
  })

  it('reports how long is left, and says so when it is late', () => {
    const first = contractBoard(world()).sort((a, b) => a.deadlineDays - b.deadlineDays)[0]!
    let s = accept(world(), first.id)
    expect(activeContract(s)!.daysRemaining).toBeCloseTo(first.deadlineDays, 6)

    s = advanceTo(s, (first.deadlineDays + 5) * DAY)
    expect(activeContract(s)!.daysRemaining).toBeLessThan(0)
    expect(activeContract(s)!.late).toBe(true)
  })
})
