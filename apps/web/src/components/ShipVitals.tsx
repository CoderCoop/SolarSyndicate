/**
 * The ship's four headline numbers, as gauges. Design doc §3.2, §3.3.
 *
 * The Life tab has answered "is this all right" at a glance since it got its
 * bands; the ship's own numbers had not. The bank was a bar with no marks on
 * it, so 18 kWh looked the same at either end of a crossing. The balance was a
 * signed figure, and whether +1.4 kW is comfortable depends entirely on what
 * the ship draws. The tank was a tonnage. The state of the machinery was not
 * on this tab at all — it lived four taps down, one part at a time, so a ship
 * quietly wearing out looked exactly like a ship in good order.
 *
 * Four rows, in the order they go wrong: the bank empties in hours, the
 * balance is what empties it, the tank decides where she can go next, and the
 * machinery is the slow one that decides whether any of it keeps working.
 *
 * Every band comes from `gauges.ts` — the same instrument the Life tab reads,
 * with its thresholds in `packages/data` where the rest of the balance is.
 */
import { formatDuration, type PowerView, type ShipVitalsView } from '@solsyn/sim'
import { GaugeRow } from './Gauges.js'

export function ShipVitals({ power, vitals }: { power: PowerView; vitals: ShipVitalsView }) {
  const deficit = power.netKw < 0

  // What the bank is doing, in the form the decision gets made in: a clock.
  // "Battery holding" is not a hedge -- a ship in balance genuinely has no
  // horizon, and saying "∞ to empty" would be a worse way to put it.
  let bank = 'Holding — nothing is drawing it down'
  if (power.boundKind === 'empty') bank = `${formatDuration(power.secondsToBound)} to empty`
  else if (power.boundKind === 'full') bank = `${formatDuration(power.secondsToBound)} to full`
  else if (power.batteryFraction >= 0.999) bank = 'Full'

  return (
    <section className="panel" aria-label="Ship vitals">
      <h2 className="panel__title">Vitals</h2>

      <ul className="gauges">
        <GaugeRow
          label="Battery"
          value={`${power.batteryKwh.toFixed(1)} kWh`}
          status={vitals.battery.status}
          gauge={vitals.battery}
          detail={`of ${power.batteryCapacityKwh.toFixed(0)} kWh in the bank`}
          horizon={
            <span className={`gauge-row__horizon ${deficit ? 'is-bad' : ''}`}>{bank}</span>
          }
        />

        <GaugeRow
          label="Power balance"
          value={`${power.netKw > 0 ? '+' : ''}${power.netKw.toFixed(1)} kW`}
          status={vitals.power.status}
          gauge={vitals.power}
          detail={`${power.productionKw.toFixed(1)} kW made, ${power.demandKw.toFixed(1)} kW drawn`}
          horizon={
            <span className={`gauge-row__horizon ${deficit ? 'is-bad' : ''}`}>
              {power.brownout
                ? 'Loads shed'
                : deficit
                  ? 'Running off the bank'
                  : 'Making more than she uses'}
            </span>
          }
        />

        <GaugeRow
          label="Propellant"
          value={`${(vitals.propellantKg / 1000).toFixed(1)} t`}
          status={vitals.propellant.status}
          gauge={vitals.propellant}
          detail={`of ${(vitals.propellantCapacityKg / 1000).toFixed(0)} t, keeping ${(
            vitals.propellantReserveKg / 1000
          ).toFixed(1)} t the astrogator will not spend`}
        />

        <GaugeRow
          label="Condition"
          value={`${Math.round(vitals.conditionPct)}%`}
          status={vitals.condition.status}
          gauge={vitals.condition}
          detail="Mean across every system aboard — the figure a yard would survey"
          horizon={
            vitals.brokenCount > 0 ? (
              <span className="gauge-row__horizon is-bad">
                {vitals.brokenCount} failed
              </span>
            ) : undefined
          }
        />
      </ul>

      <p className="panel__note">
        The bands are where each reading stops being all right. The bank is banded by the
        hours of discharge left in it, and by whether it has room to absorb anything switching
        on. The balance is red at any deficit at all, because a deficit is the ship paying the
        difference out of that bank and it ends in a brownout. Condition sits on the rungs of
        the failure ladder — amber where the next threshold a part crosses can break it.
      </p>
    </section>
  )
}
