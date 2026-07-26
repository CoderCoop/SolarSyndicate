/**
 * The resource networks. Design doc §3.2.
 *
 * Five networks, resolved together because they are genuinely coupled: every
 * watt the ship consumes becomes heat it has to reject, the electrolysis unit
 * spends water to make oxygen, and the crew are simultaneously a load on all
 * of them. Resolving them in one pass is what lets a single failure propagate
 * the way it should.
 *
 * Everything here produces *rates*. Levels are derived on read (§8.2), so this
 * function runs only when something actually changes: a part toggles, a watch
 * turns over, a component fails.
 */
import { getHull, getPart, SHED_ORDER, type PartProvides, type PowerPriority } from '@solsyn/data'
import { tuneOutputScale, tuneOf } from './tune.js'
import { activityLoad, co2KgForPpm, fatigueRatePerSecond, METABOLIC } from './crew.js'
import { pushLog } from './log.js'
import { boundTime, levelAt, settle } from './resources.js'
import { cancelKind, schedule } from './queue.js'
import { DAY, type GameTime } from './time.js'
import { RESOURCE_KEYS, type PartState, type ResourceKey, type SimState } from './types.js'

/** kWh per game second, from kW. One kW sustained for an hour is one kWh. */
export function kwToKwhPerSecond(kw: number): number {
  return kw / 3600
}

/**
 * Output multiplier from condition. A part at 100% gives full output; a worn
 * one gives noticeably less before it fails outright, which is the signal that
 * a service is overdue.
 */
export function conditionOutput(condition: number): number {
  return 0.62 + (Math.max(0, Math.min(100, condition)) / 100) * 0.38
}

/** Is this part contributing right now? */
export function partRunning(part: PartState): boolean {
  return part.enabled && !part.broken
}

/**
 * A part's effective output scale: zero if down, degraded if worn, and scaled
 * again by how well adjusted it is (spec 004 RF-36c).
 *
 * Two independent axes, deliberately multiplied in one place so everything
 * downstream -- power, scrubbing, closure, yield -- inherits both without
 * having to know about either.
 */
export function partScale(state: SimState, part: PartState, t: GameTime): number {
  if (!partRunning(part)) return 0
  return conditionOutput(levelAt(part.condition, t)) * tuneOutputScale(tuneOf(part, t))
}

function provides(part: PartState): PartProvides {
  return getPart(part.defId).provides
}

// ---------------------------------------------------------------------------
// Power
// ---------------------------------------------------------------------------

export interface PowerBalance {
  productionKw: number
  demandKw: number
  netKw: number
}

/**
 * Output a reactor is allowed while the thermal loop is in trouble. A plant
 * whose heat has nowhere to go gets derated; that is what the interlocks are
 * for, and it is the thermal equivalent of load shedding.
 */
export const DERATE_SCALE = 0.25

/** Cabin temperature that trips the reactor, and the one that clears it. */
export const THERMAL_TRIP_C = 32
export const THERMAL_CLEAR_C = 26

/**
 * Passive rejection through the hull, kW per degree above nominal.
 *
 * A hull is not a thermos: it radiates, and it radiates harder the hotter it
 * gets. Modelling this matters for more than flavour -- without it, losing the
 * radiators means temperature climbing without limit, which is both wrong and
 * a §7.4 violation. With it, a crippled ship settles at an unpleasant
 * equilibrium instead of cooking, and the player has a problem rather than a
 * sentence.
 */
export const HULL_PASSIVE_KW_PER_K = 1.2

/**
 * A single part's actual contribution in kW right now: rated power, scaled by
 * condition and engineer for generation, and by any thermal derate.
 *
 * Everything that reports power goes through this, so the per-room numbers
 * always add up to the ship total. §1 pillar 1 is "you can trace why the
 * margin is thin", and that fails immediately if the parts of the sum disagree
 * with the sum.
 */
export function partPowerKw(state: SimState, part: PartState, t: GameTime): number {
  const def = getPart(part.defId)
  if (def.powerKw === 0 || !partRunning(part)) return 0

  if (def.powerKw < 0) {
    // Loads draw their full rated power regardless of condition -- a worn pump
    // does not politely use less electricity.
    return def.powerKw
  }

  const derate = state.ship.thermalTrip && def.provides.thermalWasteKw ? DERATE_SCALE : 1
  return def.powerKw * partScale(state, part, t) * derate
}

export function powerBalance(state: SimState, t: GameTime): PowerBalance {
  let productionKw = 0
  let demandKw = 0

  for (const part of state.ship.parts) {
    const kw = partPowerKw(state, part, t)
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
      if (!partRunning(part)) continue
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

// ---------------------------------------------------------------------------
// Life support
// ---------------------------------------------------------------------------

export interface LifeBalance {
  /** kg/day, positive means accumulating. */
  o2PerDay: number
  co2PerDay: number
  waterPerDay: number
  foodPerDay: number
  /** kW into and out of the hull. */
  heatInKw: number
  heatRejectKw: number
  /** Fraction of throughput the recycler returns; 0 when it is down. */
  recycleFraction: number
  /**
   * The lowest cabin CO2 the running removers can hold, ppm; Infinity when
   * nothing is removing it, in which case there is no floor and the cabin
   * fills (§7.4 wants that failure visible, not silent).
   */
  co2FloorPpm: number
  /** Crew metabolic demand, scaled by what they are each doing. */
  crewLoad: number
}

export function lifeBalance(state: SimState, t: GameTime): LifeBalance {
  // Crew load: sum of activity multipliers, not a headcount. Four people
  // asleep are a meaningfully smaller ship than four people working.
  let crewLoad = 0
  let crewHeatKw = 0
  for (const crew of state.crew) {
    const load = activityLoad(crew.activity)
    crewLoad += load
    crewHeatKw += METABOLIC.heatKw * load
  }

  let o2Production = 0
  let co2Scrub = 0
  let foodProduction = 0
  let waterUse = 0
  let recycleFraction = 0
  let co2FloorPpm = Infinity
  let heatRejectKw = 0
  let thermalWasteKw = 0
  let electricalLoadKw = 0

  for (const part of state.ship.parts) {
    const scale = partScale(state, part, t)
    if (scale === 0) continue
    const p = provides(part)
    const def = getPart(part.defId)

    if (p.o2KgPerDay) o2Production += p.o2KgPerDay * scale
    if (p.co2ScrubKgPerDay) {
      co2Scrub += p.co2ScrubKgPerDay * scale
      // The best remover running sets how clean the cabin can get. A sorbent
      // bed reaches equilibrium with its own sorbent rather than stripping the
      // gas out; plants pull lower still, which is why the rack earns its
      // power beyond the food it grows.
      if (p.co2FloorPpm !== undefined) co2FloorPpm = Math.min(co2FloorPpm, p.co2FloorPpm)
    }
    if (p.foodKgPerDay) foodProduction += p.foodKgPerDay * scale
    if (p.waterUseKgPerDay) waterUse += p.waterUseKgPerDay
    if (p.heatRejectKw) heatRejectKw += p.heatRejectKw * scale
    if (p.thermalWasteKw) {
      // Waste heat does not improve with condition -- a tired reactor makes
      // less electricity for the same thermal output, not less heat.
      thermalWasteKw += p.thermalWasteKw * (state.ship.thermalTrip ? DERATE_SCALE : 1)
    }
    // Best recycler wins rather than summing -- they are one loop.
    if (p.waterRecycleFraction) {
      // Closure rides on `scale`, so both condition and tune reach it. Capped
      // below 1 further down: no loop is perfect.
      recycleFraction = Math.max(recycleFraction, p.waterRecycleFraction * scale)
    }
    if (def.powerKw < 0) electricalLoadKw += -def.powerKw
  }

  recycleFraction = Math.min(0.995, recycleFraction)

  const crewO2 = METABOLIC.o2KgPerDay * crewLoad
  const crewCo2 = METABOLIC.co2KgPerDay * crewLoad
  const crewWater = METABOLIC.waterKgPerDay * crewLoad
  const crewFood = METABOLIC.foodKgPerDay * crewLoad

  // Water: treat the loop as one throughput with one closure fraction. What is
  // not recovered is gone. Crude next to a real ECLSS model, but it puts the
  // consequence in exactly the right place -- lose the recycler and the tanks
  // become a three-week clock instead of a four-year one.
  const throughput = crewWater + waterUse
  const waterLoss = throughput * (1 - recycleFraction)

  // Every watt consumed inside the hull ends up as heat, on top of the
  // reactor's waste.
  const heatInKw = thermalWasteKw + electricalLoadKw + crewHeatKw

  // The hull sheds heat on its own once it is above nominal, whatever the
  // radiators are doing.
  const cabinTempC = levelAt(state.ship.resources.heat, t)
  heatRejectKw += Math.max(0, cabinTempC - 21) * HULL_PASSIVE_KW_PER_K

  // Alongside, station services keep the stores up. M2 casts off and this
  // stops, at which point the consumable clocks start mattering.
  const dockedSupply = state.ship.docked ? 1 : 0

  return {
    o2PerDay: o2Production - crewO2 + dockedSupply * 0.5,
    co2PerDay: crewCo2 - co2Scrub,
    waterPerDay: -waterLoss + dockedSupply * 6,
    foodPerDay: foodProduction - crewFood + dockedSupply * 8,
    heatInKw,
    heatRejectKw,
    recycleFraction,
    co2FloorPpm,
    crewLoad,
  }
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

const PER_DAY = (perDay: number) => perDay / DAY

/**
 * Recompute every network and reschedule the boundary events they imply.
 *
 * Call after anything that changes supply or demand: a command, a watch
 * change, a part failing, a work order completing.
 */
export function resolveNetworks(state: SimState, at: GameTime): void {
  const res = state.ship.resources
  for (const key of RESOURCE_KEYS) settle(res[key], at)

  // --- power, including load shedding -------------------------------------
  let power = powerBalance(state, at)
  const batteryEmpty = () => levelAt(res.battery, at) <= res.battery.min + 1e-9

  if (power.netKw < 0 && batteryEmpty()) {
    const shedNames: string[] = []
    while (power.netKw < 0) {
      const victim = nextShedCandidate(state)
      if (!victim) break
      victim.enabled = false
      victim.shed = true
      shedNames.push(getPart(victim.defId).name)
      power = powerBalance(state, at)
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

    if (power.netKw < 0) {
      pushLog(
        state,
        at,
        'alert',
        `Critical bus is drawing ${(-power.netKw).toFixed(1)} kW more than the ship can make. The reactor cannot carry life support alone.`,
      )
    }
  }

  state.ship.netPowerKw = power.netKw
  state.ship.onBattery = power.netKw < 0
  res.battery.rate = kwToKwhPerSecond(power.netKw)

  // --- life support --------------------------------------------------------
  const life = lifeBalance(state, at)
  const hull = getHull(state.ship.hullId)

  res.o2.rate = PER_DAY(life.o2PerDay)
  // The cabin cannot get cleaner than the best remover can hold it (§3.2).
  // Setting the reservoir's floor here keeps the level a closed-form function
  // of time -- a concentration-dependent scrub rate would be exponential and
  // would cost the whole catch-up story.
  res.co2.min = Number.isFinite(life.co2FloorPpm) ? co2KgForPpm(state, life.co2FloorPpm) : 0
  res.co2.rate = PER_DAY(life.co2PerDay)
  res.water.rate = PER_DAY(life.waterPerDay)
  res.food.rate = PER_DAY(life.foodPerDay)
  res.spares.rate = state.ship.docked ? PER_DAY(2) : 0
  res.propellant.rate = state.ship.docked ? PER_DAY(120) : 0

  // Heat: the loop modulates, so the ship holds nominal while rejection
  // capacity covers the load, and climbs once it does not. Real radiators
  // reject as T^4; rated capacity is the simplification that keeps the whole
  // simulation analytic between events, which is worth more than the fidelity.
  let netHeatKw = life.heatInKw - life.heatRejectKw
  const temp = levelAt(res.heat, at)

  // Thermal trip: heat is the one network that can cook the ship faster than
  // anyone can answer a message, so it gets an automatic response for the same
  // reason power does (§7.4). Shed what we can, then derate the reactor.
  if (!state.ship.thermalTrip && netHeatKw > 0 && temp >= THERMAL_TRIP_C) {
    state.ship.thermalTrip = true
    pushLog(
      state,
      at,
      'alert',
      `Thermal trip at ${temp.toFixed(1)}C. Reactor derated to ${Math.round(DERATE_SCALE * 100)}% — the loop cannot reject what it is making.`,
    )
    // Re-read the balance now that the plant is throttled.
    const derated = lifeBalance(state, at)
    netHeatKw = derated.heatInKw - derated.heatRejectKw
    power = powerBalance(state, at)
    state.ship.netPowerKw = power.netKw
    state.ship.onBattery = power.netKw < 0
    res.battery.rate = kwToKwhPerSecond(power.netKw)
  } else if (state.ship.thermalTrip && temp <= THERMAL_CLEAR_C) {
    // Only clear when the loop could carry the *underated* load, or the ship
    // trips straight back and oscillates. Ask the question directly rather
    // than trying to algebra the derate back out.
    state.ship.thermalTrip = false
    const full = lifeBalance(state, at)
    if (full.heatInKw <= full.heatRejectKw) {
      pushLog(state, at, 'info', 'Thermal margin restored; reactor back to full output.')
      netHeatKw = full.heatInKw - full.heatRejectKw
      power = powerBalance(state, at)
      state.ship.netPowerKw = power.netKw
      state.ship.onBattery = power.netKw < 0
      res.battery.rate = kwToKwhPerSecond(power.netKw)
    } else {
      state.ship.thermalTrip = true
    }
  }

  state.ship.netHeatKw = netHeatKw
  res.heat.rate = netHeatKw / hull.thermalMassKjPerK

  // --- crew ----------------------------------------------------------------
  updateCrewRates(state, at)

  // --- reschedule ----------------------------------------------------------
  cancelKind(state.queue, 'RESOURCE_BOUND')
  for (const key of RESOURCE_KEYS) {
    const bound = boundTime(res[key])
    if (Number.isFinite(bound)) {
      schedule(state.queue, { seq: state.nextSeq++, at: bound, kind: 'RESOURCE_BOUND', ref: key })
    }
  }
}

/**
 * Health drifts with the environment the crew are living in, and fatigue with
 * what they are doing. Both are reservoirs, so "how long until this is a
 * problem" is a division rather than a simulation.
 */
function updateCrewRates(state: SimState, at: GameTime): void {
  const temp = levelAt(state.ship.resources.heat, at)
  const co2Kg = levelAt(state.ship.resources.co2, at)
  const hull = getHull(state.ship.hullId)
  const ppm = ((co2Kg / 0.044) / (41.45 * hull.cabinVolumeM3)) * 1e6

  const starving = levelAt(state.ship.resources.food, at) <= 0
  const thirsty = levelAt(state.ship.resources.water, at) <= 0
  const suffocating = levelAt(state.ship.resources.o2, at) <= 0

  let healthPerDay = 2.5 // baseline recovery when things are fine
  if (ppm > 10000) healthPerDay -= 9
  else if (ppm > 5000) healthPerDay -= 3
  if (temp > 35) healthPerDay -= 8
  else if (temp > 28) healthPerDay -= 2.5
  if (starving) healthPerDay -= 6
  if (thirsty) healthPerDay -= 12
  if (suffocating) healthPerDay -= 20

  for (const crew of state.crew) {
    settle(crew.fatigue, at)
    settle(crew.health, at)
    crew.fatigue.rate = fatigueRatePerSecond(crew.activity)
    // Sleep is when people actually mend.
    const recovery = crew.activity === 'sleep' ? 1.4 : 1
    crew.health.rate = PER_DAY(healthPerDay > 0 ? healthPerDay * recovery : healthPerDay)
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

/** Human-readable label for a resource boundary, used in dispatches. */
export function resourceBoundMessage(
  key: ResourceKey,
  atMax: boolean,
): { level: 'info' | 'warn' | 'alert'; text: string } | undefined {
  switch (key) {
    case 'battery':
      return atMax
        ? { level: 'info', text: 'Batteries at full charge; surplus generation is being dumped.' }
        : { level: 'warn', text: 'Battery bank exhausted.' }
    case 'co2':
      return atMax
        ? { level: 'alert', text: 'CO2 has reached the cabin limit. Scrubbing cannot keep up.' }
        : undefined
    case 'o2':
      return atMax ? undefined : { level: 'alert', text: 'Oxygen reserve is gone.' }
    case 'water':
      return atMax ? undefined : { level: 'alert', text: 'Water tanks are dry.' }
    case 'food':
      return atMax ? undefined : { level: 'alert', text: 'Food stores are empty.' }
    case 'heat':
      return atMax
        ? { level: 'alert', text: 'Cabin temperature has hit the limit; the loop cannot reject any more.' }
        : undefined
    default:
      return undefined
  }
}
