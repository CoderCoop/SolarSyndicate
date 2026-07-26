/**
 * Work orders. Design doc §3.3, §4.3, §4.6.
 *
 * The queue is how a remote manager gets anything physically done. You do not
 * turn a wrench; you order the work and the crew execute it over hours or days
 * at a rate set by who is on watch and what the air is like. That indirection
 * is the whole point of the management framing -- and it is why hiring a good
 * engineer shows up as a number the player watches: days-to-fix.
 */
import { getCrewDef, getPart } from '@solsyn/data'
import { laborRate } from './crew.js'
import { pushLog } from './log.js'
import { cancelKind, schedule } from './queue.js'
import { boundTime, levelAt, makeReservoir, settle } from './resources.js'
import { HOUR, type GameTime } from './time.js'
import type { CrewState, SimState, WorkOrder, WorkOrderKind } from './types.js'

/** Condition restored by a completed job. */
const SERVICE_RESTORE = 32
const REPAIR_RESTORE_TO = 65

export function createWorkOrder(
  state: SimState,
  partId: string,
  kind: WorkOrderKind,
  at: GameTime,
): WorkOrder | undefined {
  const part = state.ship.parts.find((p) => p.id === partId)
  if (!part) return undefined

  // One open job per part; ordering a service on a broken part means a repair.
  if (state.workOrders.some((w) => w.partId === partId && w.status !== 'done')) return undefined
  const effectiveKind: WorkOrderKind = part.broken ? 'repair' : kind
  if (effectiveKind === 'repair' && !part.broken) return undefined

  const def = getPart(part.defId)
  const required =
    effectiveKind === 'repair' ? def.repairHours : def.serviceHours
  const spares = effectiveKind === 'repair' ? def.repairSpares : def.serviceSpares

  const order: WorkOrder = {
    id: `wo.${state.nextSeq++}`,
    kind: effectiveKind,
    partId,
    required,
    progress: makeReservoir(0, 0, required, at),
    spares,
    status: 'queued',
    createdAt: at,
  }
  state.workOrders.push(order)
  pushLog(
    state,
    at,
    'info',
    `Work order raised: ${effectiveKind === 'repair' ? 'repair' : 'service'} ${def.name} (${required} labour-hours).`,
  )
  return order
}

/** Crew who could work a job right now: on watch, not already assigned. */
function availableCrew(state: SimState): CrewState[] {
  return state.crew.filter((c) => c.activity === 'watch')
}

/**
 * Assign crew to jobs and set progress rates.
 *
 * Deliberately simple: the most skilled available hand takes the oldest open
 * job. A richer assignment policy is a §4.3 watch-bill feature, not an M1 one.
 */
export function resolveWorkOrders(state: SimState, at: GameTime): void {
  cancelKind(state.queue, 'WORK_ORDER_DONE')
  for (const crew of state.crew) crew.workOrderId = undefined

  const open = state.workOrders
    .filter((w) => w.status !== 'done')
    .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1))

  const free = availableCrew(state)

  for (const order of open) {
    settle(order.progress, at)

    // A repair cannot start without the spares in the locker.
    const sparesOnHand = levelAt(state.ship.resources.spares, at)
    if (order.spares > sparesOnHand) {
      order.status = 'blocked'
      order.assignedCrewId = undefined
      order.progress.rate = 0
      continue
    }

    // Pick the best hand *for this job*: servicing and repairing are different
    // competences (§4.2), so the ranking is per order rather than per watch.
    free.sort((a, b) => laborRate(state, b, at, order.kind) - laborRate(state, a, at, order.kind))
    const hand = free.shift()
    if (!hand) {
      order.status = 'queued'
      order.assignedCrewId = undefined
      order.progress.rate = 0
      continue
    }

    const rate = laborRate(state, hand, at, order.kind)
    order.status = rate > 0 ? 'active' : 'queued'
    order.assignedCrewId = hand.id
    hand.workOrderId = order.id
    // laborRate is labour-hours per game hour; the reservoir counts hours.
    order.progress.rate = rate / HOUR

    const done = boundTime(order.progress)
    if (Number.isFinite(done)) {
      schedule(state.queue, { seq: state.nextSeq++, at: done, kind: 'WORK_ORDER_DONE', ref: order.id })
    }
  }
}

/** Finish a job: consume spares, restore the part, log it. */
export function completeWorkOrder(state: SimState, orderId: string, at: GameTime): boolean {
  const order = state.workOrders.find((w) => w.id === orderId)
  if (!order || order.status === 'done') return false

  const part = state.ship.parts.find((p) => p.id === order.partId)
  if (!part) return false

  settle(order.progress, at)
  order.status = 'done'
  order.progress.rate = 0

  const spares = state.ship.resources.spares
  settle(spares, at)
  spares.value = Math.max(spares.min, spares.value - order.spares)

  const def = getPart(part.defId)
  settle(part.condition, at)

  const crewName = order.assignedCrewId
    ? getCrewDef(state.crew.find((c) => c.id === order.assignedCrewId)!.defId).name
    : 'The watch'

  if (order.kind === 'repair') {
    part.broken = false
    part.enabled = true
    part.condition.value = Math.max(part.condition.value, REPAIR_RESTORE_TO)
    pushLog(state, at, 'info', `${crewName} has ${def.name} running again, at ${REPAIR_RESTORE_TO}% condition.`)
  } else {
    part.condition.value = Math.min(part.condition.max, part.condition.value + SERVICE_RESTORE)
    pushLog(
      state,
      at,
      'info',
      `${crewName} serviced ${def.name}; condition now ${Math.round(part.condition.value)}%.`,
    )
  }

  // Keep the list from growing without bound over a long campaign.
  const finished = state.workOrders.filter((w) => w.status === 'done')
  if (finished.length > 30) {
    state.workOrders = state.workOrders.filter((w) => w.status !== 'done' || finished.slice(-30).includes(w))
  }
  return true
}

export function cancelWorkOrder(state: SimState, orderId: string, at: GameTime): boolean {
  const index = state.workOrders.findIndex((w) => w.id === orderId && w.status !== 'done')
  if (index < 0) return false
  const [order] = state.workOrders.splice(index, 1)
  if (order) {
    const part = state.ship.parts.find((p) => p.id === order.partId)
    pushLog(
      state,
      at,
      'info',
      `Work order cancelled: ${part ? getPart(part.defId).name : order.partId}.`,
    )
  }
  return true
}
