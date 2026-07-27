/**
 * Contracts. Spec 002 TR-16, TR-20. Design doc §2, §6.2.
 *
 * A contract is the thing that makes the rest of the ship matter. It supplies
 * the two clocks §2 is built around -- a deadline, and consumables that are no
 * longer topped up for free -- and it states, *before* it is accepted, what the
 * Guild has budgeted for the run.
 *
 * That allowance is the mechanism the whole milestone turns on. Loop closure,
 * tune, attendance and upgrade tiers have all been moving numbers that nothing
 * counted; measured against a budget, they become money. A tended ship arrives
 * under and banks the difference. A neglected one arrives over and pays.
 *
 * Nothing here can refuse the player anything. Abandoning a run costs credits,
 * never the ship (TR-21).
 */
import { contractsFrom, getContract, type Allowance, type MissionType } from '@solsyn/data'
import { adjustStanding, guildForContract, STANDING_DELTA } from './guild.js'
import { post } from './ledger.js'
import { pushLog } from './log.js'
import { levelAt } from './resources.js'
import { DAY, type GameTime } from './time.js'
import { RESOURCE_KEYS, type SimState } from './types.js'

/** Consumables an allowance covers. Battery, heat and CO2 are not stores. */
export const ALLOWANCE_KEYS = ['water', 'o2', 'food', 'propellant', 'spares'] as const
export type AllowanceKey = (typeof ALLOWANCE_KEYS)[number]

export interface ContractState {
  defId: string
  acceptedAt: GameTime
  dueAt: GameTime
  /**
   * What was in the tanks when the run began. Consumption is measured against
   * this on arrival, so the reconciliation is a difference of two readings
   * rather than an accumulator that could drift (constitution V).
   */
  storesAtDeparture: Record<AllowanceKey, number>
}

/** Snapshot the stores an allowance is measured against. */
export function storesNow(state: SimState, t: GameTime): Record<AllowanceKey, number> {
  const out = {} as Record<AllowanceKey, number>
  for (const key of ALLOWANCE_KEYS) {
    // Every allowance key is also a resource key; this keeps them in step.
    if (!RESOURCE_KEYS.includes(key)) throw new Error(`Allowance key ${key} is not a resource`)
    out[key] = levelAt(state.ship.resources[key], t)
  }
  return out
}

export interface BoardEntry {
  id: string
  title: string
  client: string
  /** What kind of errand it is (§5.3). Flavour and framing, never arithmetic. */
  type: MissionType
  fromPortId: string
  toPortId: string
  payCr: number
  abandonCr: number
  cargoKg: number
  deadlineDays: number
  allowance: Allowance
  blurb: string
}

/**
 * What is on offer here. Empty while a run is under way: one ship, one
 * contract, and the board is a place rather than a menu.
 */
export function contractBoard(state: SimState): BoardEntry[] {
  if (state.contract) return []
  return contractsFrom(state.ship.portId).map((c) => ({ ...c }))
}

export interface ActiveContractView extends BoardEntry {
  acceptedAt: GameTime
  dueAt: GameTime
  daysRemaining: number
  late: boolean
}

export function activeContract(state: SimState): ActiveContractView | undefined {
  const held = state.contract
  if (!held) return undefined
  const def = getContract(held.defId)
  const daysRemaining = (held.dueAt - state.now) / DAY
  return {
    ...def,
    acceptedAt: held.acceptedAt,
    dueAt: held.dueAt,
    daysRemaining,
    late: daysRemaining < 0,
  }
}

/** Take a run. Ignored if one is already under way, or if it is not on offer here. */
export function acceptContract(state: SimState, contractId: string, at: GameTime): void {
  if (state.contract) return
  const def = contractsFrom(state.ship.portId).find((c) => c.id === contractId)
  if (!def) return

  state.contract = {
    defId: def.id,
    acceptedAt: at,
    dueAt: at + def.deadlineDays * DAY,
    storesAtDeparture: storesNow(state, at),
  }
  state.ship.cargoKg += def.cargoKg

  pushLog(
    state,
    at,
    'info',
    'voyage',
    `Contract accepted: ${def.title} for ${def.client}. ${(def.cargoKg / 1000).toFixed(1)} t aboard, ${def.deadlineDays} days.`,
    `${def.payCr.toLocaleString()} cr`,
  )
}

/**
 * Walk away. Costs the stated penalty and gives the cargo back -- never
 * refused, because a desk that cannot drop a job it can no longer do is a desk
 * that gets stranded by its own paperwork (TR-21).
 */
export function abandonContract(state: SimState, at: GameTime): void {
  const held = state.contract
  if (!held) return
  const def = getContract(held.defId)

  state.ship.cargoKg = Math.max(0, state.ship.cargoKg - def.cargoKg)
  state.contract = undefined
  post(state, at, -def.abandonCr, `Contract abandoned: ${def.title}`)
  adjustStanding(
    state,
    guildForContract(def.id),
    STANDING_DELTA.abandoned,
    at,
    'They had to find another hull at short notice.',
  )
  pushLog(
    state,
    at,
    'warn',
    'money',
    `${def.title} abandoned. ${def.client} charged the desk and will remember it.`,
    `−${def.abandonCr.toLocaleString()} cr`,
  )
}
