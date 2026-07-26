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
import crewRaw from './content/crew.json' with { type: 'json' }
import bodiesRaw from './content/bodies.json' with { type: 'json' }
import portsRaw from './content/ports.json' with { type: 'json' }
import tuningRaw from './content/tuning.json' with { type: 'json' }
import contractsRaw from './content/contracts.json' with { type: 'json' }
import {
  ContentPack,
  type BodyDef,
  type CrewDef,
  type HullDef,
  type PartDef,
  type ContractDef,
  type PortDef,
  type PortPrices,
  type RoomDef,
} from './schemas.js'

export * from './schemas.js'

export const content: ContentPack = ContentPack.parse({
  rooms: roomsRaw,
  parts: partsRaw,
  hulls: hullsRaw,
  crew: crewRaw,
  bodies: bodiesRaw,
  ports: portsRaw,
  tuning: tuningRaw,
  contracts: contractsRaw,
})

const roomsById = new Map(content.rooms.map((r) => [r.id, r]))
const partsById = new Map(content.parts.map((p) => [p.id, p]))
const hullsById = new Map(content.hulls.map((h) => [h.id, h]))
const crewById = new Map(content.crew.map((c) => [c.id, c]))
const bodiesById = new Map(content.bodies.map((b) => [b.id, b]))
const portsById = new Map(content.ports.map((p) => [p.id, p]))

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

export function getBody(id: string): BodyDef {
  const b = bodiesById.get(id)
  if (!b) throw new Error(`Unknown body definition: ${id}`)
  return b
}

export function getPort(id: string): PortDef {
  const p = portsById.get(id)
  if (!p) throw new Error(`Unknown port definition: ${id}`)
  return p
}

export function getCrewDef(id: string): CrewDef {
  const c = crewById.get(id)
  if (!c) throw new Error(`Unknown crew definition: ${id}`)
  return c
}

/**
 * Every alternative for the same job, cheapest first (spec 004 RF-30).
 *
 * A refit swaps one of these for another rather than adding a second, which is
 * why they share a `line`.
 */
export function upgradesFor(partDefId: string): PartDef[] {
  const line = getPart(partDefId).line
  return content.parts.filter((p) => p.line === line).sort((a, b) => a.tier - b.tier)
}

/** Parts installed in a room, in stable definition order. */
export function partsForRoom(roomId: string): PartDef[] {
  return content.parts.filter((p) => p.roomId === roomId)
}

const contractsById = new Map(content.contracts.map((c) => [c.id, c]))

export function getContract(id: string): ContractDef {
  const c = contractsById.get(id)
  if (!c) throw new Error(`Unknown contract definition: ${id}`)
  return c
}

/** Runs on offer at a port (TR-20). */
export function contractsFrom(portId: string): ContractDef[] {
  return content.contracts.filter((c) => c.fromPortId === portId)
}

/** What a port charges for a unit of a consumable (spec 002 TR-19). */
export function priceAt(portId: string, key: keyof PortPrices): number {
  return getPort(portId).prices[key]
}

/** Attendance coefficients (spec 004 RF-38). Balance is a JSON edit. */
export const ATTENDANCE = content.tuning.attendance

/** Tune coefficients (spec 004 RF-36). */
export const TUNE = content.tuning.tune

/** How a yard values a used hull (§6.2). */
export const SURVEY = content.tuning.survey

/** The starter hull for M0. Session zero will make this a guild-driven choice (§10.1). */
export const STARTER_HULL_ID = 'hull.kestrel'

/** Where a new desk's ship is berthed. */
export const STARTER_PORT_ID = 'port.gateway'

// Content integrity: every part must live in a room its hull actually has.
for (const hull of content.hulls) {
  for (const roomId of hull.rooms) getRoom(roomId)
}
for (const part of content.parts) getRoom(part.roomId)
for (const hull of content.hulls) {
  for (const id of hull.fitOut) {
    const part = getPart(id)
    if (!hull.rooms.includes(part.roomId)) {
      throw new Error(`Hull ${hull.id} is fitted with ${id}, which needs a ${part.roomId}`)
    }
  }
}
for (const port of content.ports) getBody(port.bodyId)
// A contract must run between real ports, and must actually go somewhere.
for (const c of content.contracts) {
  getPort(c.fromPortId)
  getPort(c.toPortId)
  if (c.fromPortId === c.toPortId) throw new Error(`Contract ${c.id} goes nowhere`)
}
// Spec 003 SV-8: a crew member's default station must be a room that exists,
// or they would be derived into a deck nobody can draw.
for (const crew of content.crew) getRoom(crew.stationRoomId)
