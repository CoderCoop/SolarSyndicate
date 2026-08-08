/**
 * The five resource networks. Design doc §3.2, §1 pillar 1.
 *
 * Every gauge here answers "how long have I got, and what would change it".
 * A number without a horizon is decoration; the horizon is what turns a
 * reading into a decision.
 */
import { useState } from 'react'
import {
  channelSides,
  formatDuration,
  type FlowChannel,
  type FlowNode,
  type LifeSupportView,
  type LifeStatus,
} from '@solsyn/sim'
import { DAY, HOUR } from '@solsyn/sim'

function Days({ days }: { days: number }) {
  if (!Number.isFinite(days)) return <span className="gauge-row__horizon">holding</span>
  return <span className="gauge-row__horizon">{formatDuration(days * DAY)} left</span>
}

/** Contributors named on one gauge before the tail collapses into a count. */
const MAX_NAMED = 3

function magnitude(value: number, unit: string): string {
  if (unit === 'kg/day' && value >= 1000) return `${(value / 1000).toFixed(1)} t/day`
  // Spares are counted, not measured: "1" beside a locker of 21, not "1.00".
  if (unit === '') return `${Math.round(value * 10) / 10}`
  const decimals = value >= 100 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(decimals)} ${unit}`
}

/**
 * One side of a gauge's balance, in words. Design doc §3.2, §1 pillar 1.
 *
 * A level and a horizon say *what* and *when*. They do not say **why**, and
 * why is the only one of the three a player can act on: "47 days of water" is
 * a fact, "the recycler is putting back 19.6 of the 21.5 you use" is a
 * decision about whether to service it.
 *
 * The figures were all here already — `flowChannels` has built one channel per
 * gauge on this tab since spec 004, ranked and summed — and they were only
 * ever drawn one tab along, so reading a gauge meant leaving the gauge. This is
 * the same data, on the screen the question is asked on.
 */
function Side({
  which,
  nodes,
  unit,
}: {
  which: 'in' | 'out'
  nodes: FlowNode[]
  unit: string
}) {
  // The tail opens rather than being a count you cannot act on. Three names is
  // the right default -- on most channels it is the whole story -- but heat has
  // twelve contributors and every part aboard is one of them, so "+8 more"
  // there was hiding most of the answer to the question the panel exists for.
  const [all, setAll] = useState(false)
  if (nodes.length === 0) return null
  const named = all ? nodes : nodes.slice(0, MAX_NAMED)
  const rest = nodes.length - named.length

  return (
    <div className={`supply supply--${which}`}>
      <span className="supply__side">{which}</span>
      <ul className="supply__list">
        {named.map((n) => (
          <li key={n.id} className={`supply__item ${n.idle ? 'is-idle' : ''}`}>
            <span className="supply__name">{n.name}</span>{' '}
            <span className="supply__figure">
              {n.idle ? 'off' : magnitude(n.magnitude, unit)}
            </span>
          </li>
        ))}
        {(rest > 0 || all) && (
          <li className="supply__item">
            <button type="button" className="supply__more" onClick={() => setAll(!all)}>
              {all ? 'fewer' : `+${rest} more`}
            </button>
          </li>
        )}
      </ul>
    </div>
  )
}

/** Both sides of a gauge, when there is a channel behind it. */
function Supply({ channel }: { channel?: FlowChannel }) {
  if (!channel) return null
  const sides = channelSides(channel)
  if (sides.in.length === 0 && sides.out.length === 0) return null

  return (
    <div className="gauge-row__supply">
      <Side which="in" nodes={sides.in} unit={channel.unit} />
      <Side which="out" nodes={sides.out} unit={channel.unit} />
    </div>
  )
}

function Row({
  label,
  value,
  detail,
  status = 'nominal',
  fill,
  horizon,
  channel,
}: {
  label: string
  value: string
  detail?: string
  status?: LifeStatus
  fill?: number
  horizon?: React.ReactNode
  channel?: FlowChannel
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
      <Supply channel={channel} />
    </li>
  )
}

/**
 * What the air is doing to the people in it. Design doc §3.2, §7.4.
 *
 * The gauges below say what the numbers are. This says what they *mean* for
 * the crew, in the clinical stage the real limits are written in -- because
 * "8,400 ppm" is only actionable if you happen to know that OSHA's ceiling is
 * 5,000 and NIOSH calls 40,000 immediately dangerous to life.
 *
 * It also carries §7.4's foreshadowing: when the air is bad enough to hurt
 * somebody, this is where it says who and how long, before it happens.
 */
function Crew({ life }: { life: LifeSupportView }) {
  const env = life.environment
  const failing = life.casualties.filter((c) => !c.dead && Number.isFinite(c.secondsLeft))
  const lost = life.casualties.filter((c) => c.dead)

  if (env.exposures.length === 0 && lost.length === 0) {
    return (
      <p className="panel__note vitals vitals--nominal">
        The air is clean, the cabin is comfortable, and nothing aboard is working against the
        crew.
      </p>
    )
  }

  return (
    <div className={`vitals vitals--${env.severity}`}>
      <ul className="vitals__list">
        {env.exposures.map((e) => (
          <li key={e.hazard} className={`vital vital--${e.severity}`}>
            <span className="vital__reading">{e.reading}</span>
            <span className="vital__label">{e.label}</span>
            <span className="vital__effect">
              {e.capacity <= 0
                ? 'cannot work'
                : `working at ${Math.round(e.capacity * 100)}%`}
              {e.healthPerDay < 0 && ` · ${e.healthPerDay.toFixed(0)} health/day`}
            </span>
          </li>
        ))}
      </ul>

      {env.incapacitating && (
        <p className="vitals__stop">
          Nobody aboard can work in this. Every job in the queue is stopped until the air is
          fixed.
        </p>
      )}

      {/* §7.4: no death without foreshadowing. Health is a reservoir, so the
          moment it runs out is a division -- the game always knows, and so
          should the player, well before it happens. */}
      {failing.length > 0 && (
        <p className="vitals__deadline">
          {/* A crew signed on together shares an atmosphere and usually a
              deadline, and four names against the same figure reads as noise.
              Say it once when it is once. */}
          {failing.every(
            (c) => Math.abs(c.secondsLeft - failing[0]!.secondsLeft) < HOUR,
          )
            ? `At this rate the crew have ${formatDuration(failing[0]!.secondsLeft)}.`
            : `At this rate ${failing
                .slice()
                .sort((a, b) => a.secondsLeft - b.secondsLeft)
                .map((c) => `${c.name} has ${formatDuration(c.secondsLeft)}`)
                .join(', ')}.`}
        </p>
      )}

      {lost.length > 0 && (
        <p className="vitals__lost">
          Lost aboard: {lost.map((c) => c.name).join(', ')}.
        </p>
      )}
    </div>
  )
}

export function LifeSupport({
  life,
  channels,
}: {
  life: LifeSupportView
  channels: FlowChannel[]
}) {
  // Matched on the label the channel already carries, which `flows.ts` keeps
  // identical to the gauge's on purpose ("one channel per gauge on the Life
  // tab"). A gauge with no channel simply shows no breakdown rather than
  // guessing at one.
  const by = new Map(channels.map((c) => [c.label, c]))

  return (
    <section className="panel" aria-label="Life support">
      <h2 className="panel__title">Life Support</h2>

      <Crew life={life} />

      <ul className="gauges">
        <Row
          label="Cabin CO2"
          channel={by.get('Cabin CO2')}
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
          channel={by.get('Cabin temperature')}
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
          channel={by.get('Oxygen')}
          value={`${life.o2Kg.toFixed(1)} kg`}
          fill={life.o2Kg / 90}
          /* Partial pressure alongside the tank reading: the mass is what you
             buy, the kPa is what a body responds to. Sea level is 21.2. */
          detail={`${life.o2KPa.toFixed(1)} kPa partial pressure`}
          horizon={<Days days={life.o2Days} />}
        />

        <Row
          label="Water"
          channel={by.get('Water')}
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
          channel={by.get('Food')}
          value={`${life.foodKg.toFixed(0)} kg`}
          fill={life.foodKg / 620}
          horizon={<Days days={life.foodDays} />}
        />

        <Row
          label="Propellant"
          channel={by.get('Propellant')}
          value={`${(life.propellantKg / 1000).toFixed(1)} t`}
          fill={life.propellantKg / 18000}
          detail="A budget, not a rate — this empties during a burn and at no other time"
        />

        <Row
          label="Spares"
          channel={by.get('Spares')}
          value={`${Math.floor(life.spares)}`}
          fill={life.spares / 60}
        />
      </ul>

      {life.docked && (
        <p className="panel__note">
          Alongside at the Local. Station services are topping up stores, so the consumable
          clocks only start once the ship casts off.
        </p>
      )}

      <p className="panel__note">
        Under each gauge: what puts it in and what takes it out, biggest first, with anything
        switched off at the end. The Flows tab draws the same figures as a diagram, with the
        loops and the what-ifs.
      </p>
    </section>
  )
}
