/**
 * The always-visible readout. Design doc §3.2, §1 pillar 1.
 *
 * "Systems are legible: you can trace why the O2 margin is thin." With five
 * networks running, the bar's job is triage: what time is it aboard, is the
 * ship making or losing power, and is anything about to need me.
 */
import { useEffect, useRef } from 'react'
import {
  formatDuration,
  formatShipClock,
  type GameTime,
  type LifeSupportView,
  type PowerView,
  type ShipVitalsView,
  type Whereabouts,
} from '@solsyn/sim'
import { Track } from './Gauges.js'

/**
 * Publish how tall this bar is, so the tab strip can freeze beneath it.
 *
 * Both are sticky at the top of the same scroller, and CSS has no way to ask
 * "how tall is my sibling" -- so the one that knows says. It has to be
 * measured rather than declared: the bar grows an alarm list when something is
 * wrong and a progress track when the ship is under way, and a hardcoded
 * offset would leave the tabs overlapping the readout exactly when there is
 * something in it worth reading.
 *
 * A `ResizeObserver` rather than a layout effect on every render, because the
 * height changes with content the component does not re-render for -- a long
 * berth line wrapping to two lines when the phone is rotated, for one.
 */
function usePublishedHeight() {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const publish = () => {
      document.documentElement.style.setProperty(
        '--status-h',
        `${el.getBoundingClientRect().height}px`,
      )
    }
    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return ref
}

export function StatusBar({
  now,
  power,
  vitals,
  life,
  brokenCount,
  where,
}: {
  now: GameTime
  power: PowerView
  vitals: ShipVitalsView
  life: LifeSupportView
  brokenCount: number
  where: Whereabouts
}) {
  const ref = usePublishedHeight()
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
    <header ref={ref} className={`status ${alarms.length > 0 ? 'is-alarm' : ''}`}>
      <div className="status__row">
        <span className="status__clock" title="Ship time">
          {formatShipClock(now)}
        </span>
        <span className={`status__net ${deficit ? 'is-load' : 'is-source'}`}>
          {power.netKw > 0 ? '+' : ''}
          {power.netKw.toFixed(1)} kW
        </span>
      </div>

      {/* The same banded track the gauges elsewhere use, rather than a bar
          with quarter ticks on it. A quarter is not a threshold: it never told
          anyone whether 25% was comfortable, and on a bank that is what the
          reading is for. The bands say where it stops being. */}
      <div className="status__gauge">
        <Track gauge={vitals.battery} label="Battery" />
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
      <div
        className={`berth ${where.docked ? 'is-alongside' : 'is-underway'} ${
          where.salvage ? 'is-salvage' : ''
        }`}
      >
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
