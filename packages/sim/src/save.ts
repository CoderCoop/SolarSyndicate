/**
 * Save compatibility. Design doc §8.3.
 *
 * `SIM_STATE_VERSION` is a promise a human has to remember to keep: add a field
 * to `SimState`, bump the number. That promise was broken once already — 0.5.0
 * added `guildId` and `standing` without a bump, so a 0.4.1 save loaded as
 * current, and the first payroll after catch-up looked up guild `undefined` and
 * threw during boot.
 *
 * So the number is no longer the only line of defence. Two things here make the
 * failure impossible to reintroduce quietly:
 *
 *   1. `REQUIRED_FIELDS` is a compiler-checked map over every non-optional key
 *      of `SimState`. Adding a required field is a typecheck error until it is
 *      listed, which puts a human in front of the decision rather than relying
 *      on them to think of it.
 *   2. `stateShape` fingerprints the whole structure, and a test compares it to
 *      the shape recorded for the current version. Changing the shape without
 *      bumping fails the build; bumping without recording the new shape fails
 *      too. Neither can be forgotten.
 *
 * And at run time `readableSave` checks the save's *shape* rather than trusting
 * its version label, so even a save from a build that got this wrong is
 * rejected cleanly instead of crashing the boot.
 */
import { SIM_STATE_VERSION, type SimState } from './types.js'

/** The keys of `T` that are not optional. */
type RequiredKeys<T> = { [K in keyof T]-?: undefined extends T[K] ? never : K }[keyof T]

/**
 * Every field a save must carry. Typed as a total map, so a new required field
 * on `SimState` does not compile until it is added here — see note 1 above.
 */
const REQUIRED_FIELDS: Record<RequiredKeys<SimState>, true> = {
  version: true,
  seed: true,
  now: true,
  epochUtcMs: true,
  ship: true,
  crew: true,
  workOrders: true,
  queue: true,
  nextSeq: true,
  rngCounters: true,
  guildId: true,
  standing: true,
  credits: true,
  ledger: true,
  log: true,
}

/** Sorted for a stable message when a save is rejected. */
export const REQUIRED_STATE_FIELDS: readonly string[] = Object.keys(REQUIRED_FIELDS).sort()

/** Which required fields a candidate save is missing. Empty means none. */
export function missingStateFields(input: unknown): string[] {
  if (typeof input !== 'object' || input === null) return [...REQUIRED_STATE_FIELDS]
  const record = input as Record<string, unknown>
  return REQUIRED_STATE_FIELDS.filter((key) => record[key] === undefined)
}

/**
 * Can this build load that save?
 *
 * Version *and* shape, deliberately. The version is the intended contract; the
 * shape is what is actually true, and when they disagree the shape wins.
 */
export function readableSave(input: unknown): input is SimState {
  if (typeof input !== 'object' || input === null) return false
  if ((input as { version?: unknown }).version !== SIM_STATE_VERSION) return false
  return missingStateFields(input).length === 0
}

/**
 * Paths whose keys are data rather than structure.
 *
 * `rngCounters` is keyed by stream name and `standing` by guild id, so their
 * keys change as content changes and would make the fingerprint churn without
 * the save format having moved at all. Their *values* still carry shape.
 */
const DYNAMIC_MAPS = new Set(['$.rngCounters', '$.standing'])

function walk(value: unknown, path: string, out: Set<string>): void {
  // An absent optional field records nothing. Otherwise a part that happens to
  // have no wear threshold pending at the sampled moment would read as a change
  // to the save format, and balance work would keep tripping this. Optional
  // fields are also the ones that cannot break an older save: it not having one
  // is exactly what "optional" means.
  if (value === undefined) return

  if (Array.isArray(value)) {
    out.add(`${path}: array`)
    // Union over every element, not just the first: an array of events holds
    // more than one kind, and element order is not part of the format.
    for (const item of value) walk(item, `${path}[]`, out)
    return
  }
  if (value !== null && typeof value === 'object') {
    if (DYNAMIC_MAPS.has(path)) {
      out.add(`${path}: map`)
      for (const item of Object.values(value)) walk(item, `${path}{}`, out)
      return
    }
    out.add(`${path}: object`)
    for (const key of Object.keys(value)) {
      walk((value as Record<string, unknown>)[key], `${path}.${key}`, out)
    }
    return
  }
  out.add(`${path}: ${value === null ? 'null' : typeof value}`)
}

/**
 * A structural fingerprint of a state: every path that exists, and what kind of
 * thing sits at it. Values are not included — this answers "what shape is a
 * save", not "what is in this world", so adding a part or a port does not move
 * it but adding a field does.
 */
export function stateShape(state: SimState): string[] {
  const out = new Set<string>()
  walk(state, '$', out)
  return [...out].sort()
}
