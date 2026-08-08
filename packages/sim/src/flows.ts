/**
 * Flow channels. Spec 004 RF-13 to RF-20. Design doc §3.2.
 *
 * The first attempt at this was an overlay in the ship view's right margin.
 * Three parallel lines in a twelve-unit strip can encode *how much* passes each
 * deck and nothing else, because there is nowhere to route an edge sideways --
 * so it answered a question nobody had asked. Topology is the whole point of a
 * flow view, and topology needs its own canvas.
 *
 * One channel per gauge on the Life tab, plus power, which lives in the status
 * bar instead. Every channel uses the same grammar so learning one teaches the
 * rest:
 *
 *   sources   what puts the resource in
 *   consumers what takes it out, ranked by magnitude
 *   returns   what comes back -- the recycler loop is the reason this matters
 *   buffer    the thing absorbing the difference, which is neither
 *   net       the balance, and the horizon in days
 *
 * Every figure comes from the same selectors the rest of the UI reads, so a
 * link the player can see is always a number they could also read (SV-14).
 */
import { getHull, getPart, type PowerPriority } from '@solsyn/data'
import { crewViews } from './engine.js'
import { METABOLIC, activityLoad } from './crew.js'
import {
  ALONGSIDE_SUPPLY,
  lifeBalance,
  partScale,
  partRunning,
  powerBalance,
  partPowerKw,
} from './networks.js'
import { levelAt } from './resources.js'
import { co2Ppm } from './crew.js'
import { type GameTime } from './time.js'
import type { SimState } from './types.js'

/** Which side of the balance a node sits on. */
export type FlowRole = 'source' | 'consumer' | 'return' | 'buffer'

export interface FlowNode {
  id: string
  name: string
  /** Where it is, so the player can go and look at it. */
  where: string
  role: FlowRole
  /** Always positive; `role` carries the direction. */
  magnitude: number
  /** The part this node is, if it is one -- for linking back to the ship. */
  partId?: string
  /** One line of why, when the number alone is not the story. */
  note?: string
  /** Not contributing right now (off, failed, or shed). */
  idle?: boolean
  /**
   * Load priority, for a part that has one.
   *
   * On the diagram it is half of "Engines · low priority" and the colour of
   * the row's stripe -- which together answer the question the flow view is
   * actually for: not "what is drawing the most" but "what can I switch off".
   */
  priority?: PowerPriority
}

export interface FlowChannel {
  key: string
  /** Matches the Life tab's gauge label exactly, or 'Power'. */
  label: string
  unit: string
  nodes: FlowNode[]
  /** Signed: positive is accumulating. */
  net: number
  /** Days until the store empties at this rate; Infinity if it is not falling. */
  horizonDays: number
  /** The store this channel fills or drains, if there is one. */
  level?: { value: number; capacity: number; unit: string }
  /** The sentence under the diagram: what this balance actually means. */
  footnote: string
  /** What the horizon becomes if the key part stops (RF-18). */
  counterfactual?: string
}

const dayRate = (perDay: number) => perDay

/**
 * Station services, while alongside. A source like any other -- and one the
 * diagram has to draw, because without it the water channel shows 21.5 kg/day
 * leaving, 18.3 coming back, and a tank cheerfully reporting "holding".
 */
function alongsideNode(state: SimState, key: keyof typeof ALONGSIDE_SUPPLY): FlowNode[] {
  if (!state.ship.docked) return []
  return [
    {
      id: `alongside.${key}`,
      name: 'Station services',
      where: 'alongside',
      role: 'source',
      magnitude: ALONGSIDE_SUPPLY[key],
      note: 'topped up at the berth — this stops when the ship casts off',
    },
  ]
}

/** Days a store lasts at a signed per-day rate. */
function horizon(level: number, netPerDay: number): number {
  if (netPerDay >= 0) return Infinity
  return level / -netPerDay
}

function crewLoadOf(state: SimState): number {
  return state.crew.reduce((sum, c) => sum + activityLoad(c.activity), 0)
}

function roomNameOf(state: SimState, roomId: string): string {
  const room = state.ship.rooms.find((r) => r.id === roomId)
  return room ? room.defId : roomId
}

/** Every part that declares something on this channel, as nodes. */
function partNodes(
  state: SimState,
  t: GameTime,
  pick: (p: ReturnType<typeof getPart>) => number | undefined,
  role: FlowRole,
  scaled = true,
): FlowNode[] {
  const out: FlowNode[] = []
  for (const part of state.ship.parts) {
    const def = getPart(part.defId)
    const rated = pick(def)
    if (!rated) continue
    const running = partRunning(part)
    const magnitude = running ? rated * (scaled ? partScale(state, part, t) : 1) : 0
    out.push({
      id: part.id,
      name: def.name,
      where: roomNameOf(state, part.roomId),
      role,
      magnitude,
      partId: part.id,
      priority: def.priority,
      ...(running ? {} : { idle: true }),
    })
  }
  return out
}

/** Sort so the biggest contributor leads -- finding what to change is one look. */
function ranked(nodes: FlowNode[]): FlowNode[] {
  return [...nodes].sort((a, b) => b.magnitude - a.magnitude || (a.id < b.id ? -1 : 1))
}

export function flowChannels(state: SimState): FlowChannel[] {
  const t = state.now
  const hull = getHull(state.ship.hullId)
  const res = state.ship.resources
  const life = lifeBalance(state, t)
  const power = powerBalance(state, t)
  const load = crewLoadOf(state)
  const headcount = state.crew.length

  /**
   * The crew as a node on some channel.
   *
   * The role is a required argument rather than a default, because people are
   * a *source* on two of these five channels and a consumer on the other
   * three: they breathe out carbon dioxide and they radiate about 110 W each.
   * This used to default to `consumer`; the CO2 channel remembered to override
   * it and the heat channel did not, so four crew were drawn on the diagram as
   * though they absorbed half a kilowatt between them. The balance was right
   * all along -- `networks.ts` has counted `crewHeatKw` into `heatInKw` since
   * M1 -- which is exactly why nothing else caught it. Making the caller say
   * which side they are on removes the whole class of it.
   */
  const crewNode = (role: FlowRole, magnitude: number, note: string): FlowNode => ({
    id: 'crew',
    name: `Crew ×${headcount}`,
    where: 'aboard',
    role,
    magnitude,
    note,
  })

  // --- power ---------------------------------------------------------------
  const powerNodes = [
    ...ranked(
      state.ship.parts
        .filter((p) => getPart(p.defId).powerKw > 0)
        .map((p) => ({
          id: p.id,
          name: getPart(p.defId).name,
          where: roomNameOf(state, p.roomId),
          role: 'source' as const,
          magnitude: Math.max(0, partPowerKw(state, p, t)),
          partId: p.id,
          priority: getPart(p.defId).priority,
          ...(partRunning(p) ? {} : { idle: true }),
        })),
    ),
    ...ranked(
      state.ship.parts
        .filter((p) => getPart(p.defId).powerKw < 0)
        .map((p) => ({
          id: p.id,
          name: getPart(p.defId).name,
          where: roomNameOf(state, p.roomId),
          role: 'consumer' as const,
          magnitude: Math.max(0, -partPowerKw(state, p, t)),
          partId: p.id,
          priority: getPart(p.defId).priority,
          ...(p.shed ? { note: 'shed on brownout' } : {}),
          ...(partRunning(p) ? {} : { idle: true }),
        })),
    ),
    {
      id: 'battery',
      name: 'Battery Bank',
      where: 'machinery',
      role: 'buffer' as const,
      magnitude: Math.abs(power.netKw),
      note: power.netKw >= 0 ? 'charging' : 'draining',
    },
  ]

  // --- heat ----------------------------------------------------------------
  const heatSources: FlowNode[] = [
    ...ranked(
      state.ship.parts
        .map((p) => {
          const def = getPart(p.defId)
          const draw = Math.max(0, -partPowerKw(state, p, t))
          const waste = (def.provides.thermalWasteKw ?? 0) * (partRunning(p) ? 1 : 0)
          return {
            id: p.id,
            name: def.name,
            where: roomNameOf(state, p.roomId),
            role: 'source' as const,
            magnitude: draw + waste,
            partId: p.id,
            ...(waste > 0 ? { note: 'waste heat beyond its draw' } : {}),
            ...(partRunning(p) ? {} : { idle: true }),
          }
        })
        .filter((n) => n.magnitude > 0 || n.idle),
    ),
    // A warm body is a heat source. Four of them are 470 W, which is a
    // radiator panel's worth and not a rounding error.
    crewNode('source', METABOLIC.heatKw * load, 'about 110 W each, more when working'),
  ]
  const heatNodes: FlowNode[] = [
    ...heatSources,
    ...ranked(
      partNodes(state, t, (d) => d.provides.heatRejectKw, 'return').map((n) => ({
        ...n,
        note: 'radiators — the only way heat leaves',
      })),
    ),
    {
      id: 'hull',
      name: 'Hull thermal mass',
      where: 'ship',
      role: 'buffer',
      magnitude: Math.abs(life.heatInKw - life.heatRejectKw),
      note: life.heatInKw > life.heatRejectKw ? 'cabin warming' : 'cabin holding',
    },
  ]

  // --- CO2 -----------------------------------------------------------------
  const co2Out = ranked(partNodes(state, t, (d) => d.provides.co2ScrubKgPerDay, 'return'))
  const co2Nodes: FlowNode[] = [
    crewNode('source', METABOLIC.co2KgPerDay * load, 'about 1 kg each per day'),
    ...co2Out,
    {
      id: 'cabin',
      name: 'Cabin air',
      where: `${hull.cabinVolumeM3} m³`,
      role: 'buffer',
      magnitude: Math.abs(life.co2PerDay),
      note: `${Math.round(co2Ppm(state, t)).toLocaleString()} ppm`,
    },
  ]

  // --- O2 ------------------------------------------------------------------
  const o2Nodes: FlowNode[] = [
    ...ranked(partNodes(state, t, (d) => d.provides.o2KgPerDay, 'source')),
    ...alongsideNode(state, 'o2'),
    crewNode('consumer', METABOLIC.o2KgPerDay * load, 'about 0.84 kg each per day'),
    {
      id: 'o2tank',
      name: 'O₂ stores',
      where: 'tanks',
      role: 'buffer',
      magnitude: Math.abs(life.o2PerDay),
      note: life.o2PerDay >= 0 ? 'topping up' : 'drawing down',
    },
  ]

  // --- water: the one with a real loop (RF-17) ------------------------------
  const waterCrew = METABOLIC.waterKgPerDay * load
  const waterEquipment = ranked(
    state.ship.parts
      .filter((p) => getPart(p.defId).provides.waterUseKgPerDay)
      .map((p) => {
        const def = getPart(p.defId)
        return {
          id: p.id,
          name: def.name,
          where: roomNameOf(state, p.roomId),
          role: 'consumer' as const,
          // Deliberately unscaled, matching the sim: a worn unit drinks the
          // same and returns less, which *is* the inefficiency.
          magnitude: partRunning(p) ? (def.provides.waterUseKgPerDay ?? 0) : 0,
          partId: p.id,
          ...(def.provides.foodKgPerDay ? { note: 'locked into plants — this is food, not loss' } : {}),
          ...(partRunning(p) ? {} : { idle: true }),
        }
      }),
  )
  const throughput = waterCrew + waterEquipment.reduce((s, n) => s + n.magnitude, 0)
  const recovered = throughput * life.recycleFraction
  const recycler = state.ship.parts.find((p) => getPart(p.defId).provides.waterRecycleFraction)
  const waterNodes: FlowNode[] = [
    ...alongsideNode(state, 'water'),
    crewNode('consumer', waterCrew, 'drinking, hygiene'),
    ...waterEquipment,
    {
      id: recycler?.id ?? 'recycler',
      name: recycler ? getPart(recycler.defId).name : 'Water Recycler',
      where: recycler ? roomNameOf(state, recycler.roomId) : 'life-support',
      role: 'return',
      magnitude: recovered,
      ...(recycler ? { partId: recycler.id } : {}),
      note: `${(life.recycleFraction * 100).toFixed(1)}% of throughput returned`,
      ...(recycler && partRunning(recycler) ? {} : { idle: true }),
    },
    {
      id: 'watertank',
      name: 'Water stores',
      where: 'tanks',
      role: 'buffer',
      magnitude: Math.abs(life.waterPerDay),
      note: life.waterPerDay >= 0 ? 'holding' : 'draining',
    },
  ]

  // --- food ----------------------------------------------------------------
  const foodNodes: FlowNode[] = [
    ...ranked(partNodes(state, t, (d) => d.provides.foodKgPerDay, 'source')),
    ...alongsideNode(state, 'food'),
    crewNode('consumer', METABOLIC.foodKgPerDay * load, 'about 1.8 kg each per day'),
    {
      id: 'foodstore',
      name: 'Food stores',
      where: 'stores',
      role: 'buffer',
      magnitude: Math.abs(life.foodPerDay),
      note: life.foodPerDay >= 0 ? 'holding' : 'drawing down',
    },
  ]

  // --- propellant: a budget, not a rate (RF-19) ----------------------------
  const propellant = levelAt(res.propellant, t)
  const propNodes: FlowNode[] = [
    {
      id: 'proptank',
      name: 'Propellant',
      where: 'tanks',
      role: 'buffer',
      magnitude: propellant,
      note: `${(propellant / 1000).toFixed(1)} t of ${(hull.propellantCapacityKg / 1000).toFixed(0)} t`,
    },
    ...ranked(
      state.ship.parts
        .filter((p) => p.roomId === 'engines')
        .map((p) => ({
          id: p.id,
          name: getPart(p.defId).name,
          where: roomNameOf(state, p.roomId),
          role: 'consumer' as const,
          magnitude: 0,
          partId: p.id,
          note: 'spends propellant only during a burn',
          idle: true,
        })),
    ),
  ]

  // --- spares --------------------------------------------------------------
  const spares = levelAt(res.spares, t)
  const openOrders = state.workOrders.filter((w) => w.status !== 'done')
  const spareNodes: FlowNode[] = [
    {
      id: 'sparelocker',
      name: 'Spares locker',
      where: 'machinery',
      role: 'buffer',
      magnitude: spares,
      note: `${Math.floor(spares)} of ${hull.sparesCapacity}`,
    },
    ...ranked(
      openOrders.map((w) => {
        const part = state.ship.parts.find((p) => p.id === w.partId)
        return {
          id: w.id,
          name: part ? getPart(part.defId).name : w.partId,
          where: part ? roomNameOf(state, part.roomId) : 'ship',
          role: 'consumer' as const,
          magnitude: w.spares,
          ...(part ? { partId: part.id } : {}),
          note: w.status === 'blocked' ? 'blocked — not enough spares' : `${w.kind} in progress`,
          ...(w.spares === 0 ? { idle: true } : {}),
        }
      }),
    ),
  ]

  const waterLevel = levelAt(res.water, t)
  const grossHorizon = horizon(waterLevel, -throughput)

  return [
    {
      key: 'power',
      label: 'Power',
      unit: 'kW',
      nodes: powerNodes,
      net: power.netKw,
      horizonDays:
        power.netKw < 0 ? levelAt(res.battery, t) / (-power.netKw * 24) : Infinity,
      level: { value: levelAt(res.battery, t), capacity: hull.batteryCapacityKwh, unit: 'kWh' },
      footnote:
        power.netKw >= 0
          ? 'The bank is charging. Everything drawing is drawing from the reactor.'
          : 'The bank is covering the difference. When it empties, loads shed by priority.',
    },
    {
      key: 'heat',
      label: 'Cabin temperature',
      unit: 'kW',
      nodes: heatNodes,
      net: life.heatRejectKw - life.heatInKw,
      horizonDays: Infinity,
      footnote:
        'Every watt spent inside the hull becomes heat. The radiators are the only way it leaves.',
    },
    {
      key: 'co2',
      label: 'Cabin CO2',
      unit: 'kg/day',
      nodes: co2Nodes,
      net: -dayRate(life.co2PerDay),
      horizonDays: Infinity,
      footnote:
        'Nothing removes the last of it: a working cabin sits at a few thousand ppm, not at zero.',
      ...(co2Out.length > 0
        ? { counterfactual: 'With the scrubbers down, four people fill the cabin in days.' }
        : {}),
    },
    {
      key: 'o2',
      label: 'Oxygen',
      unit: 'kg/day',
      nodes: o2Nodes,
      net: dayRate(life.o2PerDay),
      horizonDays: horizon(levelAt(res.o2, t), life.o2PerDay),
      level: { value: levelAt(res.o2, t), capacity: hull.o2CapacityKg, unit: 'kg' },
      footnote: 'Electrolysis spends water to make this. The two channels are one system.',
    },
    {
      key: 'water',
      label: 'Water',
      unit: 'kg/day',
      nodes: waterNodes,
      net: dayRate(life.waterPerDay),
      horizonDays: horizon(waterLevel, life.waterPerDay),
      level: { value: waterLevel, capacity: hull.waterCapacityKg, unit: 'kg' },
      footnote: `${throughput.toFixed(1)} kg/day moves through the loop; ${recovered.toFixed(1)} comes back.`,
      counterfactual: `Recycler offline: −${throughput.toFixed(1)} kg/day, ${
        Number.isFinite(grossHorizon) ? `${Math.round(grossHorizon)} days` : 'no'
      } of tank.`,
    },
    {
      key: 'food',
      label: 'Food',
      unit: 'kg/day',
      nodes: foodNodes,
      net: dayRate(life.foodPerDay),
      horizonDays: horizon(levelAt(res.food, t), life.foodPerDay),
      level: { value: levelAt(res.food, t), capacity: hull.foodCapacityKg, unit: 'kg' },
      footnote: 'The rack grows a fraction of the diet. The rest is stores you had to buy.',
    },
    {
      key: 'propellant',
      label: 'Propellant',
      unit: 'kg',
      nodes: propNodes,
      net: 0,
      horizonDays: Infinity,
      level: { value: propellant, capacity: hull.propellantCapacityKg, unit: 'kg' },
      // RF-19: a tank that only empties during a manoeuvre has no meaningful
      // daily rate, so this channel is a budget rather than a balance.
      footnote: 'A budget, not a rate: this empties during a burn and at no other time.',
    },
    {
      key: 'spares',
      label: 'Spares',
      unit: '',
      nodes: spareNodes,
      net: 0,
      horizonDays: Infinity,
      level: { value: spares, capacity: hull.sparesCapacity, unit: '' },
      footnote:
        openOrders.length > 0
          ? 'Open work orders draw on the same locker. A repair that cannot find spares waits.'
          : 'Nothing is competing for the locker right now.',
    },
  ]
}

/** Crew currently aboard, for the flow view to name them. */
export function flowCrewCount(state: SimState): number {
  return crewViews(state).length
}

// ---------------------------------------------------------------------------
// Which way round a channel runs
// ---------------------------------------------------------------------------

/**
 * Channels where `return` means **removal** rather than recovery.
 *
 * Most of these track a store you want full, and `return` is what comes back
 * into it -- the water recycler. Heat and carbon dioxide track a nuisance you
 * want *gone*, and `return` is what carts it away: the radiators, the
 * scrubbers. Same role name, opposite side of the balance.
 *
 * The distinction lives here, next to the code that builds both kinds, rather
 * than in each screen that draws them. `flows.test.ts` already had to special-
 * case it once; a second reader deriving it again from the key would be the
 * third copy of one fact.
 */
const REMOVAL_CHANNELS = new Set(['heat', 'co2'])

/**
 * A channel split the way a person reads it: what puts the stuff in, and what
 * takes it out. Both ranked biggest first, with anything idle sorted last.
 *
 * `FlowRole` is the diagram's vocabulary -- source, consumer, return, buffer --
 * and it is the right one for drawing a loop. It is the wrong one for a
 * sentence, because "return" lands on a different side depending on the
 * channel and the buffer is on neither. This is the reading.
 */
export interface ChannelSides {
  /** What puts it in. */
  in: FlowNode[]
  /** What takes it out. */
  out: FlowNode[]
}

export function channelSides(channel: FlowChannel): ChannelSides {
  const removal = REMOVAL_CHANNELS.has(channel.key)
  const pick = (...roles: FlowRole[]) =>
    channel.nodes
      .filter((n) => roles.includes(n.role))
      // Idle last: a part that is switched off is worth keeping on the list --
      // "why is it not there" is a worse question than "why is it zero" -- but
      // it is not the answer to "what is draining this".
      .sort((a, b) => Number(a.idle ?? false) - Number(b.idle ?? false) || b.magnitude - a.magnitude)

  // The buffer is deliberately in neither: it is the store absorbing the
  // difference, so listing it as a contributor would double-count the net.
  return removal
    ? { in: pick('source'), out: pick('return') }
    : { in: pick('source', 'return'), out: pick('consumer') }
}
