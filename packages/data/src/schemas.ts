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

export const PartDef = z.object({
  id: z.string(),
  name: z.string(),
  roomId: z.string(),
  /**
   * Net power at full output, kW. Positive produces, negative draws.
   * Real-world derived, +25-50% for near-future (§1 pillar 2).
   */
  powerKw: z.number(),
  massKg: z.number().nonnegative(),
  priority: PowerPriority,
  /** Can the player switch this part off? Reactors and scrubbers cannot. */
  switchable: z.boolean().default(true),
  /** Starts online? */
  startsEnabled: z.boolean().default(true),
  blurb: z.string(),
})
export type PartDef = z.infer<typeof PartDef>

export const HullDef = z.object({
  id: z.string(),
  name: z.string(),
  className: z.string(),
  dryMassKg: z.number().positive(),
  /** Battery buffer, kWh. §3.2 */
  batteryCapacityKwh: z.number().positive(),
  batteryStartKwh: z.number().nonnegative(),
  rooms: z.array(z.string()),
  blurb: z.string(),
})
export type HullDef = z.infer<typeof HullDef>

export const ContentPack = z.object({
  rooms: z.array(RoomDef),
  parts: z.array(PartDef),
  hulls: z.array(HullDef),
})
export type ContentPack = z.infer<typeof ContentPack>
