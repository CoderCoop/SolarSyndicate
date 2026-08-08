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
import type { ChartBody, ChartView, ChartWindow } from '@solsyn/sim'

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
const REACH = {
  /** Closest in: about three million kilometres across. */
  min: 0.01,
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
  kind: 'system' | 'close'
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
  // Linear: the view that answers "exactly where". Centred on the ship until
  // somebody drags it somewhere else.
  const at = camera.centre ?? { x: ship.x, y: ship.y }
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
  view: View,
  camera: Camera,
  setCamera: (next: Camera) => void,
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

  /** Rescale about a plate point, keeping whatever is under it still. */
  const zoomAbout = (plateX: number, plateY: number, nextReach: number) => {
    const reachAu = Math.min(REACH.max, Math.max(REACH.min, nextReach))
    // Where the gesture is pointing, in AU, before anything moves.
    const anchor = view.from(plateX, plateY)
    const perAu = PLATE / reachAu
    // Choose the centre that puts that same AU point back under the gesture.
    setCamera({
      mode: 'close',
      reachAu,
      centre: {
        x: anchor.x - (plateX - CENTRE) / perAu,
        y: anchor.y + (plateY - CENTRE) / perAu,
      },
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
    if (pointers.current.size === 2) pinch.current = { span: spanOf(), reachAu: view.reachAu }
  }

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const was = pointers.current.get(e.pointerId)
    if (!was) return
    const now = toPlate(e.clientX, e.clientY)
    pointers.current.set(e.pointerId, now)

    if (pointers.current.size >= 2 && pinch.current) {
      const span = spanOf()
      if (span > 4 && pinch.current.span > 4) {
        const mid = midOf()
        zoomAbout(mid.x, mid.y, (pinch.current.reachAu * pinch.current.span) / span)
      }
      return
    }

    // One finger: drag. A map view is dragged into the close one, because
    // grabbing a chart and having it refuse to move is the wrong answer to a
    // gesture that plainly means "move".
    const perAu = view.kind === 'close' ? view.perAu : PLATE / REACH.start
    const at = camera.centre ?? { x: chart.ship.x, y: chart.ship.y }
    setCamera({
      mode: 'close',
      reachAu: view.kind === 'close' ? view.reachAu : REACH.start,
      centre: { x: at.x - (now.x - was.x) / perAu, y: at.y + (now.y - was.y) / perAu },
    })
  }

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
  }

  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    const at = toPlate(e.clientX, e.clientY)
    const base = view.kind === 'close' ? view.reachAu : REACH.start
    zoomAbout(at.x, at.y, e.deltaY > 0 ? base * ZOOM_STEP : base / ZOOM_STEP)
  }

  const onDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const at = toPlate(e.clientX, e.clientY)
    zoomAbout(at.x, at.y, (view.kind === 'close' ? view.reachAu : REACH.start) / 2)
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
  })
  const view = viewFor(camera, chart)
  const close = view.kind === 'close'
  const { ref: svgRef, handlers, zoomAbout } = useGestures(view, camera, setCamera, chart)
  const [shipX, shipY] = view.to(ship.x, ship.y)

  // Far enough off the ship that "centre on her" is worth offering.
  const adrift =
    close &&
    camera.centre !== null &&
    Math.hypot(shipX - CENTRE, shipY - CENTRE) > PLATE * 0.25

  // The arc split at the ship. What is behind her is history and what is ahead
  // is a commitment, and drawing them the same made the most useful thing on
  // the plate -- how much of this is left -- something to estimate by eye.
  const cut = Math.round((ship.fractionComplete ?? 0) * (chart.track.length - 1))
  const flownPath = pathFor(chart.track.slice(0, cut + 1), view)
  const aheadPath = pathFor(chart.track.slice(Math.max(0, cut)), view)

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
        onStep={(factor) => zoomAbout(CENTRE, CENTRE, view.reachAu * factor)}
        onMap={() => setCamera({ ...camera, mode: 'map' })}
        onFollow={() => setCamera({ ...camera, mode: 'close', centre: null })}
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
                  {cardinal && (
                    <text x={lx} y={ly + 2.5} textAnchor="middle">
                      {deg}°
                    </text>
                  )}
                </g>
              )
            })}
        </g>

        {/* Close up, a square grid instead: evenly spaced because the scale
            *is* even, which is the whole difference between the two views. */}
        {close && <Grid view={view} />}

        {/* Orbits, innermost first, with the direction everything travels. */}
        <g clipPath="url(#chart-plate)">
          {chart.bodies.map((b) => (
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
          {placed.map(({ body: b, on }) => {
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
              <g key={b.id} className={`chart__lead chart__lead--${WORLD[b.id]?.tone ?? 'ceres'}`}>
                <path d={`M${x} ${y} A ${r} ${r} 0 0 ${sweep} ${lx} ${ly}`} />
                <circle cx={lx} cy={ly} r="1.6" />
              </g>
            )
          })}
        </g>

        {/* The star, where it actually falls. Close up it is usually off the
            plate, and a sunward arrow says which way rather than drawing a
            sun in the wrong place. */}
        {onPlateAt(view.sun[0], view.sun[1]) ? (
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
        {chart.track.length > 0 && (
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
          if (!on) return null
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
          .filter((p) => !p.on)
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
                  {au}
                </text>
              </g>
            )
          })}
          <text className="chart__ruler-unit" x={CENTRE - 4} y="9" textAnchor="end">
            AU
          </text>
        </g>
      </svg>

      <p className="chart__caption">{describe(chart)}</p>

      {/* Exactly where everything is, in figures. The plate answers "roughly
          where, relative to what"; nobody can read three decimal places off a
          drawing, and a crossing is planned in decimals. */}
      <Positions chart={chart} />

      {/* The figures behind the arrow. §1 pillar 2: the numbers are real, so
          they may as well be legible. */}
      <Telemetry chart={chart} />

      {/* When it is worth going. §5.1 calls launch windows real gameplay; the
          maths for them shipped in M2 and nothing had ever shown it. */}
      {chart.windows.length > 0 && <Windows windows={chart.windows} />}

      <p className="panel__note">
        {close ? (
          <>
            Drawn to a <strong>true, even scale</strong> — a millimetre is a millimetre
            wherever it falls, and the ruler's evenly spaced ticks say so. The grid is{' '}
            {distance(stepFor(view.reachAu))} square. Pinch or scroll to change the scale,
            drag to move about; anything that will not fit is pointed at from the rim with
            its range.
          </>
        ) : (
          <>
            Top-down, sun at the centre, longitude measured anticlockwise from the right-hand
            spoke. Radius is drawn on a square-root scale so the inner system and the Belt are
            legible on one plate — angles and relative order are true, absolute distances are
            compressed, and the ruler is drawn to the same scale so you can see by how much.
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
  const close = view.kind === 'close'
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
        {close ? `${distance(across)} across` : `map · ${distance(extentAu * 2)}`}
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

      {/* Back to the square-root plate. Kept as a place to return to rather
          than a fourth stop on the scale: it is a different projection, not a
          different magnification, and pinching your way to it would be a lie
          about what the gesture does. */}
      <button
        type="button"
        className={`zoomer__btn ${camera.mode === 'map' ? 'is-on' : ''}`}
        aria-pressed={camera.mode === 'map'}
        onClick={onMap}
      >
        Map
      </button>

      {/* Only once the ship has actually been left behind: a control that is
          always there is one more thing to read on a plate that is mostly
          numbers. */}
      {adrift && (
        <button type="button" className="zoomer__btn zoomer__btn--follow" onClick={onFollow}>
          Centre ship
        </button>
      )}
    </div>
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
        Heliocentric, this instant — radius from the sun, longitude, and range from the ship.
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

  const rows: { label: string; value: string; detail?: string }[] = [
    {
      label: 'Position',
      value: `${ship.radiusAu.toFixed(3)} AU`,
      detail: `${ship.longitudeDeg.toFixed(1)}° heliocentric longitude`,
    },
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
    return `Under way to ${to?.name ?? 'port'} — ${pct}% of a crossing that stays inside this system.`
  }
  // The arc is the chosen profile's ellipse, not the minimum-energy one, so it
  // says which trajectory it is drawing rather than leaving the player to
  // wonder why this crossing bulges further than the last one did.
  const profile = ship.profileLabel ? ` on the ${ship.profileLabel.toLowerCase()} trajectory` : ''
  return `Under way to ${to?.name ?? 'port'}${profile} — ${pct}% of the transfer flown.`
}
