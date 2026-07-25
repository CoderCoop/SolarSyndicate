/**
 * Reservoir maths. Design doc §8.2.
 *
 * The whole offline-catch-up story rests on this file: because levels are
 * (value, rate, since) triples rather than accumulated per-tick sums, reading
 * a level a month in the future is one multiply, and the only thing the engine
 * has to schedule is the moment a level hits a boundary.
 */
import type { GameTime } from './time.js'
import type { Reservoir } from './types.js'

/**
 * How close to a bound counts as being at it.
 *
 * This is not cosmetic. An event scheduled for the instant a reservoir hits a
 * bound lands with the level a fraction of a ULP short of that bound; without
 * a tolerance the engine schedules another boundary event a nanosecond later,
 * and again, and again. The event-storm guard in the engine caught exactly
 * that, which is the reason it exists.
 */
export const RESERVOIR_EPSILON = 1e-9

export function makeReservoir(value: number, min: number, max: number, since: GameTime): Reservoir {
  return { value, rate: 0, since, min, max }
}

/** Level at time `t`, clamped to the reservoir's bounds. */
export function levelAt(r: Reservoir, t: GameTime): number {
  const raw = r.value + r.rate * (t - r.since)
  return Math.min(r.max, Math.max(r.min, raw))
}

/**
 * Advance the reservoir's stored value to `t`. Idempotent.
 *
 * Snaps to a bound once within epsilon of it, so state stays exact (a full
 * battery reads 200.0, not 199.99999999999997) and boundary predictions stay
 * stable.
 */
export function settle(r: Reservoir, t: GameTime): void {
  if (t === r.since) return
  let v = levelAt(r, t)
  if (Math.abs(v - r.max) <= RESERVOIR_EPSILON) v = r.max
  else if (Math.abs(v - r.min) <= RESERVOIR_EPSILON) v = r.min
  r.value = v
  r.since = t
}

/**
 * Absolute game time at which the reservoir next hits min or max, or Infinity
 * if it never will. Assumes the reservoir is settled to the current time.
 *
 * Returns Infinity when already resting against the bound it is heading for --
 * the level is clamped there and nothing further will happen, so scheduling an
 * event would spin.
 */
export function boundTime(r: Reservoir): GameTime {
  if (r.rate > 0) {
    const remaining = r.max - r.value
    if (remaining <= RESERVOIR_EPSILON) return Infinity
    return r.since + remaining / r.rate
  }
  if (r.rate < 0) {
    const remaining = r.value - r.min
    if (remaining <= RESERVOIR_EPSILON) return Infinity
    return r.since + remaining / -r.rate
  }
  return Infinity
}

/** Fraction of capacity, 0..1. */
export function fillFraction(r: Reservoir, t: GameTime): number {
  const span = r.max - r.min
  if (span <= 0) return 0
  return (levelAt(r, t) - r.min) / span
}
