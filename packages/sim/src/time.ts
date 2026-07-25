/**
 * Time. Design doc §7.1, §8.2.
 *
 * Two clocks, one conversion:
 *   - Real time: UTC milliseconds. Only ever enters the sim as a parameter.
 *   - Game time: seconds since the game epoch. Every sim timestamp is this.
 *
 * The 24x multiplier lives HERE and nowhere else. Changing it warps every
 * balance number in the game (§7.1 says tune early, then freeze), so it must
 * have exactly one definition to change.
 */

/** Game seconds per real second (§7.1: one real hour = one game day). */
export const TIME_SCALE = 24

/**
 * Seconds since a world's own epoch. The unit of every timestamp in SimState.
 *
 * The epoch is per-world, not a global constant: it is the UTC instant the
 * world was created, stored in SimState.epochUtcMs. A fixed universal epoch
 * would mean a world started today began on day -1,527,000 (or, with the
 * epoch in the future, on some arbitrary five-digit day). "Day 0" should be
 * the day the Guild handed you the ship.
 */
export type GameTime = number

export const SECOND = 1
export const MINUTE = 60
export const HOUR = 3600
export const DAY = 86400
export const YEAR = 365 * DAY

/**
 * Convert a real UTC instant to game time, against a world's epoch.
 *
 * The caller supplies utcMs (from Date.now(), a save file, or a test). The sim
 * itself never reads the clock -- that is what makes catch-up reproducible and
 * what the §12.2 lint rule enforces.
 */
export function gameTimeFromUtc(utcMs: number, epochUtcMs: number): GameTime {
  return ((utcMs - epochUtcMs) / 1000) * TIME_SCALE
}

/** Inverse of gameTimeFromUtc. */
export function utcFromGameTime(t: GameTime, epochUtcMs: number): number {
  return epochUtcMs + (t / TIME_SCALE) * 1000
}

/** Real milliseconds that a span of game seconds corresponds to. */
export function realMsFromGameSeconds(dt: number): number {
  return (dt / TIME_SCALE) * 1000
}

/** Game seconds elapsed over a span of real milliseconds. */
export function gameSecondsFromRealMs(ms: number): number {
  return (ms / 1000) * TIME_SCALE
}

/** Calendar breakdown of a game timestamp, for display. */
export interface ShipClock {
  day: number
  hour: number
  minute: number
  second: number
}

export function shipClock(t: GameTime): ShipClock {
  // Times before a world's own epoch are meaningless rather than merely
  // negative, so clamp -- but note that a world always starts at 0, so seeing
  // this clamp fire means something upstream is wrong.
  const total = Math.max(0, Math.floor(t))
  return {
    day: Math.floor(total / DAY),
    hour: Math.floor(total / HOUR) % 24,
    minute: Math.floor(total / MINUTE) % 60,
    second: total % 60,
  }
}

/** "D142 09:31" -- the ship's clock as shown in the UI. */
export function formatShipClock(t: GameTime): string {
  const c = shipClock(t)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `D${c.day} ${pad(c.hour)}:${pad(c.minute)}`
}

/** A duration in game seconds, rendered coarsely: "3d 4h", "12m". */
export function formatDuration(dt: number): string {
  if (!Number.isFinite(dt)) return 'never'
  const s = Math.max(0, Math.floor(dt))
  if (s < MINUTE) return `${s}s`
  if (s < HOUR) return `${Math.floor(s / MINUTE)}m`
  if (s < DAY) {
    const h = Math.floor(s / HOUR)
    const m = Math.floor((s % HOUR) / MINUTE)
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }
  const d = Math.floor(s / DAY)
  const h = Math.floor((s % DAY) / HOUR)
  return h > 0 ? `${d}d ${h}h` : `${d}d`
}
