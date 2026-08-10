/**
 * Arrival, and settling the books. Spec 002 TR-17 to TR-21.
 *
 * This is the slice the whole milestone was built toward. Loop closure, tune,
 * attendance and upgrade tiers have been moving numbers since M1 that nothing
 * counted; the allowance counts them. A tended ship arrives under budget and
 * banks the difference. A neglected one arrives over and pays for it.
 *
 * The test that matters most in this file is `a tended ship arrives under and a
 * neglected one over` -- if that ever stops being true, every efficiency
 * mechanic in the game has quietly become decoration.
 */
import { describe, expect, it } from 'vitest'
import { priceAt } from '@solsyn/data'
import {
  activeContract,
  advanceTo,
  applyCommand,
  contractBoard,
  createWorld,
  ledgerView,
  lastSettlement,
  transferOptions,
} from '../src/index.js'
import { DAY } from '../src/time.js'
import type { SimState } from '../src/types.js'

const T0 = Date.UTC(2200, 0, 1)

/** What the starting hull carries when a world opens, per `createWorld`. */
const STARTING_LEVELS = (() => {
  const s = createWorld(20260726, T0)
  return {
    water: s.ship.resources.water.value,
    food: s.ship.resources.food.value,
    o2: s.ship.resources.o2.value,
    propellant: s.ship.resources.propellant.value,
  }
})()
const world = () => createWorld(20260726, T0)

/** Book the Luna run and fly it on the cheapest flyable trajectory. */
function fly(from: SimState = world(), optionPick: 'cheapest' | 'fastest' = 'cheapest'): SimState {
  let s = applyCommand(from, {
    at: from.now,
    command: { kind: 'ACCEPT_CONTRACT', contractId: 'contract.luna.parts' },
  })
  const flyable = transferOptions(s).filter((o) => o.feasible)
  const option =
    optionPick === 'cheapest'
      ? flyable.sort((a, b) => a.deltaVMs - b.deltaVMs)[0]!
      : flyable.sort((a, b) => a.durationS - b.durationS)[0]!
  s = applyCommand(s, { at: s.now, command: { kind: 'DEPART', optionId: option.id } })
  return advanceTo(s, s.voyage!.arrivesAt + 60)
}

describe('arriving settles the books', () => {
  it('berths the ship and clears the run', () => {
    const s = fly()
    expect(s.ship.docked).toBe(true)
    expect(s.ship.portId).toBe('port.tranquillity')
    expect(activeContract(s)).toBeUndefined()
    expect(s.ship.cargoKg).toBe(0)
  })

  it('pays the contract', () => {
    const before = ledgerView(world()).credits
    const after = ledgerView(fly()).credits
    expect(after).toBeGreaterThan(before)
    expect(ledgerView(fly()).entries.some((e) => /delivered/i.test(e.reason))).toBe(true)
  })

  it('produces a settlement the player can read line by line', () => {
    // A number with no working shown is not an explanation (§1 pillar 1).
    const settlement = lastSettlement(fly())!
    expect(settlement.contractId).toBe('contract.luna.parts')
    expect(settlement.payCr).toBeGreaterThan(0)
    expect(settlement.lines.length).toBeGreaterThan(0)
    for (const line of settlement.lines) {
      expect(line.key).toBeTruthy()
      expect(Number.isFinite(line.usedKg)).toBe(true)
      expect(Number.isFinite(line.allowedKg)).toBe(true)
      expect(Number.isFinite(line.creditsCr)).toBe(true)
    }
  })

  it('prices the reconciliation at the arrival port, not the departure one', () => {
    // TR-19. Water is 2.40 at Tranquillity against 3.10 at Gateway; settling
    // at the wrong end would quietly overcharge every inbound run.
    const settlement = lastSettlement(fly())!
    const water = settlement.lines.find((l) => l.key === 'water')!
    // The whole allowance is reimbursed; what the crossing actually spent is
    // bought back at the pump, so netting it here would charge for it twice.
    expect(water.creditsCr).toBeCloseTo(water.allowedKg * priceAt('port.tranquillity', 'water'), 6)
    expect(settlement.portId).toBe('port.tranquillity')
  })

  it('puts the tanks back where they started, not to the brim', () => {
    // A resupply allowance restores the ship to the state she set out in; it
    // does not buy her a fuller tank than she had. Filling to capacity meant
    // every delivery quietly bought a quarter of a propellant tank the Guild
    // had never budgeted for -- 34,000 credits on a job paying 74,000.
    const s = fly()
    const r = s.ship.resources
    expect(r.propellant.value).toBeCloseTo(STARTING_LEVELS.propellant, 0)
    expect(r.propellant.value).toBeLessThan(r.propellant.max * 0.8)
    expect(r.water.value).toBeLessThan(r.water.max * 0.95)
  })
})

describe('the allowance is what makes efficiency worth money', () => {
  it('reimburses the budget and charges for the stores, separately', () => {
    // Money in at the desk, money out at the pump. Two events rather than one
    // netted figure, so the gap between them is visible -- and that gap is the
    // whole mechanic.
    const settlement = lastSettlement(fly())!
    for (const line of settlement.lines) {
      expect(line.creditsCr).toBeCloseTo(line.allowedKg * line.unitCr, 6)
    }
    expect(settlement.allowanceCr).toBeGreaterThan(0)
    expect(settlement.storesCr).toBeLessThan(0)
    expect(settlement.totalCr).toBeCloseTo(
      settlement.payCr + settlement.allowanceCr + settlement.storesCr,
      6,
    )
  })

  it('leaves the ordinary run worth what it always was', () => {
    // Buy back what the crossing spent, at the port you arrived at, and the
    // arithmetic is unchanged: allowed x price in, used x price out. Charging
    // at the pump is a change to what the player can *see* and decide, not to
    // what a straightforward delivery pays.
    const settlement = lastSettlement(fly())!
    const netted = settlement.lines.reduce(
      (sum, l) => sum + (l.allowedKg - l.usedKg) * l.unitCr,
      0,
    )
    // Within the difference between what was consumed and what it took to
    // refill -- the tanks did not start the run completely full.
    expect(settlement.allowanceCr + settlement.storesCr).toBeLessThan(netted + 1)
  })

  it('a tended ship arrives under and a neglected one over', () => {
    // THE test. Sandoval holds ECLSS and stations in Life Support, so her
    // watch keeps the recycler in tune; a ship whose loop has been left to
    // drift draws far more water for the same crossing.
    const tended = fly()

    // Same run, same trajectory -- but the recycler badly out of adjustment
    // and nobody qualified on watch to bring it back.
    let neglectedStart = structuredClone(world())
    const recycler = neglectedStart.ship.parts.find((p) => p.id === 'life.water.recycler')!
    recycler.tune.value = 0
    recycler.tune.rate = 0
    for (const c of neglectedStart.crew) {
      if (c.id === 'crew.sandoval') c.watch = 'A'
    }
    neglectedStart = advanceTo(neglectedStart, 0)
    const neglected = fly(neglectedStart)

    const waterOf = (s: SimState) => lastSettlement(s)!.lines.find((l) => l.key === 'water')!
    expect(waterOf(neglected).usedKg).toBeGreaterThan(waterOf(tended).usedKg)
    // The incentive now lives in the bottom line rather than in one netted
    // figure: both ships are reimbursed the same budget, and the neglected one
    // spends more of it buying the water back.
    expect(lastSettlement(neglected)!.storesCr).toBeLessThan(
      lastSettlement(tended)!.storesCr,
    )
    expect(lastSettlement(neglected)!.totalCr).toBeLessThan(lastSettlement(tended)!.totalCr)
  })

  it('makes the difference visible in the balance, not just in a gauge', () => {
    const tended = ledgerView(fly()).credits

    let neglectedStart = structuredClone(world())
    const recycler = neglectedStart.ship.parts.find((p) => p.id === 'life.water.recycler')!
    recycler.tune.value = 0
    recycler.tune.rate = 0
    neglectedStart = advanceTo(neglectedStart, 0)
    const neglected = ledgerView(fly(neglectedStart)).credits

    expect(tended).toBeGreaterThan(neglected)
  })
})

describe('the ship can get home again', () => {
  it('finds work on the board at the far end', () => {
    // The dead end this exists to prevent: the only crossing the Kestrel can
    // fly used to end at a port with nothing on offer, which strands the ship
    // commercially even though it is berthed and fuelled.
    const board = contractBoard(fly())
    expect(board.length).toBeGreaterThan(0)
    for (const c of board) expect(c.fromPortId).toBe('port.tranquillity')
  })

  it('flies the return leg and settles it at the home port', () => {
    let s = fly()
    s = applyCommand(s, {
      at: s.now,
      command: { kind: 'ACCEPT_CONTRACT', contractId: 'contract.gateway.castings' },
    })
    const option = transferOptions(s)
      .filter((o) => o.feasible)
      .sort((a, b) => a.deltaVMs - b.deltaVMs)[0]!
    s = applyCommand(s, { at: s.now, command: { kind: 'DEPART', optionId: option.id } })
    s = advanceTo(s, s.voyage!.arrivesAt + 60)

    expect(s.ship.portId).toBe('port.gateway')
    const settlement = lastSettlement(s)!
    expect(settlement.contractId).toBe('contract.gateway.castings')
    // Settled at Gateway's prices, not the ones it departed under.
    const water = settlement.lines.find((l) => l.key === 'water')!
    expect(water.unitCr).toBeCloseTo(priceAt('port.gateway', 'water'), 6)
  })

  it('leaves the round trip in profit, run competently', () => {
    // Both legs together must clear the opening balance, or the Earth-system
    // loop is a treadmill rather than a living.
    let s = fly()
    s = applyCommand(s, {
      at: s.now,
      command: { kind: 'ACCEPT_CONTRACT', contractId: 'contract.gateway.castings' },
    })
    const option = transferOptions(s)
      .filter((o) => o.feasible)
      .sort((a, b) => a.deltaVMs - b.deltaVMs)[0]!
    s = applyCommand(s, { at: s.now, command: { kind: 'DEPART', optionId: option.id } })
    s = advanceTo(s, s.voyage!.arrivesAt + 60)

    expect(ledgerView(s).credits).toBeGreaterThan(ledgerView(world()).credits)
  })
})

describe('being late costs money, never the ship', () => {
  it('pays in full when it arrives on time', () => {
    const settlement = lastSettlement(fly())!
    expect(settlement.late).toBe(false)
    expect(settlement.payCr).toBe(74_000)
  })

  it('pays less when it arrives late, and says so', () => {
    // Sitting in dock no longer makes a run late: the deadline runs from launch,
    // because a contract taken against a window months out is a booking rather
    // than a delivery already ticking. What is late is a *crossing* that
    // overruns, so that is what this builds -- the deadline pulled in behind
    // the arrival she is already flying.
    let s = world()
    s = applyCommand(s, {
      at: s.now,
      command: { kind: 'ACCEPT_CONTRACT', contractId: 'contract.luna.parts' },
    })
    s = advanceTo(s, 14 * DAY)
    const option = transferOptions(s).filter((o) => o.feasible).sort((a, b) => a.deltaVMs - b.deltaVMs)[0]!
    s = applyCommand(s, { at: s.now, command: { kind: 'DEPART', optionId: option.id } })
    s.contract!.dueAt = s.voyage!.arrivesAt - DAY
    s = advanceTo(s, s.voyage!.arrivesAt + 60)

    const settlement = lastSettlement(s)!
    expect(settlement.late).toBe(true)
    expect(settlement.payCr).toBeLessThan(74_000)
    expect(settlement.payCr).toBeGreaterThan(0)
    expect(s.log.some((l) => /late/i.test(l.text))).toBe(true)
  })

  it('never strands the ship, however badly the run went (TR-21)', () => {
    // Overdraw the desk, overrun every allowance, arrive late -- and the ship
    // is still berthed, still crewed, and still able to take the next job.
    let s = world()
    s = applyCommand(s, { at: 0, command: { kind: 'SPEND', credits: 400_000, reason: 'A bad quarter' } })
    s = fly(s)

    expect(ledgerView(s).credits).toBeLessThan(0)
    expect(s.ship.docked).toBe(true)
    expect(s.crew).toHaveLength(4)
    // And the board is open again.
    expect(activeContract(s)).toBeUndefined()
  })
})
