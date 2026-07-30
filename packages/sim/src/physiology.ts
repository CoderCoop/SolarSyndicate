/**
 * What the atmosphere does to a person. Design doc §3.2, §4.5, §7.4.
 *
 * The single place that knows how air becomes a medical problem. Before this,
 * the whole model was four `if` statements: CO2 over 5,000 ppm cost three
 * health a day and over 10,000 cost nine, with matching cuts to how well
 * somebody worked. Two cliffs, no stages in between, no name for what was
 * happening to anybody, and a health floor of 10 that made all of it survivable
 * forever.
 *
 * The numbers here are the real ones. They are worth having right because §1
 * pillar 2 is that the numbers are real, and because hypercapnia is one of the
 * few hazards in this game a player might actually recognise -- Apollo 13 is
 * the reason most people have heard of a CO2 scrubber at all.
 *
 * Sources, so a future balance pass can argue with the model rather than the
 * arithmetic:
 *
 *   CO2 -- OSHA PEL 5,000 ppm (8 h TWA); NIOSH IDLH 40,000 ppm; NASA SMAC
 *   7,000 ppm at 180 days and 5,000 at 1,000 days; Satish et al. 2012 and
 *   Allen et al. 2016 for decision-making decline from 1,000-2,500 ppm.
 *   O2  -- partial pressure, not fraction: NASA operational floor 12.7 kPa
 *   (~9,500 ft equivalent); impairment from about 16 kPa; unconsciousness
 *   around 9 kPa. Sea level is 21.2 kPa.
 *   Heat -- ISO 7243 / WBGT bands, simplified to dry-bulb because the ship does
 *   not model humidity.
 *
 * Two properties the rest of the sim depends on:
 *
 *   - **Pure and closed-form.** Every function here is a lookup on a level the
 *     reservoirs already hold, so catch-up prices a decade of bad air with the
 *     same arithmetic as one second of it (§7.2).
 *   - **Nothing is stored.** A crew member's condition is derived from the air
 *     they are in and the health they have, never accumulated -- which is the
 *     rule the whole state model rests on.
 */
import { getHull } from '@solsyn/data'
import { levelAt } from './resources.js'
import { type GameTime } from './time.js'
import type { SimState } from './types.js'

/**
 * How bad it has got, in the order it gets worse.
 *
 * Named stages rather than a bare number because the player's question is
 * never "what is the multiplier", it is "is this a problem yet, and how long
 * have I got". Every hazard maps onto the same ladder so the answer reads the
 * same whichever gauge is misbehaving.
 */
export type Severity =
  | 'nominal'
  | 'noticeable'
  | 'impaired'
  | 'dangerous'
  | 'incapacitating'
  | 'lethal'

export const SEVERITY_ORDER: readonly Severity[] = [
  'nominal',
  'noticeable',
  'impaired',
  'dangerous',
  'incapacitating',
  'lethal',
]

export function worseOf(a: Severity, b: Severity): Severity {
  return SEVERITY_ORDER.indexOf(a) >= SEVERITY_ORDER.indexOf(b) ? a : b
}

/** What one hazard is doing to the crew right now. */
export interface Exposure {
  /** Which gauge this is about. */
  hazard: 'co2' | 'o2' | 'heat' | 'cold' | 'water' | 'food'
  severity: Severity
  /** The clinical name, so the log can say what is happening rather than that a number moved. */
  label: string
  /** What it does to a person's capacity to work, 0-1. */
  capacity: number
  /** Health points per game day. Negative harms; zero is neutral. */
  healthPerDay: number
  /** The reading that produced this, formatted for a readout. */
  reading: string
}

/**
 * A band of a continuous hazard.
 *
 * `from` is the level at which the band begins, walking upward in harm. The
 * table reads top to bottom as the condition deteriorates, which is how the
 * sources present it and how anybody would check the work.
 */
interface Band {
  from: number
  severity: Severity
  label: string
  capacity: number
  healthPerDay: number
}

/** Pick the band a reading falls in. Tables are ordered least to most harmful. */
function bandFor(bands: readonly Band[], value: number): Band {
  let found = bands[0]!
  for (const band of bands) if (value >= band.from) found = band
  return found
}

/**
 * Same, for hazards that get worse as the number falls.
 *
 * Falling tables are written worst-first with ascending bounds, so the *first*
 * band the reading fits under is the one that applies -- 11 kPa is both "at or
 * below 16" and "at or below 18", and the answer is the more severe of them.
 */
function bandForFalling(bands: readonly Band[], value: number): Band {
  for (const band of bands) if (value <= band.from) return band
  return bands[bands.length - 1]!
}

// ---------------------------------------------------------------------------
// Carbon dioxide
// ---------------------------------------------------------------------------

/**
 * Hypercapnia, by cabin partial pressure in ppm.
 *
 * The important thing this encodes, which the two old thresholds did not: CO2
 * harms you on its own terms. It is not a shortage of oxygen and topping up the
 * O2 does not help -- the blood cannot unload what it is carrying. That is why
 * a failed scrubber is an emergency on a ship with full tanks, and why the
 * capacity column falls away long before the health column does.
 */
export const CO2_BANDS: readonly Band[] = [
  { from: 0, severity: 'nominal', label: 'clear', capacity: 1, healthPerDay: 0 },
  // Allen 2016: decision-making measurably down at 1,000 against 550.
  { from: 1000, severity: 'noticeable', label: 'stuffy', capacity: 0.96, healthPerDay: 0 },
  // Satish 2012: substantial cognitive decline by 2,500.
  { from: 2500, severity: 'noticeable', label: 'heavy air', capacity: 0.88, healthPerDay: 0 },
  // OSHA 8-hour permissible exposure limit.
  { from: 5000, severity: 'impaired', label: 'headaches', capacity: 0.75, healthPerDay: -1.5 },
  // NASA 180-day SMAC. ISS crews report headache and congestion around here.
  { from: 7000, severity: 'impaired', label: 'dulled', capacity: 0.64, healthPerDay: -3 },
  { from: 10000, severity: 'dangerous', label: 'drowsy', capacity: 0.5, healthPerDay: -6 },
  { from: 20000, severity: 'dangerous', label: 'breathless', capacity: 0.34, healthPerDay: -14 },
  { from: 30000, severity: 'dangerous', label: 'sweating, tunnel vision', capacity: 0.2, healthPerDay: -26 },
  // NIOSH IDLH: immediately dangerous to life or health.
  { from: 40000, severity: 'incapacitating', label: 'confused', capacity: 0, healthPerDay: -45 },
  { from: 50000, severity: 'incapacitating', label: 'collapsing', capacity: 0, healthPerDay: -80 },
  // Unconsciousness in minutes; convulsions follow.
  { from: 70000, severity: 'lethal', label: 'unconscious', capacity: 0, healthPerDay: -260 },
  { from: 100000, severity: 'lethal', label: 'dying', capacity: 0, healthPerDay: -900 },
]

/** Molar mass of CO2, kg/mol. */
const CO2_KG_PER_MOL = 0.044

/** Moles of gas in a cubic metre of cabin air at 1 atm, 21 C. */
const MOLES_PER_M3 = 41.45

/** Cabin CO2 in parts per million, from mass and pressurised volume. */
export function co2PpmAt(state: SimState, t: GameTime): number {
  const hull = getHull(state.ship.hullId)
  const kg = levelAt(state.ship.resources.co2, t)
  const molesTotal = MOLES_PER_M3 * hull.cabinVolumeM3
  return (kg / CO2_KG_PER_MOL / molesTotal) * 1e6
}

export function co2Exposure(ppm: number): Exposure {
  const band = bandFor(CO2_BANDS, ppm)
  return {
    hazard: 'co2',
    severity: band.severity,
    label: band.label,
    capacity: band.capacity,
    healthPerDay: band.healthPerDay,
    reading: `${Math.round(ppm).toLocaleString()} ppm CO2`,
  }
}

// ---------------------------------------------------------------------------
// Oxygen
// ---------------------------------------------------------------------------

/**
 * Hypoxia, by oxygen partial pressure in kPa.
 *
 * Partial pressure rather than the tank reading, because that is the quantity a
 * body actually responds to -- it is why a climber at altitude is in trouble in
 * air that is still 21% oxygen. The old model had one state, "the tank hit
 * zero", which is the moment everything is already over.
 */
export const O2_BANDS: readonly Band[] = [
  // Falling table: each entry begins at or below its `from`.
  { from: 7, severity: 'lethal', label: 'anoxic', capacity: 0, healthPerDay: -900 },
  { from: 9, severity: 'lethal', label: 'unconscious', capacity: 0, healthPerDay: -260 },
  { from: 11, severity: 'incapacitating', label: 'losing consciousness', capacity: 0, healthPerDay: -80 },
  { from: 12.7, severity: 'dangerous', label: 'judgment failing', capacity: 0.28, healthPerDay: -22 },
  { from: 14.5, severity: 'dangerous', label: 'short of breath', capacity: 0.45, healthPerDay: -9 },
  { from: 16, severity: 'impaired', label: 'light-headed', capacity: 0.7, healthPerDay: -2 },
  { from: 18, severity: 'noticeable', label: 'thin', capacity: 0.92, healthPerDay: 0 },
  { from: Infinity, severity: 'nominal', label: 'clear', capacity: 1, healthPerDay: 0 },
]

/** Molar mass of O2, kg/mol. */
const O2_KG_PER_MOL = 0.032

/** Cabin oxygen partial pressure, kPa. */
export function o2KPaAt(state: SimState, t: GameTime): number {
  const hull = getHull(state.ship.hullId)
  const kg = levelAt(state.ship.resources.o2, t)
  const moles = kg / O2_KG_PER_MOL
  // Ideal gas at cabin temperature: pV = nRT, in kPa with V in m^3.
  const tempK = 273.15 + levelAt(state.ship.resources.heat, t)
  return (moles * 8.314 * tempK) / hull.cabinVolumeM3 / 1000
}

export function o2Exposure(kPa: number): Exposure {
  const band = bandForFalling(O2_BANDS, kPa)
  return {
    hazard: 'o2',
    severity: band.severity,
    label: band.label,
    capacity: band.capacity,
    healthPerDay: band.healthPerDay,
    reading: `${kPa.toFixed(1)} kPa O2`,
  }
}

// ---------------------------------------------------------------------------
// Temperature
// ---------------------------------------------------------------------------

/** Heat stress, dry-bulb. ISO 7243 bands, simplified: no humidity model. */
export const HEAT_BANDS: readonly Band[] = [
  { from: -Infinity, severity: 'nominal', label: 'comfortable', capacity: 1, healthPerDay: 0 },
  { from: 28, severity: 'noticeable', label: 'warm', capacity: 0.92, healthPerDay: 0 },
  { from: 31, severity: 'impaired', label: 'heat stress', capacity: 0.78, healthPerDay: -2 },
  { from: 35, severity: 'dangerous', label: 'heat exhaustion', capacity: 0.5, healthPerDay: -9 },
  { from: 40, severity: 'incapacitating', label: 'heat stroke', capacity: 0, healthPerDay: -40 },
  { from: 45, severity: 'lethal', label: 'hyperthermic', capacity: 0, healthPerDay: -200 },
]

/** Cold. A ship that cannot reject heat is the common failure; this is the other one. */
export const COLD_BANDS: readonly Band[] = [
  { from: 2, severity: 'lethal', label: 'hypothermic', capacity: 0, healthPerDay: -200 },
  { from: 8, severity: 'incapacitating', label: 'losing dexterity', capacity: 0, healthPerDay: -30 },
  { from: 13, severity: 'dangerous', label: 'shivering', capacity: 0.45, healthPerDay: -7 },
  { from: 17, severity: 'impaired', label: 'cold', capacity: 0.8, healthPerDay: -1 },
  { from: Infinity, severity: 'nominal', label: 'comfortable', capacity: 1, healthPerDay: 0 },
]

export function thermalExposure(celsius: number): Exposure {
  if (celsius >= 28) {
    const band = bandFor(HEAT_BANDS, celsius)
    return {
      hazard: 'heat',
      severity: band.severity,
      label: band.label,
      capacity: band.capacity,
      healthPerDay: band.healthPerDay,
      reading: `${celsius.toFixed(1)} °C`,
    }
  }
  const band = bandForFalling(COLD_BANDS, celsius)
  return {
    hazard: 'cold',
    severity: band.severity,
    label: band.label,
    capacity: band.capacity,
    healthPerDay: band.healthPerDay,
    reading: `${celsius.toFixed(1)} °C`,
  }
}

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

/**
 * Thirst and hunger, which are slow where the gases are fast.
 *
 * Rule of threes: three minutes without air, three days without water, three
 * weeks without food. The rates below put death from thirst at about four days
 * and from starvation at about five weeks, which is the right order of
 * magnitude and, more importantly, the right *ordering* -- a ship in trouble
 * loses its air long before its pantry matters.
 */
export function storesExposure(waterKg: number, foodKg: number): Exposure[] {
  const out: Exposure[] = []
  if (waterKg <= 0) {
    out.push({
      hazard: 'water',
      severity: 'dangerous',
      label: 'dehydrating',
      capacity: 0.45,
      healthPerDay: -24,
      reading: 'no water',
    })
  }
  if (foodKg <= 0) {
    out.push({
      hazard: 'food',
      severity: 'impaired',
      label: 'starving',
      capacity: 0.7,
      healthPerDay: -3,
      reading: 'no food',
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// The whole environment, as one answer
// ---------------------------------------------------------------------------

export interface Environment {
  /** Every hazard that is doing something, worst first. Empty when all is well. */
  exposures: Exposure[]
  /** The worst stage anything has reached. */
  severity: Severity
  /** Combined capacity to work, 0-1. */
  capacity: number
  /** Health points per game day from the environment alone. Negative harms. */
  healthPerDay: number
  /** Nobody can work: they are unconscious or nearly so. */
  incapacitating: boolean
}

/**
 * Everything the air is doing to everybody, at one instant.
 *
 * Capacities multiply and health costs add, which is the honest combination:
 * two hazards each halving what somebody can do leaves a quarter, while two
 * each costing six health a day cost twelve. Bad air and heat together really
 * are worse than either, and the arithmetic should say so rather than taking
 * the worst and ignoring the rest.
 */
export function environmentAt(state: SimState, t: GameTime): Environment {
  const exposures = [
    co2Exposure(co2PpmAt(state, t)),
    o2Exposure(o2KPaAt(state, t)),
    thermalExposure(levelAt(state.ship.resources.heat, t)),
    ...storesExposure(
      levelAt(state.ship.resources.water, t),
      levelAt(state.ship.resources.food, t),
    ),
  ].filter((e) => e.severity !== 'nominal')

  let severity: Severity = 'nominal'
  let capacity = 1
  let healthPerDay = 0
  for (const e of exposures) {
    severity = worseOf(severity, e.severity)
    capacity *= e.capacity
    healthPerDay += e.healthPerDay
  }

  exposures.sort(
    (a, b) => SEVERITY_ORDER.indexOf(b.severity) - SEVERITY_ORDER.indexOf(a.severity),
  )

  return {
    exposures,
    severity,
    capacity,
    healthPerDay,
    incapacitating: capacity <= 0,
  }
}

/**
 * Baseline recovery in air that is not hurting anybody, health per day.
 *
 * People mend when the ship is working. Without this a single bad week would
 * be permanent, which turns one mistake into a campaign-long tax and is the
 * opposite of §7.4's bounded-decay rule.
 */
export const BASELINE_RECOVERY_PER_DAY = 2.5

/** Sleep is when people actually mend. */
export const SLEEP_RECOVERY_SCALE = 1.4
