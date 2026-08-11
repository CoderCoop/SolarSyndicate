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
import { creditOutcome, guildForContract, STANDING_DELTA } from './guild.js'
import { post } from './ledger.js'
import { pushLog } from './log.js'
import { settle } from './resources.js'
import { beginResupply, buyStores, storeAmount } from './resupply.js'
import { type GameTime } from './time.js'
import type { SimState } from './types.js'

/** What a late delivery is worth, as a fraction of the agreed payment. */
export const LATE_PAYMENT_FRACTION = 0.6

export interface SettlementLine {
  key: AllowanceKey
  usedKg: number
  allowedKg: number
  /**
   * What the Guild reimburses for this store: the whole allowance, at the
   * arrival port's rate.
   *
   * It used to be `(allowed - used) x price` -- the netted position, credited
   * or billed. That was the right shape while the stores themselves were free.
   * Now that every kilogramme is bought at the pump, netting here would bill
   * the same kilogramme twice: once when it came aboard and again against the
   * budget. So this is the money *in*, the pump is the money *out*, and the
   * difference is the same figure it always was.
   */
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
  /** Sum of the lines: what the Guild reimbursed for stores. */
  allowanceCr: number
  /**
   * What refilling the tanks at this port actually cost, as a negative.
   *
   * Shown beside the reimbursement rather than folded into it, because the gap
   * between them *is* the mechanic: a tended ship buys back less than it was
   * budgeted and banks the difference, and that is invisible if the two are
   * added up before the player sees them.
   */
  storesCr: number
  /** Payment, plus what was reimbursed, less what the stores cost. */
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
    // The whole allowance, reimbursed. What was actually consumed is bought
    // back at the pump, so netting it here would charge for it twice.
    return { key, usedKg, allowedKg, creditsCr: allowedKg * unitCr, unitCr }
  })

  const allowanceCr = lines.reduce((sum, l) => sum + l.creditsCr, 0)
  const late = at > held.dueAt
  const payCr = Math.round(def.payCr * (late ? LATE_PAYMENT_FRACTION : 1))

  // §6.1: standing moves on outcomes, not intentions -- and an outcome the
  // client is pleased with is one their rivals noticed too.
  creditOutcome(
    state,
    guildForContract(def.id),
    late ? STANDING_DELTA.deliveredLate : STANDING_DELTA.delivered,
    at,
    late ? `${def.title} arrived late.` : `${def.title} delivered.`,
  )

  post(state, at, payCr, `${def.title} delivered to ${port.name}`)
  post(state, at, allowanceCr, 'Resupply allowance reimbursed')

  // Put the ship back as she left, and pay for it -- before the settlement is
  // built, because what the stop cost is part of what the run was worth and a
  // panel reporting the reimbursement without the bill beside it tells half
  // the story.
  const storesCr = -restock(state, at, held.storesAtDeparture)

  state.settlement = {
    contractId: def.id,
    title: def.title,
    portId,
    at,
    late,
    payCr,
    lines,
    allowanceCr,
    storesCr,
    totalCr: payCr + allowanceCr + storesCr,
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
}

function settlementPhrase(allowanceCr: number): string {
  return `${Math.abs(Math.round(allowanceCr)).toLocaleString()} cr of allowance reimbursed`
}

/**
 * Put the ship back as she left, and pay the port for it.
 *
 * **Back to the departure levels, not to capacity.** A resupply allowance
 * restores the ship to the state she set out in; it does not buy her a fuller
 * tank than she had. Filling to the brim meant every delivery quietly bought a
 * quarter of a propellant tank the Guild had never budgeted for -- 34,000
 * credits a run, on a job paying 74,000 -- and it made the arithmetic
 * impossible to reason about, because what the stop cost depended on how empty
 * the ship happened to have been when she signed on. Restoring to the
 * departure reading makes bought and used the same number, which is what lets
 * the reimbursement and the bill cancel for an ordinary run.
 *
 * Topping up *beyond* that is still possible and is now a real decision: sit
 * alongside with the standing order on and the pumps keep going, at that
 * port's prices. Ceres water is a fifth of Gateway water.
 *
 * Two other things it does that it did not. It **says what it put aboard**:
 * this moves more mass than anything else in the game and did it in complete
 * silence. And it **obeys the standing order** (§7.3) -- filling the tanks
 * anyway because a contract happened to close would make the switch a lie. The
 * allowance is reimbursed either way: that is what the Guild budgeted, and
 * declining the stores does not un-spend what the crossing consumed.
 */
function restock(
  state: SimState,
  at: GameTime,
  toLevels: Record<AllowanceKey, number>,
): number {
  if (!state.ship.standingOrders.resupply) {
    pushLog(
      state,
      at,
      'info',
      'ship',
      'Stores not taken on: the standing order is to leave them alone. The allowance is reimbursed all the same.',
    )
    return 0
  }

  const bought = {} as Partial<Record<AllowanceKey, number>>
  const taken: string[] = []
  for (const key of ALLOWANCE_KEYS) {
    const reservoir = state.ship.resources[key]
    settle(reservoir, at)
    const target = Math.min(reservoir.max, toLevels[key])
    const delta = target - reservoir.value
    if (delta <= 0) continue
    reservoir.value = target
    bought[key] = delta
    if (!/^0(\.0+)? /.test(storeAmount(key, delta))) taken.push(storeAmount(key, delta))
  }
  if (taken.length === 0) return 0

  const cr = buyStores(state, at, bought)
  pushLog(
    state,
    at,
    'info',
    'ship',
    `Stores filled at ${getPort(state.ship.portId).name}: took on ${taken.join(', ')}.`,
    `−${Math.round(cr).toLocaleString()} cr`,
  )
  // The tanks are full, so the running count starts again from here.
  beginResupply(state, at)
  return cr
}

export function lastSettlement(state: SimState): Settlement | undefined {
  return state.settlement
}
