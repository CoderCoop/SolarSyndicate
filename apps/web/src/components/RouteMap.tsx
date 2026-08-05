/**
 * The route strip. Design doc §5.1, §5.3.
 *
 * One drawing used at both ends of a mission's life: on the board it answers
 * "where does this start, where does it end, and what kind of errand is it",
 * and under way the same drawing carries the ship along the arc it is actually
 * flying. Using one component for both is the point -- the picture the player
 * chose from is the picture they then watch, so progress is legible against a
 * shape they have already read once.
 *
 * It is a schematic, not a chart. The star chart (§5.1) is the honest
 * top-down plate with real positions; this is a route diagram.
 *
 * ## Two shapes, because there are two kinds of route
 *
 * A crossing between two *bodies* is a journey between two places, and the
 * plain arc between two labelled ends says that well.
 *
 * A hop between two ports around **one** body is not that, and drawing it that
 * way was actively wrong: Gateway and Tranquillity both orbit Earth, so the
 * strip put **two Earths** side by side and the player was left to infer that
 * they were the same planet. Nothing on the drawing said that one is 407 km up
 * and the other is 384,400 km out -- a factor of fifty-seven, and the entire
 * reason the crossing takes five days and 3.91 km/s.
 *
 * So a same-body route is drawn as what it is: one planet, with the two orbits
 * around it, obliquely. Radii use the same square-root compression the star
 * chart states, which at these numbers puts Gateway's ring hard against the
 * planet's limb and Luna's way out -- which is exactly the relationship, and
 * exactly what was missing.
 */
import { useId } from 'react'
import { getBody, getPort, type MissionType } from '@solsyn/data'

const W = 320
const H = 108
/**
 * The ends sit well inside the frame because the port label is centred under
 * the body mark and "Tranquillity Yards" is wider than the mark it labels.
 * Anything tighter clips the name rather than the drawing, which is the one
 * part a player actually needs to read.
 */
const LEFT = 52
const RIGHT = W - 52
const BASE = 56

/** Astronomical unit, km. */
const AU_KM = 149_597_870

/**
 * Distances here span five orders of magnitude — 378,000 km between Gateway
 * and Tranquillity, 265 million between Earth and Ceres — so the unit changes
 * with the number rather than forcing one scale on both.
 */
export function formatDistance(km: number): string {
  if (km >= 1e7) return `${(km / AU_KM).toFixed(2)} AU`
  if (km >= 1e6) return `${(km / 1e6).toFixed(1)} million km`
  return `${Math.round(km).toLocaleString()} km`
}

/**
 * How each body is drawn. Deliberately not to scale and not coloured
 * photographically -- these are map symbols, and the job is telling four
 * destinations apart at a glance on a phone.
 */
const BODY_MARK: Record<string, { r: number; ring?: boolean; tone: string }> = {
  earth: { r: 11, ring: true, tone: 'earth' },
  mars: { r: 8, tone: 'mars' },
  ceres: { r: 5.5, tone: 'ceres' },
}

export const MISSION_LABEL: Record<MissionType, string> = {
  cargo: 'Cargo',
  bulk: 'Bulk haul',
  survey: 'Survey',
  medical: 'Medical',
  relief: 'Relief',
}

/**
 * What each kind of run is, in the sentence a dispatcher would use. Shown with
 * the badge so the type is never a bare word the player has to infer.
 */
export const MISSION_BLURB: Record<MissionType, string> = {
  cargo: 'General freight. Crates, tools, stock — paid on delivery, timed but rarely urgent.',
  bulk: 'Commodity tonnage. The mass is the job, and every kilo of it is delta-v you pay for.',
  survey: 'Science traffic. Instruments out, data and samples back, on a window that does not move.',
  medical: 'Cold chain and consignment. Arriving late is bad; arriving warm is worse.',
  relief: 'Humanitarian stores. Nobody thanks you for it and everybody notices if it does not come.',
}

/** A small mark per mission type, drawn at the midpoint of the arc. */
function missionMark(type: MissionType, size: number) {
  const s = size
  switch (type) {
    case 'cargo':
      // A crate, seen end on.
      return (
        <g>
          <rect x={-s} y={-s} width={s * 2} height={s * 2} rx="1.5" />
          <line x1={-s} y1={0} x2={s} y2={0} />
        </g>
      )
    case 'bulk':
      // A heaped hopper: mass in a pile.
      return (
        <g>
          <path d={`M${-s} ${s} L${-s * 0.55} ${-s} L${s * 0.55} ${-s} L${s} ${s} Z`} />
          <line x1={-s} y1={s * 0.2} x2={s} y2={s * 0.2} />
        </g>
      )
    case 'survey':
      // A dish on a mast.
      return (
        <g>
          <path d={`M${-s} ${-s * 0.2} A ${s} ${s} 0 0 0 ${s} ${-s * 0.2} Z`} />
          <line x1="0" y1={-s * 0.2} x2="0" y2={s} />
        </g>
      )
    case 'medical':
      // A cross, the one symbol nobody needs a legend for.
      return (
        <g>
          <line x1="0" y1={-s} x2="0" y2={s} />
          <line x1={-s} y1="0" x2={s} y2="0" />
        </g>
      )
    case 'relief':
      // A sack, tied at the neck.
      return (
        <g>
          <path d={`M${-s * 0.75} ${-s * 0.55} L${s * 0.75} ${-s * 0.55} L${s} ${s} L${-s} ${s} Z`} />
          <line x1={-s * 0.75} y1={-s * 0.55} x2={s * 0.75} y2={-s * 0.55} />
        </g>
      )
  }
}

function End({
  portId,
  x,
  align,
  here,
}: {
  portId: string
  x: number
  align: 'start' | 'end'
  here?: boolean
}) {
  const port = getPort(portId)
  const body = getBody(port.bodyId)
  const mark = BODY_MARK[port.bodyId] ?? { r: 7, tone: 'ceres' }

  // A port at a moon is drawn as a moon: a small disc standing off the
  // primary, with its own tick. Otherwise Tranquillity reads as another
  // station in Earth orbit and the five-day crossing looks like a bug.
  const moonR = 4
  const moonX = x + mark.r + 9
  const moonY = BASE - mark.r - 1

  return (
    <g className={`route__end route__end--${mark.tone} ${here ? 'is-here' : ''}`}>
      {mark.ring && <circle className="route__ring" cx={x} cy={BASE} r={mark.r + 4.5} />}
      <circle className="route__body" cx={x} cy={BASE} r={mark.r} />

      {port.moon && (
        <g className="route__moon">
          <path
            d={`M${x} ${BASE} A ${mark.r + 12} ${mark.r + 12} 0 0 1 ${moonX} ${moonY}`}
            className="route__moon-arc"
          />
          <circle cx={moonX} cy={moonY} r={moonR} />
        </g>
      )}

      <text className="route__port" x={x} y={BASE + mark.r + 14} textAnchor="middle">
        {port.name}
      </text>
      {/* The altitude is what makes "Earth to Earth, five days" make sense. */}
      <text className="route__alt" x={x} y={BASE + mark.r + 24} textAnchor="middle">
        {formatDistance(port.orbitRadiusKm)}
      </text>
      {/* Named for where the ship actually is, with the well it sits in after. */}
      <text className="route__body-name" x={x} y={BASE - mark.r - 7} textAnchor="middle">
        {port.moon ? `${port.moon} · ${body.name}` : body.name}
      </text>
      {/* An anchor for screen readers; the visual order is left to right. */}
      <title>{align === 'start' ? `Departs ${port.name}` : `Arrives ${port.name}`}</title>
    </g>
  )
}

/**
 * Vertical squash of the orbit ellipses: an oblique view.
 *
 * A true top-down circle of the radius Luna needs would be 130 units tall in a
 * 108-unit strip. Tilting the plane is what orbital diagrams have always done,
 * and it costs nothing a route strip was ever going to claim.
 */
const OBLIQUE = 0.3

/**
 * One planet, two orbits. Design doc §5.2.
 *
 * Square-root radial compression, the same convention the star chart states for
 * the same reason: linear would draw Gateway's orbit at two pixels against
 * Luna's hundred and thirty. The compression is stated under the drawing.
 */
function SameBodyRoute({
  fromPortId,
  toPortId,
  progress,
}: {
  fromPortId: string
  toPortId: string
  progress?: number
}) {
  const from = getPort(fromPortId)
  const to = getPort(toPortId)
  const body = getBody(from.bodyId)
  const mark = BODY_MARK[from.bodyId] ?? { r: 7, tone: 'ceres' }

  const cx = W / 2
  // Low enough to leave the top strip clear for the two port labels, which is
  // the only place on a 320x108 frame they do not land on the drawing.
  const cy = BASE + 10
  const outerKm = Math.max(from.orbitRadiusKm, to.orbitRadiusKm)
  // Narrow enough that the outer port's label fits inside the frame: at 128
  // "Tranquillity Yards" ran off the right edge, which is the one word on the
  // drawing a player most needs.
  const OUTER_RX = 96

  /** Kilometres to drawing units, square-root compressed. */
  const rx = (km: number) => OUTER_RX * Math.sqrt(km / outerKm)

  // The planet is drawn to the *same* scale as the orbits, which is the whole
  // point: at these numbers Earth's limb comes up almost to Gateway's ring, and
  // that is the honest picture of how low a low orbit is.
  const bodyR = Math.max(6, rx(body.radiusKm))

  const rings = [from, to].map((p) => ({ port: p, rx: rx(p.orbitRadiusKm) }))
  const inner = rings[0]!.rx <= rings[1]!.rx ? rings[0]! : rings[1]!
  const outer = inner === rings[0]! ? rings[1]! : rings[0]!

  // Ports sit on their own rings, on opposite sides, so the gap between them
  // reads as distance rather than as two dots that happen to be near.
  const at = (r: number, side: -1 | 1) => ({ x: cx + side * r, y: cy })
  const fromAt = at(rings[0]!.rx, -1)
  const toAt = at(rings[1]!.rx, 1)

  const underWay = progress !== undefined
  const t = Math.max(0, Math.min(1, progress ?? 0))
  // The transfer ellipse, near enough: a half-turn from one ring to the other,
  // which is what a Hohmann between two coplanar orbits actually is (§5.2).
  const transfer = `M${fromAt.x} ${fromAt.y} A ${(rings[0]!.rx + rings[1]!.rx) / 2} ${
    ((rings[0]!.rx + rings[1]!.rx) / 2) * OBLIQUE
  } 0 0 1 ${toAt.x} ${toAt.y}`
  const shipX = fromAt.x + (toAt.x - fromAt.x) * t
  const shipY = cy - Math.sin(Math.PI * t) * ((rings[0]!.rx + rings[1]!.rx) / 2) * OBLIQUE


  return (
    <>
      {/* Planet first, then the orbits over it. In an oblique view the near
          half of a ring really does pass in front of the body, and drawing it
          that way is also the only way the inner ring is visible at all --
          Gateway's orbit is barely wider than Earth itself, which is the
          honest picture of how low a low orbit is. */}
      <g className={`route__end route__end--${mark.tone}`}>
        <circle className="route__body" cx={cx} cy={cy} r={bodyR} />
      </g>

      {[outer, inner].map((ring) => (
        <ellipse
          key={ring.port.id}
          className="route__orbit"
          cx={cx}
          cy={cy}
          rx={ring.rx}
          ry={ring.rx * OBLIQUE}
        />
      ))}

      <path className="route__path route__path--transfer" d={transfer} />

      <text
        className="route__body-name"
        x={cx}
        y={cy + Math.max(bodyR, inner.rx * OBLIQUE) + 11}
        textAnchor="middle"
      >
        {body.name}
      </text>

      {/* The stations themselves, on their rings. */}
      {[
        { port: from, at: fromAt },
        { port: to, at: toAt },
      ].map(({ port, at: p }) => (
        <g key={port.id} className="route__station">
          {port.moon && <circle className="route__moon-body" cx={p.x} cy={p.y} r="4" />}
          <circle className="route__station-dot" cx={p.x} cy={p.y} r="2.6" />
        </g>
      ))}

      {/* Names along the top, with a leader down to the ring each sits on.
          Anywhere else on a 320x108 frame they land on the drawing -- and the
          altitude is the number that makes the picture mean something, so it
          cannot be the thing that gets clipped. */}
      {[
        { port: from, at: fromAt, x: 6, anchor: 'start' as const },
        { port: to, at: toAt, x: W - 6, anchor: 'end' as const },
      ].map(({ port, at: p, x, anchor }) => (
        <g key={`${port.id}-label`}>
          <text className="route__port" x={x} y="13" textAnchor={anchor}>
            {port.name}
          </text>
          <text className="route__alt" x={x} y="24" textAnchor={anchor}>
            {port.moon ? `${port.moon} · ` : ''}
            {formatDistance(port.orbitRadiusKm)}
          </text>
          <line className="route__leader" x1={x === 6 ? 10 : W - 10} y1="29" x2={p.x} y2={p.y - 5} />
        </g>
      ))}

      {underWay && (
        <g className="route__ship" transform={`translate(${shipX} ${shipY})`}>
          <circle className="route__ship-halo" r="8" />
          <path className="route__ship-mark" d="M0 -5 L4 4 L0 1.5 L-4 4 Z" />
        </g>
      )}
    </>
  )
}

export interface RouteMapProps {
  fromPortId: string
  toPortId: string
  type: MissionType
  /** 0 to 1 when under way; omitted on the board, where nothing has been flown. */
  progress?: number
}

export function RouteMap({ fromPortId, toPortId, type, progress }: RouteMapProps) {
  // The board draws several of these at once, and SVG ids are document-global:
  // a fixed clip-path id would make every route on the page use the first
  // one's progress.
  const clipId = `route-flown-${useId().replace(/:/g, '')}`
  const from = getPort(fromPortId)
  const to = getPort(toPortId)

  // Two ports around one body is a hop inside a gravity well, not a crossing.
  // Drawing it as the same sweeping arc as Earth to Ceres would be a lie the
  // player pays for in propellant, so it gets a visibly flatter path.
  const sameBody = from.bodyId === to.bodyId
  const lift = sameBody ? 14 : 34
  const mid = (LEFT + RIGHT) / 2
  const path = `M${LEFT} ${BASE} Q${mid} ${BASE - lift * 2} ${RIGHT} ${BASE}`

  // Quadratic Bezier at t, for placing the ship and the type badge.
  const at = (t: number) => {
    const u = 1 - t
    return {
      x: u * u * LEFT + 2 * u * t * mid + t * t * RIGHT,
      y: u * u * BASE + 2 * u * t * (BASE - lift * 2) + t * t * BASE,
    }
  }

  // How far it actually is. Inside one well that is the gap between two orbital
  // radii; between bodies it is the gap between two heliocentric orbits, which
  // is the honest order of magnitude even though the real separation depends on
  // where the two are in their years.
  const spanKm = sameBody
    ? Math.abs(to.orbitRadiusKm - from.orbitRadiusKm)
    : Math.abs(getBody(to.bodyId).orbitRadiusAu - getBody(from.bodyId).orbitRadiusAu) * AU_KM

  const badge = at(0.5)
  const underWay = progress !== undefined
  const t = Math.max(0, Math.min(1, progress ?? 0))
  const ship = at(t)

  return (
    <svg
      className="route"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={describe(fromPortId, toPortId, type, progress)}
    >
      {/* One planet with its orbits when both ports share a primary; two ends
          and an arc when they do not. Drawing the first case as the second put
          two Earths side by side and said nothing about the fifty-seven-fold
          difference in altitude between them. */}
      {sameBody && (
        <SameBodyRoute fromPortId={fromPortId} toPortId={toPortId} {...(progress !== undefined ? { progress } : {})} />
      )}

      {/* The whole route, faint. */}
      {!sameBody && <path className="route__path" d={path} />}

      {/* How far, stated. Two ports around one body are not neighbours, and
          without this the Luna hop reads as Earth-to-Earth in five days. */}
      <text className="route__span" x={W / 2} y={H - 4} textAnchor="middle">
        {formatDistance(spanKm)}
        {sameBody ? ' between the two orbits' : ' at closest approach'}
      </text>

      {/* Flown so far, drawn over it. A dash array scaled to the path length
          would need a measured path; instead the ship mark carries position and
          the flown segment is a second arc clipped by a moving mask. */}
      {!sameBody && underWay && (
        <>
          <defs>
            <clipPath id={clipId}>
              <rect x="0" y="0" width={LEFT + (RIGHT - LEFT) * t} height={H} />
            </clipPath>
          </defs>
          <path className="route__path route__path--flown" d={path} clipPath={`url(#${clipId})`} />
        </>
      )}

      {!sameBody && (
        <>
          <End portId={fromPortId} x={LEFT} align="start" here={!underWay} />
          <End portId={toPortId} x={RIGHT} align="end" />
        </>
      )}

      {/* The kind of errand. On the arc where there is one; tucked into the
          corner of the orbital view, which has no spare middle. */}
      <g
        className={`route__badge route__badge--${type}`}
        transform={`translate(${sameBody ? 18 : badge.x} ${sameBody ? H - 20 : badge.y})`}
      >
        <circle className="route__badge-disc" r="12" />
        <g className="route__badge-mark">{missionMark(type, 5)}</g>
      </g>

      {!sameBody && underWay && (
        <g className="route__ship" transform={`translate(${ship.x} ${ship.y})`}>
          <circle className="route__ship-halo" r="8" />
          <path className="route__ship-mark" d="M0 -5 L4 4 L0 1.5 L-4 4 Z" />
        </g>
      )}
    </svg>
  )
}

function describe(
  fromPortId: string,
  toPortId: string,
  type: MissionType,
  progress?: number,
): string {
  const route = `${MISSION_LABEL[type]} run from ${getPort(fromPortId).name} to ${getPort(toPortId).name}`
  if (progress === undefined) return `${route}.`
  return `${route}, ${Math.round(progress * 100)} per cent flown.`
}
