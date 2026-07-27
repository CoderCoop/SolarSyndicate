/**
 * The always-visible readout. Design doc §3.2, §1 pillar 1.
 *
 * "Systems are legible: you can trace why the O2 margin is thin." With five
 * networks running, the bar's job is triage: what time is it aboard, is the
 * ship making or losing power, and is anything about to need me.
 */
import {
  formatDuration,
  formatShipClock,
  type GameTime,
  type LifeSupportView,
  type PowerView,
  type Whereabouts,
} from '@solsyn/sim'

export function StatusBar({
  now,
  power,
  life,
  brokenCount,
  where,
}: {
  now: GameTime
  power: PowerView
  life: LifeSupportView
  brokenCount: number
  where: Whereabouts
}) {
  const pct = Math.round(power.batteryFraction * 100)
  const deficit = power.netKw < 0

  let margin = 'Battery holding'
  if (power.boundKind === 'empty') margin = `${formatDuration(power.secondsToBound)} to empty`
  else if (power.boundKind === 'full') margin = `${formatDuration(power.secondsToBound)} to full`
  else if (power.batteryFraction >= 0.999) margin = 'Batteries full'

  const alarms: string[] = []
  if (power.brownout) alarms.push('Brownout — loads shed to hold the critical bus')
  if (life.co2Status !== 'nominal') alarms.push(`CO2 at ${Math.round(life.co2Ppm).toLocaleString()} ppm`)
  if (life.tempStatus !== 'nominal') alarms.push(`Cabin at ${life.temperatureC.toFixed(1)} °C`)
  if (brokenCount > 0) {
    alarms.push(`${brokenCount} system${brokenCount === 1 ? '' : 's'} failed`)
  }

  return (
    <header className={`status ${alarms.length > 0 ? 'is-alarm' : ''}`}>
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

      {/* Where the ship is, above the housekeeping. Power and CO2 were always
          on screen while "berthed or under way?" -- the thing that decides
          whether any of it is your problem this minute -- was not stated
          anywhere at all. */}
      <div className={`berth ${where.docked ? 'is-alongside' : 'is-underway'}`}>
        <div className="berth__line">
          <span className="berth__place">{where.place}</span>
          <span className="berth__detail">{where.detail}</span>
        </div>
        {where.fractionComplete !== undefined && (
          <div
            className="berth__track"
            role="meter"
            aria-valuenow={Math.round(where.fractionComplete * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Distance flown"
          >
            <div className="berth__flown" style={{ width: `${where.fractionComplete * 100}%` }} />
          </div>
        )}
      </div>

      <div className="status__row status__row--fine status__row--dim">
        <span>
          {Math.round(life.co2Ppm).toLocaleString()} ppm · {life.temperatureC.toFixed(1)} °C
        </span>
        <span>
          {life.heatMarginKw >= 0
            ? `${life.heatMarginKw.toFixed(0)} kW thermal margin`
            : `${(-life.heatMarginKw).toFixed(0)} kW over thermal`}
        </span>
      </div>

      {alarms.length > 0 && (
        <ul className="status__alarms">
          {alarms.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
    </header>
  )
}
