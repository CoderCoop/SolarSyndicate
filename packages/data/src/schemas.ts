/**
 * Content schemas. Design doc §9.
 *
 * Every gameplay number is a data record validated by zod -- no balance values
 * in TypeScript. Content is validated once at load; if it parses, the sim can
 * trust it and never needs defensive checks.
 */
import { z } from 'zod'

/**
 * Load-shedding priority (§3.2: "brownout -> systems shed load by priority").
 * Critical loads are never shed automatically -- a ship that switches off its
 * own CO2 scrubber to save power is a ship that kills its crew while the
 * player is asleep, which §7.4 forbids.
 */
export const PowerPriority = z.enum(['critical', 'high', 'normal', 'low'])
export type PowerPriority = z.infer<typeof PowerPriority>

/** Shed order: last entry sheds first. */
export const SHED_ORDER: readonly PowerPriority[] = ['low', 'normal', 'high'] as const

/**
 * How a thing draws itself in the cross-section. Spec 003 SV-3.
 *
 * Deliberately a closed vocabulary. An open string would let content ask for
 * art that does not exist and fail silently at render time; this fails loudly
 * at load, like every other content mistake in the project. Adding a glyph is
 * a two-file change -- this enum and the renderer -- which is the intended
 * friction. Adding a *part* that reuses an existing glyph costs no code.
 */
export const Glyph = z.enum([
  'console', // flat instrument panel
  'dish', // parabolic antenna
  'column', // vertical process cylinder: scrubber, electrolysis, recycler
  'tray', // stacked grow trays under lamps
  'battery', // cell stack
  'pump', // thermal loop pump and manifold
  'core', // reactor core behind its shadow shield
  'panel', // fold-out solar wing
  'nozzle', // engine bell
  'hab', // galley and habitation block
  'bunk', // a crew bunk
  'table', // the one table on the ship
  'couch', // acceleration couch
  'bay', // modular cargo bay
  'locker', // spares locker
])
export type Glyph = z.infer<typeof Glyph>

/**
 * How a thing sits in the room. Spec 004 RF-3.
 *
 * The room is drawn as an interior elevation, so an object has to say where it
 * belongs: standing on the deck, bolted to the bulkhead, or hanging off the
 * overhead. This is what stops the packer having to guess, and what makes a new
 * part land somewhere sensible without anyone drawing it.
 */
export const Fitting = z.enum(['floor', 'wall', 'ceiling'])
export type Fitting = z.infer<typeof Fitting>

/**
 * Real size, in metres. Spec 004 RF-3, RF-4.
 *
 * Proportions between objects are stated by data rather than chosen per
 * drawing, and a crew figure is drawn against the same scale -- so a scrubber
 * is the size a scrubber is, next to a person who is 1.7 m tall.
 */
export const SizeM = z.object({
  w: z.number().positive().max(12),
  h: z.number().positive().max(6),
})
export type SizeM = z.infer<typeof SizeM>

/**
 * Furniture the simulation does not model but the player expects to see: bunks,
 * a table, empty cargo bays. Data, on the same footing as parts (SV-4), so a
 * refit changes JSON rather than JSX.
 */
export const FixtureDef = z.object({
  glyph: Glyph,
  /** What it is, for the card that opens when the player taps it. */
  name: z.string(),
  count: z.number().int().positive().default(1),
  fitting: Fitting.default('floor'),
  sizeM: SizeM,
  /**
   * Why it is here. Fixtures are the things the sim does not model, so this is
   * the only answer a player ever gets about them -- and "everything on the
   * drawing can be asked about" is worth more than a shorter data file.
   */
  blurb: z.string(),
})
export type FixtureDef = z.infer<typeof FixtureDef>

/**
 * Knowledge domains. Design doc §4.1.
 *
 * Taken from the O*NET Content Model (US Department of Labor), which separates
 * *Knowledge* -- organised bodies of fact, slow to acquire and broadly
 * transferable -- from *Skills*, which are developed capacities applied across
 * jobs. These six are its Mathematics-and-Science, Engineering-and-Technology
 * and Health-Services domains, narrowed to the ones a ship of this size
 * actually turns on.
 *
 * Note what is NOT here: "life support" is not a body of knowledge, it is a
 * *system*. Someone who runs it well knows biology and chemistry, monitors
 * well, and is certificated on that system -- three separate things, which is
 * why one skill called "lifeSupport" always read oddly.
 */
export const KnowledgeDomain = z.enum([
  'mechanical', // O*NET: machines and tools, their designs, uses, repair
  'electronics', // O*NET: Computers and Electronics
  'physics', // covers reactor and propulsion physics
  'chemistry', // covers amine beds, electrolysis, propellant
  'biology', // covers hydroponics and closed-loop ecology
  'medicine', // O*NET: Medicine and Dentistry
])
export type KnowledgeDomain = z.infer<typeof KnowledgeDomain>

/**
 * Skills. Design doc §4.2.
 *
 * The Technical cluster of O*NET's Cross-Functional skills, verbatim, plus one
 * Systems-cluster entry for command. These were not chosen to fit the game and
 * then justified: O*NET defines Operation Monitoring as "watching gauges,
 * dials, or other indicators to make sure a machine is working properly",
 * which is the tune mechanic (spec 004 RF-36) described by an occupational
 * taxonomist decades before this ship existed.
 *
 * The split between them is the point. Keeping a system sweet, spotting that
 * something is wrong, and putting it right are three different competences,
 * and a crew member can be good at one and poor at another.
 */
export const SkillName = z.enum([
  'operationMonitoring', // watching indicators to catch drift -> tune
  'equipmentMaintenance', // routine servicing, and knowing when it is due
  'troubleshooting', // determining the cause of a fault
  'repairing', // putting it right with the tools to hand
  'qualityControl', // testing and inspection
  'judgment', // O*NET: Judgment and Decision Making -> autonomy under light-lag
])
export type SkillName = z.infer<typeof SkillName>

/**
 * System qualifications. Design doc §4.4.
 *
 * Modelled on STCW -- the IMO convention under which a mariner holds a
 * Certificate of Competency plus *endorsements*, and watchkeeping itself is a
 * certificated function -- and on ISS crew training, which is organised by
 * system rather than by trade. The names are the real ISS ones, because they
 * are already the right vocabulary for what these are.
 *
 * Knowledge and skill are continuous and everyone has some. A qualification is
 * binary and most people have none: it is what makes a particular hire worth
 * chasing (§4.4).
 */
export const Qualification = z.enum([
  'eclss', // Environmental Control and Life Support System
  'eps', // Electrical Power System
  'tcs', // Thermal Control System
  'prop', // Propulsion
  'gnc', // Guidance, Navigation and Control
  'eva', // Extravehicular Activity
  'cmo', // Crew Medical Officer -- a real assigned ISS role
])
export type Qualification = z.infer<typeof Qualification>

export const RoomDef = z.object({
  id: z.string(),
  name: z.string(),
  /** Short label for the cross-section view. */
  short: z.string(),
  /** Position in the vertical stack, 0 = nose. §3.1 */
  deck: z.number().int().nonnegative(),
  /**
   * Deck head height in metres (SV-2, RF-4). A cargo hold should look like a
   * hold and a cockpit like a cockpit; stating it in metres rather than in
   * arbitrary units is what lets a person be drawn to scale inside it.
   */
  deckHeightM: z.number().positive().max(8),
  fixtures: z.array(FixtureDef).default([]),
  /**
   * What it takes to tend this room (spec 004 RF-27, §4.2).
   *
   * A weighted knowledge requirement rather than a single skill: the engine
   * room is part mechanical and part physics, and saying so in data beats
   * inventing a "nuclear engineering" skill nobody else ever uses. Weights
   * need not sum to one; they are normalised on read.
   */
  needs: z.array(z.object({ domain: KnowledgeDomain, weight: z.number().positive() })).min(1),
  /** The system endorsement that certifies someone for this deck, if any. */
  qualification: Qualification.optional(),
  blurb: z.string(),
})
export type RoomDef = z.infer<typeof RoomDef>

/**
 * What a part *does*, beyond drawing power. Design doc §3.2.
 *
 * All rates are per game day at full condition and full output; the sim scales
 * them by condition and by crew skill. Real-world derived, +25-50% for
 * near-future (§1 pillar 2).
 */
export const PartProvides = z
  .object({
    /** CO2 removed from the cabin, kg/day. ISS CDRA is ~4 kg/day. */
    co2ScrubKgPerDay: z.number().nonnegative().optional(),
    /**
     * The lowest cabin partial pressure this remover can hold, ppm.
     *
     * A sorbent bed does not strip a gas out of an atmosphere -- it reaches
     * equilibrium with its own sorbent. The ISS runs around 2,000-3,000 ppm
     * with CDRA working perfectly, and Earth ambient is about 420. Without
     * this the model drove the cabin to exactly zero, which is a reading the
     * player can see is impossible (§1 pillar 2).
     */
    co2FloorPpm: z.number().positive().optional(),
    /** O2 put into the cabin, kg/day. */
    o2KgPerDay: z.number().nonnegative().optional(),
    /** Fraction of grey water recovered. Near-future closure ~0.97-0.98. */
    waterRecycleFraction: z.number().min(0).max(1).optional(),
    /** Water consumed to run, kg/day (electrolysis, hydroponics). */
    waterUseKgPerDay: z.number().nonnegative().optional(),
    /** Edible mass produced, kg/day. */
    foodKgPerDay: z.number().nonnegative().optional(),
    /** Heat the part can reject to space, kW. */
    heatRejectKw: z.number().nonnegative().optional(),
    /**
     * Waste heat produced beyond its electrical draw, kW. A fission plant at
     * ~25% thermal efficiency dumps roughly three times its electrical output.
     */
    thermalWasteKw: z.number().nonnegative().optional(),
  })
  .default({})
export type PartProvides = z.infer<typeof PartProvides>

export const PartDef = z.object({
  id: z.string(),
  name: z.string(),
  roomId: z.string(),
  /**
   * Net electrical power at full output, kW. Positive produces, negative draws.
   */
  /**
   * The name on a box in the systems diagram, where "Navigation & Flight
   * Computers" does not fit and truncating it produces "FLIGHT COMP".
   * Authored rather than derived: no rule over the long name gets NAV, HAB and
   * RADIATORS all right, and a label is content.
   */
  short: z.string().max(12),
  powerKw: z.number(),
  massKg: z.number().nonnegative(),
  priority: PowerPriority,
  /** Can the player switch this part off? Reactors and scrubbers cannot. */
  switchable: z.boolean().default(true),
  /** Starts online? */
  startsEnabled: z.boolean().default(true),
  /**
   * What this part is a version of. Parts sharing a line are alternatives for
   * the same job (spec 004 RF-30) -- a refit swaps one for another rather than
   * adding a second.
   */
  line: z.string(),
  /** Position within its line, 1 upward. Higher is better and dearer. */
  tier: z.number().int().min(1).default(1),
  /** Purchase price in credits. Unused until M2 gives the player money. */
  priceCr: z.number().nonnegative().default(0),
  /** How it draws itself in the cross-section (SV-3). */
  glyph: Glyph,
  /** Where it sits in the room, and how big it really is (RF-3). */
  fitting: Fitting.default('floor'),
  sizeM: SizeM,
  provides: PartProvides,

  // --- condition & maintenance (§3.3) ---
  /** Condition points lost per game day while running. */
  wearPerDay: z.number().nonnegative().default(0),
  /** Labour-hours for a routine service. */
  serviceHours: z.number().positive().default(4),
  /** Labour-hours to bring it back from a failure. */
  repairHours: z.number().positive().default(10),
  /** Spares consumed by a repair. */
  repairSpares: z.number().nonnegative().default(1),
  /** Spares consumed by a service. */
  serviceSpares: z.number().nonnegative().default(0),

  blurb: z.string(),
})
export type PartDef = z.infer<typeof PartDef>

export const HullDef = z.object({
  id: z.string(),
  name: z.string(),
  className: z.string(),
  dryMassKg: z.number().positive(),
  /** Pressurised volume, m3 -- sets how fast CO2 concentrates. */
  cabinVolumeM3: z.number().positive(),
  /**
   * Effective thermal mass of the pressurised hull, kJ/K. Only the active,
   * circulated part of the ship tracks cabin temperature quickly.
   */
  thermalMassKjPerK: z.number().positive(),
  batteryCapacityKwh: z.number().positive(),
  batteryStartKwh: z.number().nonnegative(),
  /** Consumable stores. */
  o2CapacityKg: z.number().positive(),
  waterCapacityKg: z.number().positive(),
  foodCapacityKg: z.number().positive(),
  propellantCapacityKg: z.number().positive(),
  sparesCapacity: z.number().positive(),
  /**
   * How many people can actually live aboard. The Kestrel draws six bunks for
   * a crew of four, and that spare pair is the room to hire into -- a limit
   * the drawing already stated before anything enforced it.
   */
  berths: z.number().int().positive(),
  /**
   * The engine, as the two numbers that decide how the ship flies (§3.4).
   *
   * `ispS` is exhaust velocity in disguise and sets what a given tank buys;
   * `thrustKn` sets how long a burn takes and what it feels like aboard.
   * Design §3.4 puts a nuclear-thermal ship at 0.05–0.3 g loaded, which is why
   * these are Hohmann-class transfers: two burns and a long coast, not the
   * accelerate-flip-decelerate profile of the fusion-torch tier.
   */
  ispS: z.number().positive(),
  thrustKn: z.number().positive(),
  rooms: z.array(z.string()),
  /**
   * The parts this hull is delivered with, by id.
   *
   * Explicit rather than "every part whose room exists", because once a part
   * has upgrade tiers that rule would fit all of them at once. A hull spec
   * states its fit-out; a refit changes it.
   */
  fitOut: z.array(z.string()),
  /**
   * What a yard charges for this hull, and what one in nameplate condition is
   * worth against a purchase.
   *
   * `bookValueCr` is the *undamaged* figure. What a ship actually fetches is
   * that number after a survey (see `surveyShip`): a hull that has been run
   * into the ground is worth a fraction of book, and that is the whole point —
   * neglect has to cost money somewhere the player can see it.
   *
   * Book value belongs to the hull being given up, not the one being bought: a
   * Kestrel is worth what a Kestrel is worth whatever you replace it with.
   */
  priceCr: z.number().positive(),
  bookValueCr: z.number().nonnegative(),
  blurb: z.string(),
})
export type HullDef = z.infer<typeof HullDef>

/** Watch rotation. Three 8-hour shifts to a day (§4.3). */
export const Watch = z.enum(['A', 'B', 'C'])
export type Watch = z.infer<typeof Watch>

/**
 * A guild. Design doc §6.1.
 *
 * "Ships don't fly free -- they fly *affiliated*." The guild is the seat the
 * player occupies: it sets the hall they hire from, the culture the crew hold
 * them to, and what standing is worth. M3 builds it as a system; §10.1's
 * four-way opening choice is M6's job, so for now the desk is Wrightworks and
 * the other three exist to have standing with.
 */
export const GuildDef = z.object({
  id: z.string(),
  name: z.string(),
  /** One line: what this guild *is*. */
  identity: z.string(),
  specialty: z.string(),
  /** What it asks of you, which is the half people forget. */
  culture: z.string(),
  playsLike: z.string(),
  homePortId: z.string(),
  /**
   * Wage floor, as a multiplier on a candidate's asking rate. Wrightworks
   * bargains its people *up* -- "genuinely good for crew, costs money" -- and
   * The Drift has no floor at all.
   */
  wageFloor: z.number().positive(),
  /** Rest rules, as a cap on how hard a watch can be pushed. §6.1 culture. */
  mandatoryRest: z.boolean(),
})
export type GuildDef = z.infer<typeof GuildDef>

export const CrewDef = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  age: z.number().int().positive(),
  watch: Watch,
  /**
   * Aboard from day one, or standing in a hiring hall waiting to be taken on.
   * The four who come with the ship are not a special kind of person -- they
   * are the same records with this flag set.
   */
  startsAboard: z.boolean().default(false),
  /** Where this person can be hired, when they are not already aboard. */
  hallPortId: z.string().optional(),
  /**
   * What they want per day, before any guild wage floor is applied. Crew are
   * the largest running cost a desk has, which is what makes hiring a decision
   * rather than a shopping trip.
   */
  wageCrPerDay: z.number().positive(),
  /**
   * Where they stand their watch when no work order has them elsewhere
   * (SV-8). The engineer lives in Machinery, the medic does his rounds from
   * Quarters. Their location is never stored -- this is one of the three
   * inputs it is derived from.
   */
  stationRoomId: z.string(),
  /** 1-10, slow-changing (§4.1). */
  stats: z.object({
    strength: z.number().int().min(1).max(10),
    dexterity: z.number().int().min(1).max(10),
    endurance: z.number().int().min(1).max(10),
    intellect: z.number().int().min(1).max(10),
    perception: z.number().int().min(1).max(10),
    resolve: z.number().int().min(1).max(10),
  }),
  /**
   * What they know, 0-100 per domain. Slow to move (§4.1), and the thing a
   * career is made of.
   */
  knowledge: z.object({
    mechanical: z.number().min(0).max(100).default(0),
    electronics: z.number().min(0).max(100).default(0),
    physics: z.number().min(0).max(100).default(0),
    chemistry: z.number().min(0).max(100).default(0),
    biology: z.number().min(0).max(100).default(0),
    medicine: z.number().min(0).max(100).default(0),
  }),
  /** What they can do with it, 0-100. Grows with use (§4.1, §4.2). */
  skills: z.object({
    operationMonitoring: z.number().min(0).max(100).default(0),
    equipmentMaintenance: z.number().min(0).max(100).default(0),
    troubleshooting: z.number().min(0).max(100).default(0),
    repairing: z.number().min(0).max(100).default(0),
    qualityControl: z.number().min(0).max(100).default(0),
    judgment: z.number().min(0).max(100).default(0),
  }),
  /** Endorsements held. Binary, and most crew hold none (§4.4). */
  qualifications: z.array(Qualification).default([]),
  blurb: z.string(),
})
export type CrewDef = z.infer<typeof CrewDef>

/**
 * A body the ports orbit. Real radii and periods; the map is 2D and coplanar
 * (design §5.1), which is a simplification the game states rather than hides.
 */
export const BodyDef = z.object({
  id: z.string(),
  name: z.string(),
  orbitRadiusAu: z.number().positive(),
  orbitPeriodDays: z.number().positive(),
  /** Angular position at game time zero, radians. Keeps the system unaligned. */
  phaseAtEpochRad: z.number(),
  /**
   * Standard gravitational parameter, m³/s². Real values.
   *
   * Needed so a transfer between two ports around this body can be solved with
   * the same vis-viva and Kepler maths as an interplanetary one, instead of
   * getting a hand-set duration and price of its own.
   */
  muM3S2: z.number().positive(),
})
export type BodyDef = z.infer<typeof BodyDef>

/**
 * What a port charges per unit, in credits. Spec 002 TR-19.
 *
 * Prices follow from where the port is: Ceres sits on ice, so water is cheap
 * there and dear at Gateway, which hauls everything up a gravity well. The
 * Belt imports its calories. Where you top up is meant to be a decision.
 */
export const PortPrices = z.object({
  /** Per kg. */
  water: z.number().positive(),
  o2: z.number().positive(),
  food: z.number().positive(),
  propellant: z.number().positive(),
  /** Per unit. */
  spares: z.number().positive(),
})
export type PortPrices = z.infer<typeof PortPrices>

export const PortDef = z.object({
  id: z.string(),
  name: z.string(),
  bodyId: z.string(),
  prices: PortPrices,
  /**
   * Delta-v to climb out of this port's gravity well onto a heliocentric
   * transfer, and the same again to arrive. Leaving Ceres is cheap; leaving
   * Earth is not.
   */
  escapeDeltaVMs: z.number().nonnegative(),
  /**
   * Radius of this port's orbit about its parent body, in km.
   *
   * Two ports sharing a bodyId are not therefore neighbours: Gateway sits a few
   * hundred km up Earth's well and Tranquillity is in lunar orbit, 384,400 km
   * out. Both orbit Earth, and the crossing between them is still five days.
   * Without this number the route reads "Earth to Earth" and the duration looks
   * like a bug.
   */
  orbitRadiusKm: z.number().positive(),
  /**
   * The moon this port is stationed at, when it is not orbiting the primary
   * directly. Tranquillity's bodyId is `earth` because that is the gravity
   * well and the heliocentric orbit it shares — but it is *at Luna*, and a
   * route drawn "Earth to Earth" made a five-day crossing look like a bug.
   *
   * Moons are not entries in `bodies` on purpose: that list is heliocentric,
   * and giving Luna an orbit about the sun to satisfy a label would be a
   * worse lie than the one this fixes.
   */
  moon: z.string().optional(),
  /**
   * Hulls this port's yard will sell. Most ports have no yard: buying a ship is
   * a reason to go somewhere, not something every berth offers.
   */
  sellsHullIds: z.array(z.string()).default([]),
  blurb: z.string(),
})
export type PortDef = z.infer<typeof PortDef>

/**
 * Attendance coefficients. Spec 004 RF-35 to RF-38.
 *
 * The governing rule: a part's rated figures are what it delivers with nobody
 * attending it, so an unattended ship runs to spec indefinitely and §7.4's ban
 * on punishing absence holds by construction rather than by remembering to.
 * Presence is upside -- a little output, and mostly slower wear.
 */
export const AttendanceTuning = z.object({
  /** Wear multiplier with a quality-1 hand on station. */
  wearScaleSkilled: z.number().positive(),
  /** Wear multiplier with someone present but unskilled. */
  wearScaleUnskilled: z.number().positive(),
  /**
   * Wear multiplier with nobody stationed there. Deliberately close to 1:
   * weeks of drift, visible in the condition bar long before it is a failure,
   * and always recoverable with a work order.
   */
  wearScaleUnattended: z.number().positive(),
  /**
   * What an uncertificated hand is worth on a system that wants an
   * endorsement (§4.4). Not zero: a competent engineer without the ticket
   * still helps. Not one, or the endorsement would be decoration.
   */
  uncertifiedPenalty: z.number().min(0).max(1),
})
export type AttendanceTuning = z.infer<typeof AttendanceTuning>

/**
 * Tune. Spec 004 RF-36.
 *
 * The second axis, orthogonal to physical wear: gunk in a line, a hose outside
 * its specified diameter, setpoints never re-trimmed for the humidity the ship
 * actually runs at, a fungus in the root system nobody spotted. Anyone can run
 * the plant; a skilled operator *notices*. So tune falls through inattention
 * and rises through assignment -- never through a work order, which is what
 * fixes the other axis.
 */
export const TuneTuning = z.object({
  /** Tune level at which a part delivers exactly its rated figures. */
  specTune: z.number().min(1).max(99),
  /**
   * Output multiplier at zero tune. The fair-play floor (RF-35a): a wholly
   * neglected ship is inefficient, never non-viable, and never spiralling.
   */
  outputAtZeroTune: z.number().min(0.5).max(1),
  /** Output multiplier at tune 100 -- above the nameplate, which is the point. */
  outputAtFullTune: z.number().min(1).max(1.5),
  /** Tune lost per game day while running unattended. */
  decayPerDayUnattended: z.number().positive(),
  /** Tune gained per game day, per unit of operator quality. */
  gainPerDayPerQuality: z.number().positive(),
  /** Tune an operator of quality 0 can hold: they keep it running, no more. */
  ceilingUnskilled: z.number().min(0).max(100),
  /** Tune an operator of quality 1 can hold. */
  ceilingSkilled: z.number().min(0).max(100),
})
export type TuneTuning = z.infer<typeof TuneTuning>

/**
 * How a yard values a used hull. Design doc §6.2.
 *
 * A ship is an asset, and running one into the ground has to cost money
 * somewhere the player can see. Without this the settlement rewarded neglect on
 * the spares line -- skip the repairs, bank the unspent budget, and the only
 * punishment was a wrecked ship you were not otherwise charged for.
 */
export const SurveyTuning = z.object({
  /** Fraction of book a hull fetches with everything broken: scrap and paperwork. */
  scrapFloor: z.number().min(0).max(1),
  /** How much of the survey is wear, the rest being how well she has been run. */
  conditionWeight: z.number().min(0).max(1),
  /** Deducted per failed system, on top of the condition it lost getting there. */
  brokenDeduction: z.number().min(0).max(1),
})
export type SurveyTuning = z.infer<typeof SurveyTuning>

export const Tuning = z.object({
  survey: SurveyTuning,
  attendance: AttendanceTuning,
  tune: TuneTuning,
})
export type Tuning = z.infer<typeof Tuning>

/**
 * What the Guild has budgeted for a run. Spec 002 TR-16.
 *
 * Quantities, not money: the price is whatever the port charges when the books
 * are settled (TR-17, TR-19). Stated before the contract is accepted, which is
 * the whole point -- "can I do this inside the budget" is a question asked at
 * the board, not discovered on arrival (TR-20).
 */
export const Allowance = z.object({
  water: z.number().nonnegative(),
  o2: z.number().nonnegative(),
  food: z.number().nonnegative(),
  propellant: z.number().nonnegative(),
  spares: z.number().nonnegative(),
})
export type Allowance = z.infer<typeof Allowance>

/**
 * What kind of job this is. Design doc §5.3's v1 archetypes, narrowed to the
 * ones M2 actually ships.
 *
 * The type is not a modifier -- it changes nothing in the sim arithmetic. It
 * exists because "9.8 t to Phobos in 300 days" and "6.4 t of blood products to
 * Ceres in 540" are the same row of numbers describing two completely different
 * errands, and the board should say which is which before the player reads a
 * single figure.
 */
export const MissionType = z.enum(['cargo', 'bulk', 'survey', 'medical', 'relief'])
export type MissionType = z.infer<typeof MissionType>

export const ContractDef = z.object({
  id: z.string(),
  title: z.string(),
  client: z.string(),
  type: MissionType,
  fromPortId: z.string(),
  toPortId: z.string(),
  /** Payment on delivery, before the allowance is reconciled. */
  payCr: z.number().positive(),
  /** What abandoning it costs. Never a refusal, always a price (TR-21). */
  abandonCr: z.number().nonnegative(),
  cargoKg: z.number().nonnegative(),
  /** Days from acceptance. The Guild's estimate, and the allowance follows it. */
  deadlineDays: z.number().positive(),
  allowance: Allowance,
  blurb: z.string(),
})
export type ContractDef = z.infer<typeof ContractDef>

export const ContentPack = z.object({
  guilds: z.array(GuildDef),
  contracts: z.array(ContractDef),
  tuning: Tuning,
  rooms: z.array(RoomDef),
  parts: z.array(PartDef),
  hulls: z.array(HullDef),
  crew: z.array(CrewDef),
  bodies: z.array(BodyDef),
  ports: z.array(PortDef),
})
export type ContentPack = z.infer<typeof ContentPack>
