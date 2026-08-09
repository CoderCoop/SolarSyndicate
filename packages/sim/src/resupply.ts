/**
 * Station services. Design doc §3.2, §6.2, §7.3.
 *
 * While the ship is alongside, five stores top themselves up: water, food,
 * oxygen, spares and propellant. That has been true since M1 -- it is why the
 * first milestone's tension is failures rather than supply -- and until now
 * **nothing said so**. No dispatch, no ledger line, no switch. A player could
 * watch the tanks fill and have no way to know whether that was the station,
 * the recycler, or a bug.
 *
 * ## What it costs
 *
 * **Every kilogramme is bought, at the price of the port it is bought from.**
 * The price table has always been there -- and it is a good one: volatiles get
 * cheaper the further out you go, because ice is abundant in the Belt and
 * dear in low Earth orbit, while food runs the other way because nothing grows
 * out there. Ceres water is a fifth of Gateway water; Ceres food is twice
 * Gateway food. Until now nothing consulted it except the settlement, so all
 * of that geography was written down and inert.
 *
 * The Guild still pays: the contract **reimburses the allowance it budgeted**,
 * at the arrival port's rates (TR-18). What changes is that the two halves are
 * now separate events instead of one netted figure -- money out at the pump,
 * money in at the desk.
 *
 * That is not a balance change for the ordinary run. Buy back what the
 * crossing spent, at the port you arrived at, and the bottom line is what it
 * always was: `allowed x price` in, `used x price` out. It becomes a change
 * the moment the player does something interesting -- top up at Ceres where
 * water is cheap, decline the stores and keep the reimbursement, or sit at a
 * berth between contracts, which used to be free and is now a bill.
 *
 * ## Why it is a standing order
 *
 * §7.3: "the policy toggles you set in advance". Automatic is the right
 * default -- nobody wants to press a button to be handed water they have
 * already been budgeted for -- but a default that cannot be turned off is not
 * a policy, it is a fact, and a player running a tight allowance may want the
 * tanks left exactly where they are.
 */
import { getPort, priceAt } from '@solsyn/data'
import { ALLOWANCE_KEYS, storesNow, type AllowanceKey } from './contracts.js'
import { post } from './ledger.js'
import { pushLog } from './log.js'
import { type GameTime } from './time.js'
import type { SimState } from './types.js'

/** What station services deliver per day, per store. */
export const ALONGSIDE_RATES = {
  water: 6,
  o2: 0.5,
  food: 8,
  spares: 2,
  propellant: 120,
} as const satisfies Record<AllowanceKey, number>

/** Whether the pumps should be running at this instant. */
export function resupplying(state: SimState): boolean {
  return state.ship.docked && state.ship.standingOrders.resupply
}

/**
 * Start counting what comes aboard.
 *
 * A reading taken now, differenced against a reading taken later -- the same
 * shape the contract allowance uses, and for the same reason: an accumulator
 * would drift across catch-up, and a difference of two levels cannot
 * (constitution V).
 */
export function beginResupply(state: SimState, at: GameTime): void {
  if (!resupplying(state)) return
  state.ship.resupplyFrom = { at, stores: storesNow(state, at) }
}

/** Units of a store, in the words that store is counted in. */
export function storeAmount(key: AllowanceKey, value: number): string {
  if (key === 'propellant') return `${(value / 1000).toFixed(1)} t propellant`
  if (key === 'spares') return `${Math.round(value)} spares`
  return `${Math.round(value)} kg ${key === 'o2' ? 'oxygen' : key}`
}

/**
 * Stop counting, and say what was taken on.
 *
 * Silent when nothing moved: a berth touched for an hour with full tanks
 * should not produce a dispatch saying so. The log is for things that
 * happened.
 */
export function endResupply(state: SimState, at: GameTime, why: string): void {
  const from = state.ship.resupplyFrom
  state.ship.resupplyFrom = undefined
  if (!from) return

  const now = storesNow(state, at)
  // Filtered on what the line would actually *say*, not on a threshold in
  // kilogrammes: propellant prints in tonnes, so half a kilo of it passed a
  // kilogramme test and then rendered as "0.0 t propellant".
  const taken = ALLOWANCE_KEYS.map((key) => ({
    key,
    delta: now[key] - (from.stores[key] ?? 0),
  }))
    .filter((t) => t.delta > 0 && !/^0(\.0+)? /.test(storeAmount(t.key, t.delta)))
    .sort((a, b) => b.delta - a.delta)
  if (taken.length === 0) return

  const cr = buyStores(
    state,
    at,
    Object.fromEntries(taken.map((t) => [t.key, t.delta])) as Partial<
      Record<AllowanceKey, number>
    >,
  )

  pushLog(
    state,
    at,
    'info',
    'ship',
    `Station services at ${getPort(state.ship.portId).name}: took on ${taken
      .map((t) => storeAmount(t.key, t.delta))
      .join(', ')}. ${why}`,
    `−${Math.round(cr).toLocaleString()} cr`,
  )
}

/** What a delivery of these stores costs at this port. */
export function priceStores(portId: string, taken: Partial<Record<AllowanceKey, number>>): number {
  let cr = 0
  for (const key of ALLOWANCE_KEYS) cr += (taken[key] ?? 0) * priceAt(portId, key)
  return cr
}

/**
 * Buy what came aboard, from whoever is selling it here.
 *
 * One ledger line rather than five: a player reading the books wants "stores
 * at Ceres Local", not a column of five entries they have to add up to find
 * out what a stop cost.
 */
export function buyStores(
  state: SimState,
  at: GameTime,
  taken: Partial<Record<AllowanceKey, number>>,
): number {
  const portId = state.ship.portId
  const cr = priceStores(portId, taken)
  if (cr <= 0.5) return 0
  post(state, at, -cr, `Stores at ${getPort(portId).name}`)
  return cr
}

/**
 * The switch itself, with the log line that makes it a decision rather than a
 * setting that silently changes the arithmetic.
 */
export function setResupply(state: SimState, at: GameTime, on: boolean): void {
  if (state.ship.standingOrders.resupply === on) return
  state.ship.standingOrders.resupply = on

  if (on) {
    beginResupply(state, at)
    if (state.ship.docked) {
      pushLog(state, at, 'info', 'ship', 'Station services connected. Stores are topping up.')
    }
    return
  }

  endResupply(state, at, 'Services disconnected.')
  if (state.ship.docked) {
    pushLog(
      state,
      at,
      'info',
      'ship',
      'Station services disconnected. Stores hold where they are until you reconnect.',
    )
  }
}
