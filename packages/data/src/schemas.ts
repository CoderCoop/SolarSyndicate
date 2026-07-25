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

export const RoomDef = z.object({
  id: z.string(),
  name: z.string(),
  /** Short label for the cross-section view. */
  short: z.string(),
  /** Position in the vertical stack, 0 = nose. §3.1 */
  deck: z.number().int().nonnegative(),
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

export const ContentPack = z.object({
  rooms: z.array(RoomDef),
  parts: z.array(PartDef),
  hulls: z.array(HullDef),
  crew: z.array(CrewDef),
})
export type ContentPack = z.infer<typeof ContentPack>
