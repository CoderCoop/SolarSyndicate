/**
 * The guild you fly for. Design doc §6.1.
 *
 * "Ships don't fly free -- they fly *affiliated*." The guild is the seat the
 * player occupies: it sets the hall they hire from, the wage floor they are
 * held to, and what a reputation is worth. §10.1's four-way opening choice
 * belongs to M6; what M3 builds is the *system* those four choices select
 * between, so the desk is Wrightworks and the other three exist to have
 * standing with.
 *
 * Standing runs -100 to +100 with *every* guild, not only your own, because
 * §6.1 makes cross-guild friction real: delivering for the Institute is not
 * neutral to the Combine. It moves on outcomes rather than on intentions --
 * what you delivered, when, and what you walked away from.
 */
import { content, frictionBetween, getContract, getGuild, rivalryBetween } from '@solsyn/data'
import { pushLog } from './log.js'
import { type GameTime } from './time.js'
import type { SimState } from './types.js'

export const STANDING_MIN = -100
export const STANDING_MAX = 100

/** What each outcome is worth with the guild that offered the work. */
export const STANDING_DELTA = {
  delivered: 4,
  deliveredLate: -3,
  abandoned: -12,
} as const

export function standingWith(state: SimState, guildId: string): number {
  return state.standing[guildId] ?? 0
}

/** Move standing, clamped. Never throws on an unknown guild: content may grow. */
export function adjustStanding(
  state: SimState,
  guildId: string,
  delta: number,
  at: GameTime,
  reason: string,
): void {
  const before = standingWith(state, guildId)
  const after = Math.max(STANDING_MIN, Math.min(STANDING_MAX, before + delta))
  if (after === before) return
  state.standing[guildId] = after

  // Only worth telling the player when it crosses a band; standing drifting by
  // three is noise in a log they read for problems.
  if (bandOf(before) !== bandOf(after)) {
    pushLog(
      state,
      at,
      delta > 0 ? 'info' : 'warn',
      'crew',
      `${getGuild(guildId).name} now reckon you ${bandLabel(after).toLowerCase()}. ${reason}`,
      `${delta > 0 ? '+' : ''}${delta} standing`,
    )
  }
}

/**
 * An outcome, credited to the guild it was for and charged to its rivals.
 * Design doc §6.1.
 *
 * "Cross-guild friction is real: delivering for the Institute is not neutral to
 * the Combine." The Crew tab has told the player exactly that since M3, under a
 * simulation in which only the letting guild ever moved — a claim the game made
 * and did not keep.
 *
 * **Only good news travels.** A delivery earns you with the client and costs
 * you with whoever they compete against; a late arrival or a walk-away costs
 * you with the client and earns you nothing anywhere. Two reasons, and the
 * second is the load-bearing one:
 *
 * - It is truer. The Combine does not thank you for letting the Guild down.
 *   They notice what you *did*, and what you did was fail.
 * - It closes a farm. If failure paid rivals, the cheapest route to standing
 *   with Wrightworks would be to sign Helios contracts and abandon them, over
 *   and over, for a fee — which is a strategy the fiction cannot survive.
 *
 * The rival's loss is rounded away from zero, so a friction that is meant to
 * bite always bites: 0.25 of a four-point delivery is one point, not none.
 */
export function creditOutcome(
  state: SimState,
  guildId: string,
  delta: number,
  at: GameTime,
  reason: string,
): void {
  adjustStanding(state, guildId, delta, at, reason)
  if (delta <= 0) return

  const client = getGuild(guildId).name
  for (const other of content.guilds) {
    if (other.id === guildId) continue
    const friction = frictionBetween(guildId, other.id)
    const cost = Math.round(delta * friction)
    if (cost <= 0) continue
    adjustStanding(state, other.id, -cost, at, `You delivered for ${client}.`)
  }
}

export type StandingBand = 'hostile' | 'poor' | 'neutral' | 'trusted' | 'valued'

export function bandOf(standing: number): StandingBand {
  if (standing <= -50) return 'hostile'
  if (standing < -10) return 'poor'
  if (standing <= 10) return 'neutral'
  if (standing < 50) return 'trusted'
  return 'valued'
}

function bandLabel(standing: number): string {
  return {
    hostile: 'a liability',
    poor: 'a risk',
    neutral: 'an unknown quantity',
    trusted: 'reliable',
    valued: 'one of their own',
  }[bandOf(standing)]
}

/** Which guild let a given contract. Data will carry this once boards are per-guild. */
export function guildForContract(contractId: string): string {
  const def = getContract(contractId)
  // Until contract boards are split by guild (§10.2 M3), the client's home
  // system stands in: the Office is Institute work, the yards are Wrightworks,
  // Belt Mutual and Vesta Metals are Combine paper.
  if (/Areographic/i.test(def.client)) return 'guild.meridian'
  if (/Yards/i.test(def.client)) return 'guild.wrightworks'
  return 'guild.helios'
}

export interface GuildView {
  id: string
  name: string
  /** For the places a full name will not fit -- the standing readout. */
  shortName: string
  /**
   * How badly your own guild's good news lands with this one, 0 to 1, and why.
   *
   * Undefined for your own seat, which has no friction with itself. This is
   * what turns the panel's claim -- "delivering for one is never neutral to the
   * rest" -- from a sentence into something a player can read off and plan by.
   */
  friction?: number
  frictionWhy?: string
  identity: string
  specialty: string
  culture: string
  playsLike: string
  homePortId: string
  wageFloor: number
  mandatoryRest: boolean
  standing: number
  band: StandingBand
  /** True for the guild the desk actually belongs to. */
  own: boolean
}

export function guildViews(state: SimState): GuildView[] {
  return content.guilds.map((g) => {
    const standing = standingWith(state, g.id)
    const rivalry = g.id === state.guildId ? undefined : rivalryBetween(state.guildId, g.id)
    return {
      id: g.id,
      name: g.name,
      shortName: g.shortName,
      identity: g.identity,
      specialty: g.specialty,
      culture: g.culture,
      playsLike: g.playsLike,
      homePortId: g.homePortId,
      wageFloor: g.wageFloor,
      mandatoryRest: g.mandatoryRest,
      ...(rivalry ? { friction: rivalry.friction, frictionWhy: rivalry.why } : {}),
      standing,
      band: bandOf(standing),
      own: g.id === state.guildId,
    }
  })
}
