/**
 * Casting off. Spec 002 TR-1 to TR-5, TR-10.
 *
 * The astrogator computes; the representative chooses. TR-3b is the rule that
 * shapes everything here: **no fake choices**. Every option on the table is a
 * real trajectory with a real price, and an option the ship cannot actually
 * fly is marked as such rather than offered and then refused.
 *
 * This is also where mass stops being a number and starts being a bill: cargo
 * rides in the wet mass of the rocket equation, so a full hold costs
 * propellant on every burn (TR-10).
 */
import { describe, expect, it } from 'vitest'
import {
  activeContract,
  advanceTo,
  applyCommand,
  createWorld,
  hohmannTransfer,
  propellantForDeltaV,
  stretchedTransfer,
  transferOptions,
  voyageView,
} from '../src/index.js'
import { getPort } from '@solsyn/data'
import { DAY } from '../src/time.js'
import type { SimState } from '../src/types.js'

const T0 = Date.UTC(2200, 0, 1)
const world = () => createWorld(20260726, T0)

/** Take the short Luna run, which any starting ship can afford. */
function booked(): SimState {
  const s = world()
  return applyCommand(s, {
    at: s.now,
    command: { kind: 'ACCEPT_CONTRACT', contractId: 'contract.luna.parts' },
  })
}

/** Take the long Mars run, which is where the trade-offs bite. */
function bookedFar(): SimState {
  const s = world()
  return applyCommand(s, {
    at: s.now,
    command: { kind: 'ACCEPT_CONTRACT', contractId: 'contract.phobos.survey' },
  })
}

const depart = (s: SimState, optionId: string): SimState =>
  applyCommand(s, { at: s.now, command: { kind: 'DEPART', optionId } })

describe('the stretched transfer is real mechanics', () => {
  it('reduces exactly to Hohmann at the minimum-energy ellipse', () => {
    const h = hohmannTransfer('earth', 'mars')
    const s = stretchedTransfer('earth', 'mars', 1)
    expect(s.deltaVMs).toBeCloseTo(h.deltaVMs, 6)
    // Kepler's equation goes through acos, which loses precision as the
    // eccentric anomaly approaches pi -- exactly the Hohmann case. A fifth of
    // a second in 259 days is the arithmetic, not the model.
    expect(Math.abs(s.durationS - h.durationS) / h.durationS).toBeLessThan(1e-7)
  })

  it('buys time with delta-v, steeply', () => {
    // The trade-off is meant to hurt: this is why waiting for a window is a
    // real option rather than a formality.
    const slow = stretchedTransfer('earth', 'mars', 1)
    const fast = stretchedTransfer('earth', 'mars', 1.15)
    expect(fast.durationS).toBeLessThan(slow.durationS * 0.7)
    expect(fast.deltaVMs).toBeGreaterThan(slow.deltaVMs * 1.8)
  })

  it('never goes below the minimum-energy cost', () => {
    for (const m of [0.5, 0.9, 1]) {
      expect(stretchedTransfer('earth', 'mars', m).deltaVMs).toBeGreaterThanOrEqual(
        hohmannTransfer('earth', 'mars').deltaVMs - 1e-6,
      )
    }
  })
})

describe('the astrogator lays out real options', () => {
  it('offers nothing until there is somewhere to go', () => {
    expect(transferOptions(world())).toHaveLength(0)
  })

  it('offers several once a contract is held', () => {
    const options = transferOptions(bookedFar())
    expect(options.length).toBeGreaterThan(1)
    for (const o of options) {
      expect(o.deltaVMs).toBeGreaterThan(0)
      expect(o.durationS).toBeGreaterThan(0)
      expect(o.propellantKg).toBeGreaterThan(0)
      expect(o.summary.length).toBeGreaterThan(0)
    }
  })

  it('makes every option a genuine trade, not a reskin', () => {
    // TR-3b. If two options cost the same and take the same time, one of them
    // is decoration.
    const options = transferOptions(bookedFar())
    const fingerprints = new Set(
      options.map((o) => `${Math.round(o.deltaVMs)}:${Math.round(o.durationS / DAY)}`),
    )
    expect(fingerprints.size).toBe(options.length)
  })

  it('orders them cheapest first, and cheapest is slowest', () => {
    const options = [...transferOptions(bookedFar())].sort((a, b) => a.deltaVMs - b.deltaVMs)
    expect(options[0]!.durationS).toBeGreaterThan(options.at(-1)!.durationS)
  })

  it('marks what the ship cannot actually fly rather than hiding it', () => {
    // TR-3b: a choice the ship cannot take is still information -- it tells the
    // player what a bigger ship would buy. The Kestrel is a 41 t hull with a
    // 32 t tank and 91 days of food -- a cislunar ship. Mars is 259 days away
    // and wants 47 t of propellant, so it fails on stores and mass ratio both,
    // and the board says so rather than pretending (§5.2).
    const options = transferOptions(bookedFar())
    expect(options.every((o) => !o.feasible)).toBe(true)
    for (const o of options) {
      expect(o.why).toMatch(/more than the tank can spare/)
    }
  })

  it('leaves the inner-system run flyable, so there is always a job', () => {
    expect(transferOptions(booked()).some((o) => o.feasible)).toBe(true)
  })

  it('charges for cargo, because mass is delta-v (TR-10)', () => {
    const empty = transferOptions(booked())[0]!
    const laden = { ...booked() }
    laden.ship = { ...laden.ship, cargoKg: laden.ship.cargoKg + 8_000 }
    const heavier = transferOptions(laden)[0]!

    expect(heavier.propellantKg).toBeGreaterThan(empty.propellantKg)
    // Same trajectory, same delta-v -- only the mass it has to move changed.
    expect(heavier.deltaVMs).toBeCloseTo(empty.deltaVMs, 6)
  })

  it('adds the cost of climbing out of the port it is leaving', () => {
    // Gateway is 3,200 m/s up and Phobos 830, on top of the transfer itself.
    const fromEarth = transferOptions(bookedFar())[0]!
    expect(fromEarth.deltaVMs).toBeGreaterThan(hohmannTransfer('earth', 'mars').deltaVMs)
  })

  it('does not charge two escapes for one gravity well', () => {
    // Gateway and Tranquillity both orbit Earth. A ship moving between two
    // orbits inside one well never escapes it, so charging both escapes
    // (5.07 km/s) priced the opening contract out of the game entirely.
    const from = getPort('port.gateway')
    const to = getPort('port.tranquillity')
    const hop = transferOptions(booked())[0]!
    expect(hop.deltaVMs).toBeLessThan(from.escapeDeltaVMs + to.escapeDeltaVMs)
  })
})

describe('departing casts off', () => {
  it('undocks the ship and stops the free resupply', () => {
    const s = depart(booked(), transferOptions(booked()).find((o) => o.feasible)!.id)
    expect(s.ship.docked).toBe(false)
    expect(voyageView(s)).toBeDefined()
  })

  it('spends the propellant the option quoted', () => {
    const ready = booked()
    const option = transferOptions(ready).find((o) => o.feasible)!
    const before = ready.ship.resources.propellant.value

    const s = depart(ready, option.id)
    const after = s.ship.resources.propellant.value
    expect(before - after).toBeCloseTo(option.propellantKg, 3)
  })

  it('refuses nothing it offered: a feasible option always flies', () => {
    const ready = booked()
    for (const option of transferOptions(ready).filter((o) => o.feasible)) {
      const s = depart(ready, option.id)
      expect(s.ship.docked).toBe(false)
      expect(voyageView(s)!.optionId).toBe(option.id)
    }
  })

  it('will not fly an option it marked infeasible', () => {
    // Having said the ship cannot do it, offering to do it anyway would make
    // the marking a lie.
    const ready = bookedFar()
    const s = depart(ready, transferOptions(ready)[0]!.id)
    expect(s.ship.docked).toBe(true)
  })

  it('will not depart without a contract', () => {
    const s = depart(world(), 'anything')
    expect(s.ship.docked).toBe(true)
  })

  it('arrives on its own, at the time it said', () => {
    const ready = booked()
    const option = transferOptions(ready).find((o) => o.feasible)!
    let s = depart(ready, option.id)
    const eta = voyageView(s)!.arrivesAt

    s = advanceTo(s, eta - DAY)
    expect(s.ship.docked).toBe(false)

    s = advanceTo(s, eta + DAY)
    expect(s.ship.docked).toBe(true)
    expect(s.ship.portId).toBe('port.tranquillity')
    expect(voyageView(s)).toBeUndefined()
  })

  it('keeps the contract through the crossing', () => {
    const ready = booked()
    const option = transferOptions(ready).find((o) => o.feasible)!
    let s = depart(ready, option.id)
    s = advanceTo(s, voyageView(s)!.arrivesAt / 2)
    expect(activeContract(s)?.id).toBe('contract.luna.parts')
  })

  it('is bit-identical whether crossed in one jump or a hundred', () => {
    // The crossing must not be a special code path (constitution VI).
    const ready = booked()
    const option = transferOptions(ready).find((o) => o.feasible)!
    const start = depart(ready, option.id)
    const target = voyageView(start)!.arrivesAt + 2 * DAY

    const jumped = advanceTo(start, target)
    let stepped = start
    for (let i = 1; i <= 100; i++) stepped = advanceTo(stepped, (target * i) / 100)

    expect(stepped.ship.portId).toBe(jumped.ship.portId)
    expect(stepped.ship.resources.water.value).toBeCloseTo(jumped.ship.resources.water.value, 6)
    expect(stepped.now).toBe(jumped.now)
  })
})

describe('the short run is flyable by the ship you are given', () => {
  it('offers the Luna job to a starting hull', () => {
    // Both ports orbit Earth, so this is a well-to-well hop rather than a
    // heliocentric transfer -- and the opening contract has to be takeable.
    const options = transferOptions(booked())
    expect(options.length).toBeGreaterThan(0)
    expect(options.some((o) => o.feasible)).toBe(true)
  })

  it('gets there and back into dock', () => {
    const ready = booked()
    const option = transferOptions(ready).find((o) => o.feasible)!
    let s = depart(ready, option.id)
    s = advanceTo(s, voyageView(s)!.arrivesAt + DAY)
    expect(s.ship.portId).toBe('port.tranquillity')
    expect(s.ship.docked).toBe(true)
  })

  it('costs what the rocket equation says', () => {
    const ready = booked()
    const option = transferOptions(ready).find((o) => o.feasible)!
    const wet =
      41_000 +
      ready.ship.cargoKg +
      ready.ship.resources.propellant.value +
      ready.ship.resources.water.value +
      ready.ship.resources.food.value +
      ready.ship.resources.o2.value
    // Isp 1200 for the NTR cluster. Within a few percent of the hand figure.
    const expected = propellantForDeltaV(wet, option.deltaVMs, 1200)
    expect(option.propellantKg).toBeGreaterThan(expected * 0.9)
    expect(option.propellantKg).toBeLessThan(expected * 1.1)
  })
})

describe('the Luna hop is priced by the same maths as everything else', () => {
  const MU_EARTH = 3.986004418e14

  const honestHohmann = () => {
    const r1 = getPort('port.gateway').orbitRadiusKm * 1000
    const r2 = getPort('port.tranquillity').orbitRadiusKm * 1000
    const a = (r1 + r2) / 2
    return {
      days: (Math.PI * Math.sqrt(a ** 3 / MU_EARTH)) / DAY,
      deltaVMs:
        Math.sqrt(MU_EARTH * (2 / r1 - 1 / a)) -
        Math.sqrt(MU_EARTH / r1) +
        (Math.sqrt(MU_EARTH / r2) - Math.sqrt(MU_EARTH * (2 / r2 - 1 / a))),
    }
  }

  it('takes as long as the transfer between those two orbits really takes', () => {
    // "Why does it take five days between two stations both orbiting Earth?"
    // Because one is 400 km up and the other is in lunar orbit, 384,400 km
    // out. Sharing a parent body does not make two ports neighbours.
    const s = applyCommand(createWorld(20260726, T0), {
      at: 0,
      command: { kind: 'ACCEPT_CONTRACT', contractId: 'contract.luna.parts' },
    })
    const economy = transferOptions(s).find((o) => o.id === 'economy')!
    expect(economy.durationS / DAY).toBeCloseTo(honestHohmann().days, 2)
    expect(honestHohmann().days).toBeCloseTo(4.98, 1)
  })

  it('costs what that transfer really costs -- no discount', () => {
    // This used to be charged at 1.59 km/s against a true 3.91, because the
    // tank could not afford the truth. The tank was resized instead; if this
    // ever diverges again, something has been bent to fit the ship rather
    // than the ship built to fit the physics (§5.2).
    const s = applyCommand(createWorld(20260726, T0), {
      at: 0,
      command: { kind: 'ACCEPT_CONTRACT', contractId: 'contract.luna.parts' },
    })
    const economy = transferOptions(s).find((o) => o.id === 'economy')!
    expect(economy.deltaVMs).toBeCloseTo(honestHohmann().deltaVMs, 6)
    expect(economy.deltaVMs).toBeGreaterThan(3_800)
  })

  it('leaves the ship able to fly its own opening contract', () => {
    // The invariant that the honest price has to be checked against: a desk
    // that cannot take the job it is handed is not a starting position.
    const s = applyCommand(createWorld(20260726, T0), {
      at: 0,
      command: { kind: 'ACCEPT_CONTRACT', contractId: 'contract.luna.parts' },
    })
    expect(transferOptions(s).filter((o) => o.feasible).length).toBeGreaterThan(0)
  })
})
