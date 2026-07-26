import { useEffect, useState } from 'react'
import {
  activeContract,
  chartView,
  contractBoard,
  crewViews,
  flowChannels,
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
  transferOptions,
  voyageView,
  workOrderViews,
} from '@solsyn/sim'
import { AwayReport } from './components/AwayReport.js'
import { CrewPanel } from './components/CrewPanel.js'
import { DispatchLog } from './components/DispatchLog.js'
import { Flows } from './components/Flows.js'
import { Help, SITE_URL } from './components/Help.js'
import { GuildPanel, HiringHall } from './components/Hall.js'
import { InstallBanner } from './components/InstallOffer.js'
import { Mission } from './components/Mission.js'
import { StarChart } from './components/StarChart.js'
import { LifeSupport } from './components/LifeSupport.js'
import { ShipViewport } from './components/ShipViewport.js'
import { StatusBar } from './components/StatusBar.js'
import { WorkOrders } from './components/WorkOrders.js'
import { discardWorld, reinstallApp } from './recover.js'
import { installLifecycleHandlers, useGame } from './store.js'

type Tab = 'ship' | 'mission' | 'chart' | 'flows' | 'life' | 'crew' | 'log' | 'help'

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
  { id: 'log', label: 'Log' },
  { id: 'help', label: 'Help' },
]

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
  const life = lifeSupportView(state)
  const rooms = roomViews(state)
  const crew = crewViews(state)
  const orders = workOrderViews(state)
  const channels = flowChannels(state)
  const chart = chartView(state)
  const ledger = ledgerView(state)
  const board = contractBoard(state)
  const active = activeContract(state)
  const options = transferOptions(state)
  const voyage = voyageView(state)
  const settlement = lastSettlement(state)
  const hullOffers = shipyardOffers(state)
  const guilds = guildViews(state)
  const candidates = hiringHall(state)
  const crewBerths = berths(state)
  const payroll = dailyWagesCr(state)
  const brokenCount = state.ship.parts.filter((p) => p.broken).length

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
      <StatusBar now={state.now} power={power} life={life} brokenCount={brokenCount} />

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
            {t.id === 'crew' && orders.length > 0 && <span className="tabs__count">{orders.length}</span>}
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
              <div className="recover">
                <p className="recover__text">
                  Shed loads are still offline. Restoring them without fixing the balance will
                  simply drain the bank again.
                </p>
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => dispatch({ kind: 'RESET_BROWNOUT' })}
                >
                  Restore shed loads
                </button>
              </div>
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

        {tab === 'flows' && <Flows channels={channels} />}

        {tab === 'life' && <LifeSupport life={life} />}

        {tab === 'crew' && (
          <>
            <CrewPanel
              crew={crew}
              nowHour={((state.now % 86400) + 86400) % 86400 / 3600}
              onSetWatch={(crewId, watch) => dispatch({ kind: 'SET_CREW_WATCH', crewId, watch })}
            />
            <WorkOrders
              orders={orders}
              onCancel={(workOrderId) => dispatch({ kind: 'CANCEL_WORK_ORDER', workOrderId })}
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
