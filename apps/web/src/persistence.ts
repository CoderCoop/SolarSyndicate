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
  missingStateFields,
  readableSave,
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
 * Handle a snapshot this build might not be able to read.
 *
 * Pre-release, so there is nothing to preserve: a save from an older shape is
 * discarded and the world starts again, rather than carrying transforms for
 * versions nobody is playing. The version field and this hook stay because
 * they are what make a real migration possible the moment one is warranted
 * (§8.3) — there is simply nothing to migrate yet.
 *
 * The shape is checked as well as the version, because the version is only a
 * claim. A build that adds a field and forgets to bump leaves saves that say
 * v6 and are not v6; trusting the label loads one straight into a crash.
 */
export function migrate(input: unknown): SimState | undefined {
  if (readableSave(input)) return input

  const missing = missingStateFields(input)
  const claimed = (input as { version?: unknown } | undefined)?.version
  console.warn(
    `Save is v${String(claimed)}, this build is v${SIM_STATE_VERSION}` +
      (missing.length > 0 ? `, and is missing ${missing.join(', ')}` : '') +
      '. Starting a new world.',
  )
  return undefined
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
