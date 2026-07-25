import { useEffect } from 'react'
import { powerView, recentLog, roomViews } from '@solsyn/sim'
import { AwayReport } from './components/AwayReport.js'
import { DispatchLog } from './components/DispatchLog.js'
import { ShipViewport } from './components/ShipViewport.js'
import { StatusBar } from './components/StatusBar.js'
import { installLifecycleHandlers, useGame } from './store.js'

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
  const rooms = roomViews(state)

  return (
    <div className="app">
      <StatusBar now={state.now} power={power} />

      <main className="app__main">
        <ShipViewport
          shipName={state.ship.name}
          className={state.ship.className}
          rooms={rooms}
          power={power}
          openRoomId={openRoomId}
          onSelectRoom={setOpenRoom}
          onTogglePart={(partId, enabled) =>
            dispatch({ kind: 'SET_PART_ENABLED', partId, enabled })
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

        <DispatchLog entries={recentLog(state, 40)} />

        <footer className="app__footer">
          <p className="app__milestone">
            M0 — walking skeleton. One resource network of five, no crew, no travel.
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
