/**
 * Simulation state. Design doc §8.2.
 *
 * SimState is a plain serializable object -- no classes, no Maps, no functions.
 * It must survive structuredClone and JSON round-trips unchanged, because it is
 * both the save format and (eventually) the wire format.
 */
import type { Watch } from '@solsyn/data'
import type { Emergency } from './emergency.js'
import type { ContractState } from './contracts.js'
import type { LedgerEntry } from './ledger.js'
import type { Settlement } from './reconcile.js'
import type { VoyageState } from './voyage.js'
import type { GameTime } from './time.js'

/**
 * Bump when the shape changes; add a migration in persistence. §8.3
 *
 * Distinct from the product version in package.json on purpose. This one only
 * moves when a save written by an older build can no longer be read correctly
 * -- v8 is such a case: dispatches carry a topic now, and every line in a v7
 * save has none, so a log loaded from one cannot be sorted or filtered.
 *
 * Remembering to move it is not left to memory any more: `save.ts` fingerprints
 * the shape and a test refuses any change to it that this number did not
 * follow.
 */
export const SIM_STATE_VERSION = 11

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

/**
 * The five resource networks of §3.2, plus the two stores they draw on.
 *
 * Units: battery kWh, heat degrees C (cabin temperature), o2/co2/water/food/
 * propellant kg, spares whole units.
 */
export const RESOURCE_KEYS = [
  'battery',
  'heat',
  'o2',
  'co2',
  'water',
  'food',
  'propellant',
  'spares',
] as const
export type ResourceKey = (typeof RESOURCE_KEYS)[number]

export type Resources = Record<ResourceKey, Reservoir>

export interface PartState {
  id: string
  defId: string
  roomId: string
  enabled: boolean
  /** Set when load-shedding switched this off, so the UI can explain why. */
  shed: boolean
  /** Failed outright: produces nothing until repaired. §3.3 */
  broken: boolean
  /** 0-100. Degrades output before it fails outright. */
  condition: Reservoir
  /**
   * 0-100. How well adjusted it is, as distinct from how worn (spec 004
   * RF-36). Falls through inattention, rises only through assignment. At
   * TUNE.specTune the part delivers its nameplate figures; a good enough
   * operator takes it above them.
   */
  tune: Reservoir
  /** Next condition threshold we have scheduled an event for, or undefined. */
  nextThreshold?: number
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
  resources: Resources
  /**
   * Alongside at the Local. Station services keep the consumable stores
   * topped up, which is why M1's tension is failures rather than supply.
   * M2 casts off and this becomes false.
   */
  docked: boolean
  /** Where the ship is berthed. Meaningful while docked (spec 002). */
  portId: string
  /** Cargo aboard, kg. Mass is delta-v (§5.2), so this is never free. */
  cargoKg: number
  /** Cached for display; recomputed whenever the network resolves. */
  netPowerKw: number
  netHeatKw: number
  onBattery: boolean
  brownout: boolean
  /** Reactor derated because the thermal loop cannot reject its waste heat. */
  thermalTrip: boolean
  /** Policy the ship follows without being asked (§7.3). */
  standingOrders: StandingOrders
  /**
   * Under salvage: recovered and towed in after the last hand died (§7.4).
   * Cleared when somebody signs on, so she can be crewed and flown again.
   */
  recovered?: boolean
  /** Stood to by the captain after an unanswered emergency (§7.4, §4.6). */
  safeMode?: boolean
  /**
   * The emergency the log has already announced, so escalating air raises one
   * dispatch per stage instead of one per network resolve.
   */
  lastCasualtyWarning?: string
}

/**
 * The orders that stand until you change them. Design doc §7.3.
 *
 * "Standing orders are the policy toggles you set in advance" -- the layer
 * between what you do at the desk and what the captain decides alone. They earn
 * their place by removing clerical work rather than judgement: the player still
 * chooses the policy, the ship just stops making them re-enter it.
 */
export interface StandingOrders {
  /**
   * Raise a service by itself once a part has worn far enough that a full
   * service will not overflow the condition ceiling.
   */
  autoService: boolean
  /**
   * Let the captain stand the ship to when an emergency goes unanswered
   * (§7.4). Off means the decision window never closes on its own -- which is
   * a choice the player is allowed to make, and the dispatch says so at the
   * moment they would need to know.
   */
  safeMode: boolean
}

/** What a crew member is doing right now. Driven by the watch bill (§4.3). */
export type CrewActivity = 'watch' | 'off' | 'sleep'

export interface CrewState {
  id: string
  defId: string
  watch: Watch
  activity: CrewActivity
  /** 0-100, rises awake and falls asleep. */
  fatigue: Reservoir
  /**
   * 0-100, and it can now reach the floor.
   *
   * It used to be capped above zero on the grounds that "M1 never kills". §4.5
   * is explicit that this is a permadeath game, and §7.4's rule is not that
   * death cannot happen -- it is that it cannot happen *without foreshadowing
   * and a decision*. The foreshadowing is `scheduleCasualties`, which can
   * always state who is in trouble and exactly how long they have, because
   * health is a reservoir and the answer is a division.
   */
  health: Reservoir
  /** Work order this crew member is currently progressing, if any. */
  workOrderId?: string
  /**
   * Permanent (§4.5). Kept on the record rather than inferred from health,
   * because a body recovered and a person who merely bottomed out are not the
   * same thing and the difference must survive the air getting better.
   */
  dead?: boolean
}

export type WorkOrderKind = 'service' | 'repair'
export type WorkOrderStatus = 'queued' | 'active' | 'blocked' | 'done'

/**
 * A job for the crew. Design doc §3.3: maintenance is the mechanic's core
 * gameplay, and the queue is how a remote manager expresses intent (§4.6) --
 * you order the work, the crew do it over hours or days.
 */
export interface WorkOrder {
  id: string
  kind: WorkOrderKind
  partId: string
  /** Labour-hours required. */
  required: number
  /** Labour-hours completed, as a reservoir so progress is derived, not ticked. */
  progress: Reservoir
  spares: number
  status: WorkOrderStatus
  assignedCrewId?: string
  createdAt: GameTime
  /** Position in the queue. Lower is worked first; the player sets it. */
  priority: number
  /** Raised by the standing order rather than by hand. */
  auto: boolean
}

export type EventKind =
  | 'RESOURCE_BOUND'
  | 'DAY_ROLL'
  | 'ARRIVE'
  | 'SHIFT_CHANGE'
  | 'PART_THRESHOLD'
  | 'AUTO_SERVICE'
  | 'CREW_DOWN'
  | 'EMERGENCY_WINDOW'
  | 'WORK_ORDER_DONE'

export interface SimEvent {
  /** Monotonic, assigned on schedule. Ties in `at` break by `seq`. */
  seq: number
  at: GameTime
  kind: EventKind
  /** Subject of the event: a resource key, part id, or work order id. */
  ref?: string
}

export type LogLevel = 'info' | 'warn' | 'alert'

/**
 * A dispatch line. §7.4: the session-open screen is the captain's inbox, so
 * offline catch-up must produce readable history, not just a final state.
 */
/**
 * What a dispatch is about. Design §7.4.
 *
 * Authored where the line is written, not guessed from its wording at render
 * time: the code that raises "battery exhausted" knows it is a power event,
 * and a regular expression over prose would only be a worse copy of knowledge
 * that already exists at the call site.
 */
export const LOG_TOPICS = ['ship', 'power', 'life', 'upkeep', 'crew', 'money', 'voyage'] as const
export type LogTopic = (typeof LOG_TOPICS)[number]

export interface LogEntry {
  seq: number
  at: GameTime
  level: LogLevel
  topic: LogTopic
  text: string
  /**
   * The one number that matters in this line, already formatted.
   *
   * Pulled out so a column of dispatches can be read down rather than across:
   * the figure is what tells you whether a line needs you, and burying it
   * mid-sentence makes the reader parse every word to find it.
   */
  figure?: string
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
  crew: CrewState[]
  workOrders: WorkOrder[]
  /** Pending events, sorted ascending by (at, seq). */
  queue: SimEvent[]
  nextSeq: number
  /** Per-stream PRNG counters. §7.2 */
  rngCounters: Record<string, number>
  /** The desk's balance, in credits. May be negative (TR-21). */
  /** The guild this desk belongs to (§6.1). */
  guildId: string
  /** Standing with every guild, -100..100, not only your own. */
  standing: Record<string, number>
  credits: number
  /** What moved it, newest first. */
  ledger: LedgerEntry[]
  /** The run under way, if any. One ship, one contract. */
  contract?: ContractState
  /** The acute emergency currently open, if any (§7.4). */
  emergency?: Emergency
  /** The crossing under way, if the ship is not berthed. */
  voyage?: VoyageState
  /** How the last delivery settled, for the arrival screen. */
  settlement?: Settlement
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
  | { kind: 'QUEUE_WORK_ORDER'; partId: string; orderKind: WorkOrderKind }
  | { kind: 'CANCEL_WORK_ORDER'; workOrderId: string }
  | { kind: 'MOVE_WORK_ORDER'; workOrderId: string; direction: 'up' | 'down' }
  | { kind: 'SET_STANDING_ORDER'; order: keyof StandingOrders; on: boolean }
  | { kind: 'ANSWER_EMERGENCY' }
  | { kind: 'STAND_DOWN' }
  | { kind: 'SET_CREW_WATCH'; crewId: string; watch: Watch }
  /**
   * Move money. Negative credits receive rather than spend. Never refused --
   * TR-21: a shortfall comes out of the balance, it does not block anything.
   */
  | { kind: 'SPEND'; credits: number; reason: string }
  | { kind: 'ACCEPT_CONTRACT'; contractId: string }
  | { kind: 'ABANDON_CONTRACT' }
  | { kind: 'DEPART'; optionId: string }
  | { kind: 'PURCHASE_HULL'; hullId: string }
  | { kind: 'HIRE_CREW'; crewId: string }
  | { kind: 'DISMISS_CREW'; crewId: string }

/** A command with the game time it was issued at. */
export interface TimedCommand {
  at: GameTime
  command: Command
}
