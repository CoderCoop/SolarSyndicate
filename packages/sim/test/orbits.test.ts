/**
 * Orbits and transfers. Design doc §5.1, §5.2. Spec 002 TR-1, TR-2, TR-4.
 *
 * The numbers here are checkable against a textbook, which is the point: §1
 * pillar 2 says honest values, so a Hohmann transfer to Mars had better cost
 * what a Hohmann transfer to Mars costs.
 */
import { describe, expect, it } from 'vitest'
import { getBody, getPort } from '@solsyn/data'
import {
  bodyAngleAt,
  bodyPositionAt,
  distanceBetweenBodiesAt,
  hohmannTransfer,
  phaseAngleForTransfer,
  phasingWaitS,
  portAngleAt,
  portPeriodS,
  portSeparationAt,
  propellantForDeltaV,
  stretchedBetween,
  synodicPeriodDays,
  transferStateAt,
} from '../src/orbits.js'
import { DAY } from '../src/time.js'

const AU = 1.495978707e11

describe('bodies move', () => {
  it('places a body on its orbit at the epoch phase', () => {
    const p = bodyPositionAt('earth', 0)
    // Earth's phase at epoch is 0, so it sits on the +x axis at 1 AU.
    expect(p.x).toBeCloseTo(AU, 0)
    expect(p.y).toBeCloseTo(0, 0)
  })

  it('returns to the same place after one orbital period', () => {
    const before = bodyPositionAt('mars', 0)
    const after = bodyPositionAt('mars', 686.98 * DAY)
    expect(after.x).toBeCloseTo(before.x, 0)
    expect(after.y).toBeCloseTo(before.y, 0)
  })

  it('sweeps a full turn over a period, and half a turn over half of one', () => {
    const a0 = bodyAngleAt('earth', 0)
    const half = bodyAngleAt('earth', (365.256 / 2) * DAY)
    const delta = ((half - a0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI
    expect(Math.abs(delta)).toBeCloseTo(Math.PI, 3)
  })

  it('gives inner bodies shorter periods, so the gap between them changes', () => {
    // TR-1: distance between two ports depends on when you ask.
    const gaps = [0, 100, 200, 300, 400].map((d) =>
      distanceBetweenBodiesAt('earth', 'mars', d * DAY),
    )
    const min = Math.min(...gaps)
    const max = Math.max(...gaps)
    expect(max - min).toBeGreaterThan(0.5 * AU)
    // Never closer than the difference of radii, never further than their sum.
    expect(min).toBeGreaterThanOrEqual(0.52 * AU * 0.99)
    expect(max).toBeLessThanOrEqual(2.53 * AU * 1.01)
  })

  it('treats two ports on the same body as co-located', () => {
    // Gateway and Tranquillity are both Earth-adjacent at solar-system scale.
    expect(portSeparationAt('port.gateway', 'port.tranquillity', 0)).toBe(0)
  })
})

describe('hohmann transfers', () => {
  it('costs what the textbook says for Earth to Mars', () => {
    // Published figures: ~5.6 km/s, ~259 days.
    const t = hohmannTransfer('earth', 'mars')
    expect(t.deltaVMs).toBeGreaterThan(5500)
    expect(t.deltaVMs).toBeLessThan(5700)
    expect(t.durationS / DAY).toBeGreaterThan(255)
    expect(t.durationS / DAY).toBeLessThan(263)
  })

  it('costs more, and takes longer, to reach the Belt', () => {
    const mars = hohmannTransfer('earth', 'mars')
    const ceres = hohmannTransfer('earth', 'ceres')
    expect(ceres.deltaVMs).toBeGreaterThan(mars.deltaVMs * 1.8)
    expect(ceres.durationS).toBeGreaterThan(mars.durationS * 1.7)
  })

  it('is symmetric: falling inward costs what climbing outward does', () => {
    const out = hohmannTransfer('earth', 'mars')
    const back = hohmannTransfer('mars', 'earth')
    expect(back.deltaVMs).toBeCloseTo(out.deltaVMs, 6)
    expect(back.durationS).toBeCloseTo(out.durationS, 6)
  })

  it('has a departure phase angle, which is what makes windows exist', () => {
    // Earth->Mars wants Mars ~44 degrees ahead at departure.
    const phase = phaseAngleForTransfer('earth', 'mars')
    expect((phase * 180) / Math.PI).toBeGreaterThan(40)
    expect((phase * 180) / Math.PI).toBeLessThan(48)
  })

  it('repeats on the synodic period', () => {
    // Earth-Mars synodic period is ~780 days.
    expect(synodicPeriodDays('earth', 'mars')).toBeGreaterThan(770)
    expect(synodicPeriodDays('earth', 'mars')).toBeLessThan(790)
  })
})

describe('the rocket equation is honest', () => {
  it('spends propellant exponentially in delta-v', () => {
    // TR-2. 41 t dry, NTR at 1200 s Isp.
    const light = propellantForDeltaV(41000, 1000, 1200)
    const heavy = propellantForDeltaV(41000, 5000, 1200)
    expect(heavy).toBeGreaterThan(light * 4)
  })

  it('makes a better engine cheaper for the same manoeuvre', () => {
    // Note the saving is not proportional to the Isp gain: tripling exhaust
    // velocity roughly halves the propellant, because the mass ratio is
    // exponential. 30.3 t chemical against 14.2 t nuclear for the same 5 km/s.
    const chemical = propellantForDeltaV(41000, 5000, 380)
    const nuclear = propellantForDeltaV(41000, 5000, 1200)
    expect(nuclear).toBeLessThan(chemical / 2)
    expect(nuclear).toBeGreaterThan(chemical / 3)
  })

  it('makes a heavier ship cost more for the same manoeuvre', () => {
    // Cargo is not free: TR-10 depends on this.
    const empty = propellantForDeltaV(41000, 5000, 1200)
    const laden = propellantForDeltaV(61000, 5000, 1200)
    expect(laden).toBeGreaterThan(empty * 1.4)
  })

  it('matches a hand-computed mass ratio', () => {
    // dv = 5000, Isp = 1200 -> ve = 11772 m/s, ratio = e^(5000/11772) = 1.5305
    // propellant = m0 (1 - 1/ratio) = 41000 * 0.3466 = 14211 kg
    expect(propellantForDeltaV(41000, 5000, 1200)).toBeCloseTo(14211, -2)
  })
})

/**
 * Ports have positions, and a crossing between two of them has a window.
 *
 * A port used to be a radius and nothing else, so the chart drew departure at
 * zero and the destination opposite and said in a comment that the angles were
 * the drawing's own. Give the berths real bearings and the crossing stops being
 * available at any instant: the ellipse sweeps a fixed angle in a fixed time,
 * so the far end has to already be where it will finish.
 */
describe('a crossing between two berths waits for its geometry', () => {
  const PORTS = ['port.gateway', 'port.tranquillity'] as const

  it('lands the ship on the target rather than merely on its ring', () => {
    // The whole point, and the one thing that would be invisible on the plate
    // until you looked closely enough to see her sail past an empty orbit.
    for (const multiplier of [1, 1.15, 1.4]) {
      for (const [from, to] of [PORTS, [...PORTS].reverse() as unknown as typeof PORTS]) {
        const at = 12345
        const wait = phasingWaitS(from, to, at, multiplier)
        const mu = getBody(getPort(from).bodyId).muM3S2
        const leg = stretchedBetween(
          mu,
          getPort(from).orbitRadiusKm * 1000,
          getPort(to).orbitRadiusKm * 1000,
          multiplier,
        )
        const sweep = transferStateAt(leg, mu, leg.durationS).sweptRad
        const arrives = portAngleAt(from, at + wait) + sweep
        const target = portAngleAt(to, at + wait + leg.durationS)
        const miss = Math.atan2(Math.sin(arrives - target), Math.cos(arrives - target))
        expect(Math.abs(miss)).toBeLessThan(1e-9)
      }
    }
  })

  it('never waits longer than the two orbits take to come round', () => {
    // Which is why it is absorbed into the crossing instead of offered as a
    // decision. Gateway goes round in 92.6 minutes, so leaving for Luna is
    // never more than about an hour and a half away -- a window you can always
    // meet inside two hours is arithmetic, not gameplay.
    const bound = portPeriodS('port.gateway') * 1.02
    for (let hour = 0; hour < 48; hour++) {
      const wait = phasingWaitS('port.gateway', 'port.tranquillity', hour * 3600, 1)
      expect(wait).toBeGreaterThanOrEqual(0)
      expect(wait).toBeLessThan(bound)
    }
  })

  it('is not the same wait every time, or it would not be a window', () => {
    const waits = [0, 1, 2, 3, 4, 5].map((h) =>
      phasingWaitS('port.gateway', 'port.tranquillity', h * 3600, 1),
    )
    expect(Math.max(...waits) - Math.min(...waits)).toBeGreaterThan(1800)
  })

  it('leaves interplanetary crossings alone, where the window is the gameplay', () => {
    // Months, not minutes. Waiting one out inside a crossing would hide the
    // decision §5.1 says is the astrogator's job.
    expect(phasingWaitS('port.gateway', 'port.phobos', 0, 1)).toBe(0)
  })

  it('derives a port period from Kepler on its body, not from a stated number', () => {
    const mu = getBody('earth').muM3S2
    for (const id of PORTS) {
      const r = getPort(id).orbitRadiusKm * 1000
      expect(portPeriodS(id)).toBeCloseTo(2 * Math.PI * Math.sqrt(r ** 3 / mu), 6)
    }
  })
})
