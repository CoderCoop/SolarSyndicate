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
  apoapsisAu,
  bodyAngleAt,
  bodyPeriodDays,
  bodyPositionAt,
  bodyVelocityAt,
  orbitPathAu,
  phaseAngleForTransfer,
  phasingWaitS,
  portAngleAt,
  portPositionAt,
  portVelocityAt,
  stretchedBetween,
  synodicPeriodDays,
  transferStateAt,
  type Vec2,
} from './orbits.js'
import { DAY, type GameTime } from './time.js'
import type { SimState } from './types.js'
import { crossing, transferProfile } from './voyage.js'
import { orbitStateAt } from './lambert.js'

export interface ChartBody {
  id: string
  name: string
  /** Heliocentric position in AU, for drawing. */
  x: number
  y: number
  /** Semi-major axis, AU -- the orbit's size, for ordering and for scale. */
  semiMajorAxisAu: number
  /**
   * The orbit itself, sampled in AU. Design §5.1.
   *
   * A path rather than a radius, because the orbits are ellipses now: Mars runs
   * from 1.381 to 1.666 AU and a circle at her mean is 0.14 AU wrong at both
   * ends. Sampled here rather than drawn from elements in the component so the
   * plate's own projection can be applied point by point -- which is what makes
   * the same path correct on the square-root system plate and on the linear
   * close one.
   */
  orbit: Vec2[]
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
  /**
   * Where it goes over the next `leadDays`, sampled -- so the arc has something
   * to aim at, and follows the orbit rather than a circle drawn near it.
   */
  leadArc: Vec2[]
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

/**
 * The neighbourhood of one world, for when the heliocentric frame gives up.
 *
 * Gateway to Tranquillity is 384,400 km, which is 0.0026 AU: at every scale
 * the solar-system plate can usefully draw, the two berths and the ship are
 * one dot, and the chart said so honestly by pinning her at Earth and letting
 * her sit there for five days. Honest, and useless -- the mission board's
 * route strip showed her moving the whole time, so the instrument that is
 * supposed to be the truthful one was the one that looked broken.
 *
 * Everything here is in **AU about the body**, not kilometres, so the plate's
 * existing projection, gestures and ruler carry over unchanged. Zooming past
 * the point where the sun's frame resolves anything simply lands here.
 */
export interface ChartLocal {
  bodyId: string
  bodyName: string
  /** The world itself, drawn to the same scale as the orbits around it. */
  bodyRadiusAu: number
  /** Where the ship is, relative to the body. */
  ship: Vec2
  /**
   * And how fast she is going *about that body*, m/s.
   *
   * 7.7 km/s alongside Gateway, 1.0 in lunar orbit, and whatever vis-viva says
   * in between. Kept here because it is the piece the heliocentric plate has to
   * add to the body's own motion to report her true speed round the sun —
   * deriving it twice is how the two would come to disagree.
   */
  shipVelocityMs: Vec2
  /** Her arc around it, sampled. Empty unless she is crossing between berths. */
  track: Vec2[]
  ports: {
    id: string
    name: string
    moon?: string
    orbitRadiusAu: number
    /** Where it sits on its ring, in this drawing's own reference. */
    at: Vec2
  }[]
  /** How far out this frame has to reach, AU. */
  extentAu: number
  /**
   * How much of the *flight* is behind her, 0 to 1.
   *
   * Not the fraction of the voyage: a crossing between two berths now opens
   * with a coast in the parking orbit until the far end will be where the
   * ellipse finishes, and counting that as flown would draw the arc part-flown
   * before the engine had lit.
   */
  flownFraction: number
  /**
   * Seconds of that coast still to run, zero once she has burned.
   *
   * Bounded by the synodic period of the two orbits, which around Earth is
   * about ninety minutes -- small enough to be part of the crossing rather
   * than a decision, big enough that a chart showing her sitting at her berth
   * ought to say why.
   */
  phasingS: number
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
  /** The world the ship is at, close up, for when the sun's frame is too big. */
  local?: ChartLocal
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

/** Points in a drawn lead arc. Enough that a season of travel reads as a curve. */
const LEAD_SAMPLES = 8

/**
 * Points in a drawn orbit.
 *
 * Ninety-six is four degrees of true anomaly a step, which is smooth at every
 * scale the plate reaches -- and it is a closed-form ellipse rather than a
 * Kepler solve, so asking for it on every frame costs nothing.
 */
const ORBIT_SAMPLES = 96

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
  const to = getBody(toBodyId)

  const phaseNowRad = wrapPi(bodyAngleAt(toBodyId, t) - bodyAngleAt(fromBodyId, t))
  const phaseWantedRad = wrapPi(phaseAngleForTransfer(fromBodyId, toBodyId))
  const offByRad = wrapPi(phaseNowRad - phaseWantedRad)

  // Relative angular rate, radians per day. The target closes on the wanted
  // angle at this rate, whichever way round it is.
  const rate =
    (2 * Math.PI) / bodyPeriodDays(toBodyId) - (2 * Math.PI) / bodyPeriodDays(fromBodyId)

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
  fromPortId: string,
  toPortId: string,
  departedAt: GameTime,
  elapsed: number,
  optionId = 'economy',
): Vec2 {
  const at = arcAt(fromPortId, toPortId, departedAt, elapsed, optionId)
  return at?.position ?? { x: 0, y: 0 }
}

/** Position *and* velocity on the arc, both in the chart's heliocentric frame. */
function arcAt(
  fromPortId: string,
  toPortId: string,
  departedAt: GameTime,
  elapsed: number,
  optionId: string,
) {
  // The same call the astrogator priced the option with, so the drawing and
  // the invoice cannot come apart (§1 pillar 2). It is the Lambert ellipse now,
  // which is why the arc ends *on* the target instead of half a turn from where
  // the ship left and trusting the two to coincide.
  const solved = crossing(fromPortId, toPortId, departedAt, optionId)
  const orbit = solved?.orbit
  if (!orbit) return undefined
  // She is at her berth until the departure burn. On an in-well crossing that
  // is ninety minutes; waiting for an interplanetary window it is months, and
  // drawing her already under way through it would be the same lie at a much
  // larger scale.
  if (elapsed < solved.waitS) {
    // Still alongside, waiting for the geometry. She is where her world is, not
    // where the ellipse begins -- that point is months away and so is she.
    const helio = bodyPositionAt(getPort(fromPortId).bodyId, departedAt + elapsed)
    const v = bodyVelocityAt(getPort(fromPortId).bodyId, departedAt + elapsed)
    return {
      orbit,
      state: {
        position: helio,
        velocity: v,
        radiusM: Math.hypot(helio.x, helio.y),
        speedMs: Math.hypot(v.x, v.y),
        flightPathAngleRad: 0,
      },
      position: { x: helio.x / AU, y: helio.y / AU },
      velocity: v,
    }
  }
  const state = orbitStateAt(orbit, elapsed - solved.waitS)
  return {
    orbit,
    state,
    position: { x: state.position.x / AU, y: state.position.y / AU },
    velocity: state.velocity,
  }
}

/** Heliocentric longitude of a chart position, degrees in [0, 360). */
function longitudeOf(p: Vec2): number {
  const deg = (Math.atan2(p.y, p.x) * 180) / Math.PI
  return (deg + 360) % 360
}

/** Vector sum. */
function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y }
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
    const p = transferPositionAu(v.fromPortId, v.toPortId, v.departedAt, t - v.departedAt, v.optionId)
    return { x: p.x * AU, y: p.y * AU }
  })()

  const bodies: ChartBody[] = []
  for (const body of chartBodies()) {
    const p = bodyPositionAt(body.id, t)
    bodies.push({
      id: body.id,
      name: body.name,
      x: p.x / AU,
      y: p.y / AU,
      semiMajorAxisAu: body.semiMajorAxisAu,
      orbit: orbitPathAu(body.id, ORBIT_SAMPLES),
      ports: portsOn(body.id),
      distanceAu: Math.hypot(p.x - shipAt.x, p.y - shipAt.y) / AU,
      leadArc: Array.from({ length: LEAD_SAMPLES + 1 }, (_, i) => {
        const ahead = bodyPositionAt(body.id, t + (LEAD_DAYS * DAY * i) / LEAD_SAMPLES)
        return { x: ahead.x / AU, y: ahead.y / AU }
      }),
    })
  }

  const voyage = state.voyage
  let ship: ChartShip
  let track: Vec2[] = []

  if (!voyage) {
    const home = getPort(state.ship.portId)
    // Body plus berth. Her orbit about the world is a real position now, so
    // adding it is what makes the heliocentric plate and the world's own plate
    // put her at the *same place* rather than each being right in its own
    // frame -- which is what "aligned" ought to have meant all along.
    const at = add(bodyPositionAt(home.bodyId, t), portPositionAt(home.id, t))
    const v = add(bodyVelocityAt(home.bodyId, t), portVelocityAt(home.id, t))
    ship = {
      x: at.x / AU,
      y: at.y / AU,
      atPortId: home.id,
      local: false,
      radiusAu: Math.hypot(at.x, at.y) / AU,
      longitudeDeg: longitudeOf(at),
      // She is alongside, and alongside is doing 29.8 km/s round the sun and
      // 7.7 km/s round the Earth -- the two add, and which way they add depends
      // on where in the ninety-two minutes she is. The frame the chart is drawn
      // in is the frame it has to report, all of it.
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
      // A hop inside one gravity well. The plate used to pin her at the body's
      // centre and say so honestly -- at solar-system scale she has not moved
      // -- but the berths have real positions now, so her offset is a known
      // vector rather than a direction nobody could name. Adding it is what
      // puts this plate and the world's own plate on the same point.
      const world = localView(state)
      const off = world ? { x: world.ship.x * AU, y: world.ship.y * AU } : { x: 0, y: 0 }
      const at = add(bodyPositionAt(fromBody, t), off)
      const bv = add(
        bodyVelocityAt(fromBody, t),
        world?.shipVelocityMs ?? { x: 0, y: 0 },
      )
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
        arcAt(voyage.fromPortId, voyage.toPortId, voyage.departedAt, elapsed, voyage.optionId)

      const solved = crossing(voyage.fromPortId, voyage.toPortId, voyage.departedAt, voyage.optionId)
      const waitS = solved?.waitS ?? 0
      const flightS = solved?.flightS ?? total
      const now = at(t - voyage.departedAt)
      const steps = 48
      // Sampled over the flight, not the voyage: the months spent waiting for
      // the window are not a part of the arc.
      track = now
        ? Array.from({ length: steps + 1 }, (_, i) => at(waitS + (flightS * i) / steps)!.position)
        : []

      // What is left to fly, along the arc rather than across the chord. The
      // polyline is the same one being drawn, so the number and the picture
      // are measurements of one object.
      const flown = Math.min(1, Math.max(0, (t - voyage.departedAt - waitS) / flightS))
      const remaining = track.filter((_, i) => i / steps >= flown)
      const path = now ? [now.position, ...remaining] : remaining
      let toGoAu = 0
      for (let i = 1; i < path.length; i++) {
        toGoAu += Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.y - path[i - 1]!.y)
      }

      const a = (now?.orbit.semiMajorAxisM ?? 0) / AU
      const e = now?.orbit.eccentricity ?? 0
      const helio = bodyPositionAt(fromBody, t)
      const fallback = { x: helio.x / AU, y: helio.y / AU }

      ship = {
        ...(now?.position ?? fallback),
        fromBodyId: fromBody,
        toBodyId: toBody,
        fractionComplete: fraction,
        profileLabel: profile.label,
        local: false,
        radiusAu: (now?.state.radiusM ?? Math.hypot(helio.x, helio.y)) / AU,
        longitudeDeg: longitudeOf(now?.position ?? fallback),
        speedMs: now?.state.speedMs ?? 0,
        heading: unit(now?.velocity ?? bodyVelocityAt(fromBody, t)),
        flightPathAngleRad: now?.state.flightPathAngleRad ?? 0,
        ...(track[steps] ? { intercept: track[steps]! } : {}),
        apoapsisAu: a * (1 + e),
        periapsisAu: a * (1 - e),
        toGoAu,
        toPortName: getPort(voyage.toPortId).name,
        daysToArrival: Math.max(0, voyage.arrivesAt - t) / DAY,
      }
    }
  }

  const extentAu = Math.max(
    // Apoapsis, not the axis: a plate sized to the mean radius clips the far
    // half of every orbit drawn on it.
    ...bodies.map((b) => apoapsisAu(b.id)),
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

  const local = localView(state)

  return {
    bodies,
    ship,
    track,
    extentAu: extentAu * 1.12,
    windows,
    leadDays: LEAD_DAYS,
    ...(local ? { local } : {}),
  }
}

/** Kilometres to AU. */
const KM = 1000 / AU

/**
 * The neighbourhood of whichever world the ship is at. Design doc §5.1, §5.2.
 *
 * The same maths the astrogator priced the hop with -- `stretchedBetween`
 * about the body's own gravitational parameter -- read at `now`. Not the route
 * strip's half-ellipse-shaped flourish: this is the plate that claims its
 * numbers are real, so the ship goes where Kepler puts her.
 *
 * Angles are the transfer's own reference, with departure at zero. The sim
 * does not model where Luna is in its month and inventing a phase would be a
 * number the player could check and find made up -- so the angles *between*
 * the things drawn here are true while their bearing against the stars is not
 * claimed.
 */
function localView(state: SimState): ChartLocal | undefined {
  const t = state.now
  const voyage = state.voyage
  const here = getPort(voyage ? voyage.fromPortId : state.ship.portId)
  const body = getBody(here.bodyId)
  const ports = portsOn(here.bodyId)
  if (ports.length === 0) return undefined

  const inSystem = voyage ? getPort(voyage.toPortId).bodyId === here.bodyId : false
  const r1 = here.orbitRadiusKm * KM

  // Where each berth actually is, now. Every port carries an epoch phase and
  // its period follows from the body's mu, so this is a position rather than a
  // convention -- which is what lets this plate and the heliocentric one agree
  // about where the ship is instead of each being right in its own frame.
  const placed = ports.map((p) => {
    const at = portPositionAt(p.id, t)
    return {
      ...p,
      orbitRadiusAu: getPort(p.id).orbitRadiusKm * KM,
      at: { x: (at.x / 1000) * KM, y: (at.y / 1000) * KM },
    }
  })

  let shipAt: Vec2 = placed.find((p) => p.id === here.id)?.at ?? { x: r1, y: 0 }
  let shipVelocityMs: Vec2 = portVelocityAt(here.id, t)
  let track: Vec2[] = []
  let flownFraction = 0
  let phasingS = 0

  if (inSystem && voyage) {
    const to = getPort(voyage.toPortId)
    const multiplier = transferProfile(voyage.optionId).multiplier
    const leg = stretchedBetween(
      body.muM3S2,
      here.orbitRadiusKm * 1000,
      to.orbitRadiusKm * 1000,
      multiplier,
    )
    // She coasts at her berth until the geometry works, then burns. The wait is
    // recomputed from the departure instant rather than stored, the way the
    // rest of the trajectory is.
    const waitS = phasingWaitS(here.id, to.id, voyage.departedAt, multiplier)
    const burnAt = voyage.departedAt + waitS
    phasingS = Math.max(0, burnAt - t)
    // The ellipse is oriented by where she is when she lights the engine, so
    // the far end lands on the target rather than merely on the target's ring.
    const departureAngle = portAngleAt(here.id, burnAt)
    const at = (elapsed: number): Vec2 => {
      const st = transferStateAt(leg, body.muM3S2, elapsed)
      const angle = departureAngle + st.sweptRad
      return { x: ((st.radiusM / 1000) * KM) * Math.cos(angle), y: ((st.radiusM / 1000) * KM) * Math.sin(angle) }
    }
    const flown = t - burnAt
    shipAt = flown <= 0 ? portPositionAtAu(here.id, t) : at(flown)
    if (flown > 0) {
      // Radial along the radius vector, transverse a quarter turn ahead of it,
      // both straight off the same transfer state the position came from.
      const st = transferStateAt(leg, body.muM3S2, flown)
      const angle = departureAngle + st.sweptRad
      shipVelocityMs = {
        x: st.radialMs * Math.cos(angle) - st.transverseMs * Math.sin(angle),
        y: st.radialMs * Math.sin(angle) + st.transverseMs * Math.cos(angle),
      }
    }
    flownFraction = Math.min(1, Math.max(0, flown / leg.durationS))
    const steps = 48
    track = Array.from({ length: steps + 1 }, (_, i) => at((leg.durationS * i) / steps))
  }

  const extentAu = Math.max(
    ...placed.map((p) => p.orbitRadiusAu),
    ...track.map((p) => Math.hypot(p.x, p.y)),
    Math.hypot(shipAt.x, shipAt.y),
  )

  return {
    bodyId: body.id,
    bodyName: body.name,
    bodyRadiusAu: body.radiusKm * KM,
    ship: shipAt,
    shipVelocityMs,
    track,
    ports: placed,
    extentAu: extentAu * 1.25,
    flownFraction,
    phasingS,
  }
}

/** A port's offset from its body, in AU rather than metres. */
function portPositionAtAu(portId: string, t: GameTime): Vec2 {
  const at = portPositionAt(portId, t)
  return { x: (at.x / 1000) * KM, y: (at.y / 1000) * KM }
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
  return out.sort((a, b) => a.semiMajorAxisAu - b.semiMajorAxisAu)
}

function portsOn(bodyId: string) {
  return content.ports
    .filter((p) => p.bodyId === bodyId)
    // The moon travels with the port: a chart that says "Tranquillity, Earth"
    // hides the 384,400 km that makes the crossing take five days.
    .map((p) => ({ id: p.id, name: p.name, ...(p.moon ? { moon: p.moon } : {}) }))
}
