/**
 * Buying a ship. Design doc §5.2, §6.2, §10.2 (M4's hull upgrade path, pulled
 * forward because it is the only thing standing between the player and Mars).
 *
 * The Kestrel is a cislunar hauler and the numbers say so: 32 t of tank and 91
 * days of food against a 259-day crossing that wants 47 t. That is not a
 * balance slip to be tuned away — it is the shape of the ship, and the honest
 * fix is a different ship. So the interplanetary board has been sitting there
 * priced and unreachable, which is TR-3b working: an option you cannot take is
 * still information, and now it is also a *goal*.
 *
 * Three rules shape this file:
 *
 * **A yard is a place.** Hulls are sold where hulls are built, which is
 * Tranquillity — "the only yard in the inner system that will look at a Kestrel
 * without laughing". Having to fly somewhere to buy a ship is the point; a
 * catalogue available from every berth would make the map decoration.
 *
 * **The old hull is traded in, not discarded.** The upgrade is priced as a
 * difference, because that is what replacing a working ship actually costs.
 *
 * **A new ship is new.** It arrives with its own fit-out at nameplate
 * condition and spec tune, so the tuning work done on the old ship does not
 * come along. That is a real cost of switching and it is stated up front
 * rather than discovered — the alternative, carrying parts across, would make
 * a hull change free in every way that matters.
 */
import { content, getHull, getPart, getPort, TUNE } from '@solsyn/data'
import { post } from './ledger.js'
import { pushLog } from './log.js'
import { makeReservoir, levelAt } from './resources.js'
import { type GameTime } from './time.js'
import { RESOURCE_KEYS, type PartState, type SimState } from './types.js'

export interface HullOffer {
  id: string
  name: string
  className: string
  blurb: string
  /** List price, before anything is allowed for the ship you are standing in. */
  priceCr: number
  /** What the yard allows for the current hull. */
  tradeInCr: number
  /** What actually leaves the account: price minus trade-in. */
  netCr: number
  affordable: boolean
  /** Why it cannot be bought right now, when it cannot. */
  why?: string
  /** The comparison that matters, against the hull currently flown. */
  compare: {
    dryMassKg: [number, number]
    propellantCapacityKg: [number, number]
    foodCapacityKg: [number, number]
    waterCapacityKg: [number, number]
  }
}

/**
 * What the yard here will sell. Empty away from a yard, and empty for the hull
 * already being flown — a shop that offers you the thing you are standing in is
 * the fake choice TR-3b forbids.
 */
export function shipyardOffers(state: SimState): HullOffer[] {
  if (!state.ship.docked) return []
  const port = getPort(state.ship.portId)
  const current = getHull(state.ship.hullId)

  return port.sellsHullIds
    .filter((id) => id !== state.ship.hullId)
    .map((id) => {
      const hull = getHull(id)
      const netCr = hull.priceCr - current.tradeInCr
      const affordable = state.credits >= netCr && !state.contract

      return {
        id: hull.id,
        name: hull.name,
        className: hull.className,
        blurb: hull.blurb,
        priceCr: hull.priceCr,
        tradeInCr: current.tradeInCr,
        netCr,
        affordable,
        ...(affordable
          ? {}
          : {
              why: state.contract
                ? 'The yard will not take a hull with cargo aboard. Finish or drop the run first.'
                : `Short by ${(netCr - state.credits).toLocaleString()} cr.`,
            }),
        compare: {
          dryMassKg: [current.dryMassKg, hull.dryMassKg],
          propellantCapacityKg: [current.propellantCapacityKg, hull.propellantCapacityKg],
          foodCapacityKg: [current.foodCapacityKg, hull.foodCapacityKg],
          waterCapacityKg: [current.waterCapacityKg, hull.waterCapacityKg],
        },
      }
    })
}

/**
 * Take the new hull.
 *
 * Deliberately does nothing when the offer is not on the table: having marked
 * it unaffordable, selling it anyway would make the marking a lie — the same
 * rule the astrogator's infeasible trajectories follow.
 */
export function purchaseHull(state: SimState, hullId: string, at: GameTime): boolean {
  const offer = shipyardOffers(state).find((o) => o.id === hullId)
  if (!offer || !offer.affordable) return false

  const old = getHull(state.ship.hullId)
  const hull = getHull(hullId)

  // Stores come across, capped by the new hull's tanks. Everything else about
  // the ship is replaced.
  const carried: Partial<Record<string, number>> = {}
  for (const key of RESOURCE_KEYS) {
    carried[key] = levelAt(state.ship.resources[key], at)
  }

  post(state, at, offer.tradeInCr, `${old.name} traded in at ${getPort(state.ship.portId).name}`)
  post(state, at, -hull.priceCr, `${hull.className} purchased`)

  state.ship.hullId = hull.id
  state.ship.name = hull.name
  state.ship.className = hull.className
  state.ship.rooms = hull.rooms.map((roomId) => ({ id: roomId, defId: roomId }))
  state.ship.parts = hull.fitOut.map((id) => getPart(id)).map(freshPart(at))

  const cap = {
    battery: hull.batteryCapacityKwh,
    o2: hull.o2CapacityKg,
    water: hull.waterCapacityKg,
    food: hull.foodCapacityKg,
    propellant: hull.propellantCapacityKg,
    spares: hull.sparesCapacity,
  } as const

  for (const key of RESOURCE_KEYS) {
    const max = key in cap ? cap[key as keyof typeof cap] : state.ship.resources[key].max
    state.ship.resources[key] = makeReservoir(
      Math.min(carried[key] ?? 0, max),
      state.ship.resources[key].min,
      max,
      at,
    )
  }
  // Cabin air is a property of the hull, not a store that moves with you.
  state.ship.resources.heat = makeReservoir(21, 21, 55, at)
  state.ship.resources.co2 = makeReservoir(0.52, 0, 6, at)
  state.ship.brownout = false

  pushLog(
    state,
    at,
    'info',
    `${hull.name} signed for. ${offer.priceCr.toLocaleString()} cr less ${offer.tradeInCr.toLocaleString()} for the ${old.name}. ` +
      `${(hull.propellantCapacityKg / 1000).toFixed(0)} t of tank against ${(old.propellantCapacityKg / 1000).toFixed(0)}, and stores for a window run.`,
  )
  return true
}

/** A hull is delivered at its nameplate: full condition, spec tune. */
function freshPart(at: GameTime) {
  return (def: ReturnType<typeof getPart>): PartState => ({
    id: def.id,
    defId: def.id,
    roomId: def.roomId,
    enabled: def.startsEnabled,
    shed: false,
    broken: false,
    condition: makeReservoir(100, 0, 100, at),
    tune: makeReservoir(TUNE.specTune, 0, 100, at),
  })
}

/** Every hull in the game, for the yard listing and for tests. */
export function allHulls() {
  return content.hulls
}
