/**
 * Settling the books on arrival. Spec 002 TR-17 to TR-21.
 *
 * This is what the milestone was built toward. Loop closure, tune, attendance
 * and upgrade tiers have been moving numbers since M1 that nothing counted.
 * The allowance counts them: consumption over the crossing is measured against
 * what the Guild budgeted, the underrun is credited and the overrun billed, at
 * the price of the port the ship actually arrived at.
 *
 * A tended ship banks the difference. A neglected one pays it. That is the
 * whole mechanic, and it is why every efficiency system in the game now has a
 * number in credits attached to it.
 *
 * Nothing here can refuse or strand. Late delivery pays less, an overrun costs
 * money, the balance may go negative -- and the ship is still berthed, still
 * crewed, and still able to take the next job (TR-21).
 */
import { getContract, getPort, priceAt } from '@solsyn/data'
import { ALLOWANCE_KEYS, storesNow, type AllowanceKey } from './contracts.js'
import { adjustStanding, guildForContract, STANDING_DELTA } from './guild.js'
import { post } from './ledger.js'
import { pushLog } from './log.js'
import { settle } from './resources.js'
import { beginResupply, storeAmount } from './resupply.js'
import { type GameTime } from './time.js'
import type { SimState } from './types.js'

/** What a late delivery is worth, as a fraction of the agreed payment. */
export const LATE_PAYMENT_FRACTION = 0.6

export interface SettlementLine {
  key: AllowanceKey
  usedKg: number
  allowedKg: number
  /** Positive is credited back, negative is billed. */
  creditsCr: number
  unitCr: number
}

export interface Settlement {
  contractId: string
  title: string
  portId: string
  at: GameTime
  late: boolean
  /** What the contract actually paid, after any late reduction. */
  payCr: number
  lines: SettlementLine[]
  /** Sum of the lines: positive means the run came in under budget. */
  allowanceCr: number
  /** Payment plus allowance. What the run was worth in the end. */
  totalCr: number
}

/**
 * Close out a delivered contract.
 *
 * Called at arrival, after the ship is berthed, so the prices used are the
 * arrival port's (TR-19) -- settling at the departure end would quietly
 * overcharge every inbound run.
 */
export function reconcileArrival(state: SimState, at: GameTime): void {
  const held = state.contract
  if (!held) return
  const def = getContract(held.defId)
  // Only settle when the ship actually got where it was going.
  if (state.ship.portId !== def.toPortId) return

  const portId = state.ship.portId
  const port = getPort(portId)
  const now = storesNow(state, at)

  const lines: SettlementLine[] = ALLOWANCE_KEYS.map((key) => {
    const usedKg = Math.max(0, held.storesAtDeparture[key] - now[key])
    const allowedKg = def.allowance[key]
    const unitCr = priceAt(portId, key)
    // Under the allowance is money back; over it is a bill. Same rate either
    // way at the port's price -- the penalty is that the port's price is
    // dearer than what the Guild budgeted at (TR-18).
    return { key, usedKg, allowedKg, creditsCr: (allowedKg - usedKg) * unitCr, unitCr }
  })

  const allowanceCr = lines.reduce((sum, l) => sum + l.creditsCr, 0)
  const late = at > held.dueAt
  const payCr = Math.round(def.payCr * (late ? LATE_PAYMENT_FRACTION : 1))

  // §6.1: standing moves on outcomes, not intentions.
  adjustStanding(
    state,
    guildForContract(def.id),
    late ? STANDING_DELTA.deliveredLate : STANDING_DELTA.delivered,
    at,
    late ? `${def.title} arrived late.` : `${def.title} delivered.`,
  )

  post(state, at, payCr, `${def.title} delivered to ${port.name}`)
  post(
    state,
    at,
    allowanceCr,
    allowanceCr >= 0 ? 'Resupply allowance unspent' : 'Resupply overrun',
  )

  state.settlement = {
    contractId: def.id,
    title: def.title,
    portId,
    at,
    late,
    payCr,
    lines,
    allowanceCr,
    totalCr: payCr + allowanceCr,
  }

  state.ship.cargoKg = Math.max(0, state.ship.cargoKg - def.cargoKg)
  state.contract = undefined

  pushLog(
    state,
    at,
    late ? 'warn' : 'info',
    'money',
    late
      ? `${def.title} delivered late, against ${def.payCr.toLocaleString()} cr agreed, and ${settlementPhrase(allowanceCr)}.`
      : `${def.title} delivered, and ${settlementPhrase(allowanceCr)}.`,
    `${payCr >= 0 ? '+' : '−'}${Math.abs(payCr).toLocaleString()} cr`,
  )

  restock(state, at)
}

function settlementPhrase(allowanceCr: number): string {
  const magnitude = Math.abs(Math.round(allowanceCr)).toLocaleString()
  return allowanceCr >= 0
    ? `${magnitude} cr of allowance came back`
    : `${magnitude} cr of overrun to pay`
}

/**
 * Take on stores. Alongside, the ship fills up -- the cost of doing so was
 * just settled against the allowance, so this is bookkeeping rather than a
 * second charge.
 *
 * Two things it now does that it did not. It **says what it put aboard**: this
 * moves more mass than anything else in the game and did it in complete
 * silence, so a player watching five gauges jump to full had nothing anywhere
 * telling them why. And it **obeys the standing order** (§7.3) -- a player who
 * has switched the pumps off has said not to fill the tanks, and filling them
 * anyway because a contract happened to close would make the switch a lie. The
 * allowance still settles either way: that is what the Guild budgeted, and
 * declining the stores does not un-spend what the crossing consumed.
 */
function restock(state: SimState, at: GameTime): void {
  if (!state.ship.standingOrders.resupply) {
    pushLog(
      state,
      at,
      'info',
      'ship',
      'Stores not taken on: the standing order is to leave them alone. The allowance was settled all the same.',
    )
    return
  }

  const taken: string[] = []
  for (const key of ALLOWANCE_KEYS) {
    const reservoir = state.ship.resources[key]
    settle(reservoir, at)
    const delta = reservoir.max - reservoir.value
    reservoir.value = reservoir.max
    if (delta > 0 && !/^0(\.0+)? /.test(storeAmount(key, delta))) {
      taken.push(storeAmount(key, delta))
    }
  }
  if (taken.length === 0) return

  pushLog(
    state,
    at,
    'info',
    'ship',
    `Stores filled at ${getPort(state.ship.portId).name}: took on ${taken.join(', ')}.`,
    'against the allowance',
  )
  // The tanks are full, so the running count starts again from here.
  beginResupply(state, at)
}

export function lastSettlement(state: SimState): Settlement | undefined {
  return state.settlement
}
