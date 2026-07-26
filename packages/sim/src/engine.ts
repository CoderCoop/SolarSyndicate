/**
 * The simulation engine. Design doc §7.2, §8.2.
 *
 * Two public operations, both pure: advance the world to a time, and apply a
 * player command. Internally they clone once at the boundary and then mutate,
 * which keeps callers honest about immutability without paying a deep copy per
 * event during a long catch-up.
 *
 * Catch-up is not a separate code path. Opening the app after a week away runs
 * exactly the same loop as a second of live play -- it just pops more events.
 */
import {
  content,
  getCrewDef,
  getHull,
  getPart,
  STARTER_HULL_ID,
  STARTER_PORT_ID,
  TUNE,
  type CrewDef,
  type Fitting,
  type Glyph,
  type SizeM,
} from '@solsyn/data'
import {
  activityAt,
  co2Ppm,
  crewEffectiveness,
  crewRoomId,
  nextShiftBoundary,
  updateActivities,
} from './crew.js'
import { attendanceView } from './attendance.js'
import { abandonContract, acceptContract } from './contracts.js'
import { arrive, depart } from './voyage.js'
import { OPENING_BALANCE_CR, post } from './ledger.js'
import { pushLog } from './log.js'
import {
  lifeBalance,
  powerBalance,
  partPowerKw,
  partRunning,
  partScale,
  resolveNetworks,
  resourceBoundMessage,
  restoreShedLoads,
} from './networks.js'
import { peekDue, pop, schedule } from './queue.js'
import { fillFraction, levelAt, makeReservoir, settle } from './resources.js'
import { DAY, formatDuration, gameTimeFromUtc, type GameTime } from './time.js'
import { resolveTune, tuneLabel, tuneOf } from './tune.js'
import { applyThreshold, conditionLabel, resolveWear } from './wear.js'
import {
  cancelWorkOrder,
  completeWorkOrder,
  createWorkOrder,
  resolveWorkOrders,
} from './workorders.js'
import {
  RESOURCE_KEYS,
  SIM_STATE_VERSION,
  type Command,
  type CrewState,
  type PartState,
  type ResourceKey,
  type SimEvent,
  type SimState,
  type TimedCommand,
} from './types.js'

/**
 * Safety valve. A handler that schedules an event at its own timestamp would
 * spin forever; better to throw in tests than to hang a phone.
 */
const MAX_EVENTS_PER_ADVANCE = 1_000_000

/**
 * Build a fresh world. `utcMs` is supplied by the caller -- the sim never reads
 * the clock -- and becomes this world's epoch, so play always starts on day 0.
 */
export function createWorld(seed: number, utcMs: number): SimState {
  const t0 = 0
  const hull = getHull(STARTER_HULL_ID)

  const rooms = hull.rooms.map((roomId) => ({ id: roomId, defId: roomId }))
  // The hull's stated fit-out, not "everything that would fit" -- once a part
  // has upgrade tiers the latter installs all of them at once (RF-30).
  const parts: PartState[] = hull.fitOut
    .map((id) => getPart(id))
    .map((def) => ({
      id: def.id,
      defId: def.id,
      roomId: def.roomId,
      enabled: def.startsEnabled,
      shed: false,
      broken: false,
      // A thirty-one-year-old hauler with a "characterful" maintenance log
      // does not start at 100%.
      condition: makeReservoir(startingCondition(def.id), 0, 100, t0),
      // Delivered exactly at spec: the nameplate is what you get on day one,
      // and every change from there is something you did or failed to do.
      tune: makeReservoir(TUNE.specTune, 0, 100, t0),
    }))

  const crew: CrewState[] = content.crew.map((def) => ({
    id: def.id,
    defId: def.id,
    watch: def.watch,
    activity: activityAt(def.watch, t0),
    fatigue: makeReservoir(18, 0, 100, t0),
    // Health floors above zero in M1: the crew can be worn down but not lost.
    // Mortality arrives with the lifecycle system in M3 (§4.5).
    health: makeReservoir(92, 10, 100, t0),
  }))

  const state: SimState = {
    version: SIM_STATE_VERSION,
    seed,
    now: t0,
    epochUtcMs: utcMs,
    ship: {
      name: hull.name,
      className: hull.className,
      hullId: hull.id,
      rooms,
      parts,
      resources: {
        battery: makeReservoir(hull.batteryStartKwh, 0, hull.batteryCapacityKwh, t0),
        heat: makeReservoir(21, 21, 55, t0),
        o2: makeReservoir(hull.o2CapacityKg * 0.82, 0, hull.o2CapacityKg, t0),
        // Delivered a little above what the removers will hold it at, so the
        // cabin settles *down* to its floor. Starting below the floor would
        // make the very first reading a clamp rather than a measurement.
        co2: makeReservoir(0.52, 0, 6, t0),
        water: makeReservoir(hull.waterCapacityKg * 0.88, 0, hull.waterCapacityKg, t0),
        food: makeReservoir(hull.foodCapacityKg * 0.74, 0, hull.foodCapacityKg, t0),
        // Fuelled for the opening contract with room to choose how to fly it.
        // At 0.41 the ship could not make its own first run, which is the
        // "opening budget" number spec 002 left to playtesting -- and a desk
        // that cannot take the job it is given is not a starting position.
        propellant: makeReservoir(hull.propellantCapacityKg * 0.62, 0, hull.propellantCapacityKg, t0),
        spares: makeReservoir(21, 0, hull.sparesCapacity, t0),
      },
      portId: STARTER_PORT_ID,
      cargoKg: 0,
      docked: true,
      netPowerKw: 0,
      netHeatKw: 0,
      onBattery: false,
      brownout: false,
      thermalTrip: false,
    },
    crew,
    workOrders: [],
    queue: [],
    nextSeq: 1,
    rngCounters: {},
    credits: OPENING_BALANCE_CR,
    ledger: [],
    log: [],
  }

  pushLog(state, t0, 'info', `${hull.name} (${hull.className}) is on the Local's books. Reactor online, four hands aboard.`)
  resolveAll(state, t0)
  scheduleAt(state, DAY, 'DAY_ROLL')
  scheduleAt(state, nextShiftBoundary(t0), 'SHIFT_CHANGE')
  return state
}

/** Opening condition per part. Data would own this once hulls have histories. */
function startingCondition(partId: string): number {
  const worn: Record<string, number> = {
    'life.scrubber.co2': 61,
    'life.water.recycler': 68,
    'thermal.loop.radiators': 74,
    'reactor.fission.beacon4': 79,
    'power.battery.bank': 71,
  }
  return worn[partId] ?? 88
}

/** Schedule an event, taking its sequence number from the state. */
function scheduleAt(state: SimState, at: GameTime, kind: SimEvent['kind'], ref?: string): void {
  schedule(state.queue, { seq: state.nextSeq++, at, kind, ...(ref ? { ref } : {}) })
}

/**
 * Re-resolve everything that depends on everything else.
 *
 * Wear first (it sets part rates), then networks (which read part condition),
 * then work orders (which read the environment the crew are working in). One
 * ordering, one place, so a new system can only be wired in correctly.
 */
function resolveAll(state: SimState, at: GameTime): void {
  // Tune first: it is an input to output, so networks must see the settled
  // value rather than last resolve's. Then wear (which reads attendance), then
  // networks (which read condition and tune), then work orders (which read the
  // environment the crew are working in).
  resolveTune(state, at)
  resolveWear(state, at)
  resolveNetworks(state, at)
  resolveWorkOrders(state, at)
}

function applyEvent(state: SimState, event: SimEvent): void {
  switch (event.kind) {
    case 'RESOURCE_BOUND': {
      const key = event.ref as ResourceKey | undefined
      if (!key) break
      const reservoir = state.ship.resources[key]
      settle(reservoir, event.at)
      const atMax = reservoir.value >= reservoir.max - 1e-9
      const message = resourceBoundMessage(key, atMax)
      if (message) pushLog(state, event.at, message.level, message.text)
      resolveAll(state, event.at)
      break
    }

    case 'PART_THRESHOLD': {
      if (!event.ref) break
      applyThreshold(state, event.ref, event.at)
      // Re-resolve either way: a survived threshold still changed output.
      resolveAll(state, event.at)
      break
    }

    case 'WORK_ORDER_DONE': {
      if (!event.ref) break
      completeWorkOrder(state, event.ref, event.at)
      resolveAll(state, event.at)
      break
    }

    case 'SHIFT_CHANGE': {
      updateActivities(state, event.at)
      resolveAll(state, event.at)
      scheduleAt(state, nextShiftBoundary(event.at + 1), 'SHIFT_CHANGE')
      break
    }

    case 'ARRIVE': {
      arrive(state, event.at)
      resolveAll(state, event.at)
      break
    }

    case 'DAY_ROLL': {
      writeDailyDispatch(state, event.at)
      scheduleAt(state, event.at + DAY, 'DAY_ROLL')
      break
    }
  }
}

/**
 * The daily situation report. Read-only: it deliberately does not settle
 * anything, because reservoir anchors move only where rates change -- which is
 * what keeps stepwise and jumped advances bit-identical.
 */
function writeDailyDispatch(state: SimState, at: GameTime): void {
  const res = state.ship.resources
  const battery = Math.round(fillFraction(res.battery, at) * 100)
  const ppm = Math.round(co2Ppm(state, at))
  const temp = levelAt(res.heat, at)

  const worries: string[] = []
  if (state.ship.brownout) worries.push('still in brownout')
  if (ppm > 5000) worries.push(`CO2 at ${ppm} ppm`)
  if (temp > 28) worries.push(`cabin at ${temp.toFixed(1)}C`)

  const broken = state.ship.parts.filter((p) => p.broken)
  if (broken.length > 0) {
    worries.push(`${broken.length} system${broken.length === 1 ? '' : 's'} down`)
  }

  const balance = powerBalance(state, at)
  if (balance.netKw < 0 && !state.ship.brownout) {
    const level = levelAt(res.battery, at)
    const toEmpty = res.battery.rate < 0 ? (level - res.battery.min) / -res.battery.rate : Infinity
    worries.push(`on battery, ${formatDuration(toEmpty)} to empty`)
  }

  if (worries.length === 0) {
    pushLog(state, at, 'info', `Watch change. All systems nominal, battery ${battery}%.`)
  } else {
    pushLog(state, at, 'warn', `Watch change. ${capitalize(worries.join('; '))}.`)
  }
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1)
}

/** Advance in place. Internal: callers see the cloning wrappers below. */
function advanceToMut(state: SimState, t: GameTime): void {
  if (t <= state.now) {
    // Never run time backwards; a clock skew or an old save should be inert.
    return
  }

  let processed = 0
  for (;;) {
    const due = peekDue(state.queue, t)
    if (!due) break
    pop(state.queue)
    state.now = due.at
    applyEvent(state, due)
    if (++processed > MAX_EVENTS_PER_ADVANCE) {
      throw new Error(
        `Event storm: ${processed} events while advancing to ${t}. Likely a handler scheduling at its own timestamp.`,
      )
    }
  }

  state.now = t
  // Deliberately no settle here. A reservoir's anchor moves only when its rate
  // changes; the level at `now` is always derived. That is what makes
  // advancing in one jump bit-identical to advancing in a thousand steps --
  // and therefore what makes offline catch-up trustworthy rather than merely
  // approximately right.
}

/** Advance the world to game time `t`. Pure: returns a new state. */
export function advanceTo(state: SimState, t: GameTime): SimState {
  const next = structuredClone(state)
  advanceToMut(next, t)
  return next
}

/** Advance the world to a real UTC instant, against the world's own epoch. */
export function advanceToUtc(state: SimState, utcMs: number): SimState {
  return advanceTo(state, gameTimeFromUtc(utcMs, state.epochUtcMs))
}

/** Apply a player command, advancing to its timestamp first. Pure. */
export function applyCommand(state: SimState, timed: TimedCommand): SimState {
  const next = structuredClone(state)
  advanceToMut(next, timed.at)
  const at = Math.max(next.now, timed.at)
  applyCommandMut(next, at, timed.command)
  return next
}

function applyCommandMut(state: SimState, at: GameTime, command: Command): void {
  switch (command.kind) {
    case 'SET_PART_ENABLED': {
      const part = state.ship.parts.find((p) => p.id === command.partId)
      if (!part) return
      const def = getPart(part.defId)
      if (!def.switchable) return
      if (part.broken) return
      if (part.enabled === command.enabled) return

      part.enabled = command.enabled
      // An explicit order clears the shed flag: the player has taken the
      // decision back from the load-shedding logic.
      part.shed = false
      pushLog(state, at, 'info', `${def.name} switched ${command.enabled ? 'on' : 'off'}.`)
      resolveAll(state, at)
      break
    }

    case 'RESET_BROWNOUT': {
      if (restoreShedLoads(state, at) > 0) resolveAll(state, at)
      break
    }

    case 'QUEUE_WORK_ORDER': {
      if (createWorkOrder(state, command.partId, command.orderKind, at)) resolveAll(state, at)
      break
    }

    case 'CANCEL_WORK_ORDER': {
      if (cancelWorkOrder(state, command.workOrderId, at)) resolveAll(state, at)
      break
    }

    case 'ACCEPT_CONTRACT': {
      acceptContract(state, command.contractId, at)
      resolveAll(state, at)
      break
    }

    case 'ABANDON_CONTRACT': {
      abandonContract(state, at)
      resolveAll(state, at)
      break
    }

    case 'DEPART': {
      if (depart(state, command.optionId, at)) {
        scheduleAt(state, state.voyage!.arrivesAt, 'ARRIVE')
        resolveAll(state, at)
      }
      break
    }

    case 'SPEND': {
      // TR-21: never refused. The desk can be overdrawn; it cannot be stopped.
      post(state, at, -command.credits, command.reason)
      break
    }

    case 'SET_CREW_WATCH': {
      const crew = state.crew.find((c) => c.id === command.crewId)
      if (!crew || crew.watch === command.watch) return
      crew.watch = command.watch
      crew.activity = activityAt(command.watch, at)
      pushLog(
        state,
        at,
        'info',
        `${getCrewDef(crew.defId).name} reassigned to ${command.watch} watch.`,
      )
      resolveAll(state, at)
      break
    }
  }
}

// ---------------------------------------------------------------------------
// Selectors -- derived views for the UI. The UI never reaches into SimState.
// ---------------------------------------------------------------------------

export interface PowerView {
  productionKw: number
  demandKw: number
  netKw: number
  batteryKwh: number
  batteryCapacityKwh: number
  batteryFraction: number
  /** Game seconds until the battery hits empty or full; Infinity if neither. */
  secondsToBound: number
  boundKind: 'empty' | 'full' | 'none'
  brownout: boolean
}

export function powerView(state: SimState): PowerView {
  const battery = state.ship.resources.battery
  const balance = powerBalance(state, state.now)
  const level = levelAt(battery, state.now)

  let secondsToBound = Infinity
  let boundKind: PowerView['boundKind'] = 'none'
  if (battery.rate < 0 && level > battery.min) {
    secondsToBound = (level - battery.min) / -battery.rate
    boundKind = 'empty'
  } else if (battery.rate > 0 && level < battery.max) {
    secondsToBound = (battery.max - level) / battery.rate
    boundKind = 'full'
  }

  return {
    productionKw: balance.productionKw,
    demandKw: balance.demandKw,
    netKw: balance.netKw,
    batteryKwh: level,
    batteryCapacityKwh: battery.max,
    batteryFraction: fillFraction(battery, state.now),
    secondsToBound,
    boundKind,
    brownout: state.ship.brownout,
  }
}

export type LifeStatus = 'nominal' | 'watch' | 'critical'

export interface LifeSupportView {
  co2Ppm: number
  co2Status: LifeStatus
  temperatureC: number
  tempStatus: LifeStatus
  heatInKw: number
  heatRejectKw: number
  heatMarginKw: number
  o2Kg: number
  o2Days: number
  waterKg: number
  waterDays: number
  foodKg: number
  foodDays: number
  recycleFraction: number
  spares: number
  propellantKg: number
  docked: boolean
}

/** Days until a store runs out at the current rate; Infinity if it is not falling. */
function daysRemaining(value: number, ratePerSecond: number): number {
  if (ratePerSecond >= 0) return Infinity
  return value / -ratePerSecond / DAY
}

export function lifeSupportView(state: SimState): LifeSupportView {
  const res = state.ship.resources
  const t = state.now
  const life = lifeBalance(state, t)
  const ppm = co2Ppm(state, t)
  const temp = levelAt(res.heat, t)

  return {
    co2Ppm: ppm,
    co2Status: ppm > 10000 ? 'critical' : ppm > 5000 ? 'watch' : 'nominal',
    temperatureC: temp,
    tempStatus: temp > 35 ? 'critical' : temp > 28 ? 'watch' : 'nominal',
    heatInKw: life.heatInKw,
    heatRejectKw: life.heatRejectKw,
    heatMarginKw: life.heatRejectKw - life.heatInKw,
    o2Kg: levelAt(res.o2, t),
    o2Days: daysRemaining(levelAt(res.o2, t), res.o2.rate),
    waterKg: levelAt(res.water, t),
    waterDays: daysRemaining(levelAt(res.water, t), res.water.rate),
    foodKg: levelAt(res.food, t),
    foodDays: daysRemaining(levelAt(res.food, t), res.food.rate),
    recycleFraction: life.recycleFraction,
    spares: levelAt(res.spares, t),
    propellantKg: levelAt(res.propellant, t),
    docked: state.ship.docked,
  }
}

/** First letter of the given name and of the family name. */
function initialsOf(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] ?? '?'
  const last = parts.length > 1 ? parts[parts.length - 1]![0]! : ''
  return (first + last).toUpperCase()
}

export interface CrewView {
  id: string
  name: string
  role: string
  age: number
  watch: string
  activity: string
  /** Room instance they are in right now, derived (SV-7, SV-8). */
  roomId: string
  /** Two letters for the marker on the cross-section. */
  initials: string
  fatigue: number
  health: number
  effectiveness: number
  /** The whole stat block (RF-26). The sim already holds it; this publishes it. */
  knowledge: CrewDef['knowledge']
  skills: CrewDef['skills']
  qualifications: CrewDef['qualifications']
  stats: CrewDef['stats']
  blurb: string
  workOrderId?: string
  /** What they are doing, in words. */
  doing: string
}

export function crewViews(state: SimState): CrewView[] {
  const t = state.now
  return state.crew.map((crew) => {
    const def = getCrewDef(crew.defId)
    const order = crew.workOrderId
      ? state.workOrders.find((w) => w.id === crew.workOrderId)
      : undefined
    const part = order ? state.ship.parts.find((p) => p.id === order.partId) : undefined

    let doing: string
    if (crew.activity === 'sleep') doing = 'Asleep'
    else if (crew.activity === 'off') doing = 'Off watch'
    else if (order && part) {
      doing = `${order.kind === 'repair' ? 'Repairing' : 'Servicing'} ${getPart(part.defId).name}`
    } else doing = 'On watch'

    return {
      id: crew.id,
      name: def.name,
      role: def.role,
      age: def.age,
      watch: crew.watch,
      activity: crew.activity,
      roomId: crewRoomId(state, crew),
      initials: initialsOf(def.name),
      fatigue: levelAt(crew.fatigue, t),
      health: levelAt(crew.health, t),
      effectiveness: crewEffectiveness(state, crew, t),
      knowledge: def.knowledge,
      skills: def.skills,
      qualifications: def.qualifications,
      stats: def.stats,
      blurb: def.blurb,
      ...(crew.workOrderId ? { workOrderId: crew.workOrderId } : {}),
      doing,
    }
  })
}

export interface WorkOrderView {
  id: string
  kind: string
  partId: string
  partName: string
  required: number
  completed: number
  fraction: number
  status: string
  spares: number
  assignedName?: string
  /** Game seconds until done at the current rate; Infinity if stalled. */
  secondsRemaining: number
}

export function workOrderViews(state: SimState): WorkOrderView[] {
  const t = state.now
  return state.workOrders
    .filter((w) => w.status !== 'done')
    .map((order) => {
      const part = state.ship.parts.find((p) => p.id === order.partId)
      const completed = levelAt(order.progress, t)
      const assigned = order.assignedCrewId
        ? state.crew.find((c) => c.id === order.assignedCrewId)
        : undefined
      return {
        id: order.id,
        kind: order.kind,
        partId: order.partId,
        partName: part ? getPart(part.defId).name : order.partId,
        required: order.required,
        completed,
        fraction: order.required > 0 ? completed / order.required : 0,
        status: order.status,
        spares: order.spares,
        ...(assigned ? { assignedName: getCrewDef(assigned.defId).name } : {}),
        secondsRemaining:
          order.progress.rate > 0 ? (order.required - completed) / order.progress.rate : Infinity,
      }
    })
}

export interface RoomView {
  id: string
  name: string
  short: string
  blurb: string
  deck: number
  /** Deck head height in metres (RF-4). */
  deckHeightM: number
  /** Furniture the sim does not model but the room draws (SV-4, RF-3). */
  fixtures: { glyph: Glyph; count: number; fitting: Fitting; sizeM: SizeM }[]
  /** Who is tending this room right now, and what that is worth (RF-27). */
  attendance: { attended: boolean; quality: number; wearScale: number; name?: string }
  parts: {
    id: string
    name: string
    blurb: string
    /** How this part draws itself, and where it sits (SV-3, RF-3). */
    glyph: Glyph
    fitting: Fitting
    sizeM: SizeM
    /** Rated power from the catalogue. */
    powerKw: number
    /** What it is actually contributing now, after condition and derate. */
    effectiveKw: number
    enabled: boolean
    shed: boolean
    broken: boolean
    switchable: boolean
    priority: string
    condition: number
    conditionLabel: string
    /** 0-100, and separate from condition: adjustment, not wear (RF-36). */
    tune: number
    tuneLabel: string
    hasWorkOrder: boolean
  }[]
  netKw: number
  /**
   * Waste heat this room is putting into the loop, kW. The flow overlay draws
   * this (SV-13); it is the same figure the thermal balance uses, because a
   * link the player can see must never disagree with a number they can read
   * (SV-14).
   */
  heatKw: number
  /** Net water this room moves, kg/day. Negative consumes, positive returns. */
  waterKgPerDay: number
  /** Any part in this room broken or below 25%? Drives the deck warning dot. */
  needsAttention: boolean
}

export function roomViews(state: SimState): RoomView[] {
  const t = state.now
  const openOrders = new Set(
    state.workOrders.filter((w) => w.status !== 'done').map((w) => w.partId),
  )

  return [...state.ship.rooms]
    .map((room) => {
      const def = content.rooms.find((r) => r.id === room.defId)!
      const parts = state.ship.parts
        .filter((p) => p.roomId === room.id)
        .map((p) => {
          const pd = getPart(p.defId)
          const condition = levelAt(p.condition, t)
          const scale = partScale(state, p, t)
          const draw = partPowerKw(state, p, t)
          return {
            id: p.id,
            name: pd.name,
            blurb: pd.blurb,
            glyph: pd.glyph,
            powerKw: pd.powerKw,
            effectiveKw: draw,
            // Everything a part draws becomes heat, plus whatever it wastes
            // beyond that (§3.2). Radiators are the one negative term.
            heatKw:
              Math.max(0, -draw) +
              (pd.provides.thermalWasteKw ?? 0) * scale -
              (pd.provides.heatRejectKw ?? 0) * scale,
            // Deliberately NOT scaled by condition, matching lifeBalance: a
            // worn electrolysis unit drinks the same water and returns less
            // oxygen for it. That *is* the inefficiency -- scaling both ends
            // would hold efficiency constant and there would be nothing for
            // maintenance or a better unit to improve.
            waterKgPerDay: partRunning(p) ? -(pd.provides.waterUseKgPerDay ?? 0) : 0,
            enabled: p.enabled,
            shed: p.shed,
            broken: p.broken,
            switchable: pd.switchable,
            priority: pd.priority,
            fitting: pd.fitting,
            sizeM: pd.sizeM,
            condition,
            conditionLabel: conditionLabel(condition),
            tune: tuneOf(p, t),
            tuneLabel: tuneLabel(tuneOf(p, t)),
            hasWorkOrder: openOrders.has(p.id),
          }
        })
      return {
        id: room.id,
        name: def.name,
        short: def.short,
        blurb: def.blurb,
        deck: def.deck,
        deckHeightM: def.deckHeightM,
        fixtures: def.fixtures,
        attendance: (() => {
          const a = attendanceView(state, room.id, t)
          return {
            attended: a.attended,
            quality: a.quality,
            wearScale: a.wearScale,
            ...(a.name ? { name: a.name } : {}),
          }
        })(),
        // Strip the flow terms: they belong to the room, not to the part rows
        // the UI already renders.
        parts: parts.map(({ heatKw: _h, waterKgPerDay: _w, ...rest }) => rest),
        // Effective, not rated: the per-room figures have to add up to the
        // number in the status bar or the player cannot trace a deficit.
        netKw: parts.reduce((sum, p) => sum + p.effectiveKw, 0),
        heatKw: parts.reduce((sum, p) => sum + p.heatKw, 0),
        waterKgPerDay: parts.reduce((sum, p) => sum + p.waterKgPerDay, 0),
        needsAttention: parts.some((p) => p.broken || p.condition < 25),
      }
    })
    .sort((a, b) => a.deck - b.deck)
}

/** Everything a resource gauge needs, for the five networks of §3.2. */
export function resourceLevels(state: SimState): Record<ResourceKey, number> {
  const out = {} as Record<ResourceKey, number>
  for (const key of RESOURCE_KEYS) out[key] = levelAt(state.ship.resources[key], state.now)
  return out
}
