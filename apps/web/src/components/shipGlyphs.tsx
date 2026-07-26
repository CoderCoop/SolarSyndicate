/**
 * The glyph vocabulary. Spec 003 SV-3, SV-4.
 *
 * Blueprint line-art: each thing aboard the ship draws itself as the shape it
 * actually is, at a size that says something about it. A reactor core is the
 * largest object on the ship and looks it; a spares locker is a slot.
 *
 * This file is the *only* place that knows what a glyph looks like. Content
 * chooses from the closed enum in `@solsyn/data`; adding a new kind of object
 * means adding a case here and a name there, which is deliberate friction
 * (SV-3). Adding a part that reuses an existing glyph costs nothing.
 *
 * Everything is drawn in a local box from (0,0) to (w,h), so the packer below
 * can place a glyph without knowing what it is.
 */
import type { Glyph } from '@solsyn/data'
import type { JSX } from 'react'

/** Intrinsic size of each glyph, in deck units. */
export const GLYPH_SIZE: Record<Glyph, { w: number; h: number }> = {
  core: { w: 32, h: 19 },
  nozzle: { w: 21, h: 17 },
  tray: { w: 27, h: 15 },
  bay: { w: 16, h: 14 },
  column: { w: 12, h: 21 },
  panel: { w: 24, h: 9 },
  hab: { w: 20, h: 13 },
  pump: { w: 19, h: 13 },
  battery: { w: 19, h: 10 },
  console: { w: 17, h: 9 },
  dish: { w: 15, h: 13 },
  couch: { w: 15, h: 8 },
  bunk: { w: 16, h: 6 },
  table: { w: 17, h: 6 },
  locker: { w: 8, h: 13 },
}

/**
 * Semantic tint. Borrowed from the cutaway mockup, which was rejected as a
 * *direction* but was right about one thing: warm where people rest, green
 * where things grow, hot where the reactor is. Colour carries meaning, and
 * never carries it alone (SV-5).
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

export function glyphShape(glyph: Glyph, w: number, h: number): JSX.Element {
  switch (glyph) {
    case 'core':
      // Cylindrical pile behind its shadow shield -- the shield is the reason
      // the tanks sit where they do, so it is drawn, not implied.
      return (
        <>
          <rect className="g-fill" x={w * 0.28} y={h * 0.16} width={w * 0.44} height={h * 0.68} rx="2" />
          <circle className="g-hot" cx={w / 2} cy={h / 2} r={h * 0.17} />
          <line x1={w * 0.05} y1={h * 0.9} x2={w * 0.95} y2={h * 0.9} strokeWidth="2.2" />
          {ticks(7, w * 0.08, w * 0.92).map((x) => (
            <line key={x} x1={x} y1={h * 0.9} x2={x} y2={h * 0.99} />
          ))}
        </>
      )

    case 'nozzle':
      return (
        <>
          <path className="g-fill" d={`M${w * 0.3} 0 H${w * 0.7} L${w * 0.95} ${h} H${w * 0.05} Z`} />
          {ticks(3, 0.1 * h, 0.95 * h).map((y) => (
            <line key={y} x1={w * (0.3 - (0.25 * y) / h)} y1={y} x2={w * (0.7 + (0.25 * y) / h)} y2={y} />
          ))}
        </>
      )

    case 'tray':
      // Stacked grow trays under lamps. The lamp bar sits above each tray.
      return (
        <>
          {[0.1, 0.45, 0.8].map((f) => (
            <g key={f}>
              <line x1={w * 0.08} y1={h * f} x2={w * 0.92} y2={h * f} className="g-lamp" />
              <rect className="g-grow" x={w * 0.08} y={h * (f + 0.09)} width={w * 0.84} height={h * 0.12} />
            </g>
          ))}
        </>
      )

    case 'bay':
      return (
        <>
          <rect className="g-fill" x="0.6" y="0.6" width={w - 1.2} height={h - 1.2} rx="1" />
          <line x1="0.6" y1={h * 0.3} x2={w - 0.6} y2={h * 0.3} strokeDasharray="2 2" />
          <line x1={w * 0.5} y1={h * 0.3} x2={w * 0.5} y2={h - 0.6} strokeDasharray="2 2" />
        </>
      )

    case 'column':
      return (
        <>
          <rect className="g-fill" x="0.8" y={h * 0.08} width={w - 1.6} height={h * 0.84} rx={w * 0.35} />
          {ticks(4, h * 0.14, h * 0.86).map((y) => (
            <line key={y} x1="1.6" y1={y} x2={w - 1.6} y2={y} />
          ))}
          <line x1={w / 2} y1="0" x2={w / 2} y2={h * 0.08} />
          <line x1={w / 2} y1={h * 0.92} x2={w / 2} y2={h} />
        </>
      )

    case 'panel':
      return (
        <>
          <line x1="0" y1={h / 2} x2={w * 0.14} y2={h / 2} strokeWidth="2" />
          <rect className="g-fill" x={w * 0.14} y="0.6" width={w * 0.86 - 0.6} height={h - 1.2} />
          {ticks(5, w * 0.14, w - 0.6).map((x) => (
            <line key={x} x1={x} y1="0.6" x2={x} y2={h - 0.6} />
          ))}
        </>
      )

    case 'hab':
      // Galley block and the exercise rig that keeps the medic happy.
      return (
        <>
          <rect className="g-fill" x="0.6" y={h * 0.35} width={w * 0.55} height={h * 0.6} />
          {ticks(3, h * 0.42, h * 0.92).map((y) => (
            <line key={y} x1="1.6" y1={y} x2={w * 0.55 - 0.6} y2={y} />
          ))}
          <circle cx={w * 0.79} cy={h * 0.42} r={h * 0.16} />
          <line x1={w * 0.79} y1={h * 0.58} x2={w * 0.79} y2={h * 0.95} strokeWidth="1.6" />
          <line x1={w * 0.66} y1={h * 0.95} x2={w * 0.92} y2={h * 0.95} strokeWidth="1.6" />
        </>
      )

    case 'pump':
      return (
        <>
          <circle className="g-fill" cx={w * 0.28} cy={h * 0.5} r={h * 0.32} />
          <line x1={w * 0.28} y1={h * 0.18} x2={w * 0.28} y2={h * 0.82} />
          <path d={`M${w * 0.52} ${h * 0.5} H${w * 0.98}`} strokeWidth="1.8" />
          {ticks(4, w * 0.56, w * 0.98).map((x) => (
            <line key={x} x1={x} y1={h * 0.14} x2={x} y2={h * 0.86} />
          ))}
        </>
      )

    case 'battery':
      return (
        <>
          <rect className="g-fill" x="0.6" y={h * 0.18} width={w - 3} height={h * 0.64} rx="1" />
          {ticks(4, 1.6, w - 4).map((x) => (
            <line key={x} x1={x} y1={h * 0.24} x2={x} y2={h * 0.76} strokeWidth="1.8" />
          ))}
          <rect x={w - 2.4} y={h * 0.36} width="2" height={h * 0.28} />
        </>
      )

    case 'console':
      return (
        <>
          <path className="g-fill" d={`M${w * 0.1} ${h} L${w * 0.22} ${h * 0.15} H${w * 0.9} L${w * 0.9} ${h} Z`} />
          <line x1={w * 0.3} y1={h * 0.42} x2={w * 0.82} y2={h * 0.42} />
          <line x1={w * 0.3} y1={h * 0.62} x2={w * 0.7} y2={h * 0.62} />
        </>
      )

    case 'dish':
      return (
        <>
          <path className="g-fill" d={`M${w * 0.08} ${h * 0.62} A${w * 0.46} ${h * 0.55} 0 0 1 ${w * 0.92} ${h * 0.62} Z`} />
          <line x1={w * 0.5} y1={h * 0.62} x2={w * 0.5} y2={h * 0.96} strokeWidth="1.6" />
          <line x1={w * 0.5} y1={h * 0.18} x2={w * 0.5} y2={h * 0.62} />
          <circle cx={w * 0.5} cy={h * 0.18} r="1.4" />
        </>
      )

    case 'couch':
      // A reclined acceleration seat, seen side-on: back raked toward the nose,
      // seat pan flat, restraint across the chest.
      return (
        <>
          <path
            className="g-warm"
            d={`M${w * 0.06} ${h * 0.12} L${w * 0.44} ${h * 0.58} H${w * 0.94} V${h * 0.86} H${w * 0.3} Z`}
          />
          <line x1={w * 0.14} y1={h * 0.3} x2={w * 0.34} y2={h * 0.16} />
          <line x1={w * 0.44} y1={h * 0.86} x2={w * 0.44} y2={h} />
          <line x1={w * 0.86} y1={h * 0.86} x2={w * 0.86} y2={h} />
        </>
      )

    case 'bunk':
      // Mattress with a pillow at the head end. Square corners: a bunk is a
      // shelf you sleep on, not a capsule.
      return (
        <>
          <rect className="g-warm" x="0.4" y="0.4" width={w - 0.8} height={h - 0.8} />
          <rect x="1.4" y="1.3" width={w * 0.2} height={h - 2.6} />
          <line x1={w * 0.32} y1={h * 0.5} x2={w - 1.6} y2={h * 0.5} strokeDasharray="2 1.6" />
        </>
      )

    case 'table':
      return (
        <>
          <line x1="0.5" y1={h * 0.3} x2={w - 0.5} y2={h * 0.3} strokeWidth="2" />
          <line x1={w * 0.2} y1={h * 0.3} x2={w * 0.2} y2={h} />
          <line x1={w * 0.8} y1={h * 0.3} x2={w * 0.8} y2={h} />
        </>
      )

    case 'locker':
      return (
        <>
          <rect className="g-fill" x="0.5" y="0.5" width={w - 1} height={h - 1} />
          {ticks(3, 0.5, h - 0.5).map((y) => (
            <line key={y} x1="0.5" y1={y} x2={w - 0.5} y2={y} />
          ))}
        </>
      )
  }
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export interface Placed<T> {
  item: T
  x: number
  y: number
  w: number
  h: number
}

/**
 * Shelf packing: fill a row left to right, drop to the next when the next
 * glyph will not fit. Not optimal, and it does not need to be -- a deck holds
 * a handful of objects and a stable, predictable arrangement is worth more
 * than a tight one. The same content always produces the same picture.
 */
export function packGlyphs<T>(
  items: { item: T; glyph: Glyph }[],
  box: { left: number; right: number; top: number; bottom: number },
  gap = 3,
): Placed<T>[] {
  const out: Placed<T>[] = []
  let x = box.left
  let rowTop = box.top
  let rowHeight = 0

  for (const { item, glyph } of items) {
    const { w, h } = GLYPH_SIZE[glyph]
    if (x > box.left && x + w > box.right) {
      rowTop += rowHeight + gap
      rowHeight = 0
      x = box.left
    }
    // Bottom-align within the row: things sit on the deck, they do not float.
    out.push({ item, x, y: rowTop, w, h })
    rowHeight = Math.max(rowHeight, h)
    x += w + gap
  }

  // Vertically centre the packed block in the available space, so a sparse
  // deck does not look top-heavy.
  const used = rowTop + rowHeight - box.top
  const slack = Math.max(0, box.bottom - box.top - used)
  const shift = slack / 2
  return out.map((p) => ({ ...p, y: p.y + shift }))
}

/** Total height a pack needs, used to size a deck that data made too short. */
export function packedHeight<T>(items: { item: T; glyph: Glyph }[], width: number, gap = 3): number {
  let x = 0
  let top = 0
  let rowHeight = 0
  for (const { glyph } of items) {
    const { w, h } = GLYPH_SIZE[glyph]
    if (x > 0 && x + w > width) {
      top += rowHeight + gap
      rowHeight = 0
      x = 0
    }
    rowHeight = Math.max(rowHeight, h)
    x += w + gap
  }
  return top + rowHeight
}
