/**
 * Content pack loading. Design doc §9.
 *
 * Content is parsed and validated once, at module load. Anything that fails
 * the schema throws here rather than producing a subtly wrong simulation
 * later -- content bugs should be loud and immediate.
 */
import roomsRaw from './content/rooms.json' with { type: 'json' }
import partsRaw from './content/parts.json' with { type: 'json' }
import hullsRaw from './content/hulls.json' with { type: 'json' }
import { ContentPack, type HullDef, type PartDef, type RoomDef } from './schemas.js'

export * from './schemas.js'

export const content: ContentPack = ContentPack.parse({
  rooms: roomsRaw,
  parts: partsRaw,
  hulls: hullsRaw,
})

const roomsById = new Map(content.rooms.map((r) => [r.id, r]))
const partsById = new Map(content.parts.map((p) => [p.id, p]))
const hullsById = new Map(content.hulls.map((h) => [h.id, h]))

export function getRoom(id: string): RoomDef {
  const r = roomsById.get(id)
  if (!r) throw new Error(`Unknown room definition: ${id}`)
  return r
}

export function getPart(id: string): PartDef {
  const p = partsById.get(id)
  if (!p) throw new Error(`Unknown part definition: ${id}`)
  return p
}

export function getHull(id: string): HullDef {
  const h = hullsById.get(id)
  if (!h) throw new Error(`Unknown hull definition: ${id}`)
  return h
}

/** Parts installed in a room, in stable definition order. */
export function partsForRoom(roomId: string): PartDef[] {
  return content.parts.filter((p) => p.roomId === roomId)
}

/** The starter hull for M0. Session zero will make this a guild-driven choice (§10.1). */
export const STARTER_HULL_ID = 'hull.kestrel'

// Content integrity: every part must live in a room its hull actually has.
for (const hull of content.hulls) {
  for (const roomId of hull.rooms) getRoom(roomId)
}
for (const part of content.parts) getRoom(part.roomId)
