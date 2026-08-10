/**
 * Green, amber and red for every gauge in the game. Design doc §3.2, §7.4.
 *
 * Built for the Life tab and now read by the ship's own numbers as well --
 * the bank, the power balance, the state of the machinery -- because a second
 * visual language for "is this all right" would be worse than either of them
 * alone. The bottom of this file is where the ship's gauges are defined; the
 * machinery above is unchanged and shared.
 *
 * The panel could say what a level *was* and, since 0.11.5, what was pushing it
 * about. It could not say whether the number was **all right** -- and that is
 * the first thing anybody wants from a gauge. Two of the seven carried a
 * status, from thresholds hand-written in `engine.ts` that duplicated
 * `physiology.ts` and had already drifted from it; the other five carried none
 * at all, so 11 kg of oxygen and 900 kg of water were drawn the same colour.
 *
 * ## Where the colours come from
 *
 * For anything the crew breathe or sit in, the ladder in `physiology.ts` is
 * already the impact model, so the mapping is a reading of it rather than a
 * second table of numbers to keep in step:
 *
 *   green   nominal, noticeable -- nobody is losing health
 *   amber   impaired            -- health is going now; fix it, not this minute
 *   red     dangerous and worse -- people are being harmed fast
 *
 * That lands amber on OSHA's 5,000 ppm permissible limit and red on 10,000,
 * which is where a reader who knows the real figures would put them.
 *
 * For a store, impact is **time**: how long until it runs out against how long
 * it takes to do anything about it. The thresholds are in `packages/data`
 * because they are balance, not physics.
 *
 * ## Ranges, not just a colour
 *
 * Each gauge also reports its **zones** -- where the boundaries fall along its
 * own track -- so the bar can be drawn with the ranges on it and the player can
 * see how much room is left before the next one. A store's zones move as
 * consumption does, which is correct and worth watching: open a second hab
 * module and the red band visibly grows.
 */
import { STORES, VITALS } from '@solsyn/data'
import {
  CO2_BANDS,
  COLD_BANDS,
  HEAT_BANDS,
  O2_BANDS,
  co2Exposure,
  o2Exposure,
  thermalExposure,
  type Severity,
} from './physiology.js'
import { DAY, HOUR } from './time.js'

/** Green, amber, red. */
export type LifeStatus = 'nominal' | 'watch' | 'critical'

/**
 * A severity from `physiology.ts` as a gauge colour.
 *
 * The join between the two models, and the only place it is made. `impaired`
 * is the first band that costs health on every hazard, which is why it is
 * where amber starts.
 */
export function statusFor(severity: Severity): LifeStatus {
  if (severity === 'nominal' || severity === 'noticeable') return 'nominal'
  if (severity === 'impaired') return 'watch'
  return 'critical'
}

/** The worse of two colours. */
export function worseStatus(a: LifeStatus, b: LifeStatus): LifeStatus {
  const order: LifeStatus[] = ['nominal', 'watch', 'critical']
  return order.indexOf(a) >= order.indexOf(b) ? a : b
}

/** One coloured run along a gauge's track. */
export interface Zone {
  /** Where this run ends, as a fraction of the drawn track. */
  until: number
  status: LifeStatus
}

export interface Gauge {
  /** Where the needle sits, 0-1 of the track. */
  fill: number
  status: LifeStatus
  /** The track's coloured runs, in order, ending at 1. */
  zones: Zone[]
  /**
   * Whether the track measures a quantity you have or a reading in the air.
   *
   * A tank can be drawn part-full and it means something -- that is how much
   * is in it. A carbon dioxide reading cannot: shading everything below 1,567
   * ppm would say the cabin is 3% full of a problem, which is not a thought
   * anybody has. Hazards get the needle alone.
   */
  kind: 'store' | 'hazard'
}

/**
 * Zones from a set of breakpoints and a rule.
 *
 * Status is piecewise constant and only ever changes at a band's edge, so
 * evaluating just above each candidate edge is exact -- no sampling, and no
 * chance of a thin band being missed between two samples.
 */
function zonesFrom(
  breakpoints: number[],
  statusAt: (value: number) => LifeStatus,
  min: number,
  max: number,
): Zone[] {
  const span = max - min
  if (span <= 0) return [{ until: 1, status: statusAt(min) }]

  const edges = [min, ...breakpoints.filter((b) => b > min && b < max).sort((a, b) => a - b)]
  const out: Zone[] = []
  for (let i = 0; i < edges.length; i++) {
    // Just inside the run, so a boundary belongs to the band it opens.
    const status = statusAt(edges[i]! + span * 1e-6)
    const until = Math.min(1, ((edges[i + 1] ?? max) - min) / span)
    const last = out.at(-1)
    if (last && last.status === status) last.until = until
    else out.push({ until, status })
  }
  return out
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/** One way a gauge can be in trouble: where the edges are, and what they mean. */
interface Rule {
  breakpoints: number[]
  statusAt: (value: number) => LifeStatus
}

/**
 * A gauge from one or more rules, all read along the same track.
 *
 * More than one because a reading can be dangerous for unrelated reasons at
 * once -- oxygen runs out on a clock *and* thins below what a body can use --
 * and the two have different boundaries on the same axis. Taking the worse at
 * every point is what keeps the needle in the band the row is painted: colour
 * the row from one calculation and draw the bar from another and you get a red
 * gauge with its needle sitting in the green, which is worse than no colour.
 */
function bandedGauge(
  value: number,
  rules: Rule[],
  min: number,
  max: number,
  kind: Gauge['kind'],
): Gauge {
  const statusAt = (v: number) => rules.map((r) => r.statusAt(v)).reduce(worseStatus, 'nominal')
  const breakpoints = rules.flatMap((r) => r.breakpoints)
  return {
    fill: clamp01((value - min) / (max - min)),
    status: statusAt(value),
    zones: zonesFrom(breakpoints, statusAt, min, max),
    kind,
  }
}

export function co2Gauge(ppm: number): Gauge {
  const rule: Rule = {
    breakpoints: CO2_BANDS.map((b) => b.from),
    statusAt: (v) => statusFor(co2Exposure(v).severity),
  }
  return bandedGauge(ppm, [rule], 0, CO2_TRACK_PPM, 'hazard')
}

/**
 * Where the CO2 track ends.
 *
 * Fifteen thousand, not the forty thousand of NIOSH's IDLH. Running the track
 * to the top of the ladder gave red four fifths of the bar and squashed
 * everything a working ship ever sees into the first tenth of it -- a scale is
 * for reading, and the reading always lives down here. Above this the row is
 * pegged, and it is already the colour that matters.
 */
const CO2_TRACK_PPM = 15000

/** The cabin temperature track: cold enough to shiver, hot enough to kill. */
const TEMP_TRACK_C = { min: 5, max: 45 }

export function tempGauge(celsius: number): Gauge {
  const rule: Rule = {
    // Both tables' edges: the cabin has two ways to go wrong and the bar has
    // to show the cold one, which no gauge on this panel ever has.
    breakpoints: [...COLD_BANDS, ...HEAT_BANDS].map((b) => b.from).filter(Number.isFinite),
    statusAt: (v) => statusFor(thermalExposure(v).severity),
  }
  return bandedGauge(celsius, [rule], TEMP_TRACK_C.min, TEMP_TRACK_C.max, 'hazard')
}

/**
 * Oxygen, which is dangerous for two unrelated reasons at once.
 *
 * The tank empties on a clock, and the cabin thins below what a body can use.
 * They are not the same threshold and neither implies the other: a tank that
 * is not draining lasts for ever and can still be holding too little to
 * breathe.
 *
 * The gauge reads in kilogrammes, so the pressure rule is stated in
 * kilogrammes too -- `kPaFor` inverts the ideal-gas relation the cabin
 * pressure already comes from, which makes each pressure band an exact mass on
 * the same track rather than an approximate one.
 */
export function o2Gauge(
  kg: number,
  capacity: number,
  ratePerSecond: number,
  kPaFor: (kg: number) => number,
): Gauge {
  const pressure: Rule = {
    // Solved back to mass through the same relation, so a 12.7 kPa boundary is
    // drawn at exactly the mass that produces 12.7 kPa in this cabin.
    breakpoints: O2_BANDS.map((b) => b.from)
      .filter(Number.isFinite)
      .map((kPa) => (kPa / Math.max(1e-9, kPaFor(1))) * 1),
    statusAt: (v) => statusFor(o2Exposure(kPaFor(v)).severity),
  }
  return bandedGauge(kg, [storeRule(ratePerSecond), pressure], 0, Math.max(capacity, 1e-9), 'store')
}

/**
 * A store, coloured by how long it lasts. Balance numbers from `packages/data`.
 *
 * The boundaries are a rate times a number of days, so they move as the ship's
 * consumption does. That is the point: the same 300 kg of water is comfortable
 * with four aboard and thin with eight, and a fixed mark on the bar would say
 * the same thing in both.
 *
 * `ratePerSecond` is signed the way the reservoirs are -- negative is draining.
 * A store that is filling has no red at all, which is why the zones are built
 * from the drain rate rather than from the level.
 */
function storeRule(ratePerSecond: number): Rule {
  const perDay = Math.max(0, -ratePerSecond * DAY)
  const critical = perDay * STORES.criticalDays
  const watch = perDay * STORES.watchDays
  return {
    breakpoints: [critical, watch],
    statusAt: (v) =>
      v <= critical ? 'critical' : v <= watch ? 'watch' : ('nominal' as LifeStatus),
  }
}

export function storeGauge(value: number, capacity: number, ratePerSecond: number): Gauge {
  return bandedGauge(value, [storeRule(ratePerSecond)], 0, Math.max(capacity, 1e-9), 'store')
}

/**
 * Spares, coloured by whether the ship can fix what is already wrong.
 *
 * Not a horizon: the locker does not drain on a clock, it empties when
 * something breaks. Red is an order that cannot be filled -- a repair that
 * cannot find spares waits, and waiting is how a working ship becomes a
 * derelict. Amber is having exactly enough and no slack for the next failure.
 */
export function sparesGauge(spares: number, capacity: number, needed: number): Gauge {
  const reserve = STORES.sparesReserve
  const rule: Rule = {
    breakpoints: [needed, needed + reserve],
    statusAt: (v) =>
      v < needed ? 'critical' : v < needed + reserve ? 'watch' : ('nominal' as LifeStatus),
  }
  return bandedGauge(spares, [rule], 0, Math.max(capacity, 1e-9), 'store')
}

/**
 * Propellant, coloured by whether the ship can leave at all.
 *
 * Red below the reserve the astrogator refuses to spend, because a ship that
 * cannot cast off is not a ship with a low tank -- it is stuck. Amber within a
 * few times it, where she can move but not far.
 */
export function propellantGauge(kg: number, capacity: number, reserveKg: number): Gauge {
  const watch = reserveKg * STORES.propellantWatchMultiple
  const rule: Rule = {
    breakpoints: [reserveKg, watch],
    statusAt: (v) =>
      v <= reserveKg ? 'critical' : v <= watch ? 'watch' : ('nominal' as LifeStatus),
  }
  return bandedGauge(kg, [rule], 0, Math.max(capacity, 1e-9), 'store')
}

/* ------------------------------------------------------------ the ship's own */

/**
 * The bank, which is dangerous for two unrelated reasons at once.
 *
 * It empties on a clock -- the same idea as a store, in hours rather than days
 * because that is the scale a battery lives on -- **and** it can be down to its
 * last tenth with nothing draining it, which is a bank with no room to absorb
 * the next thing anybody switches on. Neither implies the other: a full ship in
 * deficit has twenty hours and a nearly flat one on solar has for ever, and
 * both are worth a colour. Two rules on one track, as with oxygen.
 *
 * `ratePerSecond` is signed the way the reservoir is: negative is discharging,
 * and a bank that is charging has no red at all.
 */
export function batteryGauge(kwh: number, capacityKwh: number, ratePerSecond: number): Gauge {
  const perHour = Math.max(0, -ratePerSecond * HOUR)
  const horizon: Rule = {
    breakpoints: [perHour * VITALS.batteryCriticalHours, perHour * VITALS.batteryWatchHours],
    statusAt: (v) =>
      v <= perHour * VITALS.batteryCriticalHours
        ? 'critical'
        : v <= perHour * VITALS.batteryWatchHours
          ? 'watch'
          : ('nominal' as LifeStatus),
  }
  const cap = Math.max(capacityKwh, 1e-9)
  const headroom: Rule = {
    breakpoints: [cap * VITALS.batteryCriticalFraction, cap * VITALS.batteryWatchFraction],
    statusAt: (v) =>
      v <= cap * VITALS.batteryCriticalFraction
        ? 'critical'
        : v <= cap * VITALS.batteryWatchFraction
          ? 'watch'
          : ('nominal' as LifeStatus),
  }
  return bandedGauge(kwh, [horizon, headroom], 0, cap, 'store')
}

/**
 * The power balance: a reading, not a quantity, so the track is signed.
 *
 * Zero is the only figure on this axis that means anything on its own, so it
 * is where the red band ends rather than where the track begins -- a deficit
 * is not a low number, it is the ship paying for the difference out of the
 * bank, and it ends in a brownout if it is left. Amber is a surplus too thin
 * to survive anything else being switched on.
 *
 * The track runs symmetrically about zero, out to whichever of production and
 * demand is larger, so the scale is the ship's own size: 3 kW spare reads as
 * comfortable on a lifeboat and as nothing at all on a freighter, which is
 * exactly right.
 */
export function powerBalanceGauge(netKw: number, productionKw: number, demandKw: number): Gauge {
  const watchKw = demandKw * VITALS.powerMarginWatchFraction
  const rule: Rule = {
    breakpoints: [0, watchKw],
    statusAt: (v) => (v < 0 ? 'critical' : v < watchKw ? 'watch' : ('nominal' as LifeStatus)),
  }
  const span = Math.max(productionKw, demandKw, 1)
  return bandedGauge(netKw, [rule], -span, span, 'hazard')
}

/**
 * Condition, coloured by what the failure ladder does next. Design doc §3.3.
 *
 * The bands sit on the rungs in `wear.ts`: a part above the amber mark rolls
 * against nothing worse than a 6% chance at its next threshold, and one below
 * the red mark is rolling at 18% and then 34%. So amber reads "the next
 * threshold it crosses can break this" and red "it probably will" -- which is
 * a statement about the model rather than a second opinion on top of it.
 *
 * Used for one part and for the mean across the ship alike; the question is
 * the same at both scales.
 */
export function conditionGauge(conditionPct: number): Gauge {
  const rule: Rule = {
    breakpoints: [VITALS.conditionCriticalAt, VITALS.conditionWatchAt],
    statusAt: (v) =>
      v < VITALS.conditionCriticalAt
        ? 'critical'
        : v < VITALS.conditionWatchAt
          ? 'watch'
          : ('nominal' as LifeStatus),
  }
  return bandedGauge(conditionPct, [rule], 0, 100, 'store')
}
