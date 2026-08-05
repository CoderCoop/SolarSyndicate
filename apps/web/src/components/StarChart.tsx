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
 * both legible at once. It is a stated distortion rather than a hidden one --
 * and now a measurable one, because the ruler along the foot is drawn to the
 * same scale.
 *
 * ## What it is for
 *
 * It used to be three grey rings, three identical dots and a lot of black. It
 * was *true* -- the positions were real -- and it answered no question a player
 * actually had. §5.1 says what the map is for:
 *
 *   "Planets *move* -- Mars is sometimes 0.5 AU away and sometimes 2.5, so
 *   **launch windows are real gameplay** and the astrogator's job."
 *
 * Both halves of that were missing. The chart drew the motion faithfully and
 * never said what it cost, and the window maths -- `phaseAngleForTransfer`,
 * `synodicPeriodDays` -- had been written and tested in M2 and referenced by
 * nothing at all. So the plate now carries the two numbers that make it an
 * instrument: **how far away is that**, and **when is it worth going**.
 */
import type { ChartView, ChartWindow } from '@solsyn/sim'

const SIZE = 300
const CENTRE = SIZE / 2
const MARGIN = 30
/** Room along the foot for the scale ruler. */
const FOOT = 16

/**
 * How each world is drawn: a map symbol, not a photograph.
 *
 * Deliberately the same vocabulary the route strip uses, because a player who
 * has learned that the small grey one is Ceres on one screen should not have to
 * learn it again on the other. Radii are drawing units and are *not* to scale
 * with each other -- at true scale Ceres would be a third of a pixel.
 */
const WORLD: Record<string, { r: number; tone: string; ring?: boolean }> = {
  earth: { r: 6, tone: 'earth', ring: true },
  mars: { r: 4.6, tone: 'mars' },
  ceres: { r: 3, tone: 'ceres' },
}

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

/** Distance in the unit that suits it, the way the route strip does. */
function distance(au: number): string {
  if (au < 0.001) return 'here'
  if (au < 0.06) return `${(au * 149.6).toFixed(1)}M km`
  return `${au.toFixed(2)} AU`
}

/**
 * Days, kept as days for as long as they are useful.
 *
 * Switching to years at ninety collapsed two windows 25 days apart into the
 * same "0.6y" -- and 202 days against 227 is exactly the difference a player
 * plans around. Years only once the number stops being a thing you wait out.
 */
function days(d: number): string {
  if (d < 1) return 'now'
  if (d < 400) return `${Math.round(d)} days`
  return `${(d / 365.25).toFixed(1)} years`
}

/**
 * Ticks for the ruler: the round AU values that fit inside the plate.
 *
 * The square-root scale is the one thing on this drawing a player has to take
 * on trust, so it gets a ruler. Unevenly spaced ticks *are* the distortion,
 * shown rather than described.
 */
function ticksFor(extentAu: number): number[] {
  return [0.5, 1, 2, 3, 5, 10].filter((au) => au <= extentAu)
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
        viewBox={`0 0 ${SIZE} ${SIZE + FOOT}`}
        role="img"
        aria-label={describe(chart)}
      >
        <defs>
          {/* The sun's glare, and the light that decides which limb of a world
              is lit. One gradient for the star, one mask per body would be
              extravagant -- a half-disc rotated to face the sun does the same
              job for two elements. */}
          <radialGradient id="chart-sun-glare">
            <stop offset="0" className="sun-core" />
            <stop offset="1" className="sun-edge" />
          </radialGradient>
        </defs>

        {/* Orbits, innermost first, with the direction everything travels. */}
        {chart.bodies.map((b) => (
          <circle
            key={b.id}
            className="chart__orbit"
            cx={CENTRE}
            cy={CENTRE}
            r={radial(b.orbitRadiusAu, extentAu)}
          />
        ))}

        {/* Where each world will be in a season. A body is a moving target and
            the arc has to be aimed at where it is going, not where it is. */}
        {chart.bodies.map((b) => {
          const [x, y] = project(b.x, b.y, extentAu)
          const [lx, ly] = project(b.lead.x, b.lead.y, extentAu)
          const r = radial(b.orbitRadiusAu, extentAu)
          // Along the orbit rather than a chord, so it reads as travel.
          const sweep = b.lead.x * b.y - b.lead.y * b.x > 0 ? 0 : 1
          return (
            <g key={b.id} className={`chart__lead chart__lead--${WORLD[b.id]?.tone ?? 'ceres'}`}>
              <path d={`M${x} ${y} A ${r} ${r} 0 0 ${sweep} ${lx} ${ly}`} />
              <circle cx={lx} cy={ly} r="1.6" />
            </g>
          )
        })}

        <circle className="chart__glare" cx={CENTRE} cy={CENTRE} r="13" fill="url(#chart-sun-glare)" />
        <circle className="chart__sun" cx={CENTRE} cy={CENTRE} r="4.5" />

        {/* The transfer arc, when there is one. */}
        {trackPath && <path className="chart__track" d={trackPath} />}

        {chart.bodies.map((b) => {
          const [x, y] = project(b.x, b.y, extentAu)
          const mark = WORLD[b.id] ?? { r: 3.5, tone: 'ceres' }
          const here = chart.ship.atPortId
            ? b.ports.some((p) => p.id === chart.ship.atPortId)
            : b.id === chart.ship.toBodyId
          // The lit limb faces the sun, which is at the centre -- so the
          // terminator is just the angle back to the middle of the plate.
          const toSun = (Math.atan2(CENTRE - y, CENTRE - x) * 180) / Math.PI

          return (
            <g
              key={b.id}
              className={`chart__body chart__body--${mark.tone} ${here ? 'is-current' : ''}`}
            >
              {mark.ring && <circle className="chart__halo" cx={x} cy={y} r={mark.r + 3.5} />}
              <circle className="chart__disc" cx={x} cy={y} r={mark.r} />
              {/* Day side. A world lit from the star it orbits is the cheapest
                  thing on the plate that makes it read as a place. */}
              <path
                className="chart__lit"
                transform={`translate(${x} ${y}) rotate(${toSun})`}
                d={`M0 ${-mark.r} A ${mark.r} ${mark.r} 0 0 0 0 ${mark.r} Z`}
              />
              <text className="chart__name" x={x} y={y - mark.r - 5} textAnchor="middle">
                {b.name}
              </text>
              {/* The number the whole moving-planets design exists to produce. */}
              <text className="chart__range" x={x} y={y + mark.r + 9} textAnchor="middle">
                {distance(b.distanceAu)}
              </text>
              {b.ports.length > 0 && (
                <text className="chart__ports" x={x} y={y + mark.r + 17} textAnchor="middle">
                  {b.ports
                    .map((p) => (p.moon ? `${p.name.split(' ')[0]} (${p.moon})` : p.name.split(' ')[0]))
                    .join(' · ')}
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

        {/* The ruler. The square-root scale is the one thing here a player has
            to take on trust, so it is drawn rather than asserted: the ticks
            crowd toward the rim, which *is* the distortion. */}
        <g className="chart__ruler" transform={`translate(0 ${SIZE + 4})`}>
          <line x1={CENTRE} y1="0" x2={CENTRE + (CENTRE - MARGIN)} y2="0" />
          {ticksFor(extentAu).map((au) => {
            const x = CENTRE + radial(au, extentAu)
            return (
              <g key={au}>
                <line x1={x} y1="-2.5" x2={x} y2="2.5" />
                <text x={x} y="9" textAnchor="middle">
                  {au}
                </text>
              </g>
            )
          })}
          <text className="chart__ruler-unit" x={CENTRE - 4} y="9" textAnchor="end">
            AU
          </text>
        </g>
      </svg>

      <p className="chart__caption">{describe(chart)}</p>

      {/* When it is worth going. §5.1 calls launch windows real gameplay; the
          maths for them shipped in M2 and nothing had ever shown it. */}
      {chart.windows.length > 0 && <Windows windows={chart.windows} />}

      <p className="panel__note">
        Top-down, sun at the centre. Radius is drawn on a square-root scale so the inner
        system and the Belt are legible on one plate — angles and relative order are true,
        absolute distances are compressed, and the ruler is drawn to the same scale so you
        can see by how much. The faint arc off each world is where it will be in{' '}
        {chart.leadDays} days.
      </p>
    </section>
  )
}

/**
 * The window table. Design doc §5.1.
 *
 * Phase angle is the honest quantity and it is also meaningless to most people,
 * so the row leads with the decision — go now, or wait this long — and keeps
 * the angle as the supporting detail rather than the headline.
 */
function Windows({ windows }: { windows: ChartWindow[] }) {
  return (
    <div className="windows">
      <h3 className="windows__title">Launch windows</h3>
      <ul className="windows__list">
        {windows.map((w) => (
          <li key={w.toBodyId} className={`window ${w.open ? 'is-open' : ''}`}>
            <span className="window__to">{w.toName}</span>
            <span className="window__when">
              {w.open ? 'open now' : `opens in ${days(w.daysToWindow)}`}
            </span>
            <span className="window__detail">
              {w.open
                ? `geometry is within ${Math.abs(Math.round((w.offByRad * 180) / Math.PI))}° of ideal`
                : `${Math.abs(Math.round((w.offByRad * 180) / Math.PI))}° out · comes round every ${days(w.synodicDays)}`}
            </span>
          </li>
        ))}
      </ul>
      <p className="panel__note">
        A minimum-energy crossing has to leave when the target is in the right place to meet
        it — that is what makes waiting a real option rather than a delay. Flying outside a
        window is not forbidden; it just costs delta-v the astrogator will quote you.
      </p>
    </div>
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
  // The arc is the chosen profile's ellipse, not the minimum-energy one, so it
  // says which trajectory it is drawing rather than leaving the player to
  // wonder why this crossing bulges further than the last one did.
  const profile = ship.profileLabel ? ` on the ${ship.profileLabel.toLowerCase()} trajectory` : ''
  return `Under way to ${to?.name ?? 'port'}${profile} — ${pct}% of the transfer flown.`
}
