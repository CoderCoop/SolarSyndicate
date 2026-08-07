/**
 * The star chart. Design doc §5.1.
 *
 * Where everything actually is, in heliocentric coordinates, at this instant.
 * Bodies come straight from `orbits.ts`, so the chart is not a decoration
 * drawn beside the simulation -- it is the same closed-form positions the
 * transfer maths uses, read at `now`.
 *
 * A ship under way is placed on its **actual transfer ellipse** rather than
 * lerped between two dots. Kepler's equation is already how the crossing was
 * priced (spec 002 TR-2), so solving it again for the current radius and true
 * anomaly costs a Newton iteration and buys a position that is genuinely
 * where the ship is. A straight line between departure and arrival would have
 * been a lie the player could check.
 *
 * **Which ellipse depends on the profile that was chosen**, and the chart
 * draws that one. It used to rebuild the minimum-energy ellipse from the two
 * orbit radii and nothing else, so every trajectory on offer was drawn as the
 * cheap one: the player paid 2.4 km/s extra for Express and watched the arc
 * they had declined. The geometry now comes from the same `Transfer` the
 * astrogator priced -- §1 pillar 2 is that the numbers are real, and a picture
 * of a different trajectory is no more true than a fake number.
 *
 * **The ship carries her telemetry with her**: radius, longitude, speed,
 * heading, flight path angle, the apsides of the ellipse she is on and how far
 * along the arc is left. All of it was already in the sim -- vis-viva has
 * priced every crossing since M2 -- and none of it had ever reached the plate,
 * which left "where am I, how fast, and which way" as three questions a chart
 * could not answer. Everything is in the **heliocentric frame**, the frame the
 * chart is drawn in, including alongside: a ship berthed at Gateway is doing
 * 29.8 km/s, and reporting zero would be quoting a different frame from the
 * picture.
 */
import { content, getBody, getPort } from '@solsyn/data'
import {
  AU,
  MU_SUN,
  bodyAngleAt,
  bodyPositionAt,
  bodyVelocityAt,
  phaseAngleForTransfer,
  stretchedTransfer,
  synodicPeriodDays,
  transferStateAt,
  type Vec2,
} from './orbits.js'
import { DAY, type GameTime } from './time.js'
import type { SimState } from './types.js'
import { transferProfile } from './voyage.js'

export interface ChartBody {
  id: string
  name: string
  /** Heliocentric position in AU, for drawing. */
  x: number
  y: number
  orbitRadiusAu: number
  /** Ports berthed here, so the chart can label a place by what is at it. */
  ports: { id: string; name: string; moon?: string }[]
  /**
   * How far the ship is from it *right now*, in AU.
   *
   * The whole reason the bodies move (§5.1): "Mars is sometimes 0.5 AU away and
   * sometimes 2.5". The chart drew that motion faithfully and never once said
   * what it cost, which left the most consequential number on the plate as
   * something the player had to eyeball off a square-root scale.
   */
  distanceAu: number
  /** Where it will be in `leadDays`, so the arc has something to aim at. */
  lead: Vec2
}

/**
 * Whether a crossing is near its window. Design doc §5.1.
 *
 * "Planets *move* -- Mars is sometimes 0.5 AU away and sometimes 2.5, so
 * **launch windows are real gameplay** and the astrogator's job."
 *
 * The maths for this has existed since M2 -- `phaseAngleForTransfer` and
 * `synodicPeriodDays` are written, tested, and were referenced by nothing at
 * all. A window nobody can see is not gameplay, it is a fact about the
 * simulation, so this is what puts it on the plate.
 */
export interface ChartWindow {
  toBodyId: string
  toName: string
  /** Angle from the ship's body to the target now, radians, signed. */
  phaseNowRad: number
  /** The angle a minimum-energy transfer wants at departure. */
  phaseWantedRad: number
  /** How far off it is, radians. Zero is the window. */
  offByRad: number
  /** Days until the geometry comes round, 0 when it is open now. */
  daysToWindow: number
  /** How often it comes round at all. */
  synodicDays: number
  /** Inside the tolerance where a transfer is worth flying. */
  open: boolean
}

/**
 * Where the ship is and where she is going, as an instrument reads it.
 *
 * A dot on a plate says *there*. It does not say how fast, which way, whether
 * she is climbing or falling, or where the arc actually ends -- and those are
 * the four things a navigator looks at. All of them already existed in the
 * sim: vis-viva has priced every crossing since M2, and the arrival point is
 * just the target body evaluated at `arrivesAt`. None of it had ever reached
 * the plate.
 *
 * Everything here is in the **heliocentric frame**, which is the frame the
 * chart is drawn in. That matters for the berthed case: a ship alongside
 * Gateway is doing 29.8 km/s, and saying "0" would be reporting a different
 * frame from the one the picture is in.
 */
export interface ChartShip {
  x: number
  y: number
  /** Berthed here, if berthed. */
  atPortId?: string
  /** Under way between these, if under way. */
  fromBodyId?: string
  toBodyId?: string
  /**
   * The berth she is actually booked into.
   *
   * The body is not the destination: "Mars" and "Phobos Anchorage" are the
   * same dot at this scale but only one of them is a place the ship can tie up
   * at, and the readout is answering "where am I going".
   */
  toPortName?: string
  fractionComplete?: number
  /** The trajectory being flown -- "Express" -- so the arc can be named. */
  profileLabel?: string
  /** True when the crossing never leaves one body's neighbourhood. */
  local: boolean

  /** Distance from the sun, AU. */
  radiusAu: number
  /** Heliocentric longitude, degrees in [0, 360), measured the way the chart draws it. */
  longitudeDeg: number
  /** Speed in the heliocentric frame, m/s. */
  speedMs: number
  /** Unit vector along the velocity, in chart coordinates. Where she is pointed. */
  heading: Vec2
  /**
   * Positive climbing away from the sun, negative falling toward it, radians.
   *
   * Zero berthed (a circular orbit is all transverse) and zero at either apsis
   * of a transfer, which is exactly where the burns happen.
   */
  flightPathAngleRad: number

  /** Where she meets the target, AU. Only under way between bodies. */
  intercept?: Vec2
  /** The apsides of the ellipse she is on, AU -- the shape of the course. */
  apoapsisAu?: number
  periapsisAu?: number
  /** Distance still to fly along the arc, AU. */
  toGoAu?: number
  /** Days until the arrival burn. Under way, either kind of crossing. */
  daysToArrival?: number
}

export interface ChartView {
  bodies: ChartBody[]
  ship: ChartShip
  /** The transfer arc, in AU, sampled for drawing. Empty when berthed. */
  track: Vec2[]
  /** How far out the chart has to reach, in AU. */
  extentAu: number
  /** Launch windows to everywhere with a port, nearest-open first. */
  windows: ChartWindow[]
  /** How far ahead `ChartBody.lead` looks, in days. */
  leadDays: number
}

/**
 * How close the phase has to be before a crossing is worth flying.
 *
 * Fifteen degrees. Wide enough that a window is a period rather than an
 * instant -- the ship has to actually be loaded and fuelled inside it -- and
 * narrow enough that "wait for it" is a real decision rather than a formality.
 */
const WINDOW_TOLERANCE_RAD = (15 * Math.PI) / 180

/** Where the bodies will be a season from now, for the lead marks. */
const LEAD_DAYS = 90

/** Signed angle from a to b, wrapped to (-pi, pi]. */
function wrapPi(radians: number): number {
  let a = radians
  while (a <= -Math.PI) a += 2 * Math.PI
  while (a > Math.PI) a -= 2 * Math.PI
  return a
}

/**
 * When the geometry for a crossing next comes round.
 *
 * The phase error closes at the difference of the two angular rates, so this is
 * a division rather than a search -- the same closed-form property the rest of
 * the sim rests on (§7.2).
 */
function windowFor(fromBodyId: string, toBodyId: string, t: GameTime): ChartWindow {
  const from = getBody(fromBodyId)
  const to = getBody(toBodyId)

  const phaseNowRad = wrapPi(bodyAngleAt(toBodyId, t) - bodyAngleAt(fromBodyId, t))
  const phaseWantedRad = wrapPi(phaseAngleForTransfer(fromBodyId, toBodyId))
  const offByRad = wrapPi(phaseNowRad - phaseWantedRad)

  // Relative angular rate, radians per day. The target closes on the wanted
  // angle at this rate, whichever way round it is.
  const rate =
    (2 * Math.PI) / (to.orbitPeriodDays) - (2 * Math.PI) / (from.orbitPeriodDays)

  const open = Math.abs(offByRad) <= WINDOW_TOLERANCE_RAD
  let daysToWindow = 0
  if (!open && rate !== 0) {
    // Distance still to travel, in the direction the phase is actually moving.
    const remaining = rate > 0 ? wrapPi(-offByRad) : wrapPi(offByRad)
    const togo = remaining >= 0 ? remaining : remaining + 2 * Math.PI
    daysToWindow = togo / Math.abs(rate)
  }

  return {
    toBodyId,
    toName: to.name,
    phaseNowRad,
    phaseWantedRad,
    offByRad,
    daysToWindow,
    synodicDays: synodicPeriodDays(fromBodyId, toBodyId),
    open,
  }
}

/**
 * Where a ship is on a transfer ellipse, `elapsed` seconds after departure.
 *
 * `semiMajorMultiplier` is the chosen profile's stretch -- 1 for minimum
 * energy, 1.12 for Express -- and it changes the shape of the arc, not just
 * how fast the dot moves along it. An Express leg leaves harder, rides a
 * longer ellipse, and crosses the target orbit rather than meeting it
 * tangentially; drawing it on the Hohmann conic put the ship somewhere it
 * demonstrably was not.
 */
export function transferPositionAu(
  fromBodyId: string,
  toBodyId: string,
  departedAt: GameTime,
  elapsed: number,
  semiMajorMultiplier = 1,
): Vec2 {
  return arcAt(fromBodyId, toBodyId, departedAt, elapsed, semiMajorMultiplier).position
}

/** Position *and* velocity on the arc, both in the chart's heliocentric frame. */
function arcAt(
  fromBodyId: string,
  toBodyId: string,
  departedAt: GameTime,
  elapsed: number,
  semiMajorMultiplier: number,
) {
  // The same call the astrogator priced the option with, so the drawing and
  // the invoice cannot come apart (§1 pillar 2).
  const leg = stretchedTransfer(fromBodyId, toBodyId, semiMajorMultiplier)
  const state = transferStateAt(leg, MU_SUN, elapsed)

  // Anchor the arc to where the ship actually left.
  const angle = bodyAngleAt(fromBodyId, departedAt) + state.sweptRad
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)

  return {
    leg,
    state,
    position: { x: (state.radiusM * cos) / AU, y: (state.radiusM * sin) / AU },
    // Radial component along the outward unit vector, transverse along the
    // tangent a quarter turn ahead of it.
    velocity: {
      x: state.radialMs * cos - state.transverseMs * sin,
      y: state.radialMs * sin + state.transverseMs * cos,
    },
  }
}

/** Heliocentric longitude of a chart position, degrees in [0, 360). */
function longitudeOf(p: Vec2): number {
  const deg = (Math.atan2(p.y, p.x) * 180) / Math.PI
  return (deg + 360) % 360
}

function unit(v: Vec2): Vec2 {
  const m = Math.hypot(v.x, v.y)
  return m < 1e-9 ? { x: 0, y: 0 } : { x: v.x / m, y: v.y / m }
}

export function chartView(state: SimState): ChartView {
  const t = state.now

  // Where the ship is, in metres, so distances can be measured from it rather
  // than from the sun. Berthed she is at her port's body; under way she is on
  // the ellipse, which is the position that actually matters for "how far".
  const shipAt = (() => {
    const v = state.voyage
    if (!v) return bodyPositionAt(getPort(state.ship.portId).bodyId, t)
    const fromBody = getPort(v.fromPortId).bodyId
    const toBody = getPort(v.toPortId).bodyId
    if (fromBody === toBody) return bodyPositionAt(fromBody, t)
    const p = transferPositionAu(
      fromBody,
      toBody,
      v.departedAt,
      t - v.departedAt,
      transferProfile(v.optionId).multiplier,
    )
    return { x: p.x * AU, y: p.y * AU }
  })()

  const bodies: ChartBody[] = []
  for (const body of chartBodies()) {
    const p = bodyPositionAt(body.id, t)
    const ahead = bodyPositionAt(body.id, t + LEAD_DAYS * DAY)
    bodies.push({
      id: body.id,
      name: body.name,
      x: p.x / AU,
      y: p.y / AU,
      orbitRadiusAu: body.orbitRadiusAu,
      ports: portsOn(body.id),
      distanceAu: Math.hypot(p.x - shipAt.x, p.y - shipAt.y) / AU,
      lead: { x: ahead.x / AU, y: ahead.y / AU },
    })
  }

  const voyage = state.voyage
  let ship: ChartShip
  let track: Vec2[] = []

  if (!voyage) {
    const home = getPort(state.ship.portId)
    const at = bodyPositionAt(home.bodyId, t)
    const v = bodyVelocityAt(home.bodyId, t)
    ship = {
      x: at.x / AU,
      y: at.y / AU,
      atPortId: home.id,
      local: false,
      radiusAu: Math.hypot(at.x, at.y) / AU,
      longitudeDeg: longitudeOf(at),
      // She is alongside, and alongside is doing 29.8 km/s. The frame the
      // chart is drawn in is the frame it has to report.
      speedMs: Math.hypot(v.x, v.y),
      heading: unit(v),
      flightPathAngleRad: 0,
    }
  } else {
    const fromBody = getPort(voyage.fromPortId).bodyId
    const toBody = getPort(voyage.toPortId).bodyId
    const total = voyage.arrivesAt - voyage.departedAt
    const fraction = total > 0 ? Math.min(1, Math.max(0, (t - voyage.departedAt) / total)) : 1
    const profile = transferProfile(voyage.optionId)

    if (fromBody === toBody) {
      // A hop inside one gravity well. At this scale the ship has not moved,
      // and pretending otherwise would put it somewhere it is not -- so the
      // heliocentric telemetry is the body's, which is the truth of it.
      const at = bodyPositionAt(fromBody, t)
      const bv = bodyVelocityAt(fromBody, t)
      ship = {
        x: at.x / AU,
        y: at.y / AU,
        fromBodyId: fromBody,
        toBodyId: toBody,
        fractionComplete: fraction,
        profileLabel: profile.label,
        local: true,
        radiusAu: Math.hypot(at.x, at.y) / AU,
        longitudeDeg: longitudeOf(at),
        speedMs: Math.hypot(bv.x, bv.y),
        heading: unit(bv),
        flightPathAngleRad: 0,
        toPortName: getPort(voyage.toPortId).name,
        daysToArrival: Math.max(0, voyage.arrivesAt - t) / DAY,
      }
    } else {
      const at = (elapsed: number) =>
        arcAt(fromBody, toBody, voyage.departedAt, elapsed, profile.multiplier)

      const now = at(t - voyage.departedAt)
      const steps = 48
      track = Array.from({ length: steps + 1 }, (_, i) => at((total * i) / steps).position)

      // What is left to fly, along the arc rather than across the chord. The
      // polyline is the same one being drawn, so the number and the picture
      // are measurements of one object.
      const remaining = track.filter((_, i) => (i / steps) >= fraction)
      const path = [now.position, ...remaining]
      let toGoAu = 0
      for (let i = 1; i < path.length; i++) {
        toGoAu += Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.y - path[i - 1]!.y)
      }

      const a = now.leg.semiMajorAxisM / AU
      const e = now.leg.eccentricity

      ship = {
        ...now.position,
        fromBodyId: fromBody,
        toBodyId: toBody,
        fractionComplete: fraction,
        profileLabel: profile.label,
        local: false,
        radiusAu: now.state.radiusM / AU,
        longitudeDeg: longitudeOf(now.position),
        speedMs: now.state.speedMs,
        heading: unit(now.velocity),
        flightPathAngleRad: now.state.flightPathAngleRad,
        intercept: track[steps]!,
        apoapsisAu: a * (1 + e),
        periapsisAu: a * (1 - e),
        toGoAu,
        toPortName: getPort(voyage.toPortId).name,
        daysToArrival: Math.max(0, voyage.arrivesAt - t) / DAY,
      }
    }
  }

  const extentAu = Math.max(
    ...bodies.map((b) => b.orbitRadiusAu),
    Math.hypot(ship.x, ship.y),
    // An express ellipse throws its apoapsis past the destination orbit by
    // design (§5.2). Sizing the plate to the orbits alone clipped the very
    // bulge that distinguishes the profile the player paid for.
    ...track.map((p) => Math.hypot(p.x, p.y)),
  )

  // Windows from wherever she is, to everywhere else with a port. Sorted so
  // the one the player can act on soonest reads first.
  const here = getPort(state.voyage ? state.voyage.fromPortId : state.ship.portId).bodyId
  const windows = bodies
    .filter((b) => b.id !== here)
    .map((b) => windowFor(here, b.id, t))
    .sort((a, b) => a.daysToWindow - b.daysToWindow)

  return { bodies, ship, track, extentAu: extentAu * 1.12, windows, leadDays: LEAD_DAYS }
}

/** Every body with a port on it, innermost first. */
function chartBodies() {
  const seen = new Set<string>()
  const out = []
  for (const port of content.ports) {
    if (seen.has(port.bodyId)) continue
    seen.add(port.bodyId)
    out.push(getBody(port.bodyId))
  }
  return out.sort((a, b) => a.orbitRadiusAu - b.orbitRadiusAu)
}

function portsOn(bodyId: string) {
  return content.ports
    .filter((p) => p.bodyId === bodyId)
    // The moon travels with the port: a chart that says "Tranquillity, Earth"
    // hides the 384,400 km that makes the crossing take five days.
    .map((p) => ({ id: p.id, name: p.name, ...(p.moon ? { moon: p.moon } : {}) }))
}
