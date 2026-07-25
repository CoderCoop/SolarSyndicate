/**
 * The power network. Design doc §3.2.
 *
 * M0 implements exactly one of the five resource networks, end to end:
 * producers, consumers, a battery buffer, and priority-based load shedding on
 * brownout. The other four (heat, atmosphere, water, propellant) are the same
 * shape, which is the point of proving this one first.
 */
import { getPart, SHED_ORDER, type PowerPriority } from '@solsyn/data'
import { pushLog } from './log.js'
import { boundTime, levelAt, settle } from './resources.js'
import { cancelKind, schedule } from './queue.js'
import type { GameTime } from './time.js'
import type { PartState, SimState } from './types.js'

/** kWh per game second, from kW. One kW sustained for an hour is one kWh. */
export function kwToKwhPerSecond(kw: number): number {
  return kw / 3600
}

/** A part's contribution in kW right now (0 when offline). */
export function partPowerKw(part: PartState): number {
  if (!part.enabled) return 0
  return getPart(part.defId).powerKw
}

export interface PowerBalance {
  productionKw: number
  demandKw: number
  netKw: number
}

export function powerBalance(state: SimState): PowerBalance {
  let productionKw = 0
  let demandKw = 0
  for (const part of state.ship.parts) {
    const kw = partPowerKw(part)
    if (kw > 0) productionKw += kw
    else demandKw += -kw
  }
  return { productionKw, demandKw, netKw: productionKw - demandKw }
}

/**
 * Choose the next load to shed: lowest priority tier first, and within a tier
 * the largest draw first so the fewest systems go dark. Ties break on part id,
 * which keeps the choice deterministic (§7.2) rather than dependent on array
 * order.
 */
function nextShedCandidate(state: SimState): PartState | undefined {
  for (const tier of SHED_ORDER as readonly PowerPriority[]) {
    let best: PartState | undefined
    let bestDraw = 0
    for (const part of state.ship.parts) {
      if (!part.enabled) continue
      const def = getPart(part.defId)
      if (!def.switchable || def.priority !== tier) continue
      const draw = -def.powerKw
      if (draw <= 0) continue
      if (draw > bestDraw || (draw === bestDraw && best && part.id < best.id)) {
        best = part
        bestDraw = draw
      }
    }
    if (best) return best
  }
  return undefined
}

/**
 * Recompute the power network and reschedule the battery's next boundary.
 *
 * Call after anything that changes production or demand: world creation, a
 * player command, or a battery-boundary event. The battery must already be
 * settled to `at`.
 */
export function resolvePower(state: SimState, at: GameTime): void {
  const battery = state.ship.battery
  settle(battery, at)

  let balance = powerBalance(state)

  // Shed only when the buffer is actually gone. While the battery holds charge
  // a deficit is a decision the player is allowed to be making on purpose.
  const empty = () => levelAt(battery, at) <= battery.min + 1e-9
  if (balance.netKw < 0 && empty()) {
    const shedNames: string[] = []
    while (balance.netKw < 0) {
      const victim = nextShedCandidate(state)
      if (!victim) break
      victim.enabled = false
      victim.shed = true
      shedNames.push(getPart(victim.defId).name)
      balance = powerBalance(state)
    }

    if (shedNames.length > 0) {
      state.ship.brownout = true
      pushLog(
        state,
        at,
        'alert',
        `Brownout. Battery exhausted; shed ${shedNames.join(', ')} to hold the critical bus.`,
      )
    }

    if (balance.netKw < 0) {
      // Nothing left that may be shed: critical load exceeds generation. In M1
      // this becomes the safe-mode path (§7.4); for now it is a loud alert.
      pushLog(
        state,
        at,
        'alert',
        `Critical bus is drawing ${(-balance.netKw).toFixed(1)} kW more than the ship can make. The reactor cannot carry life support alone.`,
      )
    }
  }

  state.ship.netPowerKw = balance.netKw
  state.ship.onBattery = balance.netKw < 0
  battery.rate = kwToKwhPerSecond(balance.netKw)

  // The old prediction is void the moment the rate changes.
  cancelKind(state.queue, 'BATTERY_BOUND')
  const bound = boundTime(battery)
  if (Number.isFinite(bound)) {
    schedule(state.queue, { seq: state.nextSeq++, at: bound, kind: 'BATTERY_BOUND' })
  }
}

/** Restore every load that shedding switched off. */
export function restoreShedLoads(state: SimState, at: GameTime): number {
  let restored = 0
  for (const part of state.ship.parts) {
    if (part.shed) {
      part.enabled = true
      part.shed = false
      restored++
    }
  }
  if (restored > 0) {
    state.ship.brownout = false
    pushLog(state, at, 'info', `Restored ${restored} shed load${restored === 1 ? '' : 's'}.`)
  }
  return restored
}
