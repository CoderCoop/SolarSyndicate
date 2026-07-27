/**
 * What the crossing is actually like, moment to moment. Design §3.4, §5.2.
 *
 * These exist to keep one claim honest. A nuclear-thermal ship does not
 * accelerate for half the distance and decelerate for the other half -- that
 * is the fusion-torch tier, and it is a long way off (§3.4). She burns hard at
 * each end and falls the whole way between, and the readout has to say so
 * rather than invent a thrust figure to fill the silence.
 */
import { describe, expect, it } from 'vitest'
import { applyCommand, createWorld } from '../src/engine.js'
import { contractBoard } from '../src/contracts.js'
import { transferOptions, voyageView } from '../src/voyage.js'
import { DAY, HOUR } from '../src/time.js'
import type { SimState } from '../src/types.js'

const START = Date.UTC(2026, 6, 26, 9, 0, 0)

/** A world with the ship under way on the cheapest run on the board. */
function underWay(): SimState {
  let state = createWorld(4242, START)
  const contract = contractBoard(state)[0]
  if (!contract) throw new Error('no contract on the board')
  state = applyCommand(state, {
    at: state.now,
    command: { kind: 'ACCEPT_CONTRACT', contractId: contract.id },
  })
  const option = transferOptions(state).find((o) => o.feasible)
  if (!option) throw new Error('nothing flyable')
  return applyCommand(state, { at: state.now, command: { kind: 'DEPART', optionId: option.id } })
}

describe('what the ship is doing under way', () => {
  it('burns at each end and coasts between', () => {
    const state = underWay()
    const v = voyageView(state)!

    expect(v.phase).toBe('departure')
    expect(v.thrustKn).toBeGreaterThan(0)

    const mid = { ...state, now: (state.voyage!.departedAt + state.voyage!.arrivesAt) / 2 }
    const middle = voyageView(mid)!
    expect(middle.phase).toBe('coast')
    // The headline fact: no thrust, and therefore no weight, for the bulk of
    // the crossing. Free fall is not a rounding error, it is the trip.
    expect(middle.thrustKn).toBe(0)
    expect(middle.gees).toBe(0)

    const end = { ...state, now: state.voyage!.arrivesAt - 60 }
    expect(voyageView(end)!.phase).toBe('arrival')
  })

  it('burns for minutes, not for months', () => {
    const v = voyageView(underWay())!
    for (const burn of v.burns) {
      expect(burn.durationS).toBeGreaterThan(60)
      expect(burn.durationS).toBeLessThan(2 * HOUR)
    }
  })

  it('pulls the g a nuclear-thermal ship pulls (§3.4: 0.05–0.3)', () => {
    const v = voyageView(underWay())!
    for (const burn of v.burns) {
      expect(burn.gees).toBeGreaterThan(0.05)
      expect(burn.gees).toBeLessThan(0.3)
    }
  })

  it('the two burns add up to what the ship was charged for', () => {
    const state = underWay()
    const v = voyageView(state)!
    const summed = v.burns.reduce((t, b) => t + b.deltaVMs, 0)
    // Cislunar, so there is no well to escape and the transfer is the whole
    // cost. Tangential at both ends, so the split is exact.
    expect(summed).toBeCloseTo(state.voyage!.deltaVMs, -1)
  })

  it('moves at orbital speeds, and slows down going outward', () => {
    const state = underWay()
    const early = voyageView(state)!
    const late = voyageView({ ...state, now: state.voyage!.arrivesAt - HOUR })!

    // Leaving low Earth orbit: a few km/s, not a few hundred m/s.
    expect(early.speedMs).toBeGreaterThan(3000)
    expect(early.speedMs).toBeLessThan(15000)
    // Climbing out to lunar distance costs speed. It always does.
    expect(late.speedMs).toBeLessThan(early.speedMs)
  })

  it('is a pure function of time, like everything else in the sim', () => {
    const state = underWay()
    const at = state.voyage!.departedAt + 2 * DAY
    const a = voyageView({ ...state, now: at })!
    const b = voyageView({ ...state, now: at })!
    expect(a.speedMs).toBe(b.speedMs)
  })
})
