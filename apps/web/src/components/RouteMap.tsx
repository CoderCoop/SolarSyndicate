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
 * top-down plate with real positions; this is a route diagram, and it says so
 * by drawing the crossing as a plain arc between two labelled ends. Two ports
 * around one body get a visibly shallower arc than an interplanetary crossing,
 * because that difference is the single most important thing about a route the
 * Kestrel can or cannot fly.
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
      {/* The whole route, faint. */}
      <path className="route__path" d={path} />

      {/* How far, stated. Two ports around one body are not neighbours, and
          without this the Luna hop reads as Earth-to-Earth in five days. */}
      <text className="route__span" x={W / 2} y={H - 4} textAnchor="middle">
        {formatDistance(spanKm)}
        {sameBody ? '' : ' at closest approach'}
      </text>

      {/* Flown so far, drawn over it. A dash array scaled to the path length
          would need a measured path; instead the ship mark carries position and
          the flown segment is a second arc clipped by a moving mask. */}
      {underWay && (
        <>
          <defs>
            <clipPath id={clipId}>
              <rect x="0" y="0" width={LEFT + (RIGHT - LEFT) * t} height={H} />
            </clipPath>
          </defs>
          <path className="route__path route__path--flown" d={path} clipPath={`url(#${clipId})`} />
        </>
      )}

      <End portId={fromPortId} x={LEFT} align="start" here={!underWay} />
      <End portId={toPortId} x={RIGHT} align="end" />

      {/* The kind of errand, riding on the arc. */}
      <g className={`route__badge route__badge--${type}`} transform={`translate(${badge.x} ${badge.y})`}>
        <circle className="route__badge-disc" r="12" />
        <g className="route__badge-mark">{missionMark(type, 5)}</g>
      </g>

      {underWay && (
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
