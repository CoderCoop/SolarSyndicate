/**
 * Tune. Spec 004 RF-35a, RF-36. Design doc §3.3, §4.2.
 *
 * The second axis of a part's health, and the one that is not about wear.
 *
 * A water recycler does not simply wear out. Gunk builds up in a line. A hose
 * sits slightly outside its specified diameter and nobody measures it. Cabin
 * humidity drifts and the setpoints were never re-trimmed for it. In
 * hydroponics a fungus takes hold in the root system and wants the medium
 * sterilised, or a batch of seed needs lower light for a few days after
 * germination or half the seedlings die.
 *
 * Anyone can run the plant. A skilled operator *notices*. So tune falls through
 * inattention and rises only through assignment -- never through a work order,
 * which is what fixes condition. The two are orthogonal, and a part can be
 * mechanically sound and badly out of tune, or freshly trimmed and about to
 * break.
 *
 * Mechanically this is an ordinary reservoir: rate changes only when attendance
 * changes, attendance changes only at watch turnover and work-order events, and
 * both of those already re-resolve the world. Reads clamp to the bounds, so a
 * plateau costs no scheduled event and catch-up stays closed-form.
 */
import { TUNE } from '@solsyn/data'
import { attendanceFor, type Attendance } from './attendance.js'
import { levelAt, settle } from './resources.js'
import { DAY, type GameTime } from './time.js'
import type { PartState, SimState } from './types.js'

/**
 * Output multiplier from tune. Two straight segments meeting at spec, so a
 * part at `specTune` delivers exactly its nameplate and nothing has to be
 * fudged to make the numbers on the tin true.
 */
export function tuneOutputScale(tune: number): number {
  const { specTune, outputAtZeroTune, outputAtFullTune } = TUNE
  const t = Math.max(0, Math.min(100, tune))
  if (t >= specTune) {
    return 1 + ((t - specTune) / (100 - specTune)) * (outputAtFullTune - 1)
  }
  return outputAtZeroTune + (t / specTune) * (1 - outputAtZeroTune)
}

/**
 * The tune an operator of this quality can hold a system at.
 *
 * A quality-0 hand keeps it running and spots nothing, so it settles well below
 * spec. A specialist holds it above. Only a very good operator, rested and
 * breathing clean air, reaches 100 -- which is where a part beats its
 * nameplate.
 */
export function tuneCeilingFor(quality: number): number {
  const { ceilingUnskilled, ceilingSkilled } = TUNE
  return ceilingUnskilled + quality * (ceilingSkilled - ceilingUnskilled)
}

/** Tune per game second, given who is watching. Negative when nobody is. */
export function tuneRatePerSecond(a: Pick<Attendance, 'attended' | 'quality'>): number {
  if (!a.attended) return -TUNE.decayPerDayUnattended / DAY
  return (TUNE.gainPerDayPerQuality * a.quality) / DAY
}

/**
 * Recompute every part's tune rate and the bound it is heading for.
 *
 * The bounds do the work that a scheduled event would otherwise have to: a
 * system being tended climbs to its operator's ceiling and stops there; a
 * neglected one falls to zero and stops there. `levelAt` clamps, so neither
 * needs anything to fire.
 */
export function resolveTune(state: SimState, at: GameTime): void {
  for (const part of state.ship.parts) {
    settle(part.tune, at)

    // A part that is not running is not drifting out of adjustment either.
    if (!part.enabled || part.broken) {
      part.tune.rate = 0
      part.tune.min = 0
      part.tune.max = 100
      continue
    }

    const attendance = attendanceFor(state, part.roomId, at)
    const rate = tuneRatePerSecond(attendance)
    const ceiling = attendance.attended ? tuneCeilingFor(attendance.quality) : 0
    const level = levelAt(part.tune, at)

    part.tune.rate = rate
    if (rate > 0) {
      // Climbing toward the operator's ceiling -- unless it is already above
      // it, in which case a weaker hand holds the line rather than undoing
      // someone else's work.
      part.tune.min = 0
      part.tune.max = Math.max(ceiling, level)
      if (level >= part.tune.max) part.tune.rate = 0
    } else {
      part.tune.min = 0
      part.tune.max = 100
    }
  }
}

/** Current tune of a part. */
export function tuneOf(part: PartState, t: GameTime): number {
  return levelAt(part.tune, t)
}

/** Plain-language label, so the UI never has to invent one. */
export function tuneLabel(tune: number): string {
  if (tune >= 90) return 'finely tuned'
  if (tune >= TUNE.specTune) return 'in tune'
  if (tune >= 40) return 'drifting'
  if (tune >= 20) return 'out of tune'
  return 'neglected'
}
