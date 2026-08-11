/**
 * Orbits and transfers. Design doc §5.1, §5.2. Spec 002 TR-1, TR-2, TR-4.
 *
 * The numbers here are checkable against a textbook, which is the point: §1
 * pillar 2 says honest values, so a Hohmann transfer to Mars had better cost
 * what a Hohmann transfer to Mars costs.
 */
import { describe, expect, it } from 'vitest'
import { content, getBody, getPort } from '@solsyn/data'
import {
  MU_SUN,
  bodyAngleAt,
  bodyPeriodDays,
  bodyPeriodS,
  bodyPositionAt,
  bodyRadiusAt,
  bodyStateAt,
  orbitPathAu,
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
  it('places a body between its apsides, never on a fixed ring', () => {
    // `phaseAtEpochRad` is a mean longitude, so at epoch Earth is somewhere on
    // its ellipse rather than at a stated point on a circle. What is fixed is
    // the shape: the radius lives between perihelion and aphelion, always.
    const earth = getBody('earth')
    for (const d of [0, 40, 91, 200, 300]) {
      const p = bodyPositionAt('earth', d * DAY)
      const r = Math.hypot(p.x, p.y) / AU
      expect(r).toBeGreaterThanOrEqual(earth.semiMajorAxisAu * (1 - earth.eccentricity) - 1e-9)
      expect(r).toBeLessThanOrEqual(earth.semiMajorAxisAu * (1 + earth.eccentricity) + 1e-9)
    }
    // And it does vary: a circle would hold the same radius all year.
    const swing = [0, 91, 182, 273].map((d) => Math.hypot(...Object.values(bodyPositionAt('earth', d * DAY))))
    expect(Math.max(...swing) - Math.min(...swing)).toBeGreaterThan(0.02 * AU)
  })

  it('returns to the same place after one orbital period', () => {
    // The derived period, not a stated one. The data used to carry both, and
    // they disagreed by 12.5 ppm for Mars -- which is 8,290 km of Mars, and
    // enough to fail this test at metre precision.
    const before = bodyPositionAt('mars', 0)
    const after = bodyPositionAt('mars', bodyPeriodDays('mars') * DAY)
    expect(after.x).toBeCloseTo(before.x, 0)
    expect(after.y).toBeCloseTo(before.y, 0)
  })

  it('sweeps a full turn over a period, unevenly', () => {
    const period = bodyPeriodDays('earth') * DAY
    const a0 = bodyAngleAt('earth', 0)
    const full = bodyAngleAt('earth', period)
    expect(((full - a0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI).toBeCloseTo(0, 6)

    // Half a period is *not* half a turn, and that is the eccentricity showing:
    // the body runs fast at perihelion and slow at aphelion, so the true
    // longitude leads or lags the mean by up to twice the eccentricity.
    const half = bodyAngleAt('earth', period / 2)
    const delta = Math.abs(((half - a0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI)
    const equationOfCentre = 2 * getBody('earth').eccentricity
    expect(Math.abs(delta - Math.PI)).toBeGreaterThan(1e-6)
    expect(Math.abs(delta - Math.PI)).toBeLessThan(2 * equationOfCentre)
  })

  it('gives inner bodies shorter periods, so the gap between them changes', () => {
    // TR-1: distance between two ports depends on when you ask.
    const gaps = [0, 100, 200, 300, 400].map((d) =>
      distanceBetweenBodiesAt('earth', 'mars', d * DAY),
    )
    const min = Math.min(...gaps)
    const max = Math.max(...gaps)
    expect(max - min).toBeGreaterThan(0.5 * AU)

    // Bounded by the apsides rather than by two radii: at closest approach
    // Mars can be at perihelion and Earth at aphelion, which is 0.36 AU rather
    // than the 0.52 two circles allow -- the difference eccentricity makes to
    // the cheapest crossing there is.
    const reach = (id: string, sign: number) => {
      const b = getBody(id)
      return b.semiMajorAxisAu * (1 + sign * b.eccentricity)
    }
    expect(min).toBeGreaterThanOrEqual((reach('mars', -1) - reach('earth', +1)) * AU * 0.99)
    expect(max).toBeLessThanOrEqual((reach('mars', +1) + reach('earth', +1)) * AU * 1.01)
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

describe('the planets are on ellipses, and the numbers know it', () => {
  it('derives every body period from its axis, rather than stating a second one', () => {
    // The data used to carry both, and they disagreed: 12.5 ppm for Mars and
    // 923 ppm for Ceres. Small, and still two answers to where a planet is --
    // one setting the drawn position, the other the launch window.
    for (const b of content.bodies) {
      const a = b.semiMajorAxisAu * AU
      expect(bodyPeriodS(b.id)).toBeCloseTo(2 * Math.PI * Math.sqrt(a ** 3 / MU_SUN), 6)
    }
    // And they land on the observed years, which is the check that the axes
    // and the sun's µ are the real ones.
    expect(bodyPeriodDays('earth')).toBeCloseTo(365.256, 1)
    expect(bodyPeriodDays('mars')).toBeCloseTo(686.98, 0)
    expect(bodyPeriodDays('ceres')).toBeCloseTo(1681.6, -1)
  })

  it('swings each body between its apsides over its own year', () => {
    for (const b of content.bodies) {
      const period = bodyPeriodDays(b.id) * DAY
      const radii = Array.from({ length: 64 }, (_, i) => bodyRadiusAt(b.id, (period * i) / 64) / AU)
      const perihelion = b.semiMajorAxisAu * (1 - b.eccentricity)
      const aphelion = b.semiMajorAxisAu * (1 + b.eccentricity)
      expect(Math.min(...radii)).toBeCloseTo(perihelion, 3)
      expect(Math.max(...radii)).toBeCloseTo(aphelion, 3)
    }
    // Mars is the one it matters most for: a fifth further at aphelion than at
    // perihelion, which is most of the difference between a cheap crossing to
    // her and an expensive one.
    const mars = getBody('mars')
    expect(
      (mars.semiMajorAxisAu * (1 + mars.eccentricity)) /
        (mars.semiMajorAxisAu * (1 - mars.eccentricity)),
    ).toBeGreaterThan(1.2)
  })

  it('moves fastest at perihelion and slowest at aphelion', () => {
    // The second law, which is the thing an ellipse actually does. A circular
    // orbit at the mean radius holds one speed all year.
    const period = bodyPeriodDays('mars') * DAY
    const samples = Array.from({ length: 96 }, (_, i) => {
      const t = (period * i) / 96
      const { position, velocity } = bodyStateAt('mars', t)
      return { r: Math.hypot(position.x, position.y), v: Math.hypot(velocity.x, velocity.y) }
    })
    const nearest = samples.reduce((a, b) => (b.r < a.r ? b : a))
    const furthest = samples.reduce((a, b) => (b.r > a.r ? b : a))
    expect(nearest.v).toBeGreaterThan(furthest.v)
    // Conservation of angular momentum, to the sample: r·v is the same at both
    // apsides, where the velocity is purely transverse. Relative, because the
    // figure is 5.5e15 and the samples land near the apsides rather than on
    // them -- an absolute tolerance here is either meaningless or unmeetable.
    const h = (s: { r: number; v: number }) => s.r * s.v
    expect(Math.abs(h(nearest) - h(furthest)) / h(nearest)).toBeLessThan(1e-5)
  })

  it('draws an orbit that every position it publishes lies on', () => {
    // The path the chart strokes and the point it puts the planet at have to be
    // the same object, or the plate draws a world beside its own ring.
    for (const b of content.bodies) {
      const path = orbitPathAu(b.id, 96)
      expect(path).toHaveLength(96)
      const conicAt = (p: { x: number; y: number }) => {
        const nu = Math.atan2(p.y, p.x) - b.periapsisLongitudeRad
        return (b.semiMajorAxisAu * (1 - b.eccentricity ** 2)) / (1 + b.eccentricity * Math.cos(nu))
      }
      for (const p of path) expect(Math.hypot(p.x, p.y)).toBeCloseTo(conicAt(p), 9)

      const period = bodyPeriodDays(b.id) * DAY
      for (const i of [0, 17, 43, 71]) {
        const at = bodyPositionAt(b.id, (period * i) / 96)
        expect(Math.hypot(at.x, at.y) / AU).toBeCloseTo(conicAt({ x: at.x, y: at.y }), 9)
      }
    }
  })

  it('keeps the velocity on the same ellipse as the position', () => {
    // One solve for both. Deriving the velocity as a circular tangent -- which
    // is what this did before the ellipses -- puts the arrow at the right place
    // pointing the wrong way, and prices every burn against it.
    for (const b of content.bodies) {
      const { position, velocity } = bodyStateAt(b.id, 137 * DAY)
      const r = Math.hypot(position.x, position.y)
      const v = Math.hypot(velocity.x, velocity.y)
      // Vis-viva, on the body's own axis.
      expect(v).toBeCloseTo(Math.sqrt(MU_SUN * (2 / r - 1 / (b.semiMajorAxisAu * AU))), 3)
      // And not perpendicular to the radius, except at the apsides -- which is
      // exactly what a circular model cannot express.
      const radialSpeed = (position.x * velocity.x + position.y * velocity.y) / r
      if (b.eccentricity > 0.05) expect(Math.abs(radialSpeed)).toBeGreaterThan(1)
    }
  })
})
