/**
 * Crew. Design doc §4.1-§4.3.
 *
 * M1's crew are bodies on a watch bill: they sleep, wake, work, breathe, eat,
 * and get worse at their jobs when the air is bad. Ambitions, ageing, life
 * events and mortality arrive in M3 (§4.5); what matters here is that the
 * schedule *is* the AI (§4.3), because that is what lets the ship run itself
 * while the desk is empty.
 */
import { getCrewDef, getHull, type Watch } from '@solsyn/data'
import { levelAt } from './resources.js'
import { DAY, HOUR, type GameTime } from './time.js'
import type { CrewActivity, CrewState, SimState } from './types.js'

/** Three 8-hour watches to a day. */
export const WATCH_HOURS = 8
const WATCH_OFFSET: Record<Watch, number> = { A: 0, B: 8, C: 16 }

/**
 * Per-crew daily consumption at rest. ISS-derived (§3.2), which is to say
 * these are real numbers for real people in a can.
 */
export const METABOLIC = {
  o2KgPerDay: 0.84,
  co2KgPerDay: 1.0,
  waterKgPerDay: 3.5,
  foodKgPerDay: 1.8,
  /** Sensible heat output, kW. A resting adult is about 110 W. */
  heatKw: 0.11,
} as const

/** Activity scales metabolism: working crew breathe harder than sleeping ones. */
const ACTIVITY_LOAD: Record<CrewActivity, number> = { watch: 1.3, off: 1.0, sleep: 0.65 }

export function activityLoad(activity: CrewActivity): number {
  return ACTIVITY_LOAD[activity]
}

/** Where a watch is in its cycle at a given time: 8 on, 8 off, 8 asleep. */
export function activityAt(watch: Watch, t: GameTime): CrewActivity {
  const hourOfDay = ((t % DAY) + DAY) % DAY / HOUR
  const since = (hourOfDay - WATCH_OFFSET[watch] + 24) % 24
  if (since < WATCH_HOURS) return 'watch'
  if (since < WATCH_HOURS * 2) return 'off'
  return 'sleep'
}

/** The next instant any watch changes state -- always the next 8-hour boundary. */
export function nextShiftBoundary(t: GameTime): GameTime {
  const period = WATCH_HOURS * HOUR
  return Math.floor(t / period) * period + period
}

/** Fatigue points per game day, by activity. Sleep pays the debt back faster. */
const FATIGUE_RATE: Record<CrewActivity, number> = { watch: 34, off: 16, sleep: -74 }

export function fatigueRatePerSecond(activity: CrewActivity): number {
  return FATIGUE_RATE[activity] / DAY
}

// ---------------------------------------------------------------------------
// Environment -> crew performance
// ---------------------------------------------------------------------------

/** Cabin CO2 in parts per million, from mass and pressurised volume. */
export function co2Ppm(state: SimState, t: GameTime): number {
  const hull = getHull(state.ship.hullId)
  const kg = levelAt(state.ship.resources.co2, t)
  // Moles of air per m3 at 1 atm, 21 C. CO2 is 0.044 kg/mol.
  const molesTotal = 41.45 * hull.cabinVolumeM3
  return ((kg / 0.044) / molesTotal) * 1e6
}

/** Comfortable operating temperature; the thermal loop holds this when it can. */
export const NOMINAL_TEMP_C = 21

/**
 * How well the crew can work, 0-1. Fatigue, health and the environment they
 * are being asked to work in.
 *
 * This is the channel through which a failed scrubber becomes slower repairs,
 * which is the coupling that makes the ship feel like a system rather than a
 * set of unrelated gauges.
 */
export function crewEffectiveness(state: SimState, crew: CrewState, t: GameTime): number {
  if (crew.activity !== 'watch') return 0

  const fatigue = levelAt(crew.fatigue, t)
  const health = levelAt(crew.health, t)

  let m = 1
  m *= 1 - (fatigue / 100) * 0.45
  m *= 0.55 + (health / 100) * 0.45

  const ppm = co2Ppm(state, t)
  if (ppm > 10000) m *= 0.6
  else if (ppm > 5000) m *= 0.85

  const temp = levelAt(state.ship.resources.heat, t)
  if (temp > 35) m *= 0.5
  else if (temp > 28) m *= 0.85

  return Math.max(0.05, Math.min(1, m))
}

/**
 * Labour-hours a crew member completes per game hour of work order.
 *
 * A green hand is slower than useless on a difficult job; a veteran is worth
 * three of them. §4.2: crew quality must show up in numbers the player is
 * already watching, and "days until this is fixed" is the most watched number
 * in M1.
 */
export function laborRate(state: SimState, crew: CrewState, t: GameTime): number {
  const def = getCrewDef(crew.defId)
  const skillFactor = 0.4 + (def.skills.mechanics / 100) * 1.1
  return skillFactor * crewEffectiveness(state, crew, t)
}

/** The best value of a skill among crew currently aboard. */
export function bestSkill(state: SimState, skill: 'mechanics' | 'lifeSupport'): number {
  let best = 0
  for (const crew of state.crew) {
    const value = getCrewDef(crew.defId).skills[skill]
    if (value > best) best = value
  }
  return best
}

/**
 * Ship-wide effects of having a good engineer aboard (§4.2).
 *
 * A well-kept plant runs a little hotter and a little longer between services.
 * Both effects are deliberately visible in the power readout and the condition
 * bars rather than hidden in a modifier screen.
 */
export function mechanicBonuses(state: SimState): { outputScale: number; wearScale: number } {
  const skill = bestSkill(state, 'mechanics')
  return {
    outputScale: 1 + (skill / 100) * 0.08,
    wearScale: 1 - (skill / 100) * 0.3,
  }
}

/** A skilled life-support tech squeezes a little more closure out of the loops. */
export function lifeSupportBonus(state: SimState): number {
  return (bestSkill(state, 'lifeSupport') / 100) * 0.015
}

/** Refresh every crew member's activity for the current time. */
export function updateActivities(state: SimState, t: GameTime): boolean {
  let changed = false
  for (const crew of state.crew) {
    const next = activityAt(crew.watch, t)
    if (next !== crew.activity) {
      crew.activity = next
      changed = true
    }
  }
  return changed
}
