/**
 * One deck, drawn as a room. Spec 004 RF-1 to RF-9.
 *
 * The room is an interior elevation: back wall with structural ribs, conduit
 * tray along the overhead, grated deck underfoot, and a ladder shaft on the
 * starboard side running continuously through every deck so the stack reads as
 * one vessel rather than seven diagrams.
 *
 * Everything in it -- equipment, furniture, people -- is drawn at its real size
 * against a common metre grid, so a scrubber is the size a scrubber is next to
 * a person who is 1.7 m tall. And everything in it is a target: tapping a
 * machine opens that machine, rather than expanding a list of four and making
 * the player find the one they were already looking at.
 */
import type { Glyph } from '@solsyn/data'
import type { CrewView, RoomView } from '@solsyn/sim'
import {
  GLYPH_TONE,
  HUMAN_H_M,
  INTERIOR_W_M,
  U_PER_M,
  glyphShape,
  humanShape,
  layOutRoom,
  requiredHeight,
  type Placeable,
} from './roomInterior.js'

const WALL_U = 3
const W = INTERIOR_W_M * U_PER_M + WALL_U * 2
const OVERHEAD_U = 5
const DECK_U = 5
const LADDER_W = 7
const LADDER_RIGHT = W - WALL_U - 2
const LADDER_LEFT = LADDER_RIGHT - LADDER_W
const INNER_LEFT = WALL_U + 3
const INNER_RIGHT = LADDER_LEFT - 3

type Part = RoomView['parts'][number]
type Fixture = { glyph: Glyph; key: string }
type Item = Part | Fixture

const isPart = (i: Item): i is Part => 'id' in i

function partState(part: Part): string {
  if (part.broken) return 'broken'
  if (part.shed) return 'shed'
  return part.enabled ? 'on' : 'off'
}

/** Ladder rungs, evenly spaced so they line up across the deck join. */
function rungs(height: number): number[] {
  const count = Math.max(2, Math.round(height / 8))
  return Array.from({ length: count }, (_, i) => ((i + 0.5) / count) * height)
}

export interface DeckSchematicProps {
  room: RoomView
  crew: CrewView[]
  selectedPartId: string | undefined
  onSelectPart: (partId: string | undefined) => void
  onSelectCrew: (crewId: string) => void
}

export function DeckSchematic({
  room,
  crew,
  selectedPartId,
  onSelectPart,
  onSelectCrew,
}: DeckSchematicProps) {
  const items: Placeable<Item>[] = [
    ...room.parts.map((p) => ({
      item: p as Item,
      glyph: p.glyph,
      fitting: p.fitting,
      sizeM: p.sizeM,
    })),
    ...room.fixtures.flatMap((f) =>
      Array.from({ length: f.count }, (_, i) => ({
        item: { glyph: f.glyph, key: `${f.glyph}-${i}` } as Item,
        glyph: f.glyph,
        fitting: f.fitting,
        sizeM: f.sizeM,
      })),
    ),
  ]

  // Data states the deck head height; contents raise the floor on it if they
  // have to, so a room can never be drawn smaller than what it holds.
  const interiorU = INNER_RIGHT - INNER_LEFT
  const declared = room.deckHeightM * U_PER_M
  const interiorH = Math.max(declared, requiredHeight(items, interiorU) + 4)
  const height = interiorH + OVERHEAD_U + DECK_U
  const deckLine = OVERHEAD_U + interiorH

  const placed = layOutRoom(items, {
    left: INNER_LEFT,
    right: INNER_RIGHT,
    top: OVERHEAD_U,
    bottom: deckLine,
  })

  const humanH = HUMAN_H_M * U_PER_M
  const humanW = humanH * 0.42

  return (
    <svg
      className="schema"
      viewBox={`0 0 ${W} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      aria-label={deckDescription(room, crew)}
    >
      <g className="room">
        <rect className="room__air" x="0" y="0" width={W} height={height} />

        {/* Structural ribs on the back wall. */}
        {[0.18, 0.42, 0.66].map((f) => (
          <line key={f} className="room__rib" x1={W * f} y1={OVERHEAD_U} x2={W * f} y2={deckLine} />
        ))}

        {/* Conduit tray along the overhead. */}
        <rect className="room__tray" x="0" y="0" width={W} height={OVERHEAD_U} />
        <line className="room__conduit" x1="0" y1={OVERHEAD_U * 0.4} x2={W} y2={OVERHEAD_U * 0.4} />
        <line className="room__conduit" x1="0" y1={OVERHEAD_U * 0.7} x2={W} y2={OVERHEAD_U * 0.7} />

        {/* Grated deck. */}
        <line className="room__deck" x1="0" y1={deckLine} x2={W} y2={deckLine} />
        {Array.from({ length: 14 }, (_, i) => ((i + 0.5) / 14) * W).map((x) => (
          <line key={x} className="room__grate" x1={x} y1={deckLine} x2={x} y2={height} />
        ))}
        <line className="room__grate" x1="0" y1={deckLine + DECK_U * 0.55} x2={W} y2={deckLine + DECK_U * 0.55} />
      </g>

      {/* Ladder shaft, continuous through the stack. */}
      <g className="room__ladder">
        <line x1={LADDER_LEFT} y1="0" x2={LADDER_LEFT} y2={height} />
        <line x1={LADDER_RIGHT} y1="0" x2={LADDER_RIGHT} y2={height} />
        {rungs(height).map((y) => (
          <line key={y} x1={LADDER_LEFT} y1={y} x2={LADDER_RIGHT} y2={y} />
        ))}
      </g>

      {placed.map(({ item, glyph, x, y, w, h }) => {
        const part = isPart(item) ? item : undefined
        const key = part ? part.id : (item as Fixture).key
        const state = part ? partState(part) : 'fixture'
        const selected = part && part.id === selectedPartId
        return (
          <g key={key} className={`glyph glyph--${GLYPH_TONE[glyph]} is-${state}`}>
            <g transform={`translate(${x} ${y})`}>
              {glyphShape(glyph, w, h)}
              {/* Broken reads without colour (RF-6): the machine is struck out. */}
              {part?.broken && (
                <g className="glyph__x">
                  <line x1="0" y1="0" x2={w} y2={h} />
                  <line x1={w} y1="0" x2="0" y2={h} />
                </g>
              )}
              {part && !part.enabled && !part.broken && (
                <line className="glyph__off" x1="0" y1={h / 2} x2={w} y2={h / 2} />
              )}
            </g>
            {part && (
              <>
                <rect
                  className="hit"
                  x={x - 2}
                  y={y - 2}
                  width={w + 4}
                  height={h + 4}
                  role="button"
                  tabIndex={0}
                  aria-label={`${part.name}. ${Math.round(part.condition)}% ${part.conditionLabel}, ${part.tuneLabel}.`}
                  aria-pressed={Boolean(selected)}
                  onClick={() => onSelectPart(selected ? undefined : part.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onSelectPart(selected ? undefined : part.id)
                    }
                  }}
                />
                {selected && (
                  <rect className="picked" x={x - 3} y={y - 3} width={w + 6} height={h + 6} rx="2" />
                )}
              </>
            )}
          </g>
        )
      })}

      {/* People, on the deck, at human scale. */}
      {crew.map((c, i) => {
        // From the ladder inboard: equipment fills from the far side, so the
        // two only meet in a room that is genuinely crowded.
        const x = INNER_RIGHT - humanW - i * (humanW + 7)
        const y = deckLine - humanH
        return (
          <g key={c.id} className={`person person--${c.activity}`}>
            <g transform={`translate(${x} ${y})`}>{humanShape(c.activity, humanH)}</g>
            <text className="person__tag" x={x + humanW / 2} y={y - 2.5} textAnchor="middle">
              {c.initials}
            </text>
            {/* Tight to the figure: a person standing in front of a machine
                should not swallow taps meant for the machine (RF-8). */}
            <rect
              className="hit"
              x={x - 1}
              y={y - 6}
              width={humanW + 2}
              height={humanH + 7}
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
            />
          </g>
        )
      })}
    </svg>
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
