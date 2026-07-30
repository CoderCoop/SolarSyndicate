/**
 * Acute emergencies, and what the captain does about them. Design doc §7.4,
 * §4.6, §7.3.
 *
 * §7.4's rule is "no death without foreshadowing **and a decision**". The
 * foreshadowing was built with the physiology: health is a reservoir, so the
 * game can always name who is in trouble and exactly how long they have. The
 * decision was not. A player who closed the app with a failed scrubber was
 * protected by nothing but the length of the warning, which is precisely the
 * unattended death §7.4 forbids.
 *
 * So: an emergency opens a window. Answer it and nothing else happens. Leave it
 * and the captain acts on his own authority, which is what §4.6 says the whole
 * command model is for -- you are not aboard, and the person who is does not
 * wait for a round trip to save the ship.
 *
 * ## What safe mode actually is, and why it is not "everybody rest"
 *
 * §7.4 describes the captain's default as "minimal power, coast, crew secured
 * on rations", and the obvious reading is: cut metabolism to buy time. The
 * numbers say that reading is *lethal*.
 *
 * With the scrubber dead, cabin CO2 reaches the first harmful band in about
 * seven hours and the dangerous one in nineteen. Putting the whole crew to rest
 * buys about a quarter more time -- and costs the repair, because a resting
 * crew is not turning a wrench. The scrubber is thirteen labour-hours. Resting
 * everybody converts a survivable failure into a certain death, slightly later.
 *
 * The dominant lever is not breathing less. It is **fixing the thing that is
 * killing you**. So the captain's response is what a captain would actually do:
 * order the repair, put it at the head of the queue, secure the hands who are
 * not needed for it, and shed everything that is not keeping somebody alive.
 * The metabolic saving is real but secondary, and it is taken only from crew
 * who were idle anyway.
 */
import { getPart } from '@solsyn/data'
import { livingCrew } from './crew.js'
import { pushLog } from './log.js'
import { type Environment, type Severity } from './physiology.js'
import { cancelKind, schedule } from './queue.js'
import { levelAt } from './resources.js'
import { HOUR, formatDuration, type GameTime } from './time.js'
import type { SimState } from './types.js'
import { createWorkOrder, openOrders } from './workorders.js'

/**
 * The severity at which the ship stops treating an environment as a readout and
 * starts treating it as an emergency.
 *
 * `impaired` is the first band that costs health, and it is reached about seven
 * hours after a scrubber dies. Waiting for `dangerous` would open the window
 * with twelve hours left on a thirteen-hour repair, which is not a decision --
 * it is a formality before a funeral.
 */
export const EMERGENCY_AT: Severity = 'impaired'

/**
 * The longest the captain will wait for an answer, whatever the arithmetic
 * says. A window measured only as a fraction of time-to-death would run for
 * weeks on a slow leak, and an emergency nobody is acting on for a fortnight is
 * not an emergency.
 */
const MAX_WINDOW = 6 * HOUR

/**
 * How much of the crew's remaining time the captain is willing to spend waiting
 * to hear from you. A quarter: enough that a player who is actually at the desk
 * gets to make the call, short enough that three quarters of the margin is
 * still there when he stops waiting.
 */
const WINDOW_FRACTION = 0.25

export interface Emergency {
  id: string
  /** Which gauge opened it, so the dispatch can name the right one. */
  hazard: Environment['exposures'][number]['hazard']
  severity: Severity
  raisedAt: GameTime
  /** When the captain stops waiting and acts (§7.4's decision window). */
  respondBy: GameTime
  /** The part whose failure caused it, when one did. */
  causePartId?: string
  /** The player dealt with it, or the captain did. */
  answered?: boolean
}

/**
 * The failed part behind a hazard, if the failure is the cause.
 *
 * Only failures, not wear: a scrubber at 30% is not why the air is bad, it is
 * why the air got bad slowly, and ordering a repair on a working part is not
 * the emergency response.
 */
function causeOf(state: SimState, hazard: Emergency['hazard']): string | undefined {
  const wanted: Record<string, (provides: Record<string, unknown>) => boolean> = {
    co2: (p) => p.co2ScrubKgPerDay !== undefined,
    o2: (p) => p.o2KgPerDay !== undefined,
    heat: (p) => p.heatRejectKw !== undefined,
    cold: (p) => p.heatRejectKw !== undefined,
    water: (p) => p.waterRecycleFraction !== undefined,
  }
  const matches = wanted[hazard]
  if (!matches) return undefined

  return state.ship.parts.find(
    (p) => p.broken && matches(getPart(p.defId).provides as Record<string, unknown>),
  )?.id
}

/** Soonest any living crew member reaches the floor, in seconds. */
function soonestCasualty(state: SimState, at: GameTime): number {
  const times = livingCrew(state)
    .map((c) => (c.health.rate < 0 ? (levelAt(c.health, at) - c.health.min) / -c.health.rate : Infinity))
    .filter((s) => Number.isFinite(s) && s > 0)
  return times.length > 0 ? Math.min(...times) : Infinity
}

/**
 * Open, hold or close the emergency, and schedule the captain's response.
 *
 * Called from the network resolve, so it is re-derived from the environment
 * every time anything changes -- which is what lets it close itself the moment
 * the air comes good without anybody having to remember to.
 */
export function resolveEmergency(state: SimState, at: GameTime, env: Environment): void {
  cancelKind(state.queue, 'EMERGENCY_WINDOW')

  const rank = ['nominal', 'noticeable', 'impaired', 'dangerous', 'incapacitating', 'lethal']
  const acute = rank.indexOf(env.severity) >= rank.indexOf(EMERGENCY_AT)
  const open = state.emergency

  // Stood down: the air is good again, so whatever this was, it is over.
  if (!acute) {
    if (open) {
      state.emergency = undefined
      pushLog(state, at, 'info', 'life', 'The emergency is over. Conditions are back inside limits.')
    }
    standDown(state, at)
    return
  }

  const worst = env.exposures[0]
  if (!worst) return

  if (!open) {
    const margin = soonestCasualty(state, at)
    const window = Math.min(MAX_WINDOW, Number.isFinite(margin) ? margin * WINDOW_FRACTION : MAX_WINDOW)
    const cause = causeOf(state, worst.hazard)

    state.emergency = {
      id: `em.${state.nextSeq++}`,
      hazard: worst.hazard,
      severity: env.severity,
      raisedAt: at,
      respondBy: at + window,
      ...(cause ? { causePartId: cause } : {}),
    }

    pushLog(
      state,
      at,
      'alert',
      'life',
      `Emergency: ${worst.reading}, and the crew are ${worst.label}. ${
        state.ship.standingOrders.safeMode
          ? `The captain will stand the ship to in ${formatDuration(window)} unless you answer.`
          : 'Standing orders leave this to you; the captain will not act on his own.'
      }`,
      worst.reading,
    )
  } else {
    // Already open, and getting worse: the record follows the worst of it so
    // the dispatch and the panel do not describe a milder emergency than the
    // one the crew are in.
    open.severity = env.severity
    if (!open.causePartId) {
      const cause = causeOf(state, worst.hazard)
      if (cause) open.causePartId = cause
    }
  }

  const current = state.emergency
  if (!current || current.answered || !state.ship.standingOrders.safeMode) return
  schedule(state.queue, {
    seq: state.nextSeq++,
    at: Math.max(at, current.respondBy),
    kind: 'EMERGENCY_WINDOW',
    ref: current.id,
  })
}

/**
 * The player dealt with it themselves.
 *
 * Ordering the repair is answering: the captain's whole response is to raise
 * that job, so a player who has already raised it has made the same decision
 * sooner, and standing the ship to on top of it would only be theatre.
 */
export function answerEmergency(state: SimState, at: GameTime): boolean {
  const em = state.emergency
  if (!em || em.answered) return false
  em.answered = true
  cancelKind(state.queue, 'EMERGENCY_WINDOW')
  pushLog(state, at, 'info', 'life', 'The desk has the emergency. The captain stands by.')
  return true
}

/**
 * Nobody answered. The captain acts. Design doc §4.6, §7.4.
 *
 * Three things, in the order they matter: fix the cause, protect the bus, and
 * take the metabolic saving that does not cost repair capacity.
 */
export function standTo(state: SimState, emergencyId: string, at: GameTime): boolean {
  const em = state.emergency
  if (!em || em.id !== emergencyId || em.answered || state.ship.safeMode) return false
  if (!state.ship.standingOrders.safeMode) return false
  if (livingCrew(state).length === 0) return false

  state.ship.safeMode = true
  const done: string[] = []

  // 1. Fix the thing that is killing them, ahead of everything else. This is
  //    the whole response; the rest is margin around it.
  if (em.causePartId) {
    const part = state.ship.parts.find((p) => p.id === em.causePartId)
    const existing = state.workOrders.find(
      (w) => w.partId === em.causePartId && w.status !== 'done',
    )
    if (part?.broken && !existing) {
      const order = createWorkOrder(state, em.causePartId, 'repair', at)
      if (order) {
        // Straight to the head of the queue: one below whatever is there, so
        // it is taken by the next free hand rather than queued behind a
        // routine service.
        order.priority = Math.min(0, ...openOrders(state).map((w) => w.priority)) - 1
        done.push(`${getPart(part.defId).name} is under repair`)
      }
    } else if (existing) {
      existing.priority = Math.min(0, ...openOrders(state).map((w) => w.priority)) - 1
      done.push(`the repair is moved to the head of the queue`)
    }
  }

  // 2. Everything not keeping somebody alive goes off, which frees power and
  //    stops adding heat.
  let shed = 0
  for (const p of state.ship.parts) {
    const def = getPart(p.defId)
    if (!def.switchable || !p.enabled || def.powerKw >= 0) continue
    if (def.priority === 'critical' || def.priority === 'high') continue
    p.enabled = false
    p.shed = true
    shed++
  }
  if (shed > 0) done.push(`${shed} non-essential load${shed === 1 ? '' : 's'} shed`)

  // 3. Secure the hands who are not needed. Off-watch only: resting the whole
  //    crew is what turns a survivable failure into a late certain death.
  const secured = livingCrew(state).filter((c) => c.activity === 'off' && !c.workOrderId)
  for (const c of secured) c.activity = 'sleep'
  if (secured.length > 0) done.push(`${secured.length} secured off watch`)

  pushLog(
    state,
    at,
    'alert',
    'ship',
    `No word from the desk, so the captain has stood the ship to: ${done.join(', ')}. She stays this way until conditions are back inside limits.`,
  )
  return true
}

/** Come out of safe mode: the emergency is over, or the desk has taken it. */
export function standDown(state: SimState, at: GameTime): void {
  if (!state.ship.safeMode) return
  state.ship.safeMode = false
  pushLog(
    state,
    at,
    'info',
    'ship',
    'Stood down from safe mode. Shed loads are still off — restore them when the balance allows.',
  )
}
