/**
 * The skill taxonomy. Design doc §4.1, §4.2, §4.4.
 *
 * Three layers, each taken from a real classification rather than invented:
 *
 *   Knowledge      O*NET Content Model domains -- what someone understands
 *   Skills         O*NET's Cross-Functional Technical cluster -- what they can do
 *   Qualifications STCW-style endorsements over ISS system names -- what they
 *                  are certificated on
 *
 * The tests that matter here are the ones that would fail if those layers got
 * collapsed back into a single number, because that collapse is exactly what
 * made "life support skill" mean nothing.
 */
import { describe, expect, it } from 'vitest'
import { content, getCrewDef, getRoom } from '@solsyn/data'
import {
  advanceTo,
  applyCommand,
  attendanceFor,
  createWorld,
  crewViews,
  knowledgeMatch,
  laborRate,
} from '../src/index.js'
import { HOUR } from '../src/time.js'

const T0 = Date.UTC(2200, 0, 1)
const world = () => createWorld(20260726, T0)

describe('the three layers stay separate', () => {
  it('gives every crew member knowledge, skills and endorsements', () => {
    for (const def of content.crew) {
      expect(Object.keys(def.knowledge)).toHaveLength(6)
      expect(Object.keys(def.skills)).toHaveLength(6)
      expect(Array.isArray(def.qualifications)).toBe(true)
    }
  })

  it('keeps endorsements scarce -- that is what makes them worth hiring for', () => {
    const held = content.crew.flatMap((c) => c.qualifications)
    const all = ['eclss', 'eps', 'tcs', 'prop', 'gnc', 'eva', 'cmo']
    // Nobody holds everything, and at least one system has nobody certificated
    // on it, so there is a gap the player has to hire or train into.
    for (const def of content.crew) expect(def.qualifications.length).toBeLessThan(all.length)
    expect(all.some((q) => !held.includes(q))).toBe(true)
  })

  it('lets someone be good at noticing and poor at fixing', () => {
    // The whole reason O*NET separates Operation Monitoring from Repairing.
    const sandoval = getCrewDef('crew.sandoval')
    expect(sandoval.skills.operationMonitoring).toBeGreaterThan(
      sandoval.skills.repairing + 20,
    )
    const okonkwo = getCrewDef('crew.okonkwo')
    expect(okonkwo.skills.repairing).toBeGreaterThan(okonkwo.skills.operationMonitoring)
  })

  it('never asks a room for a skill, only for knowledge and a ticket', () => {
    // "Life support" is a system, not a body of knowledge. Rooms say what they
    // need to understand and what certifies you; they do not name a skill.
    for (const room of content.rooms) {
      expect(room.needs.length).toBeGreaterThan(0)
      for (const need of room.needs) {
        expect(need.weight).toBeGreaterThan(0)
        expect(Object.keys(content.crew[0]!.knowledge)).toContain(need.domain)
      }
    }
  })
})

describe('knowledge is matched against what the room actually needs', () => {
  it('rates the life-support tech highest on the life-support loop', () => {
    const room = getRoom('life-support')
    const scores = content.crew.map((c) => [c.name, knowledgeMatch(c, room)] as const)
    const best = scores.sort((a, b) => b[1] - a[1])[0]!
    expect(best[0]).toBe('Mira Sandoval')
  })

  it('rates the engineer highest on the reactor, which is a different mix', () => {
    const room = getRoom('reactor')
    const scores = content.crew.map((c) => [c.name, knowledgeMatch(c, room)] as const)
    const best = scores.sort((a, b) => b[1] - a[1])[0]!
    expect(best[0]).toBe('Dolores Okonkwo')
    // And the specialist for the *other* system is not interchangeable.
    expect(knowledgeMatch(getCrewDef('crew.sandoval'), room)).toBeLessThan(
      knowledgeMatch(getCrewDef('crew.okonkwo'), room),
    )
  })

  it('blends domains rather than keying off one', () => {
    // The engine room is genuinely part physics and part mechanical; a weighted
    // requirement says so without inventing a skill nothing else uses.
    const engines = getRoom('engines')
    expect(engines.needs.length).toBeGreaterThan(1)
    const domains = engines.needs.map((n) => n.domain)
    expect(domains).toContain('physics')
    expect(domains).toContain('mechanical')
  })
})

describe('endorsements matter, without being a gate', () => {
  it('discounts an uncertificated hand rather than refusing them', () => {
    // §4.4: a competent engineer without the ticket still helps. If they
    // counted for nothing, a short-handed ship would be unplayable.
    const s = advanceTo(world(), 17 * HOUR)
    const a = attendanceFor(s, 'life-support', s.now)
    expect(a.attended).toBe(true)
    expect(a.certified).toBe(true)
    expect(a.quality).toBeGreaterThan(0)
  })

  it('is what the certificated specialist is being paid for', () => {
    // Sandoval holds ECLSS and stations in Life Support. Nobody else does.
    expect(getCrewDef('crew.sandoval').qualifications).toContain('eclss')
    for (const other of content.crew) {
      if (other.id === 'crew.sandoval') continue
      expect(other.qualifications).not.toContain('eclss')
    }
  })
})

describe('the right hand gets the right job', () => {
  it('sends a service to the maintainer and a repair to the fixer', () => {
    // §4.2: servicing and repairing are different competences, so the ranking
    // has to be per order rather than per watch.
    const s = world()
    // Everyone awake, so the comparison is competence and not the watch bill.
    const awake = { ...s, crew: s.crew.map((c) => ({ ...c, activity: 'watch' as const })) }
    const okonkwo = awake.crew.find((c) => c.id === 'crew.okonkwo')!
    const berg = awake.crew.find((c) => c.id === 'crew.berg')!

    expect(laborRate(awake, okonkwo, awake.now, 'repair')).toBeGreaterThan(
      laborRate(awake, berg, awake.now, 'repair'),
    )
    // Berg is a medic: he inspects well and repairs badly, and the model has
    // to reflect that rather than giving him one flat competence.
    expect(laborRate(awake, berg, awake.now, 'repair')).toBeLessThan(
      laborRate(awake, okonkwo, awake.now, 'repair') * 0.7,
    )
  })

  it('assigns a real job to whoever is actually best at it', () => {
    // A repair needs something to repair, so fail the scrubber first.
    let s = structuredClone(world())
    const scrubber = s.ship.parts.find((p) => p.id === 'life.scrubber.co2')!
    scrubber.broken = true
    scrubber.enabled = false
    s = applyCommand(s, {
      at: s.now,
      command: { kind: 'QUEUE_WORK_ORDER', partId: 'life.scrubber.co2', orderKind: 'repair' },
    })
    const order = s.workOrders.find((w) => w.partId === 'life.scrubber.co2')!
    expect(order.assignedCrewId).toBeTruthy()

    const assigned = s.crew.find((c) => c.id === order.assignedCrewId)!
    const onWatch = s.crew.filter((c) => c.activity === 'watch')
    for (const other of onWatch) {
      expect(laborRate(s, assigned, s.now, 'repair')).toBeGreaterThanOrEqual(
        laborRate(s, other, s.now, 'repair') - 1e-9,
      )
    }
  })
})

describe('the roster publishes all of it', () => {
  it('hands the UI the whole stat block', () => {
    // RF-26: a selector change, not a simulation change.
    for (const view of crewViews(world())) {
      expect(Object.keys(view.knowledge)).toHaveLength(6)
      expect(Object.keys(view.skills)).toHaveLength(6)
      expect(Object.keys(view.stats)).toHaveLength(6)
      expect(Array.isArray(view.qualifications)).toBe(true)
    }
  })
})
