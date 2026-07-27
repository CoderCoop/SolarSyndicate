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
import type { Fitting, Glyph, SizeM } from '@solsyn/data'
import type { JSX } from 'react'

/** Drawing units per metre. Sets how big the whole ship reads. */
export const U_PER_M = 15

/** Interior width of the pressurised hull, metres. */
export const INTERIOR_W_M = 6

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
export function humanShape(activity: string, h: number): JSX.Element {
  const w = h * 0.42

  if (activity === 'sleep') {
    // Lying down. Drawn wide and low, which is unmistakable at a glance.
    const bodyW = h * 0.92
    const bodyH = h * 0.26
    return (
      <g transform={`translate(${-bodyW / 2 + w / 2} ${h - bodyH})`}>
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

/** How the deck is shared out before anything is placed on it. */
export interface RoomLayoutOptions {
  /**
   * Width kept clear at the right-hand end of the deck line, for people.
   *
   * People stand on the deck; they are not furniture and cannot be packed
   * around. Reserving their strip first is what stops the captain being drawn
   * through the comms array -- equipment that will not fit in what is left
   * moves up a tier instead of sharing the space.
   */
  deckReserve?: number
  /**
   * How far up the reserve goes.
   *
   * A person is taller than one tier of stores, so reserving only the deck line
   * leaves their head in the tier above -- which is exactly what put three of
   * the crew inside the bunks. The strip is a person's full height, not a
   * person's footprint.
   */
  reserveHeight?: number
  gap?: number
}

/**
 * Lay a room out. Spec 004 RF-3.
 *
 * Floor-standing objects sit on the deck in a row and wrap upward when the run
 * is full -- which is what makes six bunks read as two tiers of three rather
 * than a queue. Wall-mounted objects hang from the bulkhead in their own band,
 * filling from the far end so they do not collide with what is on the deck.
 * Only the deck line itself is shortened by `deckReserve`: the tiers above it
 * are clear of people and use the full width.
 *
 * Not an optimal packing, and it does not need to be: a deck holds a handful of
 * objects and a stable, predictable arrangement is worth more than a tight one.
 * The same content always draws the same room.
 */
export function layOutRoom<T>(
  items: Placeable<T>[],
  box: { left: number; right: number; top: number; bottom: number },
  options: RoomLayoutOptions = {},
): Placed<T>[] {
  const gap = options.gap ?? GAP
  const deckReserve = options.deckReserve ?? 0
  const reserveHeight = options.reserveHeight ?? 0
  const out: Placed<T>[] = []
  const floor = items.filter((i) => i.fitting === 'floor')
  const mounted = items.filter((i) => i.fitting !== 'floor')

  // The bulkhead band is reserved before anything stands up in the room, so a
  // wall unit can never end up drawn through the top of a tall floor-standing
  // one. Nothing overlaps by accident; it is not allowed to.
  const band = wallBandHeight(items, gap)

  // --- deck level, wrapping upward, never into the reserved band ---
  let x = box.left
  let tierBottom = box.bottom
  let tierHeight = 0
  // A tier is in people's space while its floor is still below the top of
  // their heads. Above that the full width is free again.
  const rightOf = (bottom: number) =>
    bottom > box.bottom - reserveHeight ? box.right - deckReserve : box.right
  for (const it of floor) {
    const w = it.sizeM.w * U_PER_M
    const h = it.sizeM.h * U_PER_M
    // Wrap when the run is full -- including on the very first object, which
    // the deck line can be too short for once people have their strip. Bunks
    // in a room with three people off watch is exactly that case: nothing fits
    // beside them, so everything goes up.
    // Keep going up while it still does not fit: one wrap is not enough when
    // the tier above is also in the reserve. Bounded so a single oversized
    // object can never spin here.
    const full = box.right - box.left
    for (let up = 0; x + w > rightOf(tierBottom) && (x > box.left || w <= full) && up < 8; up++) {
      tierBottom -= tierHeight + gap
      tierHeight = 0
      x = box.left
    }
    out.push({ item: it.item, glyph: it.glyph, x, y: tierBottom - h, w, h })
    tierHeight = Math.max(tierHeight, h)
    x += w + gap
  }

  // --- bulkhead, filling from the far end back toward the ladder ---
  let mx = box.right
  for (const it of mounted) {
    const w = it.sizeM.w * U_PER_M
    const h = it.sizeM.h * U_PER_M
    mx -= w
    if (mx < box.left) mx = box.right - w
    out.push({ item: it.item, glyph: it.glyph, x: mx, y: box.top + (band - h) / 2, w, h })
    mx -= gap
  }

  return out
}

/** Vertical space the wall-mounted band needs, in drawing units. */
export function wallBandHeight<T>(items: Placeable<T>[], gap = GAP): number {
  const mounted = items.filter((i) => i.fitting !== 'floor')
  if (mounted.length === 0) return 0
  return Math.max(...mounted.map((i) => i.sizeM.h * U_PER_M)) + gap
}

/**
 * How tall a room must be to hold what is in it, in drawing units: the deck
 * tiers plus the reserved bulkhead band above them.
 *
 * Mirrors `layOutRoom`'s wrap rule exactly, `deckReserve` included -- a room
 * sized by a different rule than it is filled by is a room that overflows.
 */
export function requiredHeight<T>(
  items: Placeable<T>[],
  widthUnits: number,
  options: RoomLayoutOptions = {},
): number {
  const gap = options.gap ?? GAP
  const deckReserve = options.deckReserve ?? 0
  const reserveHeight = options.reserveHeight ?? 0
  let x = 0
  let stacked = 0
  let tierHeight = 0
  // `stacked` is how far this tier's floor is above the deck line, so it is
  // exactly the test layOutRoom makes against the reserve.
  const rightAt = (up: number) => (up < reserveHeight ? widthUnits - deckReserve : widthUnits)
  for (const it of items.filter((i) => i.fitting === 'floor')) {
    const w = it.sizeM.w * U_PER_M
    const h = it.sizeM.h * U_PER_M
    for (let up = 0; x + w > rightAt(stacked) && (x > 0 || w <= widthUnits) && up < 8; up++) {
      stacked += tierHeight + gap
      tierHeight = 0
      x = 0
    }
    tierHeight = Math.max(tierHeight, h)
    x += w + gap
  }
  return stacked + tierHeight + wallBandHeight(items, gap)
}
