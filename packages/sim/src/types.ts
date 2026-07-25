/**
 * Simulation state. Design doc §8.2.
 *
 * SimState is a plain serializable object -- no classes, no Maps, no functions.
 * It must survive structuredClone and JSON round-trips unchanged, because it is
 * both the save format and (eventually) the wire format.
 */
import type { GameTime } from './time.js'

/** Bump when the shape changes; add a migration in persistence. §8.3 */
export const SIM_STATE_VERSION = 1

/**
 * A continuous quantity stored as (value at a known time, rate of change).
 * §8.2: "the sim never ticks per-frame" -- the current level is DERIVED on
 * read, so a month of offline time costs the same as a second.
 */
export interface Reservoir {
  /** Level at `since`. */
  value: number
  /** Units per game second. Only changes at events. */
  rate: number
  /** Game time at which `value` was accurate. */
  since: GameTime
  min: number
  max: number
}

export interface PartState {
  id: string
  defId: string
  roomId: string
  enabled: boolean
  /** Set when load-shedding switched this off, so the UI can explain why. */
  shed: boolean
}

export interface RoomState {
  id: string
  defId: string
}

export interface ShipState {
  name: string
  className: string
  hullId: string
  rooms: RoomState[]
  parts: PartState[]
  /** Battery buffer in kWh. §3.2 */
  battery: Reservoir
  /** Cached net power in kW at `battery.since`, for display without recompute. */
  netPowerKw: number
  /** True while demand exceeds supply and the battery is carrying the deficit. */
  onBattery: boolean
  /** True once the battery has emptied and loads have been shed. */
  brownout: boolean
}

export type EventKind = 'BATTERY_BOUND' | 'DAY_ROLL'

export interface SimEvent {
  /** Monotonic, assigned on schedule. Ties in `at` break by `seq`. */
  seq: number
  at: GameTime
  kind: EventKind
}

export type LogLevel = 'info' | 'warn' | 'alert'

/**
 * A dispatch line. §7.4: the session-open screen is the captain's inbox, so
 * offline catch-up must produce readable history, not just a final state.
 */
export interface LogEntry {
  seq: number
  at: GameTime
  level: LogLevel
  text: string
}

export interface SimState {
  version: number
  seed: number
  /** Everything in the world is accurate as of this instant. */
  now: GameTime
  /**
   * The UTC instant that is this world's game time zero. Every conversion
   * between wall-clock and game time goes through it, so a world always
   * begins on day 0 no matter when it was started.
   */
  epochUtcMs: number
  ship: ShipState
  /** Pending events, sorted ascending by (at, seq). */
  queue: SimEvent[]
  nextSeq: number
  /** Per-stream PRNG counters. §7.2 */
  rngCounters: Record<string, number>
  /** Bounded ring of recent dispatches, newest last. */
  log: LogEntry[]
}

/**
 * Player intent. §8.4: every mutation is a serializable Command so that saves
 * are snapshot + command log, and so the same objects can become the wire
 * protocol if the game ever goes server-authoritative.
 */
export type Command =
  | { kind: 'SET_PART_ENABLED'; partId: string; enabled: boolean }
  | { kind: 'RESET_BROWNOUT' }

/** A command with the game time it was issued at. */
export interface TimedCommand {
  at: GameTime
  command: Command
}
