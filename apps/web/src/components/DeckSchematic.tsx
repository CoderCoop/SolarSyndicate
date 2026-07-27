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
  GAP,
  GLYPH_TONE,
  HUMAN_H_M,
  INTERIOR_W_M,
  PERSON_TAG_U,
  U_PER_M,
  glyphShape,
  humanShape,
  layOutBlocks,
  bandHeight,
  requiredRoomHeight,
  sleepingDepth,
  type Block,
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
type Fixture = { glyph: Glyph; key: string; name: string; blurb: string }
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
  /** Fixtures are furniture the sim does not model -- but SV-10 says every
      object on the drawing can be asked about, and furniture is an object. */
  onSelectFixture: (fixture: { name: string; blurb: string }) => void
}

export function DeckSchematic({
  room,
  crew,
  selectedPartId,
  onSelectPart,
  onSelectCrew,
  onSelectFixture,
}: DeckSchematicProps) {
  // One block per part, one per fixture *definition* -- so six bunks arrive as
  // a single berth stack rather than six rectangles for a packer to strew
  // about. Spec 004 RF-3.
  const blocks: Block<Item>[] = [
    ...room.parts.map((p) => ({
      items: [p as Item],
      glyph: p.glyph,
      fitting: p.fitting,
      sizeM: p.sizeM,
      columns: 1,
    })),
    ...room.fixtures.map((f) => ({
      items: Array.from(
        { length: f.count },
        (_, i) => ({ glyph: f.glyph, key: `${f.glyph}-${i}`, name: f.name, blurb: f.blurb }) as Item,
      ),
      glyph: f.glyph,
      fitting: f.fitting,
      sizeM: f.sizeM,
      columns: f.block?.columns ?? f.count,
      ...(f.occupiedBy ? { occupiedBy: f.occupiedBy } : {}),
    })),
  ]

  // What the room is for decides how it is lit: warm where people rest, green
  // where things grow, cool where machines run (spec 004's colour rule).
  const tone = room.fixtures.some((f) => f.occupiedBy)
    ? 'warm'
    : room.parts.some((p) => p.glyph === 'tray')
      ? 'grow'
      : room.parts.some((p) => p.glyph === 'core' || p.glyph === 'nozzle')
        ? 'hot'
        : 'cool'
  const lightId = `deck-light-${room.id.replace(/[^a-z0-9]/gi, '')}`

  const humanH = HUMAN_H_M * U_PER_M
  const humanW = humanH * 0.42
  /** Standing room: the figure, plus the arm the on-watch posture reaches with. */
  const standingW = humanW * 1.2

  const interiorU = INNER_RIGHT - INNER_LEFT
  const declared = room.deckHeightM * U_PER_M
  const needed = requiredRoomHeight(blocks, interiorU)
  // A person standing on the deck is part of what the room has to hold.
  // The overhead band has to clear a standing person's head, or somebody ends
  // up drawn through the comms array with no gap on the deck to escape to.
  const overhead = crew.length === 0 ? 0 : bandHeight(blocks.filter((b) => b.fitting !== 'floor'))
  const interiorH = Math.max(declared, needed, humanH + PERSON_TAG_U + overhead + GAP)
  const height = interiorH + OVERHEAD_U + DECK_U
  const deckLine = OVERHEAD_U + interiorH

  const placed = layOutBlocks(blocks, {
    left: INNER_LEFT,
    right: INNER_RIGHT,
    top: OVERHEAD_U,
    bottom: deckLine,
  })

  // --- seat the crew ------------------------------------------------------
  //
  // A person goes where their activity puts them: asleep in a bunk, off watch
  // at the table, on watch beside the machine they are tending. Standing every
  // one of them in a lane by the ladder is what made the room read as a parts
  // bin with people filed next to it -- and it was the reason the deck had to
  // reserve a strip so wide it shoved the bunks into a tower.
  const taken = new Set<string>()
  const usedSpots = new Set<number>()
  const seatFor = (
    c: CrewView,
  ): { x: number; y: number; inside: boolean; fitW?: number; occupying?: boolean } => {
    // A berth, a chair, a place at the table.
    for (const pb of placed) {
      if (pb.block.occupiedBy !== c.activity) continue
      const free = pb.slots.find((_, i) => !taken.has(`${pb.block.glyph}-${i}`))
      if (!free) continue
      taken.add(`${pb.block.glyph}-${pb.slots.indexOf(free)}`)
      return c.activity === 'sleep'
        ? {
            // Centred in the berth, not hung off a standing figure's height --
            // which drew the sleeper two metres below her own bunk.
            occupying: true,
            x: free.x + 1,
            y: free.y + (free.h - sleepingDepth(humanH, free.w - 2)) / 2,
            inside: true,
            fitW: free.w - 2,
          }
        : { occupying: true, x: free.x + free.w / 2 - humanW / 2, y: deckLine - humanH, inside: false }
    }
    // On watch: beside the machine being tended, in the nearest space wide
    // enough to stand in. Simply stepping left of the station put people
    // through whatever was next to it.
    const busy = placed
      .flatMap((pb) => pb.slots)
      // Anything whose height overlaps a standing person's, wherever it hangs.
      // Filtering on the deck line alone let a bulkhead-mounted array count as
      // out of the way when it was at head height.
      .filter((sl) => sl.y + sl.h > deckLine - humanH - PERSON_TAG_U && sl.y < deckLine)
      .map((sl) => [sl.x, sl.x + sl.w] as const)
      .sort((a, b) => a[0] - b[0])

    const free: (readonly [number, number])[] = []
    let cursor = INNER_LEFT
    for (const [from, to] of busy) {
      if (from - cursor >= standingW + 2) free.push([cursor, from])
      cursor = Math.max(cursor, to)
    }
    if (INNER_RIGHT - cursor >= standingW + 2) free.push([cursor, INNER_RIGHT])

    const station = placed.find(
      (pb) => pb.block.items.length === 1 && isPart(pb.block.items[0]!),
    )
    const want = station ? station.x : INNER_RIGHT
    const gapSpot = free
      .filter(([from, to]) => to - from >= standingW + 2 && !usedSpots.has(from))
      .sort((a, b) => Math.abs(a[0] - want) - Math.abs(b[0] - want))[0]

    // Failing a gap near the station, take the widest one anywhere. Falling
    // back to the ladder end put people on top of whatever was stowed there,
    // which is how the medic ended up standing through the mess table.
    const anywhere =
      gapSpot ?? [...free].sort((a, b) => b[1] - b[0] - (a[1] - a[0]))[0]
    if (anywhere) {
      usedSpots.add(anywhere[0])
      // On watch is *using* the station: standing shoulder to shoulder with it
      // is the point, and their tap targets are allowed to touch.
      return { x: anywhere[0] + 1, y: deckLine - humanH, inside: false, occupying: c.activity === 'watch' }
    }
    return { x: INNER_RIGHT - standingW, y: deckLine - humanH, inside: false }
  }

  const seated = crew.map((c) => ({ crew: c, seat: seatFor(c) }))

  return (
    <svg
      className="schema"
      viewBox={`0 0 ${W} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      aria-label={deckDescription(room, crew)}
    >
      {/* The light in the room. A gradient per deck rather than one shared
          definition, because ids are document-global and seven decks would
          otherwise all inherit whichever one rendered last. */}
      <defs>
        <linearGradient id={lightId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="light-top" />
          <stop offset="0.55" className="light-mid" />
          <stop offset="1" className="light-deck" />
        </linearGradient>
      </defs>

      <g className={`room room--${tone}`}>
        <rect className="room__air" fill={`url(#${lightId})`} x="0" y="0" width={W} height={height} />

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

      {placed.flatMap((pb) =>
        pb.slots.map(({ item, x, y, w, h }) => {
          const part = isPart(item) ? item : undefined
          const key = part ? part.id : (item as Fixture).key
          const state = part ? partState(part) : 'fixture'
          const selected = part && part.id === selectedPartId
          return (
            <g key={key} className={`glyph glyph--${GLYPH_TONE[pb.block.glyph]} is-${state}`}>
              <g transform={`translate(${x} ${y})`}>
                {glyphShape(pb.block.glyph, w, h)}
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
              <rect
                className={part ? 'hit' : 'hit hit--fixture'}
                fill="none"
                pointerEvents="all"
                x={x - 2}
                y={y - 2}
                width={w + 4}
                height={h + 4}
                role="button"
                tabIndex={0}
                aria-label={
                  part
                    ? `${part.name}. ${Math.round(part.condition)}% ${part.conditionLabel}, ${part.tuneLabel}.`
                    : (item as Fixture).name
                }
                {...(part ? { 'aria-pressed': Boolean(selected) } : {})}
                onClick={() =>
                  part ? onSelectPart(selected ? undefined : part.id) : onSelectFixture(item as Fixture)
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    if (part) onSelectPart(selected ? undefined : part.id)
                    else onSelectFixture(item as Fixture)
                  }
                }}
              />
              {selected && (
                <rect className="picked" x={x - 3} y={y - 3} width={w + 6} height={h + 6} rx="2" />
              )}
            </g>
          )
        }),
      )}

      {/* People, where their activity puts them: in a berth, at the table, or
          at the machine they are tending (RF-5, RF-8). */}
      {seated.map(({ crew: c, seat }) => (
        <g
          key={c.id}
          className={`person person--${c.activity} ${seat.inside ? 'is-berthed' : ''} ${
            seat.occupying ? 'is-occupying' : ''
          }`}
        >
          <g transform={`translate(${seat.x} ${seat.y})`}>
            {humanShape(c.activity, humanH, seat.fitW)}
          </g>
          {/* Everyone is named, asleep included -- the mockup labelled the
              berth "OKONKWO · ASLEEP", and a person you cannot identify is not
              crew presence. */}
          <text
            className={`person__tag ${seat.inside ? 'person__tag--berth' : ''}`}
            x={seat.x + humanW / 2}
            y={seat.y - 2.5}
            textAnchor="middle"
          >
            {c.initials}
          </text>
          <rect
            className="hit"
            fill="none"
            pointerEvents="all"
            x={seat.x - 1}
            y={seat.y - (seat.inside ? 0 : PERSON_TAG_U - 1)}
            width={humanW + 2}
            /* A sleeper is a few units deep, not a standing figure's height:
               sized to the standing box she covered her own berth's target and
               the bunk could not be tapped at all (RF-8). */
            height={
              seat.inside
                ? sleepingDepth(humanH, seat.fitW ?? humanW)
                : humanH + PERSON_TAG_U
            }
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
      ))}
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
