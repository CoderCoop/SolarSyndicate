/**
 * The banded gauge, shared. Design doc §3.2.
 *
 * A coloured bar says whether the reading is all right *now*. The ranges say
 * how much room is left before it stops being — which is the difference
 * between a warning light and an instrument, and it is what lets a player
 * decide whether to act this watch or next week.
 *
 * This lived inside `LifeSupport.tsx` until the ship's own numbers wanted the
 * same treatment. It is one component rather than two because a second visual
 * language for "is this all right" would be worse than either of them alone:
 * the bank and the water tank are the same question about different things,
 * and the eye should not have to learn it twice.
 *
 * The class names are still the Life tab's `gauge-row__*` deliberately. They
 * are the names of *this* thing, not of that panel, and keeping them means the
 * two places cannot drift apart by someone restyling one of them.
 */
import type { Gauge, LifeStatus } from '@solsyn/sim'

/**
 * The track, with its ranges on it.
 *
 * A store's bands move as consumption does, and that is worth watching rather
 * than a defect: the same 300 kg of water is comfortable with four aboard and
 * thin with eight, and a fixed mark would say the same thing in both.
 */
export function Track({ gauge, label }: { gauge: Gauge; label: string }) {
  let from = 0
  const zones = gauge.zones.map((z) => {
    const band = { ...z, from }
    from = z.until
    return band
  })

  return (
    <div
      className="gauge-row__bar"
      role="meter"
      aria-label={label}
      aria-valuenow={Math.round(gauge.fill * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {zones.map((z) => (
        <span
          key={`${z.status}-${z.from}`}
          className={`gauge-row__zone gauge-row__zone--${z.status}`}
          style={{ left: `${z.from * 100}%`, width: `${(z.until - z.from) * 100}%` }}
        />
      ))}
      {gauge.kind === 'store' && (
        <div
          className="gauge-row__fill"
          style={{ width: `${Math.max(0, Math.min(100, gauge.fill * 100))}%` }}
        />
      )}
      {/* The needle. The fill says how full, the mark says exactly where —
          which is the only part that can be read against a boundary. */}
      <span
        className="gauge-row__needle"
        style={{ left: `${Math.max(0, Math.min(100, gauge.fill * 100))}%` }}
      />
    </div>
  )
}

/**
 * One gauge as a row: what it is, what it reads, where that sits, and why.
 *
 * `children` is what the Life tab hangs underneath — the in-and-out breakdown
 * that only exists where there is a flow channel behind the reading.
 */
export function GaugeRow({
  label,
  value,
  detail,
  status = 'nominal',
  gauge,
  horizon,
  children,
}: {
  label: string
  value: string
  detail?: string
  status?: LifeStatus
  gauge?: Gauge
  horizon?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <li className={`gauge-row gauge-row--${status}`}>
      <div className="gauge-row__head">
        <span className="gauge-row__label">{label}</span>
        <span className="gauge-row__value">{value}</span>
      </div>
      {gauge && <Track gauge={gauge} label={label} />}
      <div className="gauge-row__foot">
        {detail && <span className="gauge-row__detail">{detail}</span>}
        {horizon}
      </div>
      {children}
    </li>
  )
}
