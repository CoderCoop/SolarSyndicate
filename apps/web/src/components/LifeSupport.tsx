/**
 * The five resource networks. Design doc §3.2, §1 pillar 1.
 *
 * Every gauge here answers "how long have I got, and what would change it".
 * A number without a horizon is decoration; the horizon is what turns a
 * reading into a decision.
 */
import { useState } from 'react'
import { STORES } from '@solsyn/data'
import {
  channelSides,
  formatDuration,
  statusFor,
  type FlowChannel,
  type FlowNode,
  type Gauge,
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

/**
 * The track, with its ranges on it. Design doc §3.2.
 *
 * A coloured bar says whether the reading is all right *now*. The ranges say
 * how much room is left before it stops being — which is the difference
 * between a warning light and an instrument, and it is what lets a player
 * decide whether to act this watch or next week.
 *
 * A store's bands move as consumption does, and that is worth watching rather
 * than a defect: the same 300 kg of water is comfortable with four aboard and
 * thin with eight, and a fixed mark would say the same thing in both.
 */
function Track({ gauge, label }: { gauge: Gauge; label: string }) {
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

function Row({
  label,
  value,
  detail,
  status = 'nominal',
  gauge,
  horizon,
  channel,
}: {
  label: string
  value: string
  detail?: string
  status?: LifeStatus
  gauge?: Gauge
  horizon?: React.ReactNode
  channel?: FlowChannel
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
      <Supply channel={channel} />
    </li>
  )
}

/**
 * How much longer work takes, at a given capacity.
 *
 * The inverse is the actionable form. "Working at 64%" is a number about
 * people; "every job takes half as long again" is a number about the schedule,
 * and the schedule is what the player is deciding about.
 */
function slowdown(capacity: number): string {
  if (capacity <= 0) return 'no work at all'
  const longer = Math.round((1 / capacity - 1) * 100)
  if (longer <= 0) return 'no effect on work'
  return `jobs take ${longer}% longer`
}

/**
 * What the air is doing to the people in it. Design doc §3.2, §7.4.
 *
 * The gauges below say what the numbers are. This says what they *mean* for
 * the crew, in the clinical stage the real limits are written in -- because
 * "8,400 ppm" is only actionable if you happen to know that OSHA's ceiling is
 * 5,000 and NIOSH calls 40,000 immediately dangerous to life.
 *
 * ## What counts as worth saying
 *
 * Only what is actually hurting somebody. This used to raise a coloured panel
 * for every non-nominal reading, which meant a working ship carried a standing
 * warning: 1,567 ppm is "stuffy", costs four per cent of a work rate and no
 * health at all, and it is where a healthy cabin *sits*. An alarm that is
 * always on is not an alarm, and it was teaching the player to look past the
 * one place the game promises to foreshadow a death (§7.4).
 *
 * The threshold is the same `statusFor` the gauge bands use, so the strip and
 * the bar cannot disagree about whether something is wrong -- a red panel over
 * seven green gauges would be the worse version of this bug.
 *
 * What is below it is not hidden, only demoted: the quiet line still says what
 * the crew are working at when it is not 100%, because a player who notices
 * jobs running slow deserves the reason without an alarm being faked to give
 * it to them.
 *
 * ## Saying how much
 *
 * Every effect shown is quantified twice over: what it costs the schedule, and
 * what it costs the people. Capacity is stated as how much longer work takes,
 * which is the form a decision gets made in.
 */
function Crew({ life }: { life: LifeSupportView }) {
  const env = life.environment
  const failing = life.casualties.filter((c) => !c.dead && Number.isFinite(c.secondsLeft))
  const lost = life.casualties.filter((c) => c.dead)

  // Anything past the green band -- the same line the gauges are drawn at.
  const harming = env.exposures.filter((e) => statusFor(e.severity) !== 'nominal')
  const drag = Math.round((1 - env.capacity) * 100)

  if (harming.length === 0 && lost.length === 0) {
    return (
      <p className="panel__note vitals vitals--nominal">
        Nothing aboard is harming the crew.{' '}
        {drag > 0 ? (
          <>
            The air is a little close, so they are working at{' '}
            {Math.round(env.capacity * 100)}% and jobs take about {drag}% longer — but nobody
            is losing health for it.
          </>
        ) : (
          <>The air is clean and the cabin is comfortable.</>
        )}
      </p>
    )
  }

  return (
    <div className={`vitals vitals--${env.severity}`}>
      <ul className="vitals__list">
        {harming.map((e) => (
          <li key={e.hazard} className={`vital vital--${e.severity}`}>
            <span className="vital__reading">{e.reading}</span>
            <span className="vital__label">{e.label}</span>
            <span className="vital__effect">
              {slowdown(e.capacity)}
              {e.healthPerDay < 0 && ` · ${e.healthPerDay.toFixed(0)} health a day`}
            </span>
          </li>
        ))}
      </ul>

      {/* What it comes to together. Capacities multiply and health costs add,
          so two hazards are worse than the worse of them — and the total is
          what the sim is actually applying, minor effects included. */}
      {(harming.length > 1 || drag > 0) && (
        <p className="vitals__total">
          Altogether the crew work at {Math.round(env.capacity * 100)}% —{' '}
          {slowdown(env.capacity)}
          {env.healthPerDay < 0 && `, and lose ${(-env.healthPerDay).toFixed(0)} health a day`}.
        </p>
      )}

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
  resupply,
  onSetResupply,
}: {
  life: LifeSupportView
  channels: FlowChannel[]
  /** Whether station services are topping the stores up (§7.3). */
  resupply: boolean
  onSetResupply: (on: boolean) => void
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
          status={life.gauges.co2.status}
          gauge={life.gauges.co2}
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
          status={life.gauges.temp.status}
          gauge={life.gauges.temp}
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
          status={life.gauges.o2.status}
          gauge={life.gauges.o2}
          /* Partial pressure alongside the tank reading: the mass is what you
             buy, the kPa is what a body responds to. Sea level is 21.2. */
          detail={`${life.o2KPa.toFixed(1)} kPa partial pressure`}
          horizon={<Days days={life.o2Days} />}
        />

        <Row
          label="Water"
          channel={by.get('Water')}
          value={`${life.waterKg.toFixed(0)} kg`}
          gauge={life.gauges.water}
          detail={
            life.recycleFraction > 0
              ? `${(life.recycleFraction * 100).toFixed(1)}% loop closure`
              : 'Recycler down — open loop'
          }
          status={life.gauges.water.status}
          horizon={<Days days={life.waterDays} />}
        />

        <Row
          label="Food"
          channel={by.get('Food')}
          value={`${life.foodKg.toFixed(0)} kg`}
          status={life.gauges.food.status}
          gauge={life.gauges.food}
          horizon={<Days days={life.foodDays} />}
        />

        <Row
          label="Propellant"
          channel={by.get('Propellant')}
          value={`${(life.propellantKg / 1000).toFixed(1)} t`}
          status={life.gauges.propellant.status}
          gauge={life.gauges.propellant}
          detail="A budget, not a rate — this empties during a burn and at no other time"
        />

        <Row
          label="Spares"
          channel={by.get('Spares')}
          value={`${Math.floor(life.spares)}`}
          status={life.gauges.spares.status}
          gauge={life.gauges.spares}
        />
      </ul>

      {/*
        The standing order that decides whether five of these gauges are
        filling at all (§7.3). It lives here rather than with the work orders
        because this is the screen where a player watches it happen -- and
        because a top-up nothing on screen mentions is indistinguishable from a
        bug, which is what it was until now.
      */}
      <div className="standing">
        <button
          type="button"
          className="standing__toggle switch"
          role="switch"
          aria-checked={resupply}
          onClick={() => onSetResupply(!resupply)}
        >
          <span className="switch__track">
            <span className="switch__thumb" />
          </span>
          <span className="standing__label">Take on stores while alongside</span>
        </button>
        <p className="panel__note standing__note">
          {resupply ? (
            <>
              Water, food, oxygen, spares and propellant top up on their own at any berth, and
              the dispatch log says what came aboard when you cast off.{' '}
              {life.docked
                ? 'The consumable clocks only start once the ship leaves.'
                : 'Under way there is nobody to take them from, so the clocks are running.'}
            </>
          ) : (
            <>
              Off. The stores hold where they are, even alongside — the tanks are yours to
              fill when you choose to.
            </>
          )}
        </p>
      </div>

      <p className="panel__note">
        The bands on each bar are where the reading stops being all right. For anything the
        crew breathe or sit in they come from what it does to a person — amber where health
        starts costing, red where it costs fast, which puts the carbon dioxide marks on
        OSHA's 5,000 ppm and NIOSH's 10,000. For a store they come from how long it lasts:
        amber inside {STORES.watchDays} days, red inside {STORES.criticalDays}, and they move
        as consumption does, so the same tank is comfortable with four aboard and thin with
        eight.
      </p>

      <p className="panel__note">
        Under each gauge: what puts it in and what takes it out, biggest first, with anything
        switched off at the end. The Flows tab draws the same figures as a diagram, with the
        loops and the what-ifs.
      </p>
    </section>
  )
}
