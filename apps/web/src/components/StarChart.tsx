/**
 * The star chart. Design doc §5.1.
 *
 * Where the ship is, drawn top-down with the sun at the centre. Everything on
 * it comes from `chartView` -- the same closed-form positions the transfer
 * maths uses -- so the dot is where the ship is rather than where a tween
 * happens to have put it.
 *
 * Orbits are drawn to a **square-root radial scale**. Linear would put Earth
 * and Ceres at 1 and 2.77 AU with the inner system squashed into a fifth of
 * the plate; logarithmic would flatter the outer system into a smear. Charts
 * of this kind are read for *relative position*, and the square root keeps
 * both legible at once. It is a stated distortion rather than a hidden one --
 * and now a measurable one, because the ruler along the foot is drawn to the
 * same scale.
 *
 * ## What it is for
 *
 * It used to be three grey rings, three identical dots and a lot of black. It
 * was *true* -- the positions were real -- and it answered no question a player
 * actually had. §5.1 says what the map is for:
 *
 *   "Planets *move* -- Mars is sometimes 0.5 AU away and sometimes 2.5, so
 *   **launch windows are real gameplay** and the astrogator's job."
 *
 * Both halves of that were missing. The chart drew the motion faithfully and
 * never said what it cost, and the window maths -- `phaseAngleForTransfer`,
 * `synodicPeriodDays` -- had been written and tested in M2 and referenced by
 * nothing at all. So the plate now carries the two numbers that make it an
 * instrument: **how far away is that**, and **when is it worth going**.
 *
 * ## The ship's own state
 *
 * And now the three questions a navigator asks about their own vessel:
 * **where am I, how fast, and which way**. The dot has always been in the right
 * place and it said nothing else. It now carries a heading needle scaled to
 * speed, an arc split into what has been flown and what has not, a marked
 * intercept, and a graticule to read longitude against — with the figures
 * repeated underneath, because an arrow is a direction and a player planning a
 * burn wants a number.
 */
import { useRef, useState } from 'react'
import type { ChartBody, ChartLocal, ChartView, ChartWindow } from '@solsyn/sim'

const SIZE = 300
const CENTRE = SIZE / 2
const MARGIN = 30
/** Room along the foot for the scale ruler. */
const FOOT = 16
/** The plate's drawing radius, in the same units as everything else. */
const PLATE = CENTRE - MARGIN

/**
 * Heliocentric longitude lines, every 30°.
 *
 * A chart you cannot take a bearing off is a picture. The graticule is what
 * turns "somewhere out past Earth" into "1.24 AU at 214°" without the player
 * having to trust the readout underneath — it is the same number, drawn.
 */
const GRATICULE_STEP_DEG = 30

/**
 * Earth's orbital speed, m/s, as the needle's reference length.
 *
 * Scaling the arrow rather than fixing it means a ship crawling near apoapsis
 * has a visibly shorter needle than one whipping through perihelion, which is
 * the single most counter-intuitive fact about orbital transfer and the one a
 * static arrow would have hidden.
 */
const REFERENCE_SPEED_MS = 29784

/**
 * Plate widths a player can pick, in AU across the whole plate.
 *
 * The square-root system view is the right *map* -- it puts the inner system
 * and the Belt on one plate and states the distortion it uses to do it -- and
 * it is the wrong instrument for "where exactly am I". These are the same
 * positions drawn **linearly**, centred on the ship, so a millimetre is a
 * millimetre wherever it falls.
 *
 * The scale is continuous and the gesture is the one everybody already has:
 * pinch, drag, wheel, double tap. Four fixed stops were a scale *picker*, and
 * a chart is not something you pick a scale for — it is something you lean
 * into. The map stays as a place to return to rather than becoming a fifth
 * stop, because it is a different projection and not a different
 * magnification.
 */
/**
 * Where the sun's frame gives up and the world's own takes over.
 *
 * Below about a million kilometres across, every heliocentric plate shows one
 * dot: Gateway, Tranquillity and the ship between them are 0.0026 AU apart and
 * the sun is a hundred thousand plate-widths away. Keep pinching and the chart
 * lands in the body's own frame instead, which is where a cislunar crossing
 * has been happening all along.
 */
const LOCAL_BELOW_AU = 0.004

const REACH = {
  /** Closest in: Earth's own limb filling the plate. */
  min: 0.0002,
  /** Furthest out: Ceres' orbit with room around it. */
  max: 4,
  /** Where a fresh close view starts — half an AU across. */
  start: 0.25,
}

/** How far one wheel notch or one tap of the buttons moves the scale. */
const ZOOM_STEP = 1.35

/**
 * What the plate is showing, and from where.
 *
 * `centre` is null while the camera is following the ship, which is the state
 * it starts in and returns to: a chart that quietly stopped tracking her the
 * first time somebody nudged it would be a worse instrument than one that
 * cannot pan at all.
 */
interface Camera {
  mode: 'map' | 'close'
  /** Half the plate's width, AU. Close view only. */
  reachAu: number
  centre: { x: number; y: number } | null
  /**
   * Which origin `centre` is measured from.
   *
   * Zooming past `LOCAL_BELOW_AU` changes the frame under the camera: the same
   * pair of numbers means "1.0 AU from the sun" in one and "1.0 AU from Earth"
   * in the other. Without this the first pinch across the boundary threw the
   * ship six hundred thousand plate-widths off the edge, which is the whole
   * heliocentric distance to Earth expressed in a frame that had just stopped
   * meaning that.
   */
  centreFrame: 'sun' | 'body'
}

/** Candidate grid and ruler steps, in AU. The largest that fits at least three. */
const STEPS = [0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5]

/**
 * How the plate maps heliocentric AU onto drawing units.
 *
 * Two of these: the square-root map centred on the sun, and a linear one
 * centred on the ship. Everything that draws goes through `to`, so adding the
 * second view did not mean a second copy of the chart.
 */
interface View {
  kind: 'system' | 'close' | 'local'
  /** Heliocentric AU to plate coordinates. */
  to: (x: number, y: number) => [number, number]
  /** And back again, which is what a pinch needs to hold a point still. */
  from: (plateX: number, plateY: number) => { x: number; y: number }
  /** Where the sun lands, which in the close view is usually off the plate. */
  sun: [number, number]
  /** An orbit's radius in plate units -- a circle about the sun either way. */
  orbitR: (au: number) => number
  /** Half the plate's width, in AU. */
  reachAu: number
  /** Plate units per AU. Constant only in the close view. */
  perAu: number
}

/**
 * How each world is drawn: a map symbol, not a photograph.
 *
 * Deliberately the same vocabulary the route strip uses, because a player who
 * has learned that the small grey one is Ceres on one screen should not have to
 * learn it again on the other. Radii are drawing units and are *not* to scale
 * with each other -- at true scale Ceres would be a third of a pixel.
 */
const WORLD: Record<string, { r: number; tone: string; ring?: boolean }> = {
  earth: { r: 6, tone: 'earth', ring: true },
  mars: { r: 4.6, tone: 'mars' },
  ceres: { r: 3, tone: 'ceres' },
}

/** Square-root radial scale, AU to drawing units. */
function radial(au: number, extentAu: number): number {
  return Math.sqrt(Math.max(0, au) / extentAu) * PLATE
}

/** A point on the plate at a given longitude and drawing radius. */
function onPlate(longitudeDeg: number, r: number): [number, number] {
  const a = (longitudeDeg * Math.PI) / 180
  return [CENTRE + r * Math.cos(a), CENTRE - r * Math.sin(a)]
}

function project(x: number, y: number, extentAu: number): [number, number] {
  const au = Math.hypot(x, y)
  if (au < 1e-9) return [CENTRE, CENTRE]
  const r = radial(au, extentAu)
  // Screen y grows downward; flip so the chart reads like a map.
  return [CENTRE + (x / au) * r, CENTRE - (y / au) * r]
}

/** Distance in the unit that suits it, the way the route strip does. */
function distance(au: number): string {
  if (au < 0.001) return 'here'
  if (au < 0.06) return `${(au * 149.6).toFixed(1)}M km`
  return `${au.toFixed(2)} AU`
}

/**
 * A *scale*, as opposed to a range.
 *
 * `distance` answers "how far is that" and is right to say "here" for anything
 * under a thousandth of an AU — at solar-system scale that really is here. A
 * scale bar cannot: once the plate is measuring the gap between Gateway and
 * Luna, "here across" is not a legend, and the number the player wants is in
 * kilometres.
 */
function span(au: number): string {
  const km = au * 149597871
  if (km < 100000) return `${Math.round(km).toLocaleString()} km`
  if (au < 0.06) return `${(au * 149.6).toFixed(2)}M km`
  return `${au.toFixed(2)} AU`
}

/**
 * Days, kept as days for as long as they are useful.
 *
 * Switching to years at ninety collapsed two windows 25 days apart into the
 * same "0.6y" -- and 202 days against 227 is exactly the difference a player
 * plans around. Years only once the number stops being a thing you wait out.
 */
function days(d: number): string {
  if (d < 1) return 'now'
  if (d < 400) return `${Math.round(d)} days`
  return `${(d / 365.25).toFixed(1)} years`
}

/**
 * Ticks for the ruler: the round AU values that fit inside the plate.
 *
 * The square-root scale is the one thing on this drawing a player has to take
 * on trust, so it gets a ruler. Unevenly spaced ticks *are* the distortion,
 * shown rather than described.
 */
function ticksFor(extentAu: number): number[] {
  return [0.5, 1, 2, 3, 5, 10].filter((au) => au <= extentAu)
}

/** Track points to an SVG path, in plate coordinates. */
function pathFor(points: { x: number; y: number }[], view: View): string {
  return points
    .map((p, i) => {
      const [x, y] = view.to(p.x, p.y)
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
}

/**
 * The largest round step that puts at least three marks inside `reachAu`.
 *
 * Two was enough to be a scale and not enough to be a ruler: at half an AU it
 * drew ticks at 0.2 and 0.4 and left the reader interpolating the rest.
 */
function stepFor(reachAu: number): number {
  const fits = STEPS.filter((s) => reachAu / s >= 3)
  return fits.at(-1) ?? STEPS[0]!
}

/** Heliocentric longitude of a charted point, degrees in [0, 360). */
function longitudeOf(x: number, y: number): number {
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

function viewFor(camera: Camera, chart: ChartView): View {
  const { extentAu, ship } = chart
  if (camera.mode === 'map') {
    return {
      kind: 'system',
      to: (x, y) => project(x, y, extentAu),
      from: () => ({ x: ship.x, y: ship.y }),
      sun: [CENTRE, CENTRE],
      orbitR: (au) => radial(au, extentAu),
      reachAu: extentAu,
      perAu: PLATE / extentAu,
    }
  }
  // Close enough that the sun's frame shows nothing: switch to the world's
  // own, where the ship is somewhere between two berths rather than pinned to
  // a planet for five days.
  const local = chart.local
  // Where the body itself is, heliocentrically: the origin this frame swaps to.
  const origin = { x: ship.x, y: ship.y }
  if (local && camera.reachAu < LOCAL_BELOW_AU) {
    const at = camera.centre
      ? camera.centreFrame === 'sun'
        ? { x: camera.centre.x - origin.x, y: camera.centre.y - origin.y }
        : camera.centre
      : { x: 0, y: 0 }
    const reachAu = camera.reachAu
    const perAu = PLATE / reachAu
    const to = (x: number, y: number): [number, number] => [
      CENTRE + (x - at.x) * perAu,
      CENTRE - (y - at.y) * perAu,
    ]
    return {
      kind: 'local',
      to,
      from: (px, py) => ({ x: at.x + (px - CENTRE) / perAu, y: at.y - (py - CENTRE) / perAu }),
      // The body is the centre of this frame, so it is where the light is.
      sun: to(0, 0),
      orbitR: (au) => au * perAu,
      reachAu,
      perAu,
    }
  }

  // Linear: the view that answers "exactly where". Centred on the ship until
  // somebody drags it somewhere else.
  const at = camera.centre
    ? camera.centreFrame === 'body'
      ? { x: camera.centre.x + origin.x, y: camera.centre.y + origin.y }
      : camera.centre
    : origin
  const reachAu = camera.reachAu
  const perAu = PLATE / reachAu
  const to = (x: number, y: number): [number, number] => [
    CENTRE + (x - at.x) * perAu,
    CENTRE - (y - at.y) * perAu,
  ]
  return {
    kind: 'close',
    to,
    // The inverse, for gestures: a pinch has to hold whatever is under the
    // fingers still, which means turning plate coordinates back into AU.
    from: (px, py) => ({ x: at.x + (px - CENTRE) / perAu, y: at.y - (py - CENTRE) / perAu }),
    sun: to(0, 0),
    orbitR: (au) => au * perAu,
    reachAu,
    perAu,
  }
}

/** Is this plate position inside the drawn circle? */
function onPlateAt(x: number, y: number, inset = 0): boolean {
  return Math.hypot(x - CENTRE, y - CENTRE) <= PLATE - inset
}

/**
 * Pinch, drag and wheel on the plate. Design doc §5.1, §8.1.
 *
 * Four fixed scales were a scale *picker*, and a chart is not a thing you pick
 * a scale for — it is a thing you lean into. This is the gesture set anybody
 * who has used a maps app already knows: one finger drags, two pinch about the
 * point between them, a wheel notch steps, and a double tap goes in.
 *
 * Two details that are the whole difference between this feeling right and
 * feeling broken. The point under the fingers **stays under the fingers**,
 * which means converting plate coordinates back into AU before rescaling
 * rather than scaling about the middle of the plate. And `touch-action: none`
 * on the SVG, without which the browser claims the gesture and pans the page
 * instead — the chart would simply appear not to respond.
 */
function useGestures(
  setCamera: (next: (prev: Camera) => Camera) => void,
  chart: ChartView,
) {
  const svg = useRef<SVGSVGElement | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ span: number; reachAu: number } | null>(null)

  /** Client coordinates to the plate's own units. */
  const toPlate = (clientX: number, clientY: number) => {
    const box = svg.current?.getBoundingClientRect()
    if (!box || box.width === 0) return { x: CENTRE, y: CENTRE }
    const scale = SIZE / box.width
    return { x: (clientX - box.left) * scale, y: (clientY - box.top) * scale }
  }

  /**
   * Rescale about a plate point, keeping whatever is under it still.
   *
   * Every gesture is applied against the **latest** camera rather than the one
   * this render closed over. Wheel notches and pinch moves arrive faster than
   * React re-renders, and reading `view` from the closure quietly threw all
   * but the first of them away: thirty notches moved the scale about as far as
   * two, which reads as a chart that is ignoring you.
   */
  const zoomAbout = (plateX: number, plateY: number, next: (fromReach: number) => number) => {
    setCamera((prev) => {
      const was = viewFor(prev, chart)
      // Coming off the map there is no linear scale yet to step from.
      const base = was.kind === 'system' ? REACH.start : was.reachAu
      const reachAu = Math.min(REACH.max, Math.max(REACH.min, next(base)))
      // Where the gesture is pointing, in AU, before anything moves.
      const anchor = was.from(plateX, plateY)
      const perAu = PLATE / reachAu
      // Choose the centre that puts that same AU point back under the gesture.
      return {
        mode: 'close',
        reachAu,
        centreFrame: was.kind === 'local' ? 'body' : 'sun',
        centre: {
          x: anchor.x - (plateX - CENTRE) / perAu,
          y: anchor.y + (plateY - CENTRE) / perAu,
        },
      }
    })
  }

  const spanOf = () => {
    const [a, b] = [...pointers.current.values()]
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
  }
  const midOf = () => {
    const [a, b] = [...pointers.current.values()]
    return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : { x: CENTRE, y: CENTRE }
  }

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    // Capture is an optimisation -- it keeps a drag alive when the finger
    // leaves the plate -- and it is allowed to fail: a pointer can be gone by
    // the time the handler runs, and an uncaught throw here would take the
    // whole gesture with it rather than degrading to an ordinary drag.
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* the drag still works, it just stops at the edge of the plate */
    }
    pointers.current.set(e.pointerId, toPlate(e.clientX, e.clientY))
    if (pointers.current.size === 2) pinch.current = { span: spanOf(), reachAu: 0 }
  }

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const was = pointers.current.get(e.pointerId)
    if (!was) return
    const now = toPlate(e.clientX, e.clientY)
    pointers.current.set(e.pointerId, now)

    if (pointers.current.size >= 2 && pinch.current) {
      const span = spanOf()
      const from = pinch.current.span
      if (span > 4 && from > 4) {
        const mid = midOf()
        // Relative to the span since the last move, so the gesture keeps
        // compounding the way a maps app does.
        pinch.current = { span, reachAu: 0 }
        zoomAbout(mid.x, mid.y, (r) => (r * from) / span)
      }
      return
    }

    // One finger: drag. A map view is dragged into the close one, because
    // grabbing a chart and having it refuse to move is the wrong answer to a
    // gesture that plainly means "move".
    const by = { x: now.x - was.x, y: now.y - was.y }
    setCamera((prev) => {
      const had = viewFor(prev, chart)
      const reachAu = had.kind === 'system' ? REACH.start : had.reachAu
      const perAu = PLATE / reachAu
      const at = had.kind === 'system' ? { x: chart.ship.x, y: chart.ship.y } : had.from(CENTRE, CENTRE)
      return {
        mode: 'close',
        reachAu,
        centreFrame: had.kind === 'local' ? 'body' : 'sun',
        centre: { x: at.x - by.x / perAu, y: at.y + by.y / perAu },
      }
    })
  }

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
  }

  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    const at = toPlate(e.clientX, e.clientY)
    zoomAbout(at.x, at.y, (r) => (e.deltaY > 0 ? r * ZOOM_STEP : r / ZOOM_STEP))
  }

  const onDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const at = toPlate(e.clientX, e.clientY)
    zoomAbout(at.x, at.y, (r) => r / 2)
  }

  return {
    ref: svg,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onWheel,
      onDoubleClick,
    },
    zoomAbout,
  }
}

export function StarChart({ chart }: { chart: ChartView }) {
  const { extentAu, ship } = chart
  // Starts where it always was. The map is the right first view; the close one
  // is what you lean into when the map is too small to answer the question.
  const [camera, setCamera] = useState<Camera>({
    mode: 'map',
    reachAu: REACH.start,
    centre: null,
    centreFrame: 'sun',
  })
  const view = viewFor(camera, chart)
  const isLocal = view.kind === 'local'
  const local = isLocal ? chart.local : undefined
  const close = view.kind !== 'system'
  const { ref: svgRef, handlers, zoomAbout } = useGestures(setCamera, chart)
  const [shipX, shipY] = local ? view.to(local.ship.x, local.ship.y) : view.to(ship.x, ship.y)

  // Below a hundredth of an AU the ruler is better read in kilometres.
  const inKm = close && view.reachAu < 0.01

  // Far enough off the ship that "centre on her" is worth offering.
  const adrift =
    close &&
    camera.centre !== null &&
    Math.hypot(shipX - CENTRE, shipY - CENTRE) > PLATE * 0.25

  // The arc split at the ship. What is behind her is history and what is ahead
  // is a commitment, and drawing them the same made the most useful thing on
  // the plate -- how much of this is left -- something to estimate by eye.
  const arc = local ? local.track : chart.track
  const cut = Math.round((ship.fractionComplete ?? 0) * (arc.length - 1))
  const flownPath = pathFor(arc.slice(0, cut + 1), view)
  const aheadPath = pathFor(arc.slice(Math.max(0, cut)), view)

  // The needle's bearing is taken *through the projection*, by stepping a short
  // way along the true velocity and projecting both ends. The square-root
  // radial scale bends direction as well as distance, so a needle drawn at the
  // true bearing sits visibly off the arc it is supposed to be tangent to. The
  // honest angle is still stated as a number in the readout below; on the plate
  // the arrow has to agree with the plate. (In a close view the two coincide,
  // which is rather the point of a close view.)
  const step = 0.004 * view.reachAu
  const [aheadX, aheadY] = view.to(ship.x + ship.heading.x * step, ship.y + ship.heading.y * step)
  const headingDeg = (Math.atan2(aheadY - shipY, aheadX - shipX) * 180) / Math.PI
  const needle = 10 + 16 * Math.min(1.6, ship.speedMs / REFERENCE_SPEED_MS)

  // Which worlds land on the plate, and which have to be pointed at instead.
  const placed = chart.bodies.map((b) => {
    const [x, y] = view.to(b.x, b.y)
    return { body: b, x, y, on: onPlateAt(x, y, 2) }
  })

  return (
    <section className="panel" aria-label="Star chart">
      <h2 className="panel__title">Chart</h2>

      <Controls
        camera={camera}
        view={view}
        adrift={adrift}
        extentAu={extentAu}
        onStep={(factor) => zoomAbout(CENTRE, CENTRE, (r) => r * factor)}
        onMap={() => setCamera({ ...camera, mode: 'map' })}
        // Straight to her wherever the camera has wandered, keeping whatever
        // scale is already in force -- unless it is the system plate, which
        // has no linear scale to keep.
        onFollow={() =>
          setCamera({
            mode: 'close',
            reachAu: camera.mode === 'map' ? REACH.start : camera.reachAu,
            centre: null,
            centreFrame: 'sun',
          })
        }
      />

      <svg
        ref={svgRef}
        className={`chart ${close ? 'is-grabbable' : ''}`}
        viewBox={`0 0 ${SIZE} ${SIZE + FOOT}`}
        role="img"
        aria-label={describe(chart)}
        {...handlers}
      >
        <defs>
          {/* The sun's glare, and the light that decides which limb of a world
              is lit. One gradient for the star, one mask per body would be
              extravagant -- a half-disc rotated to face the sun does the same
              job for two elements. */}
          <radialGradient id="chart-sun-glare">
            <stop offset="0" className="sun-core" />
            <stop offset="1" className="sun-edge" />
          </radialGradient>
          <marker
            id="chart-arrow"
            markerWidth="5"
            markerHeight="5"
            refX="4"
            refY="2.5"
            orient="auto"
          >
            <path className="chart__arrowhead" d="M0 0 L5 2.5 L0 5 Z" />
          </marker>
          {/* An orbit seen from close up is a circle hundreds of plate-widths
              across. Clipping is what lets the same code draw it in both
              views rather than special-casing the near one. */}
          <clipPath id="chart-plate">
            <circle cx={CENTRE} cy={CENTRE} r={PLATE} />
          </clipPath>
        </defs>

        {/* Longitude. Thirty-degree spokes and a rim, so a bearing can be read
            off the plate rather than taken on trust from the readout. Only on
            the system plate: spokes from a sun that is eight plate-widths off
            the edge are a line, not a bearing. */}
        <g className="chart__graticule">
          <circle className="chart__rim" cx={CENTRE} cy={CENTRE} r={PLATE} />
          {!close &&
            Array.from({ length: 360 / GRATICULE_STEP_DEG }, (_, i) => {
              const deg = i * GRATICULE_STEP_DEG
              const [x, y] = onPlate(deg, PLATE)
              const cardinal = deg % 90 === 0
              const [lx, ly] = onPlate(deg, PLATE + 9)
              return (
                <g key={deg} className={cardinal ? 'is-cardinal' : ''}>
                  <line x1={CENTRE} y1={CENTRE} x2={x} y2={y} />
                  {/* Every thirty degrees, the way an orrery's tick ring is
                      marked -- twelve is the count that makes a bearing
                      readable off the plate instead of estimated between two
                      quadrant marks. */}
                  <text x={lx} y={ly + 2.5} textAnchor="middle">
                    {deg}°
                  </text>
                </g>
              )
            })}
          {/* The zero point, named. Ecliptic longitude is measured from the
              First Point of Aries, and a chart that says "0°" without saying
              zero *of what* is quoting a coordinate it has not defined. */}
          {!close && <Equinox />}
        </g>

        {/* Close up, a square grid instead: evenly spaced because the scale
            *is* even, which is the whole difference between the two views. */}
        {close && <Grid view={view} />}

        {/* The world's own frame: the planet to scale, and a ring for each
            berth around it. Everything heliocentric is off in here -- the sun
            is a hundred thousand plate-widths away and its orbits are
            straight lines. */}
        {local && <LocalFrame local={local} view={view} />}

        {/* Orbits, innermost first, with the direction everything travels. */}
        <g clipPath="url(#chart-plate)">
          {!isLocal &&
            chart.bodies.map((b) => (
              <circle
                key={b.id}
                className="chart__orbit"
                cx={view.sun[0]}
                cy={view.sun[1]}
                r={view.orbitR(b.orbitRadiusAu)}
              />
            ))}
        </g>

        {/* Where each world will be in a season. A body is a moving target and
            the arc has to be aimed at where it is going, not where it is. */}
        <g clipPath="url(#chart-plate)">
          {!isLocal &&
            placed.map(({ body: b, on }) => {
            const [x, y] = view.to(b.x, b.y)
            const [lx, ly] = view.to(b.lead.x, b.lead.y)
            // Both ends have to land on the plate. An arc with one end twelve
            // plate-widths away crosses the whole drawing edge to edge, which
            // reads as a route between two places rather than as one world's
            // own ninety days of travel -- and close up, where ninety days is
            // most of a lap, that is nearly always what it would draw.
            if (!on || !onPlateAt(lx, ly)) return null
            const r = view.orbitR(b.orbitRadiusAu)
            // Along the orbit rather than a chord, so it reads as travel.
            const sweep = b.lead.x * b.y - b.lead.y * b.x > 0 ? 0 : 1
              return (
                <g
                  key={b.id}
                  className={`chart__lead chart__lead--${WORLD[b.id]?.tone ?? 'ceres'}`}
                >
                  <path d={`M${x} ${y} A ${r} ${r} 0 0 ${sweep} ${lx} ${ly}`} />
                  <circle cx={lx} cy={ly} r="1.6" />
                </g>
              )
            })}
        </g>

        {/* The star, where it actually falls. Close up it is usually off the
            plate, and a sunward arrow says which way rather than drawing a
            sun in the wrong place. */}
        {isLocal ? null : onPlateAt(view.sun[0], view.sun[1]) ? (
          <>
            <circle
              className="chart__glare"
              cx={view.sun[0]}
              cy={view.sun[1]}
              r="13"
              fill="url(#chart-sun-glare)"
            />
            <circle className="chart__sun" cx={view.sun[0]} cy={view.sun[1]} r="4.5" />
          </>
        ) : (
          <Sunward view={view} />
        )}

        {/* The transfer arc, cut at the ship: flown behind, committed ahead.
            Clipped, because a Mars ellipse seen from a tenth of an AU runs off
            the plate and straight across the ruler underneath it. */}
        {arc.length > 0 && (
          <g className="chart__arc" clipPath="url(#chart-plate)">
            <path className="chart__track chart__track--flown" d={flownPath} />
            <path className="chart__track chart__track--ahead" d={aheadPath} />
          </g>
        )}

        {/* Where the arc ends. The arrival burn happens here, on the target's
            orbit, and it is the one point of the course the player can plan
            against. */}
        {ship.intercept && onPlateAt(...view.to(ship.intercept.x, ship.intercept.y), 6) && (
          <g className="chart__intercept">
            {(() => {
              const [x, y] = view.to(ship.intercept.x, ship.intercept.y)
              return (
                <>
                  <circle cx={x} cy={y} r="4" />
                  <line x1={x - 6} y1={y} x2={x + 6} y2={y} />
                  <line x1={x} y1={y - 6} x2={x} y2={y + 6} />
                  <text x={x} y={y - 9} textAnchor="middle">
                    arrival
                  </text>
                </>
              )
            })()}
          </g>
        )}

        {placed.map(({ body: b, x, y, on }) => {
          if (!on || isLocal) return null
          const mark = WORLD[b.id] ?? { r: 3.5, tone: 'ceres' }
          const here = chart.ship.atPortId
            ? b.ports.some((p) => p.id === chart.ship.atPortId)
            : b.id === chart.ship.toBodyId
          // The lit limb faces the sun -- wherever the sun has landed, which
          // in a close view is usually off the edge of the plate.
          const toSun = (Math.atan2(view.sun[1] - y, view.sun[0] - x) * 180) / Math.PI

          return (
            <g
              key={b.id}
              className={`chart__body chart__body--${mark.tone} ${here ? 'is-current' : ''}`}
            >
              {mark.ring && <circle className="chart__halo" cx={x} cy={y} r={mark.r + 3.5} />}
              <circle className="chart__disc" cx={x} cy={y} r={mark.r} />
              {/* Day side. A world lit from the star it orbits is the cheapest
                  thing on the plate that makes it read as a place. */}
              <path
                className="chart__lit"
                transform={`translate(${x} ${y}) rotate(${toSun})`}
                d={`M0 ${-mark.r} A ${mark.r} ${mark.r} 0 0 0 0 ${mark.r} Z`}
              />
              <text className="chart__name" x={x} y={y - mark.r - 5} textAnchor="middle">
                {b.name}
              </text>
              {/* The number the whole moving-planets design exists to produce. */}
              <text className="chart__range" x={x} y={y + mark.r + 9} textAnchor="middle">
                {distance(b.distanceAu)}
              </text>
              {b.ports.length > 0 && (
                <text className="chart__ports" x={x} y={y + mark.r + 17} textAnchor="middle">
                  {b.ports
                    .map((p) => (p.moon ? `${p.name.split(' ')[0]} (${p.moon})` : p.name.split(' ')[0]))
                    .join(' · ')}
                </text>
              )}
            </g>
          )
        })}

        {/* Somewhere off the edge. A close view that simply loses Mars is
            worse than the wide one it replaced, so what will not fit is
            pointed at, named, and given its range. */}
        {placed
          .filter((p) => !p.on && !isLocal)
          .map((p) => (
            <Offplate key={p.body.id} body={p.body} x={p.x} y={p.y} />
          ))}

        {/* The ship, turned to her heading, with a needle whose length is her
            speed. The glyph used to point up whatever she was doing. */}
        <g className={`chart__ship ${ship.atPortId ? 'is-berthed' : 'is-under-way'}`}>
          <circle className="chart__ship-halo" cx={shipX} cy={shipY} r="9" />
          <g
            className="chart__velocity"
            transform={`translate(${shipX} ${shipY}) rotate(${headingDeg})`}
          >
            <line x1="9" y1="0" x2={needle} y2="0" markerEnd="url(#chart-arrow)" />
          </g>
          <path
            className="chart__ship-mark"
            transform={`translate(${shipX} ${shipY}) rotate(${headingDeg + 90})`}
            d="M0 -5.5 L4 4 L0 1.5 L-4 4 Z"
          />
        </g>

        {/* The ruler, drawn to whichever scale is in force. On the system
            plate the ticks crowd toward the rim, and that crowding *is* the
            square root; switch to a close view and the same ruler comes out
            evenly spaced, which is the difference stated rather than claimed. */}
        <g className="chart__ruler" transform={`translate(0 ${SIZE + 4})`}>
          <line x1={CENTRE} y1="0" x2={CENTRE + PLATE} y2="0" />
          {(close ? closeTicks(view.reachAu) : ticksFor(extentAu)).map((au) => {
            const x = CENTRE + view.orbitR(au)
            return (
              <g key={au}>
                <line x1={x} y1="-2.5" x2={x} y2="2.5" />
                <text x={x} y="9" textAnchor="middle">
                  {inKm ? Math.round(au * 149597.871).toLocaleString() : au}
                </text>
              </g>
            )
          })}
          {/* Once the plate is measuring the gap between two berths, "0.002 AU"
              is a number nobody can hold. Kilometres are what that distance is
              quoted in everywhere else in the game. */}
          <text className="chart__ruler-unit" x={CENTRE - 4} y="9" textAnchor="end">
            {inKm ? '1000 km' : 'AU'}
          </text>
        </g>
      </svg>

      <p className="chart__caption">{describe(chart)}</p>

      {/* The ship first: where she is, then how fast and where to. Both are
          about her, so they sit together rather than with a table of
          everything else between them. */}
      <Coordinates chart={chart} />
      <Telemetry chart={chart} />

      {/* Then everything else, in figures. The plate answers "roughly where,
          relative to what"; nobody can read three decimal places off a
          drawing, and a crossing is planned in decimals. */}
      <Positions chart={chart} />

      {/* When it is worth going. §5.1 calls launch windows real gameplay; the
          maths for them shipped in M2 and nothing had ever shown it. */}
      {chart.windows.length > 0 && <Windows windows={chart.windows} />}

      <p className="panel__note">
        {isLocal && local ? (
          <>
            Close in on <strong>{local.bodyName}</strong>, drawn to a true, even scale — the
            planet is the same size as the orbits around it, which is why Gateway's ring sits
            almost against its limb and Tranquillity's is fifty-seven times further out. The
            angles between things here are the transfer's own: the sim does not track where
            Luna is in its month, and inventing a bearing would be a number you could check
            and find made up.
          </>
        ) : close ? (
          <>
            Drawn to a <strong>true, even scale</strong> — a millimetre is a millimetre
            wherever it falls, and the ruler's evenly spaced ticks say so. The grid is{' '}
            {span(stepFor(view.reachAu))} square. Pinch or scroll to change the scale,
            drag to move about; anything that will not fit is pointed at from the rim with
            its range.
          </>
        ) : (
          <>
            Top-down from ecliptic north, sun at the centre, <strong>ecliptic longitude
            measured anticlockwise from ♈</strong> — the First Point of Aries — which is the
            frame real solar-system work is quoted in. Radius is drawn on a square-root scale
            so the inner system and the Belt are legible on one plate: angles and relative
            order are true, absolute distances are compressed, and the ruler is drawn to the
            same scale so you can see by how much.
          </>
        )}{' '}
        The faint arc off each world is where it will be in {chart.leadDays} days; the needle
        off the ship is her heading, drawn longer the faster she is going.
      </p>
    </section>
  )
}

/** Evenly spaced ticks out to the plate's edge, close up. */
function closeTicks(reachAu: number): number[] {
  const step = stepFor(reachAu)
  const out: number[] = []
  for (let au = step; au <= reachAu * 1.001; au += step) out.push(Number(au.toFixed(4)))
  return out
}

/**
 * The controls beside the gesture. Design doc §5.1, §8.1.
 *
 * A pinch is the primary way in, and it is also invisible, unavailable to a
 * mouse and unavailable to anybody driving by keyboard. So the same three
 * moves are here as buttons: closer, wider, and back to the map. They also
 * give the plate somewhere to *say what scale it is at*, which a continuous
 * zoom needs far more than a set of fixed stops did — with four buttons the
 * scale was the label on the pressed one.
 */
function Controls({
  camera,
  view,
  adrift,
  extentAu,
  onStep,
  onMap,
  onFollow,
}: {
  camera: Camera
  view: View
  adrift: boolean
  extentAu: number
  onStep: (factor: number) => void
  onMap: () => void
  onFollow: () => void
}) {
  // Anything that is not the square-root map is a scale you can state.
  const close = view.kind !== 'system'
  const across = view.reachAu * 2

  return (
    <div className="zoomer" role="group" aria-label="Chart scale">
      <button
        type="button"
        className="zoomer__btn zoomer__btn--step"
        aria-label="Zoom out"
        disabled={close && view.reachAu >= REACH.max - 1e-9}
        onClick={() => onStep(ZOOM_STEP)}
      >
        −
      </button>

      <span className="zoomer__scale" aria-live="polite">
        {close ? `${span(across)} across` : `system · ${span(extentAu * 2)}`}
      </span>

      <button
        type="button"
        className="zoomer__btn zoomer__btn--step"
        aria-label="Zoom in"
        disabled={close && view.reachAu <= REACH.min + 1e-9}
        onClick={() => onStep(1 / ZOOM_STEP)}
      >
        +
      </button>

      {/* All the way out. It was labelled "Map", which named the projection
          rather than what pressing it does -- and what a player wants from it
          is not a square-root scale, it is the whole solar system on one
          plate. Kept as a place to return to rather than a stop on the scale:
          a different projection is not a different magnification, and pinching
          your way into it would be a lie about what the gesture does. */}
      <button
        type="button"
        className={`zoomer__btn ${camera.mode === 'map' ? 'is-on' : ''}`}
        aria-pressed={camera.mode === 'map'}
        title="The whole system on one plate"
        onClick={onMap}
      >
        System
      </button>

      {/*
        Find the ship, from anywhere.

        A crosshair, because every maps application on a phone has taught that
        this button means "put me back in the middle" -- and it is the one
        control a chart you can drag off the edge of genuinely needs. Always
        there rather than only once she is lost: a control that appears when
        you are already in trouble is one you have to notice mid-problem, and
        from the system plate it is also the fastest way in to her.
      */}
      <button
        type="button"
        className={`zoomer__btn zoomer__btn--locate ${adrift ? 'is-wanted' : ''}`}
        aria-label="Centre on the ship"
        title="Centre on the ship"
        onClick={onFollow}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="6.5" />
          <circle className="locate__dot" cx="12" cy="12" r="2.4" />
          <line x1="12" y1="1.5" x2="12" y2="5" />
          <line x1="12" y1="19" x2="12" y2="22.5" />
          <line x1="1.5" y1="12" x2="5" y2="12" />
          <line x1="19" y1="12" x2="22.5" y2="12" />
        </svg>
      </button>
    </div>
  )
}

/**
 * The world's own neighbourhood. Design doc §5.1, §5.2.
 *
 * Gateway to Tranquillity is 0.0026 AU, so on every heliocentric plate the two
 * berths and the ship are one dot — the chart pinned her at Earth and let her
 * sit there for five days while the mission board's route strip showed her
 * crossing the whole time. The instrument meant to be the truthful one was the
 * one that looked broken.
 *
 * The planet is drawn to the *same scale* as the rings around it, which is the
 * whole point: Earth's limb comes up almost to Gateway's orbit, and that is
 * the honest picture of how low a low orbit is. Luna's ring is fifty-seven
 * times further out, which is the entire reason the hop costs five days and
 * 3.91 km/s.
 */
function LocalFrame({ local, view }: { local: ChartLocal; view: View }) {
  const [cx, cy] = view.to(0, 0)
  const bodyR = view.orbitR(local.bodyRadiusAu)

  return (
    <g className="chart__local" clipPath="url(#chart-plate)">
      <circle
        className={`chart__local-body chart__local-body--${WORLD[local.bodyId]?.tone ?? 'ceres'}`}
        cx={cx}
        cy={cy}
        r={bodyR}
      />
      {local.ports.map((p) => {
        const [px, py] = view.to(p.at.x, p.at.y)
        return (
          <g key={p.id} className="chart__local-port">
            <circle
              className="chart__orbit"
              cx={cx}
              cy={cy}
              r={view.orbitR(p.orbitRadiusAu)}
            />
            <circle className="chart__local-berth" cx={px} cy={py} r="2.6" />
            {/* Set outward from the body, along the berth's own side. Two
                rings that share a centre put their labels on top of each other
                if both are pulled toward the middle -- and outward is where the
                empty space is. */}
            <text
              x={px + (px < cx ? -5 : 5)}
              y={py - 6}
              textAnchor={px < cx ? 'end' : 'start'}
            >
              {p.moon ? `${p.name.split(' ')[0]} (${p.moon})` : p.name.split(' ')[0]}
            </text>
          </g>
        )
      })}
      <text className="chart__local-name" x={cx} y={cy + bodyR + 11} textAnchor="middle">
        {local.bodyName}
      </text>
    </g>
  )
}

/**
 * The First Point of Aries, marked on the rim. Design doc §5.1.
 *
 * Real heliocentric ecliptic coordinates are measured from the vernal equinox
 * — the direction from the Earth to the Sun at the March equinox — with
 * longitude running anticlockwise seen from ecliptic north, which is exactly
 * how this plate was already drawn. So the convention costs nothing to adopt
 * and buys the difference between an angle and a **coordinate**: 149° now
 * means the same thing here as it does in an ephemeris, rather than meaning
 * "anticlockwise from whichever spoke we happened to draw first".
 *
 * ♈ is a direction marker, which is where astronomical symbols are still
 * standard practice. They are deliberately *not* used for the worlds: the IAU
 * discourages planetary symbols in modern work and proposes letter
 * abbreviations for tables, and "Mars" is in any case a better label than ♂
 * for anybody who has not memorised the set.
 */
function Equinox() {
  const [x, y] = onPlate(0, PLATE)
  const [tx, ty] = onPlate(0, PLATE + 9)
  return (
    <g className="chart__equinox">
      <line x1={x - 9} y1={y} x2={x + 5} y2={y} />
      <path d={`M${x + 5} ${y} l-4 -2.6 v5.2 Z`} />
      <text x={tx} y={ty - 7} textAnchor="middle">
        ♈
      </text>
    </g>
  )
}

/** A square grid at a round spacing, for the close views. */
function Grid({ view }: { view: View }) {
  const step = stepFor(view.reachAu)
  const perStep = step * view.perAu
  // Anchored to the sun, not to the ship, so the lines stay put as she moves
  // through them rather than travelling with her and showing nothing.
  const offset = (dim: 0 | 1) => {
    const origin = view.sun[dim]
    return origin - Math.ceil((origin - (CENTRE - PLATE)) / perStep) * perStep
  }
  const lines = (dim: 0 | 1) => {
    const out: number[] = []
    for (let v = offset(dim); v <= CENTRE + PLATE; v += perStep) out.push(v)
    return out
  }

  return (
    <g className="chart__grid" clipPath="url(#chart-plate)">
      {lines(0).map((x) => (
        <line key={`v${x.toFixed(1)}`} x1={x} y1={CENTRE - PLATE} x2={x} y2={CENTRE + PLATE} />
      ))}
      {lines(1).map((y) => (
        <line key={`h${y.toFixed(1)}`} x1={CENTRE - PLATE} y1={y} x2={CENTRE + PLATE} y2={y} />
      ))}
    </g>
  )
}

/**
 * Which way the sun is, when it is off the plate.
 *
 * The label is placed in *screen* space rather than inside the chevron's
 * rotation. Rotating a label with its arrow and then counter-rotating it puts
 * it on whichever side the rotation happens to leave it -- which, with the sun
 * off to the left, was directly on top of the arrowhead.
 */
function Sunward({ view }: { view: View }) {
  const angle = Math.atan2(view.sun[1] - CENTRE, view.sun[0] - CENTRE)
  const deg = (angle * 180) / Math.PI
  const [x, y] = [CENTRE + Math.cos(angle) * (PLATE - 6), CENTRE + Math.sin(angle) * (PLATE - 6)]
  // Outside the rim, where nothing else is drawn in a close view -- the
  // chevron fills the ring from the edge inward, so a label set back along the
  // same bearing lands on top of it whichever way the sun happens to be.
  const lx = CENTRE + Math.cos(angle) * (PLATE + 11)
  const ly = CENTRE + Math.sin(angle) * (PLATE + 11)
  return (
    <g className="chart__sunward">
      <path transform={`translate(${x} ${y}) rotate(${deg})`} d="M0 0 L-9 -4 L-9 4 Z" />
      <text x={lx} y={ly + 3} textAnchor="middle">
        sun
      </text>
    </g>
  )
}

/**
 * A world that will not fit, pointed at from the rim.
 *
 * A close view that simply loses Mars is worse than the wide one it replaced.
 * The chevron sits on the edge in the world's true direction and carries its
 * range, so "not on this plate" still answers where and how far.
 */
function Offplate({ body, x, y }: { body: ChartBody; x: number; y: number }) {
  const angle = Math.atan2(y - CENTRE, x - CENTRE)
  const deg = (angle * 180) / Math.PI
  const px = CENTRE + Math.cos(angle) * (PLATE - 4)
  const py = CENTRE + Math.sin(angle) * (PLATE - 4)
  // Labels ride just inside the rim, upright, on whichever side keeps them on
  // the plate.
  const lx = CENTRE + Math.cos(angle) * (PLATE - 14)
  const ly = CENTRE + Math.sin(angle) * (PLATE - 14)
  const anchor = Math.cos(angle) > 0.3 ? 'end' : Math.cos(angle) < -0.3 ? 'start' : 'middle'

  return (
    <g className={`chart__offplate chart__offplate--${WORLD[body.id]?.tone ?? 'ceres'}`}>
      <path transform={`translate(${px} ${py}) rotate(${deg})`} d="M0 0 L-7 -3.5 L-7 3.5 Z" />
      <text x={lx} y={ly} textAnchor={anchor}>
        {body.name}
      </text>
      <text className="chart__offplate-range" x={lx} y={ly + 8} textAnchor={anchor}>
        {distance(body.distanceAu)}
      </text>
    </g>
  )
}

/**
 * An angle the way an ephemeris prints one: degrees, arcminutes, arcseconds.
 *
 * The sexagesimal form is what the Astronomical Almanac and every ephemeris
 * after it quote, and it is why "18 arcminutes" is a phrase at all. Kept
 * beside the decimal rather than instead of it — the decimal is what a player
 * compares against another number on the same screen.
 */
function sexagesimal(deg: number): string {
  const total = ((deg % 360) + 360) % 360
  const d = Math.floor(total)
  const minutes = (total - d) * 60
  const m = Math.floor(minutes)
  const arcsec = Math.round((minutes - m) * 60)
  // Rounding 59.6" up has to carry, or the chart prints 60".
  const [dd, mm, ss] = arcsec === 60 ? [d, m + 1, 0] : [d, m, arcsec]
  return mm === 60 ? `${dd + 1}° 00′ 00″` : `${dd}° ${String(mm).padStart(2, '0')}′ ${String(ss).padStart(2, '0')}″`
}

/**
 * The ship's position as a set of coordinates. Design doc §5.1, §1 pillar 2.
 *
 * Real solar-system work quotes a heliocentric ecliptic triple — longitude λ,
 * latitude β, radius vector r — measured from the First Point of Aries, and
 * JPL's vector tables give the same position as Cartesian x, y, z in AU. Both
 * are here because they answer different questions: λ and r are what you plan
 * a transfer with, x and y are what the plate is literally drawn from.
 *
 * **β is always zero, and saying so is the point.** The sim is coplanar by
 * design (§5.1: "what this does not model: inclination"), so a latitude row
 * that always reads 0.000° is not padding — it is the model stating its own
 * simplification in the one place a player would otherwise assume it had been
 * handled.
 */
function Coordinates({ chart }: { chart: ChartView }) {
  const { ship } = chart
  const rows = [
    {
      symbol: 'λ',
      name: 'Ecliptic longitude',
      value: `${ship.longitudeDeg.toFixed(3)}°`,
      detail: `${sexagesimal(ship.longitudeDeg)} from ♈`,
    },
    {
      symbol: 'β',
      name: 'Ecliptic latitude',
      value: '0.000°',
      detail: 'coplanar model — nothing in this system leaves the ecliptic',
    },
    {
      symbol: 'r',
      name: 'Radius vector',
      value: `${ship.radiusAu.toFixed(5)} AU`,
      detail: `${(ship.radiusAu * 149.598).toFixed(2)} million km from the sun`,
    },
    {
      symbol: 'x',
      name: 'Toward the equinox',
      value: `${ship.x >= 0 ? '+' : '−'}${Math.abs(ship.x).toFixed(5)} AU`,
    },
    {
      symbol: 'y',
      name: 'A quarter turn ahead of it',
      value: `${ship.y >= 0 ? '+' : '−'}${Math.abs(ship.y).toFixed(5)} AU`,
    },
  ]

  return (
    <div className="coords">
      <h3 className="coords__title">
        Ship — heliocentric ecliptic <span className="coords__epoch">of date</span>
      </h3>
      <dl className="coords__list">
        {rows.map((r) => (
          <div key={r.symbol} className="coords__row">
            <dt className="coords__symbol" title={r.name}>
              {r.symbol}
            </dt>
            <dd className="coords__value">
              {r.value}
              <span className="coords__name">{r.name}</span>
              {r.detail && <span className="coords__detail">{r.detail}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/**
 * Where everything is, to three decimals. Design doc §5.1, §1 pillar 2.
 *
 * The plate answers "roughly where, relative to what". It cannot answer "how
 * far, exactly" -- nobody reads three decimal places off a drawing, and a
 * crossing is planned in decimals. Radius and longitude locate a place in the
 * heliocentric frame the chart is drawn in; range is the number the player
 * actually spends, measured from the ship rather than from the sun.
 */
function Positions({ chart }: { chart: ChartView }) {
  const rows = [
    {
      id: 'ship',
      name: chart.ship.atPortId ? 'Ship (alongside)' : 'Ship',
      radiusAu: chart.ship.radiusAu,
      longitudeDeg: chart.ship.longitudeDeg,
      rangeAu: 0,
      here: true,
      ports: '',
    },
    ...chart.bodies.map((b) => ({
      id: b.id,
      name: b.name,
      radiusAu: Math.hypot(b.x, b.y),
      longitudeDeg: longitudeOf(b.x, b.y),
      rangeAu: b.distanceAu,
      here: false,
      ports: b.ports.map((p) => p.name).join(', '),
    })),
  ]

  return (
    <table className="positions">
      <caption className="positions__caption">
        Heliocentric ecliptic, this instant — radius vector, longitude measured from ♈, and
        range from the ship.
      </caption>
      <thead>
        <tr>
          <th scope="col">Place</th>
          <th scope="col">Radius</th>
          <th scope="col">Long.</th>
          <th scope="col">Range</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className={r.here ? 'is-ship' : ''}>
            <th scope="row">
              {r.name}
              {r.ports && <span className="positions__ports">{r.ports}</span>}
            </th>
            <td>{r.radiusAu.toFixed(3)}</td>
            <td>{r.longitudeDeg.toFixed(1)}°</td>
            <td>{r.here ? '—' : distance(r.rangeAu)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * The numbers behind the picture. Design doc §5.1, §1 pillar 2.
 *
 * Grouped the way a navigator would ask for them — where, how fast, and where
 * to — rather than as a flat list of quantities. Every figure here is read
 * straight off the same `chartView` the plate is drawn from, so the arrow and
 * the number cannot drift apart.
 */
function Telemetry({ chart }: { chart: ChartView }) {
  const { ship } = chart
  const to = chart.bodies.find((b) => b.id === ship.toBodyId)
  const climb = (ship.flightPathAngleRad * 180) / Math.PI

  // Position lives in the coordinates block above, stated properly. Repeating
  // it here to three decimals while five sit an inch higher is the kind of
  // duplication a reader has to stop and reconcile.
  const rows: { label: string; value: string; detail?: string }[] = [
    {
      label: 'Velocity',
      value: `${(ship.speedMs / 1000).toFixed(2)} km/s`,
      // Sun-relative because that is the frame the plate is in — the same
      // reason a berthed ship reads 29.8 rather than nothing.
      detail: ship.atPortId
        ? 'with her berth, around the sun'
        : Math.abs(climb) < 0.05
          ? 'level — at an apsis of the transfer'
          : `${climb > 0 ? 'climbing' : 'falling'} ${Math.abs(climb).toFixed(1)}° off the horizontal`,
    },
  ]

  if (ship.atPortId) {
    rows.push({ label: 'Course', value: 'Alongside', detail: 'no transfer under way' })
  } else {
    // The berth, not the body: "Mars" and "Phobos Anchorage" are the same dot
    // at this scale, and only one of them is somewhere the ship can tie up.
    const flown = Math.round((ship.fractionComplete ?? 0) * 100)
    const eta =
      ship.daysToArrival === undefined
        ? undefined
        : ship.daysToArrival < 2
          ? `arrival burn in ${Math.round(ship.daysToArrival * 24)} h · ${flown}% flown`
          : `arrival burn in ${Math.round(ship.daysToArrival)} d · ${flown}% flown`
    rows.push({
      label: 'Course',
      value: ship.toPortName ?? to?.name ?? 'in transit',
      detail: ship.local ? `${eta ?? ''} · stays inside this system`.trim() : eta,
    })
  }

  if (ship.toGoAu !== undefined) {
    rows.push({
      label: 'To run',
      value: `${ship.toGoAu.toFixed(3)} AU`,
      detail: 'measured along the arc, not across it',
    })
  }

  if (ship.periapsisAu !== undefined && ship.apoapsisAu !== undefined) {
    rows.push({
      label: 'Transfer',
      value: `${ship.periapsisAu.toFixed(2)} — ${ship.apoapsisAu.toFixed(2)} AU`,
      detail: 'perihelion and aphelion of the ellipse she is on',
    })
  }

  return (
    <dl className="telemetry">
      {rows.map((r) => (
        <div key={r.label} className="telemetry__row">
          <dt className="telemetry__label">{r.label}</dt>
          <dd className="telemetry__value">
            {r.value}
            {r.detail && <span className="telemetry__detail">{r.detail}</span>}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * The window table. Design doc §5.1.
 *
 * Phase angle is the honest quantity and it is also meaningless to most people,
 * so the row leads with the decision — go now, or wait this long — and keeps
 * the angle as the supporting detail rather than the headline.
 */
function Windows({ windows }: { windows: ChartWindow[] }) {
  return (
    <div className="windows">
      <h3 className="windows__title">Launch windows</h3>
      <ul className="windows__list">
        {windows.map((w) => (
          <li key={w.toBodyId} className={`window ${w.open ? 'is-open' : ''}`}>
            <span className="window__to">{w.toName}</span>
            <span className="window__when">
              {w.open ? 'open now' : `opens in ${days(w.daysToWindow)}`}
            </span>
            <span className="window__detail">
              {w.open
                ? `geometry is within ${Math.abs(Math.round((w.offByRad * 180) / Math.PI))}° of ideal`
                : `${Math.abs(Math.round((w.offByRad * 180) / Math.PI))}° out · comes round every ${days(w.synodicDays)}`}
            </span>
          </li>
        ))}
      </ul>
      <p className="panel__note">
        A minimum-energy crossing has to leave when the target is in the right place to meet
        it — that is what makes waiting a real option rather than a delay. Flying outside a
        window is not forbidden; it just costs delta-v the astrogator will quote you.
      </p>
    </div>
  )
}

function describe(chart: ChartView): string {
  const { ship } = chart
  if (ship.atPortId) {
    const port = chart.bodies.flatMap((b) => b.ports).find((p) => p.id === ship.atPortId)
    return `Berthed at ${port?.name ?? 'port'}.`
  }
  const to = chart.bodies.find((b) => b.id === ship.toBodyId)
  const pct = Math.round((ship.fractionComplete ?? 0) * 100)
  if (ship.local) {
    // The berth, not the body. "Under way to Earth" is what the chart said for
    // five days of a Gateway-to-Luna hop, which is true of the dot and useless
    // about the errand.
    return `Under way to ${ship.toPortName ?? to?.name ?? 'port'} — ${pct}% of a crossing that stays inside ${to?.name ?? 'this'}'s neighbourhood.`
  }
  // The arc is the chosen profile's ellipse, not the minimum-energy one, so it
  // says which trajectory it is drawing rather than leaving the player to
  // wonder why this crossing bulges further than the last one did.
  const profile = ship.profileLabel ? ` on the ${ship.profileLabel.toLowerCase()} trajectory` : ''
  return `Under way to ${to?.name ?? 'port'}${profile} — ${pct}% of the transfer flown.`
}
