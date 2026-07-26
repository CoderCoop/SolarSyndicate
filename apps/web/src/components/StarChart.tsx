/**
 * The star chart. Design doc §5.1.
 *
 * Where the ship is, drawn top-down with the sun at the centre. Everything on
 * it comes from `chartView` -- the same closed-form positions the transfer
 * maths uses -- so the dot is where the ship is rather than where a tween
 * happens to have put it.
 *
 * Orbits are drawn to a **square-root radial scale**. Linear would put Earth
 * and Ceres at 1 and 2.77 AU with the inner system squashed into a fifth of
 * the plate; logarithmic would flatter the outer system into a smear. Charts
 * of this kind are read for *relative position*, and the square root keeps
 * both legible at once. It is a stated distortion rather than a hidden one.
 */
import type { ChartView } from '@solsyn/sim'

const SIZE = 300
const CENTRE = SIZE / 2
const MARGIN = 26

/** Square-root radial scale, AU to drawing units. */
function radial(au: number, extentAu: number): number {
  const usable = CENTRE - MARGIN
  return Math.sqrt(Math.max(0, au) / extentAu) * usable
}

function project(x: number, y: number, extentAu: number): [number, number] {
  const au = Math.hypot(x, y)
  if (au < 1e-9) return [CENTRE, CENTRE]
  const r = radial(au, extentAu)
  // Screen y grows downward; flip so the chart reads like a map.
  return [CENTRE + (x / au) * r, CENTRE - (y / au) * r]
}

export function StarChart({ chart }: { chart: ChartView }) {
  const { extentAu } = chart
  const [shipX, shipY] = project(chart.ship.x, chart.ship.y, extentAu)

  const trackPath = chart.track
    .map((p, i) => {
      const [x, y] = project(p.x, p.y, extentAu)
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')

  return (
    <section className="panel" aria-label="Star chart">
      <h2 className="panel__title">Chart</h2>

      <svg
        className="chart"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={describe(chart)}
      >
        {/* Orbits, innermost first. */}
        {chart.bodies.map((b) => (
          <circle
            key={b.id}
            className="chart__orbit"
            cx={CENTRE}
            cy={CENTRE}
            r={radial(b.orbitRadiusAu, extentAu)}
          />
        ))}

        <circle className="chart__sun" cx={CENTRE} cy={CENTRE} r="4.5" />

        {/* The transfer arc, when there is one. */}
        {trackPath && <path className="chart__track" d={trackPath} />}

        {chart.bodies.map((b) => {
          const [x, y] = project(b.x, b.y, extentAu)
          const here = chart.ship.atPortId
            ? b.ports.some((p) => p.id === chart.ship.atPortId)
            : b.id === chart.ship.toBodyId
          return (
            <g key={b.id} className={`chart__body ${here ? 'is-current' : ''}`}>
              <circle cx={x} cy={y} r="4" />
              <text x={x} y={y - 8} textAnchor="middle">
                {b.name}
              </text>
              {b.ports.length > 0 && (
                <text className="chart__ports" x={x} y={y + 17} textAnchor="middle">
                  {b.ports.map((p) => p.name.split(' ')[0]).join(' · ')}
                </text>
              )}
            </g>
          )
        })}

        {/* The ship. Ringed so it reads over a body it is sitting on. */}
        <g className={`chart__ship ${chart.ship.atPortId ? 'is-berthed' : 'is-under-way'}`}>
          <circle className="chart__ship-halo" cx={shipX} cy={shipY} r="9" />
          <path
            className="chart__ship-mark"
            d={`M${shipX} ${shipY - 5.5} L${shipX + 4} ${shipY + 4} L${shipX} ${shipY + 1.5} L${shipX - 4} ${shipY + 4} Z`}
          />
        </g>
      </svg>

      <p className="chart__caption">{describe(chart)}</p>
      <p className="panel__note">
        Top-down, sun at the centre. Radius is drawn on a square-root scale so
        the inner system and the Belt are legible on one plate — angles and
        relative order are true, absolute distances are compressed.
      </p>
    </section>
  )
}

function describe(chart: ChartView): string {
  const { ship } = chart
  if (ship.atPortId) {
    const port = chart.bodies.flatMap((b) => b.ports).find((p) => p.id === ship.atPortId)
    return `Berthed at ${port?.name ?? 'port'}.`
  }
  const to = chart.bodies.find((b) => b.id === ship.toBodyId)
  const pct = Math.round((ship.fractionComplete ?? 0) * 100)
  if (ship.local) {
    return `Under way to ${to?.name ?? 'port'} — ${pct}% of a crossing that stays inside this system.`
  }
  return `Under way to ${to?.name ?? 'port'} — ${pct}% of the transfer flown.`
}
