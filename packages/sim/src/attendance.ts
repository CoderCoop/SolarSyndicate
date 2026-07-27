/**
 * Attendance. Spec 004 RF-27 to RF-39. Design doc §4.2, §4.3, §7.4.
 *
 * The design says equipment *and crew* decide how well the networks run.
 * Condition already did that. Crew did not: the old bonuses read the best
 * skill aboard regardless of watch, station or consciousness, so a technician
 * asleep in her bunk improved the water loop exactly as much as one standing
 * at the recycler. Assignment was decorative.
 *
 * The rule now is presence, and it buys two separate things: slower wear
 * here, and -- through tune.ts -- a system that stays in adjustment.
 *
 * A hand counts for a room only while on watch and
 * stationed there -- by their watch bill or by an active work order -- and
 * their contribution scales with current effectiveness, so fatigue, cabin CO2
 * and cabin temperature all feed back into it.
 *
 * The governing constraint is §7.4: a part's rated figures are what it
 * delivers *unattended*. An unattended ship runs to spec indefinitely and
 * never decays toward some worse steady state. Presence is upside -- a little
 * output, and mostly slower wear -- so absence can never kill, never spiral,
 * and never make the ship worse than the hardware you bought.
 *
 * Nothing here schedules anything. Attendance changes only when a watch turns
 * over or a work order moves, both of which already re-resolve the world, so
 * offline catch-up stays bit-identical (constitution VI, RF-31).
 */
import { ATTENDANCE, getCrewDef, getRoom, type RoomDef } from '@solsyn/data'
import { crewEffectiveness, crewRoomId } from './crew.js'
import type { GameTime } from './time.js'
import type { CrewState, SimState } from './types.js'

/**
 * How well someone's knowledge matches what a room needs. 0-1.
 *
 * Weighted across domains rather than keyed to one skill, because the engine
 * room is genuinely part mechanical and part physics -- and saying so in data
 * beats inventing a "nuclear engineering" skill that nothing else uses.
 */
export function knowledgeMatch(def: ReturnType<typeof getCrewDef>, room: RoomDef): number {
  let total = 0
  let weighted = 0
  for (const { domain, weight } of room.needs) {
    total += weight
    weighted += (def.knowledge[domain] / 100) * weight
  }
  return total > 0 ? weighted / total : 0
}

export interface Attendance {
  /** Is anyone on watch in this room at all? */
  attended: boolean
  /**
   * 0-1. The best hand's relevant skill times their current effectiveness.
   * Zero when the room is deserted, or when whoever is there is useless at
   * what this room needs.
   */
  quality: number
  /** Who is being counted, for the UI to name. */
  crewId?: string
  /** Do they hold this system's endorsement? */
  certified?: boolean
}

const NOBODY: Attendance = { attended: false, quality: 0 }

/** A room's attendance right now. */
export function attendanceFor(state: SimState, roomId: string, t: GameTime): Attendance {
  const roomState = state.ship.rooms.find((r) => r.id === roomId)
  if (!roomState) return NOBODY
  const room = getRoom(roomState.defId)

  let best: Attendance = NOBODY
  for (const crew of state.crew) {
    // Only a hand actually standing a watch here counts. Asleep in the same
    // compartment is not attendance, which is the whole point of the rule.
    if (crew.dead || crew.activity !== 'watch') continue
    if (crewRoomId(state, crew) !== roomId) continue

    const def = getCrewDef(crew.defId)
    // Keeping a system in adjustment is Operation Monitoring, applied through
    // what you actually understand about it -- O*NET's own definition is
    // "watching gauges, dials, or other indicators to make sure a machine is
    // working properly", which is exactly this.
    const monitoring = def.skills.operationMonitoring / 100
    const match = knowledgeMatch(def, room)
    const certified =
      !room.qualification || def.qualifications.includes(room.qualification)

    const quality =
      monitoring *
      match *
      (certified ? 1 : ATTENDANCE.uncertifiedPenalty) *
      crewEffectiveness(state, crew, t)

    if (!best.attended || quality > best.quality) {
      best = { attended: true, quality, crewId: crew.id, certified }
    }
  }
  return best
}

/** Attendance for the room a given part sits in. */
export function attendanceForPart(state: SimState, roomId: string, t: GameTime): Attendance {
  return attendanceFor(state, roomId, t)
}

/**
 * Wear multiplier. This is where presence actually pays, because "keeping the
 * systems in good operational status" is a claim about condition over time,
 * not about instantaneous throughput.
 *
 * Deserted rooms wear slightly faster than rated -- weeks of drift, visible in
 * the condition bar long before it becomes a failure, and always recoverable
 * with a work order. A reason to staff a watch, never a punishment for closing
 * the app.
 */
export function wearScaleFor(a: Pick<Attendance, 'attended' | 'quality'>): number {
  if (!a.attended) return ATTENDANCE.wearScaleUnattended
  const { wearScaleUnskilled, wearScaleSkilled } = ATTENDANCE
  return wearScaleUnskilled - a.quality * (wearScaleUnskilled - wearScaleSkilled)
}

/** Everything the UI needs to explain a room's attendance in one call. */
export function attendanceView(
  state: SimState,
  roomId: string,
  t: GameTime,
): Attendance & { wearScale: number; name?: string } {
  const a = attendanceFor(state, roomId, t)
  const crew: CrewState | undefined = a.crewId
    ? state.crew.find((c) => c.id === a.crewId)
    : undefined
  return {
    ...a,
    wearScale: wearScaleFor(a),
    ...(crew ? { name: getCrewDef(crew.defId).name } : {}),
  }
}
