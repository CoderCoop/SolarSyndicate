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
  count: z.number().int().positive().default(1),
  fitting: Fitting.default('floor'),
  sizeM: SizeM,
})
export type FixtureDef = z.infer<typeof FixtureDef>

/** The five skills, as a value rather than only a shape. */
export const SkillName = z.enum(['mechanics', 'lifeSupport', 'medicine', 'piloting', 'leadership'])
export type SkillName = z.infer<typeof SkillName>

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
   * Which skill counts as tending this room (spec 004 RF-27). A hand on watch
   * here contributes at this skill; anyone else's expertise is irrelevant to
   * this deck no matter how good they are.
   */
  tendedBySkill: SkillName,
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
  powerKw: z.number(),
  massKg: z.number().nonnegative(),
  priority: PowerPriority,
  /** Can the player switch this part off? Reactors and scrubbers cannot. */
  switchable: z.boolean().default(true),
  /** Starts online? */
  startsEnabled: z.boolean().default(true),
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
  rooms: z.array(z.string()),
  blurb: z.string(),
})
export type HullDef = z.infer<typeof HullDef>

/** Watch rotation. Three 8-hour shifts to a day (§4.3). */
export const Watch = z.enum(['A', 'B', 'C'])
export type Watch = z.infer<typeof Watch>

export const CrewDef = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  age: z.number().int().positive(),
  watch: Watch,
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
  /** 0-100, grows with use (§4.1). M1 exercises mechanics and lifeSupport. */
  skills: z.object({
    mechanics: z.number().min(0).max(100).default(0),
    lifeSupport: z.number().min(0).max(100).default(0),
    medicine: z.number().min(0).max(100).default(0),
    piloting: z.number().min(0).max(100).default(0),
    leadership: z.number().min(0).max(100).default(0),
  }),
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
})
export type BodyDef = z.infer<typeof BodyDef>

export const PortDef = z.object({
  id: z.string(),
  name: z.string(),
  bodyId: z.string(),
  /**
   * Delta-v to climb out of this port's gravity well onto a heliocentric
   * transfer, and the same again to arrive. Leaving Ceres is cheap; leaving
   * Earth is not.
   */
  escapeDeltaVMs: z.number().nonnegative(),
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

export const Tuning = z.object({
  attendance: AttendanceTuning,
  tune: TuneTuning,
})
export type Tuning = z.infer<typeof Tuning>

export const ContentPack = z.object({
  tuning: Tuning,
  rooms: z.array(RoomDef),
  parts: z.array(PartDef),
  hulls: z.array(HullDef),
  crew: z.array(CrewDef),
  bodies: z.array(BodyDef),
  ports: z.array(PortDef),
})
export type ContentPack = z.infer<typeof ContentPack>
