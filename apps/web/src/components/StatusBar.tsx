/**
 * The power readout. Design doc §3.2, §1 pillar 1.
 *
 * "Systems are legible: you can trace why the O2 margin is thin." The bar has
 * to answer three questions at a glance -- what time is it aboard, is the ship
 * making or losing power, and how long until that matters.
 */
import { formatDuration, formatShipClock, type PowerView, type GameTime } from '@solsyn/sim'

export function StatusBar({ now, power }: { now: GameTime; power: PowerView }) {
  const pct = Math.round(power.batteryFraction * 100)
  const deficit = power.netKw < 0

  let margin = 'Battery holding'
  if (power.boundKind === 'empty') margin = `${formatDuration(power.secondsToBound)} to empty`
  else if (power.boundKind === 'full') margin = `${formatDuration(power.secondsToBound)} to full`
  else if (power.batteryFraction >= 0.999) margin = 'Batteries full'

  return (
    <header className={`status ${power.brownout ? 'is-brownout' : ''}`}>
      <div className="status__row">
        <span className="status__clock" title="Ship time">
          {formatShipClock(now)}
        </span>
        <span className={`status__net ${deficit ? 'is-load' : 'is-source'}`}>
          {power.netKw > 0 ? '+' : ''}
          {power.netKw.toFixed(1)} kW
        </span>
      </div>

      <div className="gauge" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div
          className={`gauge__fill ${deficit ? 'is-draining' : 'is-charging'}`}
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
        <div className="gauge__ticks" aria-hidden="true">
          {[25, 50, 75].map((t) => (
            <span key={t} style={{ left: `${t}%` }} />
          ))}
        </div>
      </div>

      <div className="status__row status__row--fine">
        <span>
          {power.batteryKwh.toFixed(1)} / {power.batteryCapacityKwh.toFixed(0)} kWh
        </span>
        <span className={deficit ? 'is-load' : ''}>{margin}</span>
      </div>

      <div className="status__row status__row--fine status__row--dim">
        <span>Generation {power.productionKw.toFixed(1)} kW</span>
        <span>Demand {power.demandKw.toFixed(1)} kW</span>
      </div>

      {power.brownout && (
        <p className="status__brownout">
          Brownout — loads shed to hold the critical bus.
        </p>
      )}
    </header>
  )
}
