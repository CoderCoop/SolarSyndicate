import { useEffect, useState } from 'react'
import {
  crewViews,
  lifeSupportView,
  powerView,
  recentLog,
  roomViews,
  workOrderViews,
} from '@solsyn/sim'
import { AwayReport } from './components/AwayReport.js'
import { CrewPanel } from './components/CrewPanel.js'
import { DispatchLog } from './components/DispatchLog.js'
import { LifeSupport } from './components/LifeSupport.js'
import { ShipViewport } from './components/ShipViewport.js'
import { StatusBar } from './components/StatusBar.js'
import { WorkOrders } from './components/WorkOrders.js'
import { installLifecycleHandlers, useGame } from './store.js'

type Tab = 'ship' | 'life' | 'crew' | 'log'

const TABS: { id: Tab; label: string }[] = [
  { id: 'ship', label: 'Ship' },
  { id: 'life', label: 'Life' },
  { id: 'crew', label: 'Crew' },
  { id: 'log', label: 'Log' },
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

  useEffect(() => {
    void init()
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
        <p>Reading the Local's books…</p>
      </div>
    )
  }

  const power = powerView(state)
  const life = lifeSupportView(state)
  const rooms = roomViews(state)
  const crew = crewViews(state)
  const orders = workOrderViews(state)
  const brokenCount = state.ship.parts.filter((p) => p.broken).length

  return (
    <div className="app">
      <StatusBar now={state.now} power={power} life={life} brokenCount={brokenCount} />

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

        {tab === 'life' && <LifeSupport life={life} />}

        {tab === 'crew' && (
          <>
            <CrewPanel
              crew={crew}
              onSetWatch={(crewId, watch) => dispatch({ kind: 'SET_CREW_WATCH', crewId, watch })}
            />
            <WorkOrders
              orders={orders}
              onCancel={(workOrderId) => dispatch({ kind: 'CANCEL_WORK_ORDER', workOrderId })}
            />
          </>
        )}

        {tab === 'log' && <DispatchLog entries={recentLog(state, 60)} />}

        <footer className="app__footer">
          <p className="app__milestone">
            M1 — the living ship. Five resource networks, wear and failure, work orders, four
            crew on a watch bill. No travel, no missions, no guilds yet.
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
