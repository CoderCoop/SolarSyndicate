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
  createWorld,
  ledgerView,
  lastSettlement,
  transferOptions,
} from '../src/index.js'
import { DAY } from '../src/time.js'
import type { SimState } from '../src/types.js'

const T0 = Date.UTC(2200, 0, 1)
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
    const delta = water.allowedKg - water.usedKg
    expect(water.creditsCr).toBeCloseTo(delta * priceAt('port.tranquillity', 'water'), 6)
    expect(settlement.portId).toBe('port.tranquillity')
  })

  it('tops the tanks back up once the books are closed', () => {
    const s = fly()
    const r = s.ship.resources
    expect(r.water.value).toBeGreaterThan(r.water.max * 0.95)
    expect(r.food.value).toBeGreaterThan(r.food.max * 0.95)
    expect(r.o2.value).toBeGreaterThan(r.o2.max * 0.95)
  })
})

describe('the allowance is what makes efficiency worth money', () => {
  it('credits an underrun and bills an overrun, at the stated price', () => {
    const settlement = lastSettlement(fly())!
    for (const line of settlement.lines) {
      const delta = line.allowedKg - line.usedKg
      expect(Math.sign(line.creditsCr)).toBe(Math.sign(delta) || 0)
    }
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
    expect(waterOf(neglected).creditsCr).toBeLessThan(waterOf(tended).creditsCr)
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

describe('being late costs money, never the ship', () => {
  it('pays in full when it arrives on time', () => {
    const settlement = lastSettlement(fly())!
    expect(settlement.late).toBe(false)
    expect(settlement.payCr).toBe(74_000)
  })

  it('pays less when it arrives late, and says so', () => {
    // Accept, then sit in dock past the deadline before flying.
    let s = world()
    s = applyCommand(s, {
      at: s.now,
      command: { kind: 'ACCEPT_CONTRACT', contractId: 'contract.luna.parts' },
    })
    s = advanceTo(s, 14 * DAY)
    const option = transferOptions(s).filter((o) => o.feasible).sort((a, b) => a.deltaVMs - b.deltaVMs)[0]!
    s = applyCommand(s, { at: s.now, command: { kind: 'DEPART', optionId: option.id } })
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
