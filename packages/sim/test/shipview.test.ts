/**
 * Selectors behind the ship cross-section. Spec 003 SV-7, SV-8, SV-11, SV-14.
 *
 * These exist to protect one property above all: a crew member's location is
 * *derived*, so the schematic cannot disagree with the roster and no save
 * needs migrating to show people on the ship. Constitution V.
 */
import { describe, expect, it } from 'vitest'
import { content } from '@solsyn/data'
import {
  advanceTo,
  applyCommand,
  createWorld,
  crewViews,
  powerView,
  roomViews,
} from '../src/index.js'
import { HOUR } from '../src/time.js'

const T0 = Date.UTC(2200, 0, 1)
const world = () => createWorld(20260726, T0)

describe('crew are somewhere', () => {
  it('puts every crew member in exactly one room that exists', () => {
    const s = world()
    const roomIds = new Set(s.ship.rooms.map((r) => r.id))
    const views = crewViews(s)
    expect(views).toHaveLength(4)
    for (const c of views) expect(roomIds.has(c.roomId)).toBe(true)
  })

  it('sends sleepers and the off-watch to quarters', () => {
    const s = world()
    for (const c of crewViews(s)) {
      if (c.activity === 'sleep' || c.activity === 'off') expect(c.roomId).toBe('quarters')
    }
  })

  it('puts crew on watch at their declared station', () => {
    const s = world()
    for (const c of crewViews(s)) {
      if (c.activity !== 'watch') continue
      const def = content.crew.find((d) => d.name === c.name)!
      expect(c.roomId).toBe(def.stationRoomId)
    }
  })

  it('moves a crew member to the deck of the part they are working on', () => {
    // The scrubber is in Life Support; nobody's station is Life Support on the
    // A watch, so the room they are drawn in can only have come from the job.
    let s = world()
    s = applyCommand(s, {
      at: s.now,
      command: { kind: 'QUEUE_WORK_ORDER', partId: 'life.scrubber.co2', orderKind: 'service' },
    })

    const order = s.workOrders.find((w) => w.partId === 'life.scrubber.co2')!
    expect(order.status).toBe('active')

    const worker = crewViews(s).find((c) => c.id === order.assignedCrewId)!
    expect(worker.activity).toBe('watch')
    expect(worker.roomId).toBe('life-support')

    // And once the job is done they go back to their station -- a five-hour
    // service is comfortably inside a nine-hour run.
    const later = advanceTo(s, s.now + 9 * HOUR)
    const settled = crewViews(later).find((c) => c.id === worker.id)!
    expect(settled.roomId).not.toBe('life-support')
  })

  it('moves people when the watch turns over, without writing any state', () => {
    const s = world()
    const before = crewViews(s).map((c) => `${c.name}@${c.roomId}`)

    // A read-only advance across at least one 8-hour boundary.
    const later = advanceTo(s, s.now + 9 * HOUR)
    const after = crewViews(later).map((c) => `${c.name}@${c.roomId}`)

    expect(after).not.toEqual(before)
    // SV-11: nothing about locations lives in SimState, so there is nothing
    // there to have changed shape.
    expect(JSON.stringify(later.crew[0])).not.toContain('room')
  })

  it('gives each marker two initials', () => {
    for (const c of crewViews(world())) expect(c.initials).toMatch(/^[A-Z]{2}$/)
  })
})

describe('rooms carry what the schematic needs', () => {
  it('gives every room a real height and every part a real size', () => {
    // Spec 004 RF-3, RF-4: proportions come from data, in metres, so a person
    // can be drawn against the same grid as the machinery.
    for (const room of roomViews(world())) {
      expect(room.deckHeightM).toBeGreaterThan(1.8)
      expect(room.deckHeightM).toBeLessThan(6)
      for (const part of room.parts) {
        expect(part.glyph).toBeTruthy()
        expect(part.fitting).toMatch(/floor|wall|ceiling/)
        expect(part.sizeM.w).toBeGreaterThan(0)
        expect(part.sizeM.h).toBeGreaterThan(0)
        // Nothing may be taller than the deck it stands in.
        if (part.fitting === 'floor') expect(part.sizeM.h).toBeLessThan(room.deckHeightM)
      }
    }
  })

  it('publishes both health axes for every part', () => {
    for (const room of roomViews(world())) {
      for (const part of room.parts) {
        expect(part.condition).toBeGreaterThanOrEqual(0)
        expect(part.tune).toBeGreaterThanOrEqual(0)
        expect(part.tuneLabel).toBeTruthy()
      }
    }
  })

  it('declares fixtures for the rooms that have furniture', () => {
    const rooms = roomViews(world())
    const quarters = rooms.find((r) => r.id === 'quarters')!
    expect(quarters.fixtures.find((f) => f.glyph === 'bunk')?.count).toBe(6)
    // Six bunks for four crew: the ship has room to grow (§4.4).
    expect(quarters.fixtures.find((f) => f.glyph === 'bunk')!.count).toBeGreaterThan(
      crewViews(world()).length,
    )
  })

  it('agrees with the status bar about power', () => {
    // SV-14. The overlay draws these; they must add up to the number the
    // player can already read, or the picture is lying.
    const s = world()
    const rooms = roomViews(s)
    const total = rooms.reduce((sum, r) => sum + r.netKw, 0)
    expect(total).toBeCloseTo(powerView(s).netKw, 6)
  })

  it('accounts for heat: what the ship draws, it must also reject', () => {
    const s = world()
    const rooms = roomViews(s)
    // The reactor is the big source; machinery, with the radiators, is the
    // only sink. Everything else is a small positive.
    const reactor = rooms.find((r) => r.id === 'reactor')!
    const machinery = rooms.find((r) => r.id === 'machinery')!
    expect(reactor.heatKw).toBeGreaterThan(50)
    expect(machinery.heatKw).toBeLessThan(0)
    for (const r of rooms) {
      if (r.id !== 'machinery') expect(r.heatKw).toBeGreaterThanOrEqual(0)
    }
  })

  it('shows life support as the water consumer', () => {
    const rooms = roomViews(world())
    const life = rooms.find((r) => r.id === 'life-support')!
    expect(life.waterKgPerDay).toBeLessThan(0)
    expect(rooms.find((r) => r.id === 'cargo')!.waterKgPerDay).toBe(0)
  })

  it('reports the same water draw the sim actually spends', () => {
    // SV-14, and the reason it matters: the sim deliberately does NOT derate
    // water use by condition, because a worn electrolysis unit drinking the
    // same water for less oxygen *is* the inefficiency. A selector that scaled
    // it would draw a link narrower than the flow it depicts.
    const s = world()
    const rooms = roomViews(s)
    const shipWater = rooms.reduce((sum, r) => sum + r.waterKgPerDay, 0)

    const running = new Set(s.ship.parts.filter((p) => p.enabled && !p.broken).map((p) => p.defId))
    const equipmentUse = content.parts
      .filter((p) => running.has(p.id))
      .reduce((sum, p) => sum + (p.provides.waterUseKgPerDay ?? 0), 0)

    expect(shipWater).toBeCloseTo(-equipmentUse, 9)
    // And it is genuinely off full condition, so a scaled version would differ.
    const scrubberRoom = rooms.find((r) => r.id === 'life-support')!
    expect(scrubberRoom.parts.some((p) => p.condition < 100)).toBe(true)
  })

  it('returns a part water draw in full when it stops', () => {
    let s = world()
    const before = roomViews(s).find((r) => r.id === 'life-support')!.waterKgPerDay
    s = applyCommand(s, {
      at: s.now,
      command: { kind: 'SET_PART_ENABLED', partId: 'life.hydroponics.lamps', enabled: false },
    })
    const after = roomViews(s).find((r) => r.id === 'life-support')!.waterKgPerDay
    // The rack drinks 2.0 kg/day flat; switching it off returns exactly that.
    expect(after - before).toBeCloseTo(2.0, 9)
  })

  it('stops drawing a part as a load once it is switched off', () => {
    let s = world()
    const before = roomViews(s).find((r) => r.id === 'life-support')!
    s = applyCommand(s, {
      at: s.now,
      command: { kind: 'SET_PART_ENABLED', partId: 'life.hydroponics.lamps', enabled: false },
    })
    const after = roomViews(s).find((r) => r.id === 'life-support')!

    expect(after.netKw).toBeGreaterThan(before.netKw)
    expect(after.waterKgPerDay).toBeGreaterThan(before.waterKgPerDay)
    expect(after.parts.find((p) => p.id === 'life.hydroponics.lamps')!.enabled).toBe(false)
  })
})
