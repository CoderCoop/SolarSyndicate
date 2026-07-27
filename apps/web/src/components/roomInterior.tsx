/**
 * Room interiors. Spec 004 RF-1 to RF-5.
 *
 * A room is drawn as a technical elevation seen side-on: back wall with
 * structural ribs, conduit tray along the overhead, grated deck underfoot.
 * Equipment stands on the deck or bolts to the bulkhead at the size it really
 * is, and a crew figure is drawn to the same scale -- so everything in the
 * room is measured against a person rather than against nothing.
 *
 * This file is the only place that knows what anything *looks* like. Content
 * chooses a glyph from the closed enum in `@solsyn/data` and states its size in
 * metres and how it is fitted; the packer below places it without knowing what
 * it is. Adding a part that reuses a glyph costs no code at all.
 */
import type { Fitting, Glyph, OccupiedBy, SizeM } from '@solsyn/data'
import type { JSX } from 'react'

/** Drawing units per metre. Sets how big the whole ship reads. */
export const U_PER_M = 15

/** Interior width of the pressurised hull, metres. */
/**
 * Habitable width, in metres.
 *
 * 6.5 rather than 6.0: at six metres a berth stack, a galley block and the mess
 * table came to 6.6 m of contents in 5.0 m of drawable deck, so the table was
 * bumped up a tier and drew as if it were bolted to the overhead. Half a metre
 * on a hauler of 41 tonnes dry is unremarkable, and it gives every deck the
 * room to lay its contents out in one run.
 */
export const INTERIOR_W_M = 6.5

/** A person, for scale (RF-4). */
export const HUMAN_H_M = 1.7

/**
 * Semantic tint. Warm where people rest, green where things grow, hot at the
 * reactor. Colour carries meaning here and never carries it alone (RF-6).
 */
export const GLYPH_TONE: Record<Glyph, 'cool' | 'warm' | 'grow' | 'hot'> = {
  core: 'hot',
  nozzle: 'hot',
  tray: 'grow',
  bay: 'cool',
  column: 'cool',
  panel: 'cool',
  hab: 'warm',
  pump: 'cool',
  battery: 'cool',
  console: 'cool',
  dish: 'cool',
  couch: 'warm',
  bunk: 'warm',
  table: 'warm',
  locker: 'cool',
}

/** Evenly spaced positions across a span, for repeated internal detail. */
function ticks(count: number, from: number, to: number): number[] {
  const step = (to - from) / count
  return Array.from({ length: count }, (_, i) => from + step * (i + 0.5))
}

/**
 * Each glyph draws itself into a box from (0,0) to (w,h), in drawing units.
 * The shapes are deliberately mechanical: a plinth under anything that stands
 * on the deck, pipework leaving anything that is plumbed, banding on anything
 * that is a pressure vessel.
 */
export function glyphShape(glyph: Glyph, w: number, h: number): JSX.Element {
  switch (glyph) {
    case 'core':
      // The pile, behind its shadow shield -- the thing that decides where
      // everything else on the ship is allowed to sit (§3.1).
      return (
        <>
          <path className="kit shield" d={`M${w * 0.04} 0 H${w * 0.96} L${w * 0.84} ${h * 0.3} H${w * 0.16} Z`} />
          {ticks(3, h * 0.06, h * 0.26).map((y) => (
            <line key={y} className="hair" x1={w * 0.1} y1={y} x2={w * 0.9} y2={y} />
          ))}
          <rect className="kit" x={w * 0.2} y={h * 0.36} width={w * 0.6} height={h * 0.58} rx="2" />
          <circle className="glow" cx={w * 0.5} cy={h * 0.64} r={h * 0.16} />
          <circle className="hair" cx={w * 0.5} cy={h * 0.64} r={h * 0.24} />
          <rect className="kit plinth" x={w * 0.14} y={h * 0.94} width={w * 0.72} height={h * 0.06} />
        </>
      )

    case 'nozzle':
      return (
        <>
          <path className="kit" d={`M${w * 0.28} 0 H${w * 0.72} L${w} ${h} H0 Z`} />
          {ticks(4, h * 0.15, h * 0.95).map((y) => {
            const spread = 0.28 - (0.28 * y) / h
            return (
              <line key={y} className="hair" x1={w * spread} y1={y} x2={w * (1 - spread)} y2={y} />
            )
          })}
        </>
      )

    case 'tray':
      // Three lit shelves. The only green anybody sees for months.
      return (
        <>
          <rect className="kit" x="0" y="0" width={w} height={h * 0.94} rx="1.5" />
          {[0.08, 0.38, 0.68].map((f) => (
            <g key={f}>
              <line className="lamp" x1={w * 0.06} y1={h * f} x2={w * 0.94} y2={h * f} />
              <rect className="grow" x={w * 0.06} y={h * (f + 0.08)} width={w * 0.88} height={h * 0.12} />
            </g>
          ))}
          <rect className="kit plinth" x="0" y={h * 0.94} width={w} height={h * 0.06} />
        </>
      )

    case 'bay':
      return (
        <>
          <rect className="kit" x="0.5" y="0.5" width={w - 1} height={h - 1} rx="1" />
          <line className="hair" x1="0.5" y1={h * 0.26} x2={w - 0.5} y2={h * 0.26} />
          <line className="hair" x1={w * 0.5} y1={h * 0.26} x2={w * 0.5} y2={h - 0.5} strokeDasharray="2 2" />
        </>
      )

    case 'column':
      // A process vessel: banded shell, plumbed at both ends.
      return (
        <>
          <path className="pipe" d={`M${w * 0.5} ${h * 0.08} V-4`} />
          <rect className="kit" x={w * 0.08} y={h * 0.08} width={w * 0.84} height={h * 0.84} rx={w * 0.3} />
          {ticks(4, h * 0.16, h * 0.84).map((y) => (
            <line key={y} className="hair" x1={w * 0.14} y1={y} x2={w * 0.86} y2={y} />
          ))}
          <rect className="kit plinth" x="0" y={h * 0.92} width={w} height={h * 0.08} />
        </>
      )

    case 'panel':
      return (
        <>
          <rect className="kit" x="0.5" y="0.5" width={w - 1} height={h - 1} />
          {ticks(5, 0.5, w - 0.5).map((x) => (
            <line key={x} className="hair" x1={x} y1="0.5" x2={x} y2={h - 0.5} />
          ))}
          <line className="hair" x1="0.5" y1={h * 0.5} x2={w - 0.5} y2={h * 0.5} />
        </>
      )

    case 'hab':
      // Galley run, and the exercise rig that keeps bone density off the
      // medic's list.
      return (
        <>
          <rect className="kit" x="0" y={h * 0.2} width={w * 0.58} height={h * 0.8} />
          {ticks(3, h * 0.3, h * 0.94).map((y) => (
            <line key={y} className="hair" x1={w * 0.06} y1={y} x2={w * 0.52} y2={y} />
          ))}
          <circle className="hair" cx={w * 0.8} cy={h * 0.3} r={h * 0.13} />
          <line className="kit-line" x1={w * 0.8} y1={h * 0.43} x2={w * 0.8} y2={h} />
          <line className="kit-line" x1={w * 0.66} y1={h} x2={w * 0.94} y2={h} />
        </>
      )

    case 'pump':
      return (
        <>
          <rect className="kit" x="0" y="0" width={w} height={h} rx="1.5" />
          <circle className="hair" cx={w * 0.28} cy={h * 0.5} r={h * 0.26} />
          <line className="hair" x1={w * 0.28} y1={h * 0.24} x2={w * 0.28} y2={h * 0.76} />
          {ticks(4, w * 0.52, w * 0.94).map((x) => (
            <line key={x} className="hair" x1={x} y1={h * 0.14} x2={x} y2={h * 0.86} />
          ))}
          <path className="pipe" d={`M${w * 0.5} ${h} V${h + 5}`} />
        </>
      )

    case 'battery':
      return (
        <>
          <rect className="kit" x="0" y={h * 0.12} width={w - 2} height={h * 0.8} rx="1" />
          {ticks(5, 1.5, w - 3.5).map((x) => (
            <line key={x} className="kit-line" x1={x} y1={h * 0.2} x2={x} y2={h * 0.84} />
          ))}
          <rect className="kit" x={w - 2} y={h * 0.36} width="2" height={h * 0.28} />
          <rect className="kit plinth" x="0" y={h * 0.92} width={w} height={h * 0.08} />
        </>
      )

    case 'console':
      return (
        <>
          <path className="kit" d={`M${w * 0.08} ${h} L${w * 0.2} ${h * 0.1} H${w * 0.92} V${h} Z`} />
          <line className="hair" x1={w * 0.3} y1={h * 0.34} x2={w * 0.84} y2={h * 0.34} />
          <line className="hair" x1={w * 0.3} y1={h * 0.52} x2={w * 0.7} y2={h * 0.52} />
          <line className="hair" x1={w * 0.3} y1={h * 0.7} x2={w * 0.78} y2={h * 0.7} />
        </>
      )

    case 'dish':
      return (
        <>
          <path className="kit" d={`M0 ${h * 0.66} A${w * 0.5} ${h * 0.6} 0 0 1 ${w} ${h * 0.66} Z`} />
          <line className="hair" x1={w * 0.5} y1={h * 0.1} x2={w * 0.5} y2={h * 0.66} />
          <circle className="hair" cx={w * 0.5} cy={h * 0.1} r="1.6" />
          <line className="kit-line" x1={w * 0.5} y1={h * 0.66} x2={w * 0.5} y2={h} />
        </>
      )

    case 'couch':
      // A reclined acceleration seat, back raked toward the nose.
      return (
        <>
          <path
            className="kit warm"
            d={`M${w * 0.04} ${h * 0.1} L${w * 0.42} ${h * 0.6} H${w * 0.96} V${h * 0.88} H${w * 0.28} Z`}
          />
          <line className="hair" x1={w * 0.14} y1={h * 0.3} x2={w * 0.34} y2={h * 0.16} />
          <line className="kit-line" x1={w * 0.44} y1={h * 0.88} x2={w * 0.44} y2={h} />
          <line className="kit-line" x1={w * 0.88} y1={h * 0.88} x2={w * 0.88} y2={h} />
        </>
      )

    case 'bunk':
      // A shelf you sleep on, with a pillow at the head end.
      return (
        <>
          <rect className="kit warm" x="0" y="0" width={w} height={h} />
          <rect className="hair" x={w * 0.03} y={h * 0.16} width={w * 0.16} height={h * 0.68} />
          <line className="hair" x1={w * 0.22} y1={h * 0.55} x2={w * 0.96} y2={h * 0.55} strokeDasharray="2.5 2" />
        </>
      )

    case 'table':
      return (
        <>
          <line className="kit-line thick warm-line" x1="0" y1={h * 0.2} x2={w} y2={h * 0.2} />
          <line className="kit-line warm-line" x1={w * 0.14} y1={h * 0.2} x2={w * 0.14} y2={h} />
          <line className="kit-line warm-line" x1={w * 0.86} y1={h * 0.2} x2={w * 0.86} y2={h} />
        </>
      )

    case 'locker':
      return (
        <>
          <rect className="kit" x="0" y="0" width={w} height={h} />
          {ticks(3, 0, h).map((y) => (
            <line key={y} className="hair" x1="0" y1={y} x2={w} y2={y} />
          ))}
          {ticks(3, 0, h).map((y) => (
            <circle key={`h${y}`} className="hair" cx={w * 0.8} cy={y} r="0.7" />
          ))}
        </>
      )
  }
}

/**
 * A person, drawn at `HUMAN_H_M`. Spec 004 RF-5: activity reads from posture
 * before it reads from colour.
 */
export function humanShape(activity: string, h: number, fitW?: number): JSX.Element {
  const w = h * 0.42

  if (activity === 'sleep') {
    // Lying down, and lying *in* something: given a berth's width, the figure
    // is drawn to fit it rather than sprawling out through the bulkhead.
    const bodyW = fitW ?? h * 0.92
    const bodyH = Math.min(h * 0.26, bodyW * 0.42)
    return (
      <g transform={fitW ? 'translate(0 0)' : `translate(0 ${h - bodyH})`}>
        <circle className="figure" cx={bodyH * 0.42} cy={bodyH * 0.5} r={bodyH * 0.36} />
        <path
          className="figure"
          d={`M${bodyH * 0.8} ${bodyH * 0.16} H${bodyW - bodyH * 0.3} a${bodyH * 0.34} ${bodyH * 0.34} 0 0 1 0 ${bodyH * 0.68} H${bodyH * 0.8} Z`}
        />
      </g>
    )
  }

  const head = h * 0.11
  const legs = activity === 'off' ? h * 0.5 : h * 0.55
  return (
    <>
      <circle className="figure" cx={w / 2} cy={head} r={head} />
      <path
        className="figure"
        d={`M${w / 2} ${head * 2} L${w * 0.16} ${h * 0.36} V${legs} h${w * 0.22} L${w * 0.46} ${h} h${w * 0.14} L${w * 0.62} ${legs} h${w * 0.22} V${h * 0.36} Z`}
      />
      {activity === 'watch' && (
        // Reaching for the panel: on watch is doing something.
        <path className="figure-arm" d={`M${w * 0.78} ${h * 0.4} L${w * 1.14} ${h * 0.3}`} />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Placing things in the room
// ---------------------------------------------------------------------------

export interface Placeable<T> {
  item: T
  glyph: Glyph
  fitting: Fitting
  sizeM: SizeM
}

export interface Placed<T> {
  item: T
  glyph: Glyph
  x: number
  y: number
  w: number
  h: number
}

/**
 * Space kept between anything and anything else, in drawing units.
 *
 * Glyphs are strokes, and a stroke straddles the path it is drawn on -- so a
 * shape occupies slightly more room than the box it was given. Laying out to
 * the nominal box alone produced drawings where a bunk clipped the bunk above
 * it by a couple of units. This is the allowance that stops that.
 */
export const GAP = 4

/**
 * Space a person needs above their own head: the initials tag, and the top of
 * a tap target drawn a little proud of the figure so it is reachable.
 *
 * Part of the room's height budget, because a tap target that overlaps the
 * machine behind it steals taps meant for the machine (RF-8) -- invisible on
 * the drawing, and infuriating to use.
 */
export const PERSON_TAG_U = 7

/** How deep a lying figure is, given the berth it has to fit in. */
export function sleepingDepth(h: number, fitW: number): number {
  return Math.min(h * 0.26, fitW * 0.42)
}

/**
 * A set of identical things, laid out together. Spec 004 RF-3.
 *
 * This is the unit the room is built from, and the reason it replaced a
 * bin-packer. Six bunks are not six rectangles that happen to be adjacent, they
 * are one berth stack; a packer fed them loose produced a staircase with the
 * mess table balanced on top, because "wrap upward when the row is full" is
 * exactly what it should do when it has no idea what a table is.
 *
 * A block knows its own shape. Everything else is just blocks side by side.
 */
export interface Block<T> {
  items: T[]
  glyph: Glyph
  fitting: Fitting
  sizeM: SizeM
  /** Across before up. Six in three columns is two tiers of three. */
  columns: number
  /** What activity puts a person in one of these, if any. */
  occupiedBy?: OccupiedBy
}

/** Where a block ended up, and where each slot inside it is. */
export interface PlacedBlock<T> {
  block: Block<T>
  x: number
  y: number
  w: number
  h: number
  /** One per item, in order: the box each individual thing occupies. */
  slots: { item: T; x: number; y: number; w: number; h: number }[]
}

function blockSize<T>(block: Block<T>, gap = GAP): { w: number; h: number; rows: number } {
  const iw = block.sizeM.w * U_PER_M
  const ih = block.sizeM.h * U_PER_M
  const cols = Math.min(block.columns, block.items.length)
  const rows = Math.ceil(block.items.length / cols)
  return { w: cols * iw + (cols - 1) * gap, h: rows * ih + (rows - 1) * gap, rows }
}

/**
 * Lay a room out as blocks standing side by side on the deck.
 *
 * A room elevation is a row of things against a back wall, not a bin to be
 * filled. Blocks stand on the deck from the left; a block that will not fit in
 * what is left starts a new tier above. Wall- and ceiling-fitted blocks hang in
 * the band along the overhead, out of everybody's way.
 *
 * Deterministic and order-preserving: the same content always draws the same
 * room, which is worth more than a tighter packing.
 */
export function layOutBlocks<T>(
  blocks: Block<T>[],
  box: { left: number; right: number; top: number; bottom: number },
  gap = GAP,
): PlacedBlock<T>[] {
  const out: PlacedBlock<T>[] = []
  // Biggest first. A berth stack is the thing a crew compartment is built
  // around, and anchoring it at the left with the small stuff filling in beside
  // it is both what the mockup drew and what stops a table being bumped up a
  // tier by whatever happened to be placed before it.
  const byArea = (a: Block<T>, b: Block<T>) =>
    blockSize(b, gap).w * blockSize(b, gap).h - blockSize(a, gap).w * blockSize(a, gap).h
  const onDeck = blocks.filter((b) => b.fitting === 'floor').sort(byArea)
  const aloft = blocks.filter((b) => b.fitting !== 'floor').sort(byArea)

  const band = bandHeight(aloft, gap)
  const deckTop = box.top + (band > 0 ? band + gap : 0)

  const put = (block: Block<T>, x: number, y: number) => {
    const iw = block.sizeM.w * U_PER_M
    const ih = block.sizeM.h * U_PER_M
    const cols = Math.min(block.columns, block.items.length)
    const size = blockSize(block, gap)
    out.push({
      block,
      x,
      y,
      ...size,
      // Filled bottom row first, so a half-empty stack reads as a stack with
      // its top tier empty rather than as one floating in the air.
      slots: block.items.map((item, i) => ({
        item,
        x: x + (i % cols) * (iw + gap),
        y: y + size.h - ih - Math.floor(i / cols) * (ih + gap),
        w: iw,
        h: ih,
      })),
    })
  }

  // --- the deck ---
  let x = box.left
  let tierBottom = box.bottom
  let tierHeight = 0
  for (const block of onDeck) {
    const size = blockSize(block, gap)
    if (x > box.left && x + size.w > box.right) {
      tierBottom -= tierHeight + gap
      tierHeight = 0
      x = box.left
    }
    put(block, x, tierBottom - size.h)
    tierHeight = Math.max(tierHeight, size.h)
    x += size.w + gap
  }

  // --- the overhead band, filling from the far end back toward the ladder ---
  let mx = box.right
  for (const block of aloft) {
    const size = blockSize(block, gap)
    mx -= size.w
    if (mx < box.left) mx = box.right - size.w
    put(block, mx, box.top + (band - size.h) / 2)
    mx -= gap
  }

  void deckTop
  return out
}

/** Vertical space the overhead band needs. */
export function bandHeight<T>(aloft: Block<T>[], gap = GAP): number {
  if (aloft.length === 0) return 0
  return Math.max(...aloft.map((b) => blockSize(b, gap).h)) + gap
}

/**
 * How tall a room must be to hold what is in it.
 *
 * Mirrors `layOutBlocks` exactly -- a room sized by a different rule than it is
 * filled by is a room that overflows.
 */
export function requiredRoomHeight<T>(blocks: Block<T>[], widthUnits: number, gap = GAP): number {
  const byArea = (a: Block<T>, b: Block<T>) =>
    blockSize(b, gap).w * blockSize(b, gap).h - blockSize(a, gap).w * blockSize(a, gap).h
  const onDeck = blocks.filter((b) => b.fitting === 'floor').sort(byArea)
  const aloft = blocks.filter((b) => b.fitting !== 'floor')
  let x = 0
  let stacked = 0
  let tierHeight = 0
  for (const block of onDeck) {
    const size = blockSize(block, gap)
    if (x > 0 && x + size.w > widthUnits) {
      stacked += tierHeight + gap
      tierHeight = 0
      x = 0
    }
    tierHeight = Math.max(tierHeight, size.h)
    x += size.w + gap
  }
  return stacked + tierHeight + bandHeight(aloft, gap) + gap
}
