/**
 * Work orders. Design doc §3.3, §4.3, §4.6.
 *
 * The queue is how a remote manager gets anything physically done. You do not
 * turn a wrench; you order the work and the crew execute it over hours or days
 * at a rate set by who is on watch and what the air is like. That indirection
 * is the whole point of the management framing -- and it is why hiring a good
 * engineer shows up as a number the player watches: days-to-fix.
 */
import { content, getCrewDef, getPart } from '@solsyn/data'
import { laborRate } from './crew.js'
import { pushLog } from './log.js'
import { cancelKind, schedule } from './queue.js'
import { boundTime, levelAt, makeReservoir, settle } from './resources.js'
import { HOUR, type GameTime } from './time.js'
import type { CrewState, SimState, WorkOrder, WorkOrderKind } from './types.js'

/** Condition restored by a completed job. Balance lives in data (§9). */
const SERVICE_RESTORE = content.tuning.upkeep.serviceRestore
const REPAIR_RESTORE_TO = content.tuning.upkeep.repairRestoreTo

/**
 * The condition at which a service stops throwing spares away.
 *
 * A service puts back a *fixed* number of points, and the condition ceiling
 * clips whatever will not fit -- so servicing a part at 90% spends the whole
 * spare to buy ten points and bins the other twenty-two. Above this figure the
 * job is not worth the locker; at or below it, every point is kept.
 *
 * This is the number the standing order is built on, and stating it as a
 * derivation rather than a constant is the point: change `serviceRestore` in
 * data and the policy follows it.
 */
export const NO_WASTE_CONDITION = 100 - SERVICE_RESTORE

/** Where the standing order actually fires, per `autoServiceAt`. */
export const AUTO_SERVICE_CONDITION = NO_WASTE_CONDITION * content.tuning.upkeep.autoServiceAt

/**
 * How much of a service would be thrown away against the ceiling, in points.
 * Shown on the station card so "not yet worth it" is a number, not a feeling.
 */
export function serviceWasteAt(condition: number): number {
  return Math.max(0, SERVICE_RESTORE - (100 - condition))
}

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
    // New work goes to the back of the queue. A repair on a failed part is
    // still ordered behind whatever is already running, because pre-empting a
    // half-finished job wastes the hours already in it -- the player moves it
    // up if they disagree, which is the whole point of the control.
    priority: nextPriority(state),
    auto: false,
  }
  state.workOrders.push(order)
  pushLog(
    state,
    at,
    'info',
    'upkeep',
    `Work order raised: ${effectiveKind === 'repair' ? 'repair' : 'service'} ${def.name}.`,
    `${required} h`,
  )
  return order
}

/** One past the back of the queue. Open jobs only: done ones are history. */
function nextPriority(state: SimState): number {
  const open = state.workOrders.filter((w) => w.status !== 'done')
  return open.reduce((max, w) => Math.max(max, w.priority ?? 0), 0) + 1
}

/**
 * Move a job up or down the queue. Spec: §4.3 -- "you approve the watch bill
 * and the work-order priorities".
 *
 * Swaps with the neighbour rather than renumbering the world, so the order the
 * player sees is the order they get and nothing else shifts under them.
 */
export function reprioritiseWorkOrder(
  state: SimState,
  orderId: string,
  direction: 'up' | 'down',
): boolean {
  const open = openOrders(state)
  const index = open.findIndex((w) => w.id === orderId)
  if (index < 0) return false
  const swapWith = direction === 'up' ? index - 1 : index + 1
  if (swapWith < 0 || swapWith >= open.length) return false

  const a = open[index]!
  const b = open[swapWith]!
  const carried = a.priority
  a.priority = b.priority
  b.priority = carried
  return true
}

/**
 * The queue, in the order it will actually be worked.
 *
 * Priority first, then age. Age alone was the whole policy until now, which
 * meant the only way to get a failed scrubber seen before a routine service
 * raised an hour earlier was to cancel the service.
 */
export function openOrders(state: SimState): WorkOrder[] {
  return state.workOrders
    .filter((w) => w.status !== 'done')
    .sort(
      (a, b) =>
        (a.priority ?? 0) - (b.priority ?? 0) ||
        a.createdAt - b.createdAt ||
        (a.id < b.id ? -1 : 1),
    )
}

/**
 * The standing order: raise a service the moment one would not be wasted.
 *
 * §7.3 calls standing orders "the policy toggles you set in advance", and this
 * is the first of them. It exists because the maintenance loop had a right
 * answer that was pure clerical work -- watch seven parts, notice each one
 * crossing a line, tap the same button -- and a management game should let you
 * state the policy once instead of executing it by hand forever.
 *
 * It deliberately will not:
 *   - raise a job the locker cannot pay for, which would only sit blocked and
 *     hold a hand that another job could use;
 *   - touch a broken part, because that is a repair and repairs are not
 *     discretionary -- they are already ordered by the player or not at all;
 *   - queue behind itself, since `createWorkOrder` allows one open job per part.
 *
 * Returns the order if it raised one, so the caller can re-resolve.
 */
export function autoQueueService(
  state: SimState,
  partId: string,
  at: GameTime,
): WorkOrder | undefined {
  if (!state.ship.standingOrders.autoService) return undefined

  const part = state.ship.parts.find((p) => p.id === partId)
  if (!part || part.broken) return undefined
  if (state.workOrders.some((w) => w.partId === partId && w.status !== 'done')) return undefined

  settle(part.condition, at)
  if (levelAt(part.condition, at) > AUTO_SERVICE_CONDITION + 1e-9) return undefined

  // Spares the open queue has already spoken for. Raising a job whose spares
  // are promised to another one just blocks it on arrival.
  const def = getPart(part.defId)
  const committed = openOrders(state).reduce((sum, w) => sum + w.spares, 0)
  if (def.serviceSpares > levelAt(state.ship.resources.spares, at) - committed) return undefined

  const order = createWorkOrder(state, partId, 'service', at)
  if (order) order.auto = true
  return order
}

/** Crew who could work a job right now: on watch, not already assigned. */
function availableCrew(state: SimState): CrewState[] {
  return state.crew.filter((c) => !c.dead && c.activity === 'watch')
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

  const open = openOrders(state)
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
    pushLog(
      state,
      at,
      'info',
      'upkeep',
      `${crewName} has ${def.name} running again.`,
      `${REPAIR_RESTORE_TO}% condition`,
    )
  } else {
    part.condition.value = Math.min(part.condition.max, part.condition.value + SERVICE_RESTORE)
    pushLog(
      state,
      at,
      'info',
      'upkeep',
      `${crewName} serviced ${def.name}.`,
      `${Math.round(part.condition.value)}% condition`,
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
      'upkeep',
      `Work order cancelled: ${part ? getPart(part.defId).name : order.partId}.`,
    )
  }
  return true
}
