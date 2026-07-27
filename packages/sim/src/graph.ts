/**
 * The ship as a system. Mockup 003, option C -- "the engineering panel".
 *
 * "Stations are nodes, the five networks are lines running between them, and
 * the lines move when the resource does." Design §1 pillar 1 promises that you
 * can trace why the O2 margin is thin; here that stops being a promise and
 * becomes following a line with your finger.
 *
 * The distinction from `flows.ts` is topology. A ranked list can say the
 * hydroponics rack is the biggest draw; only a graph can say the reactor feeds
 * it, that its waste heat goes to the same radiators as everything else, and
 * that the water it drinks comes back round. When a scrubber fails and CO2
 * climbs, the cascade is a *shape* rather than three numbers on three screens.
 *
 * Everything here is derived from the same balances the rest of the UI reads
 * (SV-14). Nothing is drawn by hand, so a part added in content appears on the
 * diagram without anybody positioning it.
 *
 * The known cost, stated in 003 and still true: "twelve parts and five networks
 * is already near the limit ... the graph does not degrade gracefully." The
 * channel filter is the answer -- all five at once while the ship is small,
 * one at a time when it is not.
 */
import { getPart, getRoom } from '@solsyn/data'
import { crewViews } from './engine.js'
import { partPowerKw, partRunning, powerBalance, lifeBalance } from './networks.js'
import { levelAt } from './resources.js'
import type { ResourceKey, SimState } from './types.js'

/** What a node is *for*, which decides how it is drawn. */
export type GraphRole = 'source' | 'consumer' | 'store' | 'sink'

export interface GraphNode {
  id: string
  /** Full name, for the card that opens when it is tapped. */
  name: string
  /** Short form for the box itself: "REACTOR", not "Beacon-4 Fission Plant". */
  short: string
  role: GraphRole
  /** Which deck it lives on, so the graph can be laid out like the ship. */
  deck: number
  roomId: string
  /** The lines under the name. Already formatted, in reading order. */
  figures: string[]
  /** Initials of anyone standing there right now (003 kept crew visible). */
  crew: string[]
  /** Off, failed, or shed: on the diagram but not contributing. */
  idle: boolean
  partId?: string
}

export interface GraphEdge {
  id: string
  /** Which network this line belongs to -- and therefore its colour. */
  channel: ResourceKey
  fromId: string
  toId: string
  /** Always positive. Sets the line's width and how fast the dashes move. */
  magnitude: number
  /** A loop that returns to where it started, drawn as a round trip. */
  loop?: boolean
}

export interface FlowGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export function flowGraph(state: SimState): FlowGraph {
  const t = state.now
  const power = powerBalance(state, t)
  const life = lifeBalance(state, t)
  const crew = crewViews(state)

  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []

  const deckOf = (roomId: string) => {
    const room = state.ship.rooms.find((r) => r.id === roomId)
    return room ? getRoom(room.defId).deck : 0
  }

  // --- one node per installed part ------------------------------------------
  for (const part of state.ship.parts) {
    const def = getPart(part.defId)
    const kw = partPowerKw(state, part, t)
    const running = partRunning(part)

    const figures: string[] = []
    if (kw !== 0) figures.push(`${kw > 0 ? '+' : ''}${kw.toFixed(1)} kW`)
    if (!running) figures.push(part.broken ? 'failed' : part.shed ? 'shed' : 'off')

    nodes.push({
      id: part.id,
      name: def.name,
      short: def.short,
      role: kw > 0 ? 'source' : def.provides?.heatRejectKw ? 'sink' : 'consumer',
      deck: deckOf(part.roomId),
      roomId: part.roomId,
      figures,
      crew: crew.filter((c) => c.roomId === part.roomId).map((c) => c.initials),
      idle: !running,
      partId: part.id,
    })
  }

  // The battery bank is a part like any other, so it is already a node -- it
  // just needs to say what it is doing rather than what it draws. A second
  // synthetic "store" node beside it drew the same object twice.
  const bank = nodes.find((n) => n.id === 'power.battery.bank')
  const battery = state.ship.resources.battery
  if (bank) {
    bank.role = 'store'
    bank.figures = [
      `${Math.round((levelAt(battery, t) / battery.max) * 100)}%`,
      power.netKw >= 0 ? 'charging' : 'draining',
    ]
  }

  const byId = new Map(nodes.map((n) => [n.id, n]))
  const sources = nodes.filter((n) => n.role === 'source')
  const sinks = nodes.filter((n) => n.role === 'sink')
  const draws = nodes.filter((n) => n.role === 'consumer' || n.role === 'sink')

  // --- power: every source to every draw, and the balance to the bank --------
  //
  // Drawn as real pairs rather than through an abstract bus, because the whole
  // point of this view is that a line goes from a thing to a thing. Magnitude
  // is the source's share of that draw, so the widths still sum correctly.
  const totalSupply = sources.reduce((sum, s) => sum + Math.abs(partKw(state, s, t)), 0)
  for (const source of sources) {
    const share = totalSupply > 0 ? Math.abs(partKw(state, source, t)) / totalSupply : 0
    for (const draw of draws) {
      const kw = Math.abs(partKw(state, draw, t))
      if (kw <= 0) continue
      edges.push({
        id: `power:${source.id}->${draw.id}`,
        channel: 'battery',
        fromId: source.id,
        toId: draw.id,
        magnitude: kw * share,
      })
    }
    edges.push({
      id: `power:${source.id}->bank`,
      channel: 'battery',
      fromId: power.netKw >= 0 ? source.id : (bank?.id ?? source.id),
      toId: power.netKw >= 0 ? (bank?.id ?? source.id) : source.id,
      magnitude: Math.abs(power.netKw) * share,
    })
  }

  // --- heat: everything that runs warm, to whatever rejects it --------------
  const radiator = sinks[0]
  if (radiator) {
    for (const node of nodes) {
      if (node.id === radiator.id || node.role === 'store') continue
      const def = node.partId ? getPart(state.ship.parts.find((p) => p.id === node.partId)!.defId) : undefined
      const waste = def?.provides?.thermalWasteKw ?? 0
      if (waste <= 0 || node.idle) continue
      edges.push({
        id: `heat:${node.id}`,
        channel: 'heat',
        fromId: node.id,
        toId: radiator.id,
        magnitude: waste,
      })
    }
  }

  // --- water: the loop, which is the thing a ranked list could never show ---
  const recycler = nodes.find((n) => n.id === 'life.water.recycler')
  const grow = nodes.find((n) => n.id === 'life.hydroponics.lamps')
  if (recycler && grow) {
    edges.push({
      id: 'water:loop',
      channel: 'water',
      fromId: grow.id,
      toId: recycler.id,
      magnitude: Math.abs(life.waterPerDay),
      loop: true,
    })
  }

  // Drop edges whose endpoints went missing with a refit, rather than drawing
  // a line to nowhere.
  return { nodes, edges: edges.filter((e) => byId.has(e.fromId) && byId.has(e.toId)) }
}

/** Power for a node that is a part; zero for anything else. */
function partKw(state: SimState, node: GraphNode, t: number): number {
  const part = state.ship.parts.find((p) => p.id === node.partId)
  return part ? partPowerKw(state, part, t) : 0
}
