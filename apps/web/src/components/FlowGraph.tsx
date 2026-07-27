/**
 * The engineering panel. Mockup 003, option C.
 *
 * Stations are nodes laid out the way the ship is laid out -- nose at the top,
 * engines at the bottom -- and the five networks are lines running between
 * them. The lines move when the resource does, so a glance says not only how
 * much but *which way*, and a dead line is visibly dead.
 *
 * This replaces the ranked column that stood here before. A ranked list can
 * say the hydroponics rack is the biggest draw; it cannot say the reactor
 * feeds it, that its waste heat goes where everything else's does, or that
 * the water comes back round. Following a line with your finger is the whole
 * point (§1 pillar 1), and a list has no lines to follow.
 *
 * 003 named the risk and it has not gone away: "twelve parts and five networks
 * is already near the limit ... the graph does not degrade gracefully". The
 * channel filter is the answer, so a busier ship narrows to one network rather
 * than becoming a hairball.
 */
import { useMemo, useState } from 'react'
import type { FlowGraph as Graph, GraphEdge, GraphNode } from '@solsyn/sim'

const W = 336
const PAD = 12
const NODE_H = 42
const ROW_H = 58
const TOP = 16
const COL_GAP = 10
/**
 * Most boxes on one row.
 *
 * A deck can hold four parts; four boxes across a phone leaves 75 units each,
 * which is narrower than the words that have to go in them -- and a label that
 * overflows its box is painted over by the next box along, so it does not read
 * as "too long", it reads as *missing*. A crowded deck wraps to a second row
 * instead.
 */
const PER_ROW = 3

/** One colour per network, matching the Life tab's gauges. */
const CHANNELS = [
  { key: 'battery', label: 'power' },
  { key: 'heat', label: 'heat' },
  { key: 'water', label: 'water' },
  { key: 'o2', label: 'oxygen' },
  { key: 'co2', label: 'CO₂' },
] as const

type ChannelKey = (typeof CHANNELS)[number]['key']

interface Placed extends GraphNode {
  x: number
  y: number
  /** Width is per row, so a row of two gets wider boxes than a row of three. */
  w: number
}

/**
 * Lay the nodes out by deck.
 *
 * Deck is the y, position within the deck is the x. Nothing is positioned by
 * hand, so a part added in content lands somewhere sensible without anybody
 * touching this file -- and the diagram keeps the ship's own shape, which is
 * what makes it readable as *this* ship rather than as a generic graph.
 */
function place(nodes: GraphNode[]): { placed: Placed[]; height: number } {
  const decks = [...new Set(nodes.map((n) => n.deck))].sort((a, b) => a - b)
  const span = W - PAD * 2
  const placed: Placed[] = []
  let row = 0

  for (const deck of decks) {
    const onDeck = nodes.filter((n) => n.deck === deck)
    for (let i = 0; i < onDeck.length; i += PER_ROW) {
      const chunk = onDeck.slice(i, i + PER_ROW)
      const w = (span - COL_GAP * (chunk.length - 1)) / chunk.length
      const used = chunk.length * w + COL_GAP * (chunk.length - 1)
      chunk.forEach((node, col) => {
        placed.push({
          ...node,
          x: PAD + (span - used) / 2 + col * (w + COL_GAP),
          y: TOP + row * ROW_H,
          w,
        })
      })
      row += 1
    }
  }

  return { placed, height: TOP + row * ROW_H + 10 }
}

/**
 * Route an edge as two verticals and a horizontal, the way a cable run
 * actually goes. Straight diagonals across a diagram of boxes read as noise;
 * right angles read as plumbing, which is what these are.
 */
function route(from: Placed, to: Placed): string {
  const x1 = from.x + from.w / 2
  const x2 = to.x + to.w / 2
  const downward = to.y > from.y
  const y1 = downward ? from.y + NODE_H : from.y
  const y2 = downward ? to.y : to.y + NODE_H
  const mid = (y1 + y2) / 2
  if (Math.abs(x1 - x2) < 1) return `M${x1} ${y1} V${y2}`
  return `M${x1} ${y1} V${mid} H${x2} V${y2}`
}

/** A loop leaves one side and comes back, so it needs a bulge to be visible. */
function routeLoop(from: Placed, to: Placed): string {
  const x1 = from.x
  const x2 = to.x
  const y1 = from.y + NODE_H / 2
  const y2 = to.y + NODE_H / 2
  const out = Math.min(x1, x2) - 9
  return `M${x1} ${y1} H${out} V${y2} H${x2}`
}

function width(magnitude: number, scale: number): number {
  if (magnitude <= 0) return 1
  return 1.4 + Math.min(1, magnitude / scale) * 4
}

export function FlowGraph({
  graph,
  onOpenPart,
}: {
  graph: Graph
  onOpenPart?: (partId: string) => void
}) {
  const [only, setOnly] = useState<ChannelKey | 'all'>('all')
  const [openId, setOpenId] = useState<string | undefined>()

  const { placed, height } = useMemo(() => place(graph.nodes), [graph.nodes])
  const byId = useMemo(() => new Map(placed.map((n) => [n.id, n])), [placed])

  const present = CHANNELS.filter((c) => graph.edges.some((e) => e.channel === c.key))
  const edges = graph.edges.filter((e) => only === 'all' || e.channel === only)

  // Width is scaled *within* a network, not across all of them. A reactor's
  // 66 kW of waste heat against a scrubber's 1.2 kW of draw are both "kW" and
  // are not the same quantity; one shared scale makes every power line a
  // hairline beside the heat, which says nothing true about either.
  const scaleFor = useMemo(() => {
    const max = new Map<string, number>()
    for (const e of graph.edges) max.set(e.channel, Math.max(max.get(e.channel) ?? 0, e.magnitude))
    return max
  }, [graph.edges])
  const open = placed.find((n) => n.id === openId)

  const drawEdge = (edge: GraphEdge) => {
    const from = byId.get(edge.fromId)
    const to = byId.get(edge.toId)
    if (!from || !to) return null
    return (
      <path
        key={edge.id}
        className={`fgr__edge fgr__edge--${edge.channel} ${edge.magnitude > 0 ? 'is-live' : ''}`}
        d={edge.loop ? routeLoop(from, to) : route(from, to)}
        strokeWidth={width(edge.magnitude, scaleFor.get(edge.channel) ?? 1)}
      />
    )
  }

  return (
    <section className="panel fgr" aria-label="Systems diagram">
      <h2 className="panel__title">Flows</h2>

      <div className="log__filters" role="group" aria-label="Filter by network">
        <button
          type="button"
          className={`chip ${only === 'all' ? 'is-on' : ''}`}
          aria-pressed={only === 'all'}
          onClick={() => setOnly('all')}
        >
          All
        </button>
        {present.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`chip chip--net chip--${c.key} ${only === c.key ? 'is-on' : ''}`}
            aria-pressed={only === c.key}
            onClick={() => setOnly(c.key)}
          >
            <i className={`chip__dot chip__dot--${c.key}`} aria-hidden="true" />
            {c.label}
          </button>
        ))}
      </div>

      <svg
        className="fgr__svg"
        viewBox={`0 0 ${W} ${height}`}
        role="img"
        aria-label={describe(graph)}
      >
        {/* Lines first, so a box is never drawn under its own plumbing. */}
        {edges.map(drawEdge)}

        {placed.map((node) => (
          <g
            key={node.id}
            className={`fgr__node fgr__node--${node.role} ${node.idle ? 'is-idle' : ''} ${
              openId === node.id ? 'is-open' : ''
            }`}
          >
            <rect className="fgr__box" x={node.x} y={node.y} width={node.w} height={NODE_H} rx="6" />
            <text className="fgr__name" x={node.x + 7} y={node.y + 15}>
              {node.short}
            </text>
            {node.figures.map((f, i) => (
              <text key={f} className="fgr__figure" x={node.x + 7} y={node.y + 27 + i * 11}>
                {f}
              </text>
            ))}

            {/* 003 would not compromise on crew presence, and neither does this. */}
            {node.crew.map((initials, i) => (
              <g key={initials} className="fgr__crew">
                <circle cx={node.x + node.w - 9 - i * 14} cy={node.y + 9} r="6.5" />
                <text x={node.x + node.w - 9 - i * 14} y={node.y + 11.5} textAnchor="middle">
                  {initials}
                </text>
              </g>
            ))}

            {/* The box gets a class of its own rather than being styled as
                `.fgr__node rect`, because that selector also caught the tap
                target sitting on top of the label -- class+element outranks
                the plain class the target was styled with, so it inherited the
                box's opaque fill and painted every label out. The diagram drew
                as boxes with no words in them. `fill="none"` here as well:
                belt and braces on the element whose whole job is to be
                invisible. */}
            <rect
              className="fgr__hit"
              fill="none"
              pointerEvents="all"
              x={node.x}
              y={node.y}
              width={node.w}
              height={NODE_H}
              role="button"
              tabIndex={0}
              aria-label={`${node.name}. ${node.figures.join(', ')}.`}
              onClick={() => setOpenId(openId === node.id ? undefined : node.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setOpenId(openId === node.id ? undefined : node.id)
                }
              }}
            />
          </g>
        ))}
      </svg>

      {open && (
        <div className="fgr__card">
          <div className="fgr__card-head">
            <strong>{open.name}</strong>
            <span>{open.figures.join(' · ')}</span>
          </div>
          <ul className="fgr__links">
            {graph.edges
              .filter((e) => e.fromId === open.id || e.toId === open.id)
              .slice(0, 6)
              .map((e) => {
                const other = byId.get(e.fromId === open.id ? e.toId : e.fromId)
                return (
                  <li key={e.id}>
                    <i className={`chip__dot chip__dot--${e.channel}`} aria-hidden="true" />
                    <span>
                      {e.fromId === open.id ? 'to' : 'from'} {other?.name ?? '—'}
                    </span>
                  </li>
                )
              })}
          </ul>
          {open.partId && onOpenPart && (
            <button
              type="button"
              className="button button--small"
              onClick={() => onOpenPart(open.partId!)}
            >
              Open on the ship
            </button>
          )}
        </div>
      )}

      <p className="panel__note">
        Every station on the ship, and what runs between them. Line colour is the network, width
        is how much, and the dashes travel the way the resource does — so a line that has stopped
        moving is a network that has stopped.
      </p>
    </section>
  )
}

/** What a screen reader hears instead of the diagram. */
function describe(graph: Graph): string {
  const sources = graph.nodes.filter((n) => n.role === 'source').map((n) => n.name)
  return `Systems diagram. ${graph.nodes.length} stations, ${graph.edges.length} connections. Supplied by ${sources.join(' and ')}.`
}
