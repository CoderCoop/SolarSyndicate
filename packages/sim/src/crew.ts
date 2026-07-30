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
import { environmentAt } from './physiology.js'
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

/** Moles of air per m3 at 1 atm, 21 C. */
const MOLES_PER_M3 = 41.45

/** Molar mass of CO2, kg/mol. */
const CO2_KG_PER_MOL = 0.044

/** Cabin CO2 in parts per million, from mass and pressurised volume. */
export function co2Ppm(state: SimState, t: GameTime): number {
  const hull = getHull(state.ship.hullId)
  const kg = levelAt(state.ship.resources.co2, t)
  const molesTotal = MOLES_PER_M3 * hull.cabinVolumeM3
  return (kg / CO2_KG_PER_MOL / molesTotal) * 1e6
}

/** The inverse: what a given cabin concentration weighs. */
export function co2KgForPpm(state: SimState, ppm: number): number {
  const hull = getHull(state.ship.hullId)
  const molesTotal = MOLES_PER_M3 * hull.cabinVolumeM3
  return (ppm / 1e6) * molesTotal * CO2_KG_PER_MOL
}

/** Comfortable operating temperature; the thermal loop holds this when it can. */
export const NOMINAL_TEMP_C = 21

/**
 * Everybody still aboard and breathing.
 *
 * The dead stay on `state.crew` because §4.5 wants people to persist -- a name
 * you lost is part of the campaign, not a row to delete. But that means every
 * consumer has to remember to skip them, and four separately forgot: the dead
 * held berths that blocked hiring, drew wages, kept reporting "On watch", and
 * held work orders nobody was doing. One helper, so the next consumer does not
 * have to remember.
 */
export function livingCrew(state: SimState): CrewState[] {
  return state.crew.filter((c) => !c.dead)
}

/**
 * How well the crew can work, 0-1. Fatigue, health and the environment they
 * are being asked to work in.
 *
 * This is the channel through which a failed scrubber becomes slower repairs,
 * which is the coupling that makes the ship feel like a system rather than a
 * set of unrelated gauges.
 */
export function crewEffectiveness(state: SimState, crew: CrewState, t: GameTime): number {
  if (crew.dead || crew.activity !== 'watch') return 0

  const fatigue = levelAt(crew.fatigue, t)
  const health = levelAt(crew.health, t)

  let m = 1
  m *= 1 - (fatigue / 100) * 0.45
  m *= 0.55 + (health / 100) * 0.45

  // What the air is doing to them, on the real ladder (physiology.ts). This
  // used to be four `if`s inline: CO2 over 10,000 ppm cost 40% and heat over
  // 35 C cost half, with nothing in between and no name for either.
  const env = environmentAt(state, t)
  m *= env.capacity

  // Unconscious is not "very slow". Somebody at 4% CO2 is not doing a reduced
  // amount of work, they are doing none, and the floor below must not quietly
  // hand them back a twentieth of a shift.
  if (env.incapacitating) return 0

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
export function laborRate(
  state: SimState,
  crew: CrewState,
  t: GameTime,
  kind: 'service' | 'repair' = 'repair',
): number {
  const def = getCrewDef(crew.defId)
  // Different work, different competence (§4.2). Routine servicing is
  // Equipment Maintenance; bringing a failed unit back is Repairing, gated by
  // Troubleshooting -- you cannot fix what you have not diagnosed.
  const skill =
    kind === 'service'
      ? def.skills.equipmentMaintenance / 100
      : (def.skills.repairing / 100) * 0.7 + (def.skills.troubleshooting / 100) * 0.3
  const skillFactor = 0.4 + skill * 1.1
  return skillFactor * crewEffectiveness(state, crew, t)
}

/** Where crew go when they are not on watch. */
export const QUARTERS_ROOM_DEF = 'quarters'

/**
 * Which room a crew member is in. Spec 003 SV-8, spec 004 RF-32.
 *
 * Derived, never stored (constitution V). Sleeping and off-watch crew are in
 * Quarters; a crew member on a work order is at the part they are working on;
 * anyone else is at their station.
 *
 * This lives here rather than in the selector layer because the *simulation*
 * now depends on it too: attendance is what a room's wear and efficiency turn
 * on. Two definitions of "where is she" would drift, and the drawing would
 * stop agreeing with the physics.
 */
export function crewRoomId(state: SimState, crew: CrewState): string {
  const roomByDef = (defId: string): string | undefined =>
    state.ship.rooms.find((r) => r.defId === defId)?.id

  if (crew.activity !== 'sleep' && crew.workOrderId) {
    const order = state.workOrders.find((w) => w.id === crew.workOrderId)
    const part = order ? state.ship.parts.find((p) => p.id === order.partId) : undefined
    if (part) return part.roomId
  }

  const def = getCrewDef(crew.defId)
  const station = crew.activity === 'watch' ? def.stationRoomId : QUARTERS_ROOM_DEF
  // Fall back rather than throwing: a hull without quarters is a content bug,
  // not a reason to blank the screen.
  return roomByDef(station) ?? roomByDef(def.stationRoomId) ?? state.ship.rooms[0]!.id
}

/** Refresh every crew member's activity for the current time. */
export function updateActivities(state: SimState, t: GameTime): boolean {
  let changed = false
  for (const crew of state.crew) {
    if (crew.dead) continue
    const next = activityAt(crew.watch, t)
    if (next !== crew.activity) {
      crew.activity = next
      changed = true
    }
  }
  return changed
}
