/**
 * One deck of the cross-section. Spec 003 SV-1 to SV-9, SV-13 to SV-16.
 *
 * The deck is an SVG whose height comes from content (`deckUnits`) but is
 * never allowed to be smaller than what the deck actually holds -- data sets
 * the proportion, the contents set the floor. A ladder shaft runs down the
 * starboard side of every deck so the stack reads as one ship, and the right
 * margin is reserved for the flow overlay so turning it on never reflows the
 * schematic beneath it (SV-16).
 */
import type { Glyph } from '@solsyn/data'
import type { CrewView, RoomView } from '@solsyn/sim'
import { GLYPH_TONE, glyphShape, packedHeight, packGlyphs } from './shipGlyphs.js'

/** Drawing units. The SVG scales to whatever width the phone gives it. */
const W = 100
const WALL = 2.5
const INNER_LEFT = 6
const INNER_RIGHT = 74
const LADDER_LEFT = 78.5
const LADDER_RIGHT = 84.5
const CREW_BAND = 12
const PAD_TOP = 5
const UNITS_PER_DECK = 25

/** Flow channel centres, in the reserved right-hand margin. */
const CHANNEL_X = { power: 87.5, heat: 92, water: 96.5 } as const

type Part = RoomView['parts'][number]

/** Ladder rungs, evenly spaced so they line up across the deck join. */
function rungs(height: number): number[] {
  const count = Math.max(2, Math.round(height / 7))
  return Array.from({ length: count }, (_, i) => ((i + 0.5) / count) * height)
}

function partState(part: Part): string {
  if (part.broken) return 'broken'
  if (part.shed) return 'shed'
  return part.enabled ? 'on' : 'off'
}

export interface DeckSchematicProps {
  room: RoomView
  crew: CrewView[]
  showFlow: boolean
  onSelectCrew: (crewId: string) => void
}

export function DeckSchematic({ room, crew, showFlow, onSelectCrew }: DeckSchematicProps) {
  // Parts first, then fixtures: the things that can fail lead the eye.
  const drawables: { item: Part | { glyph: Glyph; key: string }; glyph: Glyph }[] = [
    ...room.parts.map((p) => ({ item: p, glyph: p.glyph })),
    ...room.fixtures.flatMap((f) =>
      Array.from({ length: f.count }, (_, i) => ({
        item: { glyph: f.glyph, key: `${f.glyph}-${i}` },
        glyph: f.glyph,
      })),
    ),
  ]

  const contentWidth = INNER_RIGHT - INNER_LEFT
  const band = crew.length > 0 ? CREW_BAND : 0
  const needed = packedHeight(drawables, contentWidth) + PAD_TOP * 2 + band
  const height = Math.max(room.deckUnits * UNITS_PER_DECK, needed)

  const placed = packGlyphs(drawables, {
    left: INNER_LEFT,
    right: INNER_RIGHT,
    top: PAD_TOP,
    bottom: height - band - PAD_TOP,
  })

  return (
    <svg
      className="schema"
      viewBox={`0 0 ${W} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={deckDescription(room, crew)}
    >
      {/* Hull walls and the deck floor. The stack of these is the ship. */}
      <g className="schema__hull">
        <rect x="0" y="0" width={W} height={height} />
        <line x1={WALL} y1={height} x2={W - WALL} y2={height} className="schema__floor" />
      </g>

      {/* Ladder shaft: continuous through every deck, which is how a reader
          knows the decks are one vessel rather than seven diagrams. */}
      <g className="schema__ladder">
        <line x1={LADDER_LEFT} y1="0" x2={LADDER_LEFT} y2={height} />
        <line x1={LADDER_RIGHT} y1="0" x2={LADDER_RIGHT} y2={height} />
        {rungs(height).map((y) => (
          <line key={y} x1={LADDER_LEFT} y1={y} x2={LADDER_RIGHT} y2={y} />
        ))}
      </g>

      {placed.map(({ item, x, y, w, h }) => {
        const isPart = 'id' in item
        const glyph: Glyph = item.glyph
        const key = isPart ? item.id : item.key
        const state = isPart ? partState(item) : 'fixture'
        return (
          <g
            key={key}
            className={`glyph glyph--${GLYPH_TONE[glyph]} is-${state}`}
            transform={`translate(${x} ${y})`}
          >
            {glyphShape(glyph, w, h)}
            {/* Broken is legible without colour (SV-5): the part is struck out. */}
            {isPart && item.broken && (
              <g className="glyph__x">
                <line x1="0" y1="0" x2={w} y2={h} />
                <line x1={w} y1="0" x2="0" y2={h} />
              </g>
            )}
            {isPart && !item.enabled && !item.broken && (
              <line className="glyph__off" x1="0" y1={h / 2} x2={w} y2={h / 2} />
            )}
          </g>
        )
      })}

      {/* Crew stand on the deck floor. */}
      {crew.map((c, i) => {
        const cx = INNER_LEFT + 6 + i * 13
        const cy = height - CREW_BAND / 2
        return (
          <g
            key={c.id}
            className={`marker marker--${c.activity}`}
            role="button"
            tabIndex={0}
            aria-label={`${c.name}, ${c.role}. ${c.doing}.`}
            onClick={() => onSelectCrew(c.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelectCrew(c.id)
              }
            }}
          >
            <circle className="marker__ring" cx={cx} cy={cy} r="5" />
            <text className="marker__text" x={cx} y={cy} dominantBaseline="central" textAnchor="middle">
              {c.initials}
            </text>
          </g>
        )
      })}

      {showFlow && <DeckFlow room={room} height={height} />}
    </svg>
  )
}

/**
 * Flow links for one deck. Spec 003 SV-13, SV-14, SV-15.
 *
 * Each channel runs the full height of the deck (it is a ship-long trunk) with
 * a branch into the room. Width comes from the room's own magnitude on that
 * channel, taken from the same selector the deck header prints, so the picture
 * and the number can never disagree.
 *
 * Direction is carried twice: by animated dashes, and by a static arrowhead.
 * Under `prefers-reduced-motion` the dashes stop and the arrowhead is still
 * there -- the overlay degrades, it does not vanish (SV-15).
 */
function DeckFlow({ room, height }: { room: RoomView; height: number }) {
  const channels = [
    { key: 'power' as const, magnitude: room.netKw, scale: 12 },
    { key: 'heat' as const, magnitude: room.heatKw, scale: 40 },
    { key: 'water' as const, magnitude: room.waterKgPerDay, scale: 8 },
  ]

  return (
    <g className="flow" aria-hidden="true">
      {channels.map(({ key, magnitude, scale }) => {
        const x = CHANNEL_X[key]
        // Positive means this room supplies the trunk, negative means it draws.
        const supplying = magnitude > 0
        const width = magnitude === 0 ? 0 : 0.8 + Math.min(3.4, (Math.abs(magnitude) / scale) * 3.4)
        if (width === 0) {
          return <line key={key} className="flow__idle" x1={x} y1="0" x2={x} y2={height} />
        }
        const midY = height / 2
        return (
          <g key={key} className={`flow__ch flow__ch--${key} ${supplying ? 'is-out' : 'is-in'}`}>
            <line className="flow__trunk" x1={x} y1="0" x2={x} y2={height} strokeWidth={width} />
            <line
              className="flow__branch"
              x1={x}
              y1={midY}
              x2={LADDER_RIGHT + 1}
              y2={midY}
              strokeWidth={Math.max(0.7, width * 0.8)}
            />
            {/* Arrowhead: static direction, for reduced motion and for print. */}
            <path
              className="flow__head"
              d={
                supplying
                  ? `M${x - 1.6} ${midY - 2.2} L${x + 1.6} ${midY} L${x - 1.6} ${midY + 2.2} Z`
                  : `M${LADDER_RIGHT + 2.6} ${midY - 2.2} L${LADDER_RIGHT} ${midY} L${LADDER_RIGHT + 2.6} ${midY + 2.2} Z`
              }
            />
          </g>
        )
      })}
    </g>
  )
}

/** What a screen reader hears instead of the drawing. */
function deckDescription(room: RoomView, crew: CrewView[]): string {
  const broken = room.parts.filter((p) => p.broken).map((p) => p.name)
  const bits = [`${room.name}, deck ${room.deck}`]
  if (room.parts.length > 0) bits.push(`${room.parts.length} installed`)
  if (broken.length > 0) bits.push(`${broken.join(' and ')} failed`)
  if (crew.length > 0) bits.push(crew.map((c) => `${c.name} ${c.doing.toLowerCase()}`).join(', '))
  return `${bits.join('. ')}.`
}
