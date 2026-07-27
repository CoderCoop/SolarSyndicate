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
import { attendanceFor, wearScaleFor } from './attendance.js'
import { pushLog } from './log.js'
import { cancelKind, schedule } from './queue.js'
import { levelAt, settle } from './resources.js'
import { draw } from './rng.js'
import { AUTO_SERVICE_CONDITION } from './workorders.js'
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

/**
 * Wear only accrues while a part is actually running, and it accrues at a rate
 * set by who is standing watch in its room (spec 004 RF-37). A tended plant
 * stays in good order; an ignored one drifts toward its next service.
 */
export function wearRatePerSecond(state: SimState, part: PartState, t: GameTime): number {
  if (!part.enabled || part.broken) return 0
  const def = getPart(part.defId)
  if (def.wearPerDay <= 0) return 0
  const wearScale = wearScaleFor(attendanceFor(state, part.roomId, t))
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
  cancelKind(state.queue, 'AUTO_SERVICE')

  for (const part of state.ship.parts) {
    settle(part.condition, at)
    part.condition.rate = wearRatePerSecond(state, part, at)

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

  scheduleAutoService(state, at)
}

/**
 * When each part will next be worth servicing, as its own event.
 *
 * The standing order cannot ride on the condition thresholds: those are 75, 50,
 * 25, 10 and 0, and the point where a service stops being wasted is 68. Hanging
 * the policy on the nearest threshold below would make it fire at 50 -- running
 * every part eighteen points harder than the rule the player was shown.
 *
 * So it gets its own scheduled crossing, which is also what makes it work while
 * the app is closed: catch-up pops the event at the moment condition passed the
 * line, not whenever somebody next opened the game (§7.2).
 */
function scheduleAutoService(state: SimState, at: GameTime): void {
  if (!state.ship.standingOrders.autoService) return

  for (const part of state.ship.parts) {
    if (part.broken || part.condition.rate >= 0) continue
    if (state.workOrders.some((w) => w.partId === part.id && w.status !== 'done')) continue

    const current = levelAt(part.condition, at)
    // Already past it: raise the crossing now rather than never, which is what
    // happens to a part that wore through the line while the order was off.
    const secondsAway = Math.max(0, (current - AUTO_SERVICE_CONDITION) / -part.condition.rate)
    if (!Number.isFinite(secondsAway)) continue

    schedule(state.queue, {
      seq: state.nextSeq++,
      at: at + secondsAway,
      kind: 'AUTO_SERVICE',
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
      'upkeep',
      `${def.name} has failed. It needs ${def.repairHours} hours and ${def.repairSpares} spares.`,
      `${Math.round(condition)}% condition`,
    )
    return true
  }

  pushLog(
    state,
    at,
    threshold <= 25 ? 'warn' : 'info',
    'upkeep',
    `${def.name} is ${conditionLabel(condition)}. Service takes ${def.serviceHours} hours.`,
    `${Math.round(condition)}% condition`,
  )
  return false
}
