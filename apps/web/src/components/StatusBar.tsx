/**
 * The always-visible readout. Design doc §3.2, §1, §6.1.
 *
 * "Systems are legible: you can trace why the O2 margin is thin." With five
 * networks running, the bar's job is triage: what time is it aboard, is the
 * ship making or losing power, and is anything about to need me.
 *
 * And, since 0.17.3, what the desk is worth. §1 makes the player an
 * institution rather than a pilot, and an institution's headline figure is its
 * balance -- which was on one panel of one tab, under the ledger it heads, so
 * the number every decision in the game is priced against was three taps from
 * most of the decisions.
 */
import { useEffect, useRef } from 'react'
import {
  formatCredits,
  formatDuration,
  formatShipClock,
  type GameTime,
  type Gauge,
  type LedgerView,
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

/**
 * One standing figure about the desk, with its name under it.
 *
 * There are two of these to state and only one of them exists yet. Standing
 * with the guilds is simulated -- `guildViews`, `adjustStanding`, a band and a
 * sentence per guild since M3 -- and is not surfaced anywhere a player can see
 * it while deciding anything, so the second cell is the shape it will take:
 * beside the money, at the same weight, because "what will they let me fly"
 * and "what can I afford to fly" are the same size of question (§6.1).
 *
 * Laid out so one figure sits alone without a hole beside it and two split the
 * row evenly, which is why this is a component and not two hardcoded spans.
 */
function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="purse__cell">
      <span className={`purse__figure ${tone ?? ''}`}>{value}</span>
      <span className="purse__label">{label}</span>
    </div>
  )
}

/**
 * One metric, small. Design doc §3.2.
 *
 * The same banded track the Life tab and the Ship tab read, at the size a
 * standing readout can afford ten of. A name and a bar and nothing else: the
 * figure belongs on the tab that owns the metric, and what this has to answer
 * is only "is any of it wrong", from wherever the player happens to be.
 *
 * Short names because there are ten of them across a phone. They are the
 * abbreviations already used aboard rather than truncations — the full name
 * goes to the meter's accessible label, so nothing is lost to a screen reader.
 */
function Mini({ label, name, gauge }: { label: string; name: string; gauge: Gauge }) {
  return (
    <div className={`strip__cell strip__cell--${gauge.status}`}>
      <span className="strip__label">{label}</span>
      <Track gauge={gauge} label={name} />
    </div>
  )
}

export function StatusBar({
  now,
  power,
  vitals,
  life,
  ledger,
  brokenCount,
  where,
}: {
  now: GameTime
  power: PowerView
  vitals: ShipVitalsView
  life: LifeSupportView
  ledger: LedgerView
  brokenCount: number
  where: Whereabouts
}) {
  const ref = usePublishedHeight()
  const deficit = power.netKw < 0

  let margin = 'Battery holding'
  if (power.boundKind === 'empty') margin = `${formatDuration(power.secondsToBound)} to empty`
  else if (power.boundKind === 'full') margin = `${formatDuration(power.secondsToBound)} to full`
  else if (power.batteryFraction >= 0.999) margin = 'Batteries full'

  // Ship first, then life, each in the order it goes wrong. Propellant is on
  // both views and is one metric, so it is stated once, from the ship's.
  const metrics: { label: string; name: string; gauge: Gauge }[] = [
    { label: 'BATT', name: 'Battery', gauge: vitals.battery },
    { label: 'PWR', name: 'Power balance', gauge: vitals.power },
    { label: 'PROP', name: 'Propellant', gauge: vitals.propellant },
    { label: 'COND', name: 'Condition', gauge: vitals.condition },
    { label: 'CO₂', name: 'Cabin CO2', gauge: life.gauges.co2 },
    { label: 'TEMP', name: 'Cabin temperature', gauge: life.gauges.temp },
    { label: 'O₂', name: 'Oxygen', gauge: life.gauges.o2 },
    { label: 'WATER', name: 'Water', gauge: life.gauges.water },
    { label: 'FOOD', name: 'Food', gauge: life.gauges.food },
    { label: 'SPARES', name: 'Spares', gauge: life.gauges.spares },
  ]

  const alarms: string[] = []
  if (power.brownout) alarms.push('Brownout — loads shed to hold the critical bus')
  if (life.co2Status !== 'nominal') alarms.push(`CO2 at ${Math.round(life.co2Ppm).toLocaleString()} ppm`)
  if (life.tempStatus !== 'nominal') alarms.push(`Cabin at ${life.temperatureC.toFixed(1)} °C`)
  if (brokenCount > 0) {
    alarms.push(`${brokenCount} system${brokenCount === 1 ? '' : 's'} failed`)
  }

  return (
    <header ref={ref} className={`status ${alarms.length > 0 ? 'is-alarm' : ''}`}>
      {/* The desk, above the ship. Everything below this line is what the
          Ariadne is doing; this is what the business is worth, and it is the
          figure the rest of it is spent against. */}
      <div className="purse">
        <Figure
          label="On the books"
          value={formatCredits(ledger.credits)}
          tone={ledger.overdrawn ? 'is-overdrawn' : ''}
        />
        {/* Guild influence goes here, at the same weight (§6.1). */}
      </div>

      <div className="status__row">
        <span className="status__clock" title="Ship time">
          {formatShipClock(now)}
        </span>
        <span className={`status__net ${deficit ? 'is-load' : 'is-source'}`}>
          {power.netKw > 0 ? '+' : ''}
          {power.netKw.toFixed(1)} kW
        </span>
      </div>

      {/* Every metric the ship has, at a glance. Design doc §3.2, §1 pillar 1.
          The bar carried one gauge -- the bank -- so triage meant "the battery
          is fine, now go and check the other nine on two other tabs". They are
          all banded from the same `gauges.ts`, so they can all be here: the
          question a standing readout answers is "is any of it wrong", and one
          amber cell out of ten answers it in the time it takes to look. */}
      <div className="strip" aria-label="Ship and life metrics">
        {metrics.map((m) => (
          <Mini key={m.name} label={m.label} name={m.name} gauge={m.gauge} />
        ))}
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

      {/* The ppm-and-degrees line that used to sit here is gone with the
          strip's arrival. It was two of the ten metrics, picked because they
          were the two that could hurt somebody and given a figure apiece up
          here for want of anywhere better; CO₂ and TEMP are banded in the
          strip now, which says the same thing in less room and about all ten.
          The thermal margin the line also carried is on the Life tab, beside
          the gauge it explains. */}

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
