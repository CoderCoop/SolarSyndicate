/**
 * Station services. Design doc §3.2, §7.3.
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
 * Nothing at the pump, and that is deliberate rather than an oversight. The
 * bill arrives on delivery: `reconcileArrival` measures what the crossing
 * consumed against the Guild's allowance and credits the underrun or bills the
 * overrun at the arrival port's price (TR-17, TR-18). Charging again here
 * would bill the same kilogramme twice.
 *
 * Two honest consequences of that model, which the log now makes visible
 * rather than leaving to be discovered: the allowance baseline is taken at
 * *departure*, so whatever comes aboard before casting off is free; and a ship
 * sitting at a berth with no contract refills for nothing at all.
 *
 * ## Why it is a standing order
 *
 * §7.3: "the policy toggles you set in advance". Automatic is the right
 * default -- nobody wants to press a button to be handed water they have
 * already been budgeted for -- but a default that cannot be turned off is not
 * a policy, it is a fact, and a player running a tight allowance may want the
 * tanks left exactly where they are.
 */
import { ALLOWANCE_KEYS, storesNow, type AllowanceKey } from './contracts.js'
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

  pushLog(
    state,
    at,
    'info',
    'ship',
    `Station services: took on ${taken.map((t) => storeAmount(t.key, t.delta)).join(', ')}. ${why}`,
    'alongside',
  )
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
