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
import { post } from './ledger.js'
import { pushLog } from './log.js'
import { settle } from './resources.js'
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
    late
      ? `${def.title} delivered late. ${payCr.toLocaleString()} cr against ${def.payCr.toLocaleString()} agreed, and ${settlementPhrase(allowanceCr)}.`
      : `${def.title} delivered. ${payCr.toLocaleString()} cr, and ${settlementPhrase(allowanceCr)}.`,
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
 */
function restock(state: SimState, at: GameTime): void {
  for (const key of ALLOWANCE_KEYS) {
    const reservoir = state.ship.resources[key]
    settle(reservoir, at)
    reservoir.value = reservoir.max
  }
}

export function lastSettlement(state: SimState): Settlement | undefined {
  return state.settlement
}
