/**
 * Persistence. Design doc §8.3.
 *
 * Save = snapshot + command log. Loading replays any commands recorded since
 * the snapshot, then fast-forwards to now. Migrations are versioned from day
 * one because breaking saves is the cardinal sin of a PWA that people install
 * and leave running for months.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import {
  applyCommand,
  createWorld,
  SIM_STATE_VERSION,
  type SimState,
  type TimedCommand,
} from '@solsyn/sim'

const DB_NAME = 'solar-syndicate'
const DB_VERSION = 1
const SLOT = 'primary'

interface SaveRecord {
  slot: string
  /** Snapshot of SimState at the moment it was written. */
  snapshot: SimState
  /** Commands issued after the snapshot, in order. */
  commands: TimedCommand[]
  /** Wall clock at write time, for the "while you were away" digest. */
  savedUtcMs: number
}

interface SyndicateDB extends DBSchema {
  saves: {
    key: string
    value: SaveRecord
  }
}

let dbPromise: Promise<IDBPDatabase<SyndicateDB>> | undefined

function db(): Promise<IDBPDatabase<SyndicateDB>> {
  dbPromise ??= openDB<SyndicateDB>(DB_NAME, DB_VERSION, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        database.createObjectStore('saves', { keyPath: 'slot' })
      }
      // Future schema changes add `if (oldVersion < N)` blocks here.
    },
  })
  return dbPromise
}

/**
 * Migrate a loaded snapshot forward. Every version bump needs a case here;
 * an unrecognised future version is refused rather than guessed at.
 *
 * §8.3 calls save-breaking the cardinal sin of an installed PWA, so these run
 * in sequence: v1 -> v2 -> v3, each transforming in place, however many
 * versions the player has skipped.
 */
function migrate(input: SimState): SimState | undefined {
  if (input.version > SIM_STATE_VERSION) {
    console.warn(
      `Save is from a newer build (v${input.version} > v${SIM_STATE_VERSION}); refusing to load it.`,
    )
    return undefined
  }

  let state = input
  if (state.version === 1) state = migrateV1toV2(state)

  return state.version === SIM_STATE_VERSION ? state : undefined
}

/**
 * M0 -> M1. A v1 ship had a single battery reservoir, no crew, no work orders
 * and parts with no condition. Keep everything the player actually built up
 * (their battery level, which systems they had switched off) and fill in the
 * rest from a fresh world of the same seed.
 */
function migrateV1toV2(old: SimState): SimState {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v1 = old as any
  const fresh = createWorld(old.seed, old.epochUtcMs)

  fresh.now = old.now
  fresh.log = old.log ?? []
  fresh.nextSeq = Math.max(fresh.nextSeq, old.nextSeq ?? 1)
  fresh.rngCounters = old.rngCounters ?? {}

  if (v1.ship?.battery) {
    fresh.ship.resources.battery = v1.ship.battery
  }
  for (const oldPart of v1.ship?.parts ?? []) {
    const part = fresh.ship.parts.find((p) => p.id === oldPart.id)
    if (!part) continue
    part.enabled = oldPart.enabled ?? part.enabled
    part.shed = oldPart.shed ?? false
  }
  fresh.ship.brownout = v1.ship?.brownout ?? false

  // Events referenced v1 kinds that no longer exist; a fresh queue is rebuilt
  // by the first advance.
  fresh.queue = fresh.queue.filter((e) => e.at >= fresh.now)
  fresh.version = 2
  return fresh
}

export interface LoadedSave {
  state: SimState
  savedUtcMs: number
}

export async function loadSave(): Promise<LoadedSave | undefined> {
  try {
    const record = await (await db()).get('saves', SLOT)
    if (!record) return undefined

    const migrated = migrate(record.snapshot)
    if (!migrated) return undefined

    // Replay commands recorded since the snapshot was written.
    let state = migrated
    for (const command of record.commands) {
      state = applyCommand(state, command)
    }

    return { state, savedUtcMs: record.savedUtcMs }
  } catch (err) {
    console.error('Failed to load save', err)
    return undefined
  }
}

/**
 * Write a full snapshot and clear the command log.
 *
 * M0 snapshots on every change, which is simple and correct. The command log
 * exists because it is the thing that has to be designed in from the start
 * (§8.4) -- once saves are large enough that snapshotting every change costs
 * something, appendCommand becomes the hot path and snapshots get periodic.
 */
export async function saveSnapshot(state: SimState, savedUtcMs: number): Promise<void> {
  try {
    await (await db()).put('saves', { slot: SLOT, snapshot: state, commands: [], savedUtcMs })
  } catch (err) {
    console.error('Failed to save', err)
  }
}

/** Append a command to the log without rewriting the snapshot. */
export async function appendCommand(command: TimedCommand, savedUtcMs: number): Promise<void> {
  try {
    const database = await db()
    const record = await database.get('saves', SLOT)
    if (!record) return
    record.commands.push(command)
    record.savedUtcMs = savedUtcMs
    await database.put('saves', record)
  } catch (err) {
    console.error('Failed to append command', err)
  }
}

export async function clearSave(): Promise<void> {
  try {
    await (await db()).delete('saves', SLOT)
  } catch (err) {
    console.error('Failed to clear save', err)
  }
}

/**
 * Ask the browser not to evict us. A management sim you check on weekly is
 * exactly the kind of app a storage sweep would otherwise throw away.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  try {
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}
