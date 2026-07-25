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
import { content, getHull, getPart, STARTER_HULL_ID } from '@solsyn/data'
import { pushLog } from './log.js'
import { powerBalance, resolvePower, restoreShedLoads } from './power.js'
import { peekDue, pop, schedule } from './queue.js'
import { fillFraction, levelAt, makeReservoir, settle } from './resources.js'
import { DAY, formatDuration, gameTimeFromUtc, type GameTime } from './time.js'
import {
  SIM_STATE_VERSION,
  type Command,
  type PartState,
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
  const parts: PartState[] = content.parts
    .filter((def) => hull.rooms.includes(def.roomId))
    .map((def) => ({
      id: def.id,
      defId: def.id,
      roomId: def.roomId,
      enabled: def.startsEnabled,
      shed: false,
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
      battery: makeReservoir(hull.batteryStartKwh, 0, hull.batteryCapacityKwh, t0),
      netPowerKw: 0,
      onBattery: false,
      brownout: false,
    },
    queue: [],
    nextSeq: 1,
    rngCounters: {},
    log: [],
  }

  pushLog(state, t0, 'info', `${hull.name} (${hull.className}) is on the Local's books. Reactor online.`)
  resolvePower(state, t0)
  scheduleAt(state, Math.floor(t0 / DAY) * DAY + DAY, 'DAY_ROLL')
  return state
}

/** Schedule an event, taking its sequence number from the state. */
function scheduleAt(state: SimState, at: GameTime, kind: SimEvent['kind']): void {
  schedule(state.queue, { seq: state.nextSeq++, at, kind })
}

function applyEvent(state: SimState, event: SimEvent): void {
  switch (event.kind) {
    case 'BATTERY_BOUND': {
      const battery = state.ship.battery
      settle(battery, event.at)
      const atMax = battery.value >= battery.max - 1e-9
      if (atMax) {
        pushLog(state, event.at, 'info', 'Batteries at full charge; surplus generation is being dumped.')
      } else {
        pushLog(state, event.at, 'warn', 'Battery bank exhausted.')
      }
      resolvePower(state, event.at)
      break
    }

    case 'DAY_ROLL': {
      // Read-only: deliberately does NOT settle. Anchors move only where the
      // rate changes, which is what keeps stepwise and jumped advances
      // bit-identical (see the catch-up equivalence test).
      const battery = state.ship.battery
      const balance = powerBalance(state)
      const level = levelAt(battery, event.at)
      const pct = Math.round(fillFraction(battery, event.at) * 100)
      if (state.ship.brownout) {
        pushLog(state, event.at, 'warn', `Watch change. Still in brownout; battery ${pct}%.`)
      } else if (balance.netKw < 0) {
        const bound = battery.rate < 0 ? (level - battery.min) / -battery.rate : Infinity
        pushLog(
          state,
          event.at,
          'warn',
          `Watch change. Running on battery at ${balance.netKw.toFixed(1)} kW; ${pct}% remaining, ${formatDuration(bound)} to empty.`,
        )
      } else {
        pushLog(state, event.at, 'info', `Watch change. Power nominal, battery ${pct}%.`)
      }
      scheduleAt(state, event.at + DAY, 'DAY_ROLL')
      break
    }
  }
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
      throw new Error(`Event storm: ${processed} events while advancing to ${t}. Likely a handler scheduling at its own timestamp.`)
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
      if (part.enabled === command.enabled) return

      part.enabled = command.enabled
      // An explicit order clears the shed flag: the player has taken the
      // decision back from the load-shedding logic.
      part.shed = false
      pushLog(state, at, 'info', `${def.name} switched ${command.enabled ? 'on' : 'off'}.`)
      resolvePower(state, at)
      break
    }

    case 'RESET_BROWNOUT': {
      if (restoreShedLoads(state, at) > 0) resolvePower(state, at)
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
  const battery = state.ship.battery
  const balance = powerBalance(state)
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

export interface RoomView {
  id: string
  name: string
  short: string
  blurb: string
  deck: number
  parts: {
    id: string
    name: string
    blurb: string
    powerKw: number
    enabled: boolean
    shed: boolean
    switchable: boolean
    priority: string
  }[]
  netKw: number
}

export function roomViews(state: SimState): RoomView[] {
  const byDeck = [...state.ship.rooms].map((room) => {
    const def = content.rooms.find((r) => r.id === room.defId)!
    const parts = state.ship.parts
      .filter((p) => p.roomId === room.id)
      .map((p) => {
        const pd = getPart(p.defId)
        return {
          id: p.id,
          name: pd.name,
          blurb: pd.blurb,
          powerKw: pd.powerKw,
          enabled: p.enabled,
          shed: p.shed,
          switchable: pd.switchable,
          priority: pd.priority,
        }
      })
    return {
      id: room.id,
      name: def.name,
      short: def.short,
      blurb: def.blurb,
      deck: def.deck,
      parts,
      netKw: parts.reduce((sum, p) => sum + (p.enabled ? p.powerKw : 0), 0),
    }
  })
  return byDeck.sort((a, b) => a.deck - b.deck)
}
