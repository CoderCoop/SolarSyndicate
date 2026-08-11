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
import { content, getContract, getGuild } from '@solsyn/data'
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
      standing,
      band: bandOf(standing),
      own: g.id === state.guildId,
    }
  })
}
