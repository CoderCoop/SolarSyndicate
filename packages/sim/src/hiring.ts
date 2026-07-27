/**
 * The hiring hall, and what crew cost. Design doc §4.4, §6.1, §10.1.
 *
 * Until now the four aboard were a fact of the world. They are now a *decision*
 * — and the first decision with a running cost attached, because wages are the
 * largest standing bill a desk has and they are paid whether the ship is flying
 * or sitting alongside.
 *
 * Three things make hiring a choice rather than shopping:
 *
 * **Berths.** The Kestrel draws six bunks for a crew of four, which the ship
 * view has stated since M1 without anything enforcing it. Now it is the limit:
 * two spare berths, and a bigger hull is also a bigger payroll.
 *
 * **The guild sets the floor.** Wrightworks bargains its people *up* — §6.1's
 * "wage floors and mandatory rest, genuinely good for crew, costs money" — so
 * the same candidate is dearer under a union card than under The Drift, which
 * has no floor and no safety net either.
 *
 * **A hall is a place.** Candidates stand where they stand. Wrightworks' home
 * is Tranquillity and §6.1 promises "the best mechanics in any hall", so the
 * deep bench is there and Gateway carries the general trade. Wanting a
 * particular person is a reason to fly somewhere.
 */
import { crewInHall, getCrewDef, getGuild, getHull } from '@solsyn/data'
import { post } from './ledger.js'
import { pushLog } from './log.js'
import { makeReservoir } from './resources.js'
import { DAY, type GameTime } from './time.js'
import type { CrewState, SimState } from './types.js'

/** What a person costs per day, after the guild's floor is applied. */
export function wageFor(state: SimState, defId: string): number {
  const guild = getGuild(state.guildId)
  return Math.round(getCrewDef(defId).wageCrPerDay * guild.wageFloor)
}

/** The whole payroll, per day. */
export function dailyWagesCr(state: SimState): number {
  return state.crew.reduce((sum, c) => sum + wageFor(state, c.defId), 0)
}

export function berths(state: SimState): { used: number; total: number; free: number } {
  const total = getHull(state.ship.hullId).berths
  const used = state.crew.length
  return { used, total, free: Math.max(0, total - used) }
}

export interface Candidate {
  id: string
  name: string
  role: string
  age: number
  blurb: string
  stationRoomId: string
  qualifications: string[]
  /** Daily wage at this desk's guild rates. */
  wageCrPerDay: number
  /** What they ask before the guild floor -- so the floor is visible, not folded in. */
  asksCrPerDay: number
  hireable: boolean
  why?: string
}

/**
 * Who is standing in the hall here. Empty under way, and empty of anyone
 * already aboard.
 */
export function hiringHall(state: SimState): Candidate[] {
  if (!state.ship.docked) return []
  const aboard = new Set(state.crew.map((c) => c.defId))
  const free = berths(state).free

  return crewInHall(state.ship.portId)
    .filter((def) => !aboard.has(def.id))
    .map((def) => {
      const wage = wageFor(state, def.id)
      // A month's wages up front is the yard's rule of thumb for whether a desk
      // can actually carry someone, and it stops a hire that bankrupts you on
      // the first day roll.
      const affordable = state.credits >= wage * 30
      const hireable = free > 0 && affordable

      return {
        id: def.id,
        name: def.name,
        role: def.role,
        age: def.age,
        blurb: def.blurb,
        stationRoomId: def.stationRoomId,
        qualifications: [...def.qualifications],
        wageCrPerDay: wage,
        asksCrPerDay: def.wageCrPerDay,
        hireable,
        ...(hireable
          ? {}
          : {
              why:
                free === 0
                  ? 'No berth free. Someone would have to leave first.'
                  : `The desk cannot carry the wage — ${(wage * 30).toLocaleString()} cr of cover wanted.`,
            }),
      }
    })
}

/**
 * Take somebody on. Does nothing if they are not actually on offer, matching
 * the rule the astrogator and the yard already follow: having marked something
 * unavailable, doing it anyway would make the marking a lie.
 */
export function hireCrew(state: SimState, crewId: string, at: GameTime): boolean {
  const candidate = hiringHall(state).find((c) => c.id === crewId)
  if (!candidate || !candidate.hireable) return false
  const def = getCrewDef(crewId)

  // Onto the thinnest watch, so a hire fills a gap rather than crowding a shift.
  const counts = { A: 0, B: 0, C: 0 }
  for (const c of state.crew) counts[c.watch] += 1
  const watch = (['A', 'B', 'C'] as const).reduce((a, b) => (counts[a] <= counts[b] ? a : b))

  const hired: CrewState = {
    id: def.id,
    defId: def.id,
    watch,
    activity: 'off',
    // They arrive rested and in one piece; what happens next is on the desk.
    fatigue: makeReservoir(10, 0, 100, at),
    health: makeReservoir(95, 0, 100, at),
  }
  state.crew.push(hired)

  pushLog(
    state,
    at,
    'info',
    'crew',
    `${def.name} signed on as ${def.role}, ${watch} watch.`,
    `${candidate.wageCrPerDay.toLocaleString()} cr/day`,
  )
  return true
}

/**
 * Let somebody go. Costs a fortnight's wages in severance under a guild that
 * has a wage floor -- §6.1's rest-and-wage rules cut both ways, and a union
 * card is worth something on the way out as well as on the way in.
 */
export function dismissCrew(state: SimState, crewId: string, at: GameTime): boolean {
  const index = state.crew.findIndex((c) => c.id === crewId)
  if (index < 0) return false
  // A ship with nobody aboard is a derelict, not a challenge (§7.4).
  if (state.crew.length <= 1) return false

  const def = getCrewDef(state.crew[index]!.defId)
  const guild = getGuild(state.guildId)
  const severance = guild.wageFloor > 1 ? wageFor(state, def.id) * 14 : 0

  state.crew.splice(index, 1)
  // Anything they were part-way through goes back on the board unassigned.
  for (const order of state.workOrders) {
    if (order.assignedCrewId === crewId) delete order.assignedCrewId
  }

  if (severance > 0) post(state, at, -severance, `Severance for ${def.name}`)
  pushLog(
    state,
    at,
    'warn',
    'crew',
    severance > 0
      ? `${def.name} paid off. ${guild.name} rules put severance on the desk.`
      : `${def.name} paid off. No severance, no argument.`,
    severance > 0 ? `−${severance.toLocaleString()} cr` : undefined,
  )
  return true
}

/**
 * Run the payroll. Called on the day roll, because money is a *stock* and only
 * an event may move it -- a wage bill expressed as a rate would have to be
 * integrated during catch-up, and the whole ledger is built on not doing that.
 */
export function payWages(state: SimState, at: GameTime): void {
  const total = dailyWagesCr(state)
  if (total <= 0) return
  post(state, at, -total, `Wages, ${state.crew.length} aboard`)
}

/** A day's payroll, for the UI to state before anyone is hired. */
export const WAGE_PERIOD = DAY
