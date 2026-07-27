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
import { content, getHull, getPart, getPort, SURVEY, TUNE } from '@solsyn/data'
import { post } from './ledger.js'
import { pushLog } from './log.js'
import { makeReservoir, levelAt } from './resources.js'
import { type GameTime } from './time.js'
import { RESOURCE_KEYS, type PartState, type SimState } from './types.js'

/**
 * What a yard sees when it walks the ship. Design doc §6.2.
 *
 * The trade-in is the one place the *state* of the ship turns into money, and
 * it exists because without it neglect was free at settlement: skipping repairs
 * banked the unspent spares budget, and the wrecked ship it produced cost
 * nothing on the books.
 *
 * Wear dominates, because that is what a surveyor can measure. Tune counts for
 * the rest -- a yard can tell a ship that has been watched from one that has
 * merely been run, and it is worth saying so, but it is not what sets the
 * price. A failed system is deducted twice over: once through the condition it
 * lost on the way down, and once again because it has to be replaced before
 * anyone else will fly her.
 */
export interface Survey {
  /** Mean condition across every installed system, 0-100. */
  conditionPct: number
  /** Mean tune, 0-100. */
  tunePct: number
  brokenCount: number
  /** Fraction of book value this ship actually fetches. */
  factor: number
  /** Book value at nameplate, before the survey. */
  bookValueCr: number
  /** What the yard will actually allow. */
  tradeInCr: number
  /** The sentence a surveyor would say, for the card. */
  verdict: string
}

/** Walk the ship and price it. */
export function surveyShip(state: SimState, at: GameTime): Survey {
  const hull = getHull(state.ship.hullId)
  const parts = state.ship.parts
  const n = Math.max(1, parts.length)

  const conditionPct = parts.reduce((sum, p) => sum + levelAt(p.condition, at), 0) / n
  const tunePct = parts.reduce((sum, p) => sum + levelAt(p.tune, at), 0) / n
  const brokenCount = parts.filter((p) => p.broken).length

  const kept =
    SURVEY.conditionWeight * (conditionPct / 100) +
    (1 - SURVEY.conditionWeight) * (tunePct / 100)
  const raw =
    SURVEY.scrapFloor +
    (1 - SURVEY.scrapFloor) * kept -
    SURVEY.brokenDeduction * brokenCount
  // Even a wreck is worth its metal, and no yard pays over book for a used hull.
  const factor = Math.max(SURVEY.scrapFloor, Math.min(1, raw))

  return {
    conditionPct,
    tunePct,
    brokenCount,
    factor,
    bookValueCr: hull.bookValueCr,
    tradeInCr: Math.round(hull.bookValueCr * factor),
    verdict: verdictFor(factor, brokenCount),
  }
}

function verdictFor(factor: number, broken: number): string {
  if (broken > 0) {
    return `${broken} failed system${broken === 1 ? '' : 's'} to make good before anyone else will fly her.`
  }
  if (factor >= 0.95) return 'Barely a mark on her. The yard has no argument to make.'
  if (factor >= 0.8) return 'Honest wear, well kept. The surveyor finds nothing to lean on.'
  if (factor >= 0.6) return 'She has been worked. Every hour of deferred servicing is in this number.'
  return 'Run into the ground. The yard is buying metal, not a ship.'
}

export interface HullOffer {
  id: string
  name: string
  className: string
  blurb: string
  /** List price, before anything is allowed for the ship you are standing in. */
  priceCr: number
  /** What the yard allows for the current hull, after surveying it. */
  tradeInCr: number
  /** Why it allows that, so the number is never a bare assertion. */
  survey: Survey
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
  const survey = surveyShip(state, state.now)
  const currentHull = getHull(state.ship.hullId)

  return port.sellsHullIds
    .filter((id) => id !== state.ship.hullId)
    .map((id) => {
      const hull = getHull(id)
      const netCr = hull.priceCr - survey.tradeInCr
      const affordable = state.credits >= netCr && !state.contract

      return {
        id: hull.id,
        name: hull.name,
        className: hull.className,
        blurb: hull.blurb,
        priceCr: hull.priceCr,
        tradeInCr: survey.tradeInCr,
        survey,
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
          dryMassKg: [currentHull.dryMassKg, hull.dryMassKg],
          propellantCapacityKg: [currentHull.propellantCapacityKg, hull.propellantCapacityKg],
          foodCapacityKg: [currentHull.foodCapacityKg, hull.foodCapacityKg],
          waterCapacityKg: [currentHull.waterCapacityKg, hull.waterCapacityKg],
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
    'money',
    `${hull.name} signed for. ${offer.priceCr.toLocaleString()} cr less ${offer.tradeInCr.toLocaleString()} for the ${old.name}. ` +
      `${(hull.propellantCapacityKg / 1000).toFixed(0)} t of tank against ${(old.propellantCapacityKg / 1000).toFixed(0)}, and stores for a window run.`,
    `−${(offer.priceCr - offer.tradeInCr).toLocaleString()} cr`,
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
