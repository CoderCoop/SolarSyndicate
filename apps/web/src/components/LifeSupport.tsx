/**
 * The five resource networks. Design doc §3.2, §1 pillar 1.
 *
 * Every gauge here answers "how long have I got, and what would change it".
 * A number without a horizon is decoration; the horizon is what turns a
 * reading into a decision.
 */
import { formatDuration, type LifeSupportView, type LifeStatus } from '@solsyn/sim'
import { DAY } from '@solsyn/sim'

function Days({ days }: { days: number }) {
  if (!Number.isFinite(days)) return <span className="gauge-row__horizon">holding</span>
  return <span className="gauge-row__horizon">{formatDuration(days * DAY)} left</span>
}

function Row({
  label,
  value,
  detail,
  status = 'nominal',
  fill,
  horizon,
}: {
  label: string
  value: string
  detail?: string
  status?: LifeStatus
  fill?: number
  horizon?: React.ReactNode
}) {
  return (
    <li className={`gauge-row gauge-row--${status}`}>
      <div className="gauge-row__head">
        <span className="gauge-row__label">{label}</span>
        <span className="gauge-row__value">{value}</span>
      </div>
      {fill !== undefined && (
        <div className="gauge-row__bar">
          <div
            className="gauge-row__fill"
            style={{ width: `${Math.max(0, Math.min(100, fill * 100))}%` }}
          />
        </div>
      )}
      <div className="gauge-row__foot">
        {detail && <span className="gauge-row__detail">{detail}</span>}
        {horizon}
      </div>
    </li>
  )
}

export function LifeSupport({ life }: { life: LifeSupportView }) {
  return (
    <section className="panel" aria-label="Life support">
      <h2 className="panel__title">Life Support</h2>

      <ul className="gauges">
        <Row
          label="Cabin CO2"
          value={`${Math.round(life.co2Ppm).toLocaleString()} ppm`}
          status={life.co2Status}
          fill={life.co2Ppm / 15000}
          detail={
            life.co2Status === 'nominal'
              ? 'Scrubbers keeping ahead'
              : life.co2Status === 'watch'
                ? 'Above the comfortable limit — crew are slowing down'
                : 'Dangerous. The scrubbers are not keeping up'
          }
        />

        <Row
          label="Cabin temperature"
          value={`${life.temperatureC.toFixed(1)} °C`}
          status={life.tempStatus}
          fill={(life.temperatureC - 21) / 30}
          detail={`${life.heatInKw.toFixed(1)} kW in, ${life.heatRejectKw.toFixed(1)} kW rejected`}
          horizon={
            <span className={`gauge-row__horizon ${life.heatMarginKw < 0 ? 'is-bad' : ''}`}>
              {life.heatMarginKw >= 0
                ? `${life.heatMarginKw.toFixed(1)} kW margin`
                : `${(-life.heatMarginKw).toFixed(1)} kW over`}
            </span>
          }
        />

        <Row
          label="Oxygen"
          value={`${life.o2Kg.toFixed(1)} kg`}
          fill={life.o2Kg / 90}
          horizon={<Days days={life.o2Days} />}
        />

        <Row
          label="Water"
          value={`${life.waterKg.toFixed(0)} kg`}
          fill={life.waterKg / 900}
          detail={
            life.recycleFraction > 0
              ? `${(life.recycleFraction * 100).toFixed(1)}% loop closure`
              : 'Recycler down — open loop'
          }
          status={life.recycleFraction > 0 ? 'nominal' : 'critical'}
          horizon={<Days days={life.waterDays} />}
        />

        <Row
          label="Food"
          value={`${life.foodKg.toFixed(0)} kg`}
          fill={life.foodKg / 620}
          horizon={<Days days={life.foodDays} />}
        />

        <Row
          label="Propellant"
          value={`${(life.propellantKg / 1000).toFixed(1)} t`}
          fill={life.propellantKg / 18000}
          detail="No consumers until the ship can leave — M2"
        />

        <Row label="Spares" value={`${Math.floor(life.spares)}`} fill={life.spares / 60} />
      </ul>

      {life.docked && (
        <p className="panel__note">
          Alongside at the Local. Station services are topping up stores, so the consumable
          clocks only start once the ship casts off.
        </p>
      )}
    </section>
  )
}
