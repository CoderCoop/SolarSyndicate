/**
 * The star chart. Design doc §5.1.
 *
 * Where everything actually is, in heliocentric coordinates, at this instant.
 * Bodies come straight from `orbits.ts`, so the chart is not a decoration
 * drawn beside the simulation -- it is the same closed-form positions the
 * transfer maths uses, read at `now`.
 *
 * A ship under way is placed on its **actual transfer ellipse** rather than
 * lerped between two dots. Kepler's equation is already how the crossing was
 * priced (spec 002 TR-2), so solving it again for the current radius and true
 * anomaly costs a Newton iteration and buys a position that is genuinely
 * where the ship is. A straight line between departure and arrival would have
 * been a lie the player could check.
 */
import { content, getBody, getPort } from '@solsyn/data'
import { AU, MU_SUN, bodyAngleAt, bodyPositionAt, type Vec2 } from './orbits.js'
import { type GameTime } from './time.js'
import type { SimState } from './types.js'

export interface ChartBody {
  id: string
  name: string
  /** Heliocentric position in AU, for drawing. */
  x: number
  y: number
  orbitRadiusAu: number
  /** Ports berthed here, so the chart can label a place by what is at it. */
  ports: { id: string; name: string }[]
}

export interface ChartShip {
  x: number
  y: number
  /** Berthed here, if berthed. */
  atPortId?: string
  /** Under way between these, if under way. */
  fromBodyId?: string
  toBodyId?: string
  fractionComplete?: number
  /** True when the crossing never leaves one body's neighbourhood. */
  local: boolean
}

export interface ChartView {
  bodies: ChartBody[]
  ship: ChartShip
  /** The transfer arc, in AU, sampled for drawing. Empty when berthed. */
  track: Vec2[]
  /** How far out the chart has to reach, in AU. */
  extentAu: number
}

/**
 * Solve Kepler's equation for the eccentric anomaly. Newton-Raphson from a
 * sensible guess; the ellipses here are mild, so this converges in a handful
 * of steps and the loop is bounded regardless.
 */
function eccentricAnomaly(meanAnomaly: number, e: number): number {
  let E = e < 0.8 ? meanAnomaly : Math.PI
  for (let i = 0; i < 24; i++) {
    const delta = (E - e * Math.sin(E) - meanAnomaly) / (1 - e * Math.cos(E))
    E -= delta
    if (Math.abs(delta) < 1e-12) break
  }
  return E
}

/** Where a ship is on a transfer ellipse, `elapsed` seconds after departure. */
export function transferPositionAu(
  fromBodyId: string,
  toBodyId: string,
  departedAt: GameTime,
  elapsed: number,
): Vec2 {
  const r1 = getBody(fromBodyId).orbitRadiusAu * AU
  const r2 = getBody(toBodyId).orbitRadiusAu * AU
  const a = (r1 + r2) / 2
  const e = Math.abs(1 - r1 / a)

  // Which end of the ellipse the ship leaves from. Going outward it departs at
  // periapsis; going inward the departure radius is the *apoapsis*, half an
  // orbit round, so the sweep starts at mean anomaly pi rather than zero.
  // Getting this wrong put an inbound ship on an outbound arc.
  const outbound = r2 >= r1
  const startAnomaly = outbound ? 0 : Math.PI
  const meanAnomaly = startAnomaly + elapsed * Math.sqrt(MU_SUN / a ** 3)
  const E = eccentricAnomaly(meanAnomaly, e)

  const r = a * (1 - e * Math.cos(E))
  // True anomaly from eccentric anomaly, the usual half-angle form.
  const nu =
    2 *
    Math.atan2(
      Math.sqrt(1 + e) * Math.sin(E / 2),
      Math.sqrt(1 - e) * Math.cos(E / 2),
    )

  // Anchor the arc to where the ship actually left: the true anomaly at
  // departure is 0 outbound and pi inbound, so subtract it out.
  const departureAngle = bodyAngleAt(fromBodyId, departedAt)
  const angle = departureAngle + nu - startAnomaly

  return { x: (r * Math.cos(angle)) / AU, y: (r * Math.sin(angle)) / AU }
}

export function chartView(state: SimState): ChartView {
  const t = state.now

  const bodies: ChartBody[] = [];
  for (const body of chartBodies()) {
    const p = bodyPositionAt(body.id, t)
    bodies.push({
      id: body.id,
      name: body.name,
      x: p.x / AU,
      y: p.y / AU,
      orbitRadiusAu: body.orbitRadiusAu,
      ports: portsOn(body.id),
    })
  }

  const voyage = state.voyage
  let ship: ChartShip
  let track: Vec2[] = []

  if (!voyage) {
    const home = getPort(state.ship.portId)
    const at = bodyPositionAt(home.bodyId, t)
    ship = { x: at.x / AU, y: at.y / AU, atPortId: home.id, local: false }
  } else {
    const fromBody = getPort(voyage.fromPortId).bodyId
    const toBody = getPort(voyage.toPortId).bodyId
    const total = voyage.arrivesAt - voyage.departedAt
    const fraction = total > 0 ? Math.min(1, Math.max(0, (t - voyage.departedAt) / total)) : 1

    if (fromBody === toBody) {
      // A hop inside one gravity well. At this scale the ship has not moved,
      // and pretending otherwise would put it somewhere it is not.
      const at = bodyPositionAt(fromBody, t)
      ship = {
        x: at.x / AU,
        y: at.y / AU,
        fromBodyId: fromBody,
        toBodyId: toBody,
        fractionComplete: fraction,
        local: true,
      }
    } else {
      const now = transferPositionAu(fromBody, toBody, voyage.departedAt, t - voyage.departedAt)
      ship = {
        ...now,
        fromBodyId: fromBody,
        toBodyId: toBody,
        fractionComplete: fraction,
        local: false,
      }
      const steps = 48
      track = Array.from({ length: steps + 1 }, (_, i) =>
        transferPositionAu(fromBody, toBody, voyage.departedAt, (total * i) / steps),
      )
    }
  }

  const extentAu = Math.max(
    ...bodies.map((b) => b.orbitRadiusAu),
    Math.hypot(ship.x, ship.y),
  )

  return { bodies, ship, track, extentAu: extentAu * 1.12 }
}

/** Every body with a port on it, innermost first. */
function chartBodies() {
  const seen = new Set<string>()
  const out = []
  for (const port of content.ports) {
    if (seen.has(port.bodyId)) continue
    seen.add(port.bodyId)
    out.push(getBody(port.bodyId))
  }
  return out.sort((a, b) => a.orbitRadiusAu - b.orbitRadiusAu)
}

function portsOn(bodyId: string) {
  return content.ports
    .filter((p) => p.bodyId === bodyId)
    .map((p) => ({ id: p.id, name: p.name }))
}
