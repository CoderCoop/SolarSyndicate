import { useEffect, useRef, useState } from 'react'
import {
  AUTO_SERVICE_CONDITION,
  activeContract,
  emergencyView,
  TIME_SCALE,
  chartView,
  contractBoard,
  crewViews,
  flowChannels,
  flowGraph,
  lastSettlement,
  ledgerView,
  berths,
  dailyWagesCr,
  guildViews,
  hiringHall,
  shipyardOffers,
  lifeSupportView,
  powerView,
  recentLog,
  roomViews,
  shipVitals,
  transferOptions,
  voyageView,
  whereabouts,
  workOrderViews,
  type PowerView,
  type RoomView,
} from '@solsyn/sim'
import { AwayReport } from './components/AwayReport.js'
import { CrewPanel } from './components/CrewPanel.js'
import { DispatchLog } from './components/DispatchLog.js'
import { EmergencyBanner } from './components/EmergencyBanner.js'
import { Flows } from './components/Flows.js'
import { FlowGraph } from './components/FlowGraph.js'
import { Help, SITE_URL } from './components/Help.js'
import { GuildPanel, HiringHall } from './components/Hall.js'
import { InstallBanner } from './components/InstallOffer.js'
import { Mission } from './components/Mission.js'
import { StarChart } from './components/StarChart.js'
import { LifeSupport } from './components/LifeSupport.js'
import { ShipViewport } from './components/ShipViewport.js'
import { StatusBar } from './components/StatusBar.js'
import { Assignments, WorkOrders } from './components/WorkOrders.js'
import { discardWorld, reinstallApp } from './recover.js'
import { installLifecycleHandlers, useGame } from './store.js'

type Tab = 'ship' | 'mission' | 'chart' | 'flows' | 'life' | 'crew' | 'work' | 'log' | 'help'

/**
 * How long the boot screen waits before offering a way out of itself.
 *
 * Long enough that a cold start on a slow phone never sees it -- loading a save
 * and catching a decade up is measured in hundreds of milliseconds -- and short
 * enough that somebody staring at a screen that will never change is not left
 * guessing.
 */
const BOOT_PATIENCE_MS = 6000

const TABS: { id: Tab; label: string }[] = [
  { id: 'ship', label: 'Ship' },
  { id: 'mission', label: 'Mission' },
  { id: 'chart', label: 'Chart' },
  { id: 'flows', label: 'Flows' },
  { id: 'life', label: 'Life' },
  { id: 'crew', label: 'Crew' },
  { id: 'work', label: 'Work' },
  { id: 'log', label: 'Log' },
  { id: 'help', label: 'Help' },
]

/**
 * A game clock that runs between the 1 Hz ticks. Design doc §8.5, §8.1.
 *
 * `state.now` moves once a second, which at 720x is twelve game minutes a step.
 * That is invisible for a planet and hopeless for a station: Gateway's orbit is
 * 92.6 minutes, so its berth jumped forty-seven degrees a frame and read as a
 * fault rather than as a low orbit.
 *
 * What this returns is a *time*, not a position. Every position in the sim is a
 * closed-form function of time, so evaluating at 03:41:07.35 gives the truth at
 * 03:41:07.35 -- there is no interpolation anywhere and nothing is smoothed
 * toward anything. Lerping between two drawn frames would have been easier and
 * would have put the ship somewhere she is not, which is the whole thing the
 * plate exists not to do.
 *
 * Re-anchored on every tick rather than free-running, so it can never drift
 * away from the simulation it is drawing.
 */
function useAnimatedNow(now: number, running: boolean): number {
  const [display, setDisplay] = useState(now)
  const anchor = useRef({ sim: now, wall: 0 })

  useEffect(() => {
    anchor.current = { sim: now, wall: performance.now() }
    if (!running) setDisplay(now)
  }, [now, running])

  useEffect(() => {
    if (!running) return
    let frame = 0
    const step = () => {
      const { sim, wall } = anchor.current
      setDisplay(sim + ((performance.now() - wall) / 1000) * TIME_SCALE)
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [running])

  return running ? display : now
}

export function App() {
  const state = useGame((s) => s.state)
  const status = useGame((s) => s.status)
  const awayReport = useGame((s) => s.awayReport)
  const openRoomId = useGame((s) => s.openRoomId)
  const init = useGame((s) => s.init)
  const tick = useGame((s) => s.tick)
  const dispatch = useGame((s) => s.dispatch)
  const setOpenRoom = useGame((s) => s.setOpenRoom)
  const dismissAwayReport = useGame((s) => s.dismissAwayReport)
  const resetWorld = useGame((s) => s.resetWorld)

  const [tab, setTab] = useState<Tab>('ship')
  const [bootSlow, setBootSlow] = useState(false)

  useEffect(() => {
    // Nothing is cancelled and nothing is declared failed -- if the world does
    // arrive at second seven the panel simply goes away with the screen. This
    // only adds a way out for a boot that is never going to finish.
    const id = window.setTimeout(() => setBootSlow(true), BOOT_PATIENCE_MS)
    return () => window.clearTimeout(id)
  }, [])

  useEffect(() => {
    // A rejection here would leave the boot screen up for ever with nothing in
    // the console to say why, which is precisely how a stale save presented
    // itself once. init() handles its own failures; this is the backstop.
    init().catch((err: unknown) => console.error('Boot failed', err))
    return installLifecycleHandlers()
  }, [init])

  useEffect(() => {
    // §8.5: 1 Hz cosmetic tick. The sim is event-driven and does not need
    // frames; this only refreshes what the player is looking at.
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [tick])

  useEffect(() => {
    // A new section starts at its top. This only became a question when the
    // tab strip froze: before, the strip left the screen on the way down, so
    // reaching it meant scrolling back up and every section opened at its head
    // by accident. Now a tab can be tapped from the bottom of a cross-section,
    // and without this the Chart would open scrolled a thousand pixels into a
    // screen the player has never seen -- which reads as a broken tab rather
    // than as a preserved scroll position.
    window.scrollTo(0, 0)
  }, [tab])

  // And a smooth clock for the one screen that shows things moving fast enough
  // for 1 Hz to stutter. Only while the chart is up: nothing else on the ship
  // changes quickly enough to be worth a frame budget.
  const animatedNow = useAnimatedNow(state?.now ?? 0, tab === 'chart')

  if (status === 'loading' || !state) {
    return (
      <div className="boot">
        <p className="boot__line">Reading the Local's books…</p>

        {bootSlow && (
          <section className="boot__stuck" aria-label="Recovery">
            <h2 className="boot__title">This is taking longer than it should.</h2>
            <p className="boot__why">
              Two things can hold it up here, and each has its own way out. Neither touches
              anything but this browser.
            </p>
            <button
              type="button"
              className="button button--primary boot__button"
              onClick={() => void discardWorld()}
            >
              Start a new world
            </button>
            <p className="boot__note">
              Discards the saved ship. Use this if the game was working and stopped after an
              update.
            </p>
            <button
              type="button"
              className="button boot__button"
              onClick={() => void reinstallApp()}
            >
              Fetch the game again
            </button>
            <p className="boot__note">
              Keeps the ship, drops the copy of the game stored for offline play and pulls a
              fresh one. Use this if the same fault survives everything else.
            </p>
          </section>
        )}
      </div>
    )
  }

  const power = powerView(state)
  const vitals = shipVitals(state)
  const life = lifeSupportView(state)
  const rooms = roomViews(state)
  const crew = crewViews(state)
  const orders = workOrderViews(state)
  const channels = flowChannels(state)
  const graph = flowGraph(state)
  // Drawn on a clock that runs between ticks. The cosmetic tick is 1 Hz, which
  // at 720x is twelve game minutes a frame -- and Gateway goes round the Earth
  // in 92.6 of them, so the berth jumped forty-seven degrees a step and read as
  // a fault rather than as a fast orbit.
  //
  // Nothing is interpolated, which is the point: every position in this sim is
  // a closed-form function of time, so asking for the position at 03:41:07.35
  // is asking for the truth at 03:41:07.35 rather than for a guess between two
  // samples. Smoothing a drawing by lerping between frames is exactly the kind
  // of plausible-looking lie the plate is supposed not to tell.
  const chart = chartView(tab === 'chart' ? { ...state, now: animatedNow } : state)
  const ledger = ledgerView(state)
  const board = contractBoard(state)
  const active = activeContract(state)
  const options = transferOptions(state)
  const voyage = voyageView(state)
  const where = whereabouts(state)
  const settlement = lastSettlement(state)
  const hullOffers = shipyardOffers(state)
  const guilds = guildViews(state)
  const candidates = hiringHall(state)
  const crewBerths = berths(state)
  const payroll = dailyWagesCr(state)
  const brokenCount = state.ship.parts.filter((p) => p.broken).length
  const emergency = emergencyView(state)

  // The Mission tab is where the only timed decision in the game lives, so the
  // nav says when it wants attention: work on offer, or a deadline running.
  const missionBadge = state.ship.docked
    ? active
      ? `${Math.max(0, Math.ceil(active.daysRemaining))}d`
      : board.length > 0
        ? String(board.length)
        : undefined
    : undefined

  return (
    <div className="app">
      <StatusBar
        now={state.now}
        power={power}
        vitals={vitals}
        life={life}
        ledger={ledger}
        brokenCount={brokenCount}
        where={where}
      />

      {/* Above the install offer and above the tabs: an acute emergency is the
          one thing that should interrupt whatever the player came here to do,
          and §7.4 says the window has to actually reach them. */}
      {emergency && (
        <EmergencyBanner
          emergency={emergency}
          onAnswer={() => dispatch({ kind: 'ANSWER_EMERGENCY' })}
          onStandDown={() => dispatch({ kind: 'STAND_DOWN' })}
        />
      )}

      {/* Under the status bar, never over it: the offer must not cover a gauge
          the player is watching. */}
      <InstallBanner />

      <nav className="tabs" aria-label="Sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tabs__btn ${tab === t.id ? 'is-on' : ''}`}
            aria-current={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === 'ship' && brokenCount > 0 && <span className="tabs__dot" />}
            {t.id === 'mission' && missionBadge && <span className="tabs__count">{missionBadge}</span>}
            {t.id === 'work' && orders.length > 0 && <span className="tabs__count">{orders.length}</span>}
          </button>
        ))}
      </nav>

      <main className="app__main">
        {tab === 'ship' && (
          <>
            <ShipViewport
              shipName={state.ship.name}
              className={state.ship.className}
              rooms={rooms}
              crew={crew}
              power={power}
              vitals={vitals}
              openRoomId={openRoomId}
              onSelectRoom={setOpenRoom}
              onTogglePart={(partId, enabled) =>
                dispatch({ kind: 'SET_PART_ENABLED', partId, enabled })
              }
              onOrderWork={(partId, orderKind) =>
                dispatch({ kind: 'QUEUE_WORK_ORDER', partId, orderKind })
              }
            />

            {power.brownout && (
              <Brownout
                rooms={rooms}
                power={power}
                onRestore={() => dispatch({ kind: 'RESET_BROWNOUT' })}
              />
            )}
          </>
        )}

        {tab === 'mission' && (
          <Mission
            ledger={ledger}
            board={board}
            active={active}
            options={options}
            voyage={voyage}
            settlement={settlement}
            portId={state.ship.portId}
            docked={state.ship.docked}
            hullOffers={hullOffers}
            onPurchase={(hullId) => dispatch({ kind: 'PURCHASE_HULL', hullId })}
            onAccept={(contractId) => dispatch({ kind: 'ACCEPT_CONTRACT', contractId })}
            onAbandon={() => dispatch({ kind: 'ABANDON_CONTRACT' })}
            onDepart={(optionId) => dispatch({ kind: 'DEPART', optionId })}
          />
        )}

        {tab === 'chart' && <StarChart chart={chart} />}

        {tab === 'flows' && (
          <>
            <FlowGraph
              graph={graph}
              onOpenPart={(partId) => {
                const room = rooms.find((r) => r.parts.some((p) => p.id === partId))
                if (room) setOpenRoom(room.id)
                setTab('ship')
              }}
            />
            <Flows channels={channels} />
          </>
        )}

        {tab === 'life' && (
          <LifeSupport
            life={life}
            channels={channels}
            resupply={state.ship.standingOrders.resupply}
            onSetResupply={(on) =>
              dispatch({ kind: 'SET_STANDING_ORDER', order: 'resupply', on })
            }
          />
        )}

        {tab === 'crew' && (
          <>
            <CrewPanel
              crew={crew}
              nowHour={((state.now % 86400) + 86400) % 86400 / 3600}
              onSetWatch={(crewId, watch) => dispatch({ kind: 'SET_CREW_WATCH', crewId, watch })}
            />
            <HiringHall
              candidates={candidates}
              berths={crewBerths}
              dailyWagesCr={payroll}
              portId={state.ship.portId}
              docked={state.ship.docked}
              onHire={(crewId) => dispatch({ kind: 'HIRE_CREW', crewId })}
            />
            <GuildPanel guilds={guilds} />
          </>
        )}

        {tab === 'work' && (
          <>
            <WorkOrders
              orders={orders}
              autoService={state.ship.standingOrders.autoService}
              autoServiceAt={AUTO_SERVICE_CONDITION}
              onCancel={(workOrderId) => dispatch({ kind: 'CANCEL_WORK_ORDER', workOrderId })}
              onMove={(workOrderId, direction) =>
                dispatch({ kind: 'MOVE_WORK_ORDER', workOrderId, direction })
              }
              onSetAutoService={(on) =>
                dispatch({ kind: 'SET_STANDING_ORDER', order: 'autoService', on })
              }
            />
            <Assignments crew={crew} orders={orders} />
          </>
        )}

        {tab === 'log' && <DispatchLog entries={recentLog(state, 60)} />}

        {tab === 'help' && <Help />}

        <footer className="app__footer">
          <p className="app__milestone">
            M3 begins — guilds and hiring. Standing with four guilds, a hall to hire from,
            berths that limit the crew, and wages drawn every day. Before that, M2 — the ship
            goes somewhere. Contracts with a stated resupply allowance, real
            transfer orbits, and books that settle on arrival: efficiency now has a price.
            The Kestrel is a cislunar hauler; the yard at Tranquillity sells the hull that
            reaches Mars. The Belt is still out of reach.
          </p>
          <p className="app__links">
            <a href={SITE_URL} target="_blank" rel="noreferrer">
              Project site &amp; design doc
            </a>
          </p>
          <button type="button" className="button button--quiet" onClick={() => void resetWorld()}>
            Scuttle and start over
          </button>
        </footer>
      </main>

      {awayReport && <AwayReport report={awayReport} onDismiss={dismissAwayReport} />}
    </div>
  )
}

/**
 * After a brownout. Design doc §3.2, §7.4.
 *
 * The ship shed load on its own authority, and this is the panel that explains
 * itself afterwards. It replaced one that said "Shed loads are still offline.
 * Restoring them without fixing the balance will simply drain the bank again",
 * which had three problems: it never said the ship had switched anything off,
 * it never said *which* things, and "fixing the balance" named no number the
 * player could act on. Worse, the only control it offered was the one its own
 * text warned against pressing -- a panel whose single affordance is a mistake.
 *
 * So it states the three things a person actually needs: what happened, what
 * the shed kit costs to run, and what pressing the button would leave them
 * with. The button stays live either way. Restoring into a deficit is a
 * recoverable mistake, not a hazard, and §7.4 says the game does not wall the
 * player off from its own consequences -- it just stops them being a surprise.
 */
function Brownout({
  rooms,
  power,
  onRestore,
}: {
  rooms: RoomView[]
  power: PowerView
  onRestore: () => void
}) {
  const shed = rooms.flatMap((r) => r.parts).filter((p) => p.shed)

  // A shed part contributes nothing while it is off, so its current draw reads
  // as zero. What it *would* cost is the rated figure -- and for a load that is
  // the honest number whatever its condition, because a worn pump does not
  // politely use less electricity (networks.ts, partPowerKw).
  const costKw = shed.reduce((sum, p) => sum + -p.powerKw, 0)
  const afterKw = power.netKw - costKw
  const safe = afterKw >= 0

  const names = shed.map((p) => p.name)
  const listed =
    names.length > 3
      ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`
      : names.length > 1
        ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
        : (names[0] ?? 'several systems')

  // One shed load is the common case on a small ship, and "they draw 14 kW
  // between them" about a single preheater is the kind of wrongness that makes
  // a player stop trusting the rest of the sentence.
  const many = shed.length !== 1
  const it = many ? 'them' : 'it'
  const draws = many ? 'They draw' : 'It draws'
  const between = many ? ' between them' : ''

  return (
    <div className={`recover ${safe ? 'is-safe' : ''}`}>
      <p className="recover__what">
        The power ran out, so the ship switched off <strong>{listed}</strong> by itself to keep
        the critical bus alive.
      </p>
      <p className="recover__text">
        {safe ? (
          <>
            {draws} <strong>{costKw.toFixed(1)} kW</strong>
            {between} and you now have <strong>{power.netKw.toFixed(1)} kW</strong> spare.
            Switching {it} back on leaves <strong>+{afterKw.toFixed(1)} kW</strong> — {it} will
            stay on.
          </>
        ) : (
          <>
            {draws} <strong>{costKw.toFixed(1)} kW</strong>
            {between} and you only have <strong>{power.netKw.toFixed(1)} kW</strong> spare.
            Switching {it} back on now would leave you{' '}
            <strong>{afterKw.toFixed(1)} kW</strong> short, and the ship would shed {it} again as
            soon as the battery emptied. Find {(-afterKw).toFixed(1)} kW first — switch something
            else off, or repair whatever is running down.
          </>
        )}
      </p>
      <button
        type="button"
        className={`button ${safe ? 'button--primary' : ''}`}
        onClick={onRestore}
      >
        Switch {it} back on
      </button>
    </div>
  )
}
