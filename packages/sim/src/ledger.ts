/**
 * The books. Spec 002 TR-16 to TR-21. Design doc §1, §6.2.
 *
 * The player is an institution (§1), and an institution keeps books. This is
 * not only flavour: the ledger is what finally gives efficiency a consequence.
 * Loop closure, tune, attendance and upgrade tiers have all been moving numbers
 * that nothing counted; credits count them.
 *
 * Two rules govern the whole thing:
 *
 *   The balance may go negative. A shortfall comes out of the money and is
 *   never a wall -- a ship that cannot undock because the desk is overdrawn is
 *   a stranded ship, which §7.4 forbids (TR-21).
 *
 *   Money is a stock, not a rate. It changes only when a command or an event
 *   moves it, never with the passage of time, so catch-up never has to think
 *   about it.
 */
import type { GameTime } from './time.js'
import type { SimState } from './types.js'

/** What the Local advances a new desk to get started. */
export const OPENING_BALANCE_CR = 240_000

export interface LedgerEntry {
  at: GameTime
  /** Signed: negative is spent, positive is received. */
  credits: number
  reason: string
}

/** Move the balance and write it down. Never refuses. */
export function post(state: SimState, at: GameTime, credits: number, reason: string): void {
  state.credits += credits
  state.ledger.unshift({ at, credits, reason })
  // The books are for the player, not for accounting: keep them readable.
  if (state.ledger.length > 200) state.ledger.length = 200
}

export interface LedgerView {
  credits: number
  entries: LedgerEntry[]
  /** True when the desk is overdrawn -- a state, not a block. */
  overdrawn: boolean
}

export function ledgerView(state: SimState): LedgerView {
  return {
    credits: state.credits,
    entries: state.ledger,
    overdrawn: state.credits < 0,
  }
}
