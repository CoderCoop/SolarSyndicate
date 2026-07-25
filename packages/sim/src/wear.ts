/**
 * Condition, wear and failure. Design doc §3.3.
 *
 * Parts wear while they run. Output degrades first -- gracefully, and visibly
 * in the numbers the player already watches -- and then at thresholds the part
 * rolls against failing outright. That ordering matters: a component that dies
 * without warning is a trap, while one that has been quietly losing output for
 * a week is a decision the player declined to make.
 */
import { getPart } from '@solsyn/data'
import { mechanicBonuses } from './crew.js'
import { pushLog } from './log.js'
import { cancelKind, schedule } from './queue.js'
import { levelAt, settle } from './resources.js'
import { draw } from './rng.js'
import { DAY, type GameTime } from './time.js'
import type { PartState, SimState } from './types.js'

/**
 * Condition levels that get a dispatch and a failure roll on the way down.
 * Descending, because that is the direction condition travels.
 */
export const CONDITION_THRESHOLDS = [75, 50, 25, 10, 0] as const

/** Chance of outright failure when a part crosses a threshold. */
const FAILURE_CHANCE: Record<number, number> = {
  75: 0,
  50: 0.06,
  25: 0.18,
  10: 0.34,
  0: 1,
}

export function conditionLabel(condition: number): string {
  if (condition >= 85) return 'good'
  if (condition >= 60) return 'serviceable'
  if (condition >= 35) return 'worn'
  if (condition >= 15) return 'poor'
  return 'critical'
}

/** Wear only accrues while a part is actually running. */
export function wearRatePerSecond(state: SimState, part: PartState): number {
  if (!part.enabled || part.broken) return 0
  const def = getPart(part.defId)
  if (def.wearPerDay <= 0) return 0
  const { wearScale } = mechanicBonuses(state)
  return -(def.wearPerDay * wearScale) / DAY
}

/** The highest threshold strictly below a given condition. */
function nextThresholdBelow(condition: number): number | undefined {
  for (const threshold of CONDITION_THRESHOLDS) {
    if (threshold < condition - 1e-9) return threshold
  }
  return undefined
}

/**
 * Recompute wear rates and reschedule the next condition threshold for every
 * part. Cheap, and called whenever anything might have changed the rate.
 */
export function resolveWear(state: SimState, at: GameTime): void {
  cancelKind(state.queue, 'PART_THRESHOLD')

  for (const part of state.ship.parts) {
    settle(part.condition, at)
    part.condition.rate = wearRatePerSecond(state, part)

    const current = levelAt(part.condition, at)
    const threshold = nextThresholdBelow(current)
    part.nextThreshold = threshold

    if (threshold === undefined || part.condition.rate >= 0) continue

    const secondsAway = (current - threshold) / -part.condition.rate
    schedule(state.queue, {
      seq: state.nextSeq++,
      at: at + secondsAway,
      kind: 'PART_THRESHOLD',
      ref: part.id,
    })
  }
}

/**
 * A part reached a condition threshold: warn, then roll for failure.
 *
 * Returns true if the part failed, so the caller knows to re-resolve the
 * networks that just lost it.
 */
export function applyThreshold(state: SimState, partId: string, at: GameTime): boolean {
  const part = state.ship.parts.find((p) => p.id === partId)
  if (!part || part.broken) return false

  const def = getPart(part.defId)
  settle(part.condition, at)
  const condition = levelAt(part.condition, at)
  const threshold = part.nextThreshold ?? 0
  const chance = FAILURE_CHANCE[threshold] ?? 0

  // One stream per part per purpose, so adding randomness elsewhere in the
  // game can never perturb this sequence (§7.2).
  const roll = draw(state, `part:${part.id}/failure`)

  if (roll < chance) {
    part.broken = true
    part.enabled = false
    part.condition.rate = 0
    pushLog(
      state,
      at,
      'alert',
      `${def.name} has failed at ${Math.round(condition)}% condition. It needs ${def.repairHours} hours and ${def.repairSpares} spares.`,
    )
    return true
  }

  pushLog(
    state,
    at,
    threshold <= 25 ? 'warn' : 'info',
    `${def.name} is down to ${Math.round(condition)}% — ${conditionLabel(condition)}. Service takes ${def.serviceHours} hours.`,
  )
  return false
}
