/**
 * What happens to a ship whose crew is gone. Design doc §7.4, §4.5.
 *
 * §7.4 is explicit about where the line sits:
 *
 *   "The ship survives. Crew are mortal; the campaign is not. Hull loss is not
 *   in v1 (a dead-crew ship gets recovered/towed at ruinous cost)."
 *
 * Nothing implemented that, so the last casualty left a working vessel nobody
 * could crew: the dead held every berth, so hiring replacements was blocked by
 * the people who had died; a voyage under way kept counting down to an arrival
 * with nobody aboard to make it; and the contract sat open against a hold whose
 * cargo was never going to be delivered. A campaign that cannot continue is a
 * wall, and TR-21 says consequences are financial and never a wall.
 *
 * So this is the floor under the worst outcome in the game. It is meant to
 * hurt -- a tow is priced against the hull, not against what is in the bank --
 * and it is meant to leave a desk that can still trade its way back.
 */
import { content, getHull, getPort } from '@solsyn/data'
import { livingCrew } from './crew.js'
import { post } from './ledger.js'
import { pushLog } from './log.js'
import { cancelKind } from './queue.js'
import { formatDuration, type GameTime } from './time.js'
import type { SimState } from './types.js'

/** What a tow costs, in credits, for the hull currently flown. */
export function towFeeCr(state: SimState): number {
  const hull = getHull(state.ship.hullId)
  return Math.round(hull.priceCr * content.tuning.recovery.towFeeHullFraction)
}

/**
 * The port a derelict gets taken to.
 *
 * Whichever end of the crossing she was headed for, because that is where the
 * tug was already going and where the cargo was owed. A ship that never cast
 * off is recovered where she lies, which costs nothing to move.
 */
function recoveryPortId(state: SimState): string {
  const voyage = state.voyage
  return voyage ? voyage.toPortId : state.ship.portId
}

/**
 * True when there is nobody left alive aboard.
 *
 * Deliberately not "health reached zero": somebody can be at the floor and
 * still breathing, and the difference is the whole point of the `dead` flag.
 */
export function isDerelict(state: SimState): boolean {
  return state.crew.length > 0 && livingCrew(state).length === 0
}

/**
 * Recover a derelict: end the voyage, tow her in, and send the bill.
 *
 * Called from the casualty handler the moment the last hand dies, so the state
 * the player returns to is a berthed ship with empty bunks and a debt -- not a
 * ghost coasting toward an arrival it cannot make.
 *
 * Returns true when it did something, so the caller knows to re-resolve.
 */
export function recoverShip(state: SimState, at: GameTime): boolean {
  if (!isDerelict(state) || state.ship.recovered) return false

  const voyage = state.voyage
  const portId = recoveryPortId(state)
  const port = getPort(portId)
  const fee = towFeeCr(state)

  // She is not flying anywhere under her own power again. Cancel the arrival
  // rather than let it fire: an ARRIVE with no crew would berth her and settle
  // the books as though the run had been completed.
  if (voyage) {
    cancelKind(state.queue, 'ARRIVE')
    const remaining = Math.max(0, voyage.arrivesAt - at)
    state.voyage = undefined
    pushLog(
      state,
      at,
      'alert',
      'voyage',
      `${state.ship.name} was ${formatDuration(remaining)} short of ${port.name} with nobody aboard to fly her. A tug has the tow.`,
    )
  }

  state.ship.portId = portId
  state.ship.docked = true
  state.ship.recovered = true

  // The cargo never arrived. The contract goes with the crew -- there is no
  // version of this where the run is settled as delivered (TR-19).
  if (state.contract) {
    state.contract = undefined
    state.ship.cargoKg = 0
    pushLog(
      state,
      at,
      'alert',
      'money',
      'The contract is forfeit. The cargo was aboard a ship with no crew, and the client has been told so.',
    )
  }

  // Work nobody is left to do.
  state.workOrders = state.workOrders.filter((w) => w.status === 'done')

  post(state, at, -fee, `Recovery and tow to ${port.name}`)
  pushLog(
    state,
    at,
    'alert',
    'ship',
    `${state.ship.name} is under salvage at ${port.name}. She is intact and she is yours; there is nobody aboard to fly her, and the berth is held until she is crewed.`,
    `-${fee.toLocaleString()} Cr`,
  )
  return true
}

/**
 * Clear the derelict mark once somebody is aboard again.
 *
 * A separate step rather than a derived flag, because "has been recovered" and
 * "has no crew" stop being the same thing the moment the first replacement
 * signs on -- and the recovery must not fire a second time on the way back up.
 */
export function releaseIfCrewed(state: SimState, at: GameTime): void {
  if (!state.ship.recovered || livingCrew(state).length === 0) return
  state.ship.recovered = false
  pushLog(
    state,
    at,
    'info',
    'ship',
    `${state.ship.name} is released from salvage. She has a crew again.`,
  )
}
