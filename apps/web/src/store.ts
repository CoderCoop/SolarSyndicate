/**
 * UI state. Design doc §8.1.
 *
 * The sim owns truth. React never mutates SimState -- every player action is a
 * Command handed to the engine, which returns a new state. That discipline is
 * what makes the command log a real save format today and a plausible wire
 * protocol later (§8.4).
 */
import { create } from 'zustand'
import {
  advanceToUtc,
  applyCommand,
  createWorld,
  gameTimeFromUtc,
  type Command,
  type LogEntry,
  type SimState,
} from '@solsyn/sim'
import { appendCommand, loadSave, requestPersistentStorage, saveSnapshot, clearSave } from './persistence.js'

/** What happened while the app was closed. §7.4: "return is a story." */
export interface AwayReport {
  awayRealMs: number
  gameSecondsElapsed: number
  entries: LogEntry[]
}

interface GameStore {
  state: SimState | undefined
  status: 'loading' | 'ready'
  awayReport: AwayReport | undefined
  openRoomId: string | undefined

  init: () => Promise<void>
  dispatch: (command: Command) => void
  tick: () => void
  setOpenRoom: (roomId: string | undefined) => void
  dismissAwayReport: () => void
  resetWorld: () => Promise<void>
}

/** Entries added to the log after `afterSeq`, oldest first. */
function entriesSince(state: SimState, afterSeq: number): LogEntry[] {
  return state.log.filter((e) => e.seq > afterSeq)
}

function newSeed(): number {
  // App layer, so real entropy is fine. The seed then pins everything the sim
  // does from here on.
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0
}

export const useGame = create<GameStore>((set, get) => ({
  state: undefined,
  status: 'loading',
  awayReport: undefined,
  openRoomId: undefined,

  async init() {
    void requestPersistentStorage()

    const now = Date.now()

    let saved
    try {
      saved = await loadSave()
    } catch (err) {
      // Boot is the one place the game cannot afford to be strict. Whatever is
      // wrong with the stored world -- a shape this build cannot read, a
      // corrupt record, a catch-up that throws -- the answer is a playable
      // ship, not a loading screen that never finishes. §7.4 in spirit: the
      // player is never stranded.
      console.error('Could not read the saved world; starting a new one.', err)
      saved = undefined
    }

    if (saved) {
      try {
        // Catch up. Same code path as live play -- there is no separate offline
        // earnings calculation (§7.2).
        const lastSeq = saved.state.log.at(-1)?.seq ?? 0
        const beforeNow = saved.state.now
        const caught = advanceToUtc(saved.state, now)

        const awayRealMs = Math.max(0, now - saved.savedUtcMs)
        const entries = entriesSince(caught, lastSeq)

        await saveSnapshot(caught, now)
        set({
          state: caught,
          status: 'ready',
          awayReport:
            awayRealMs > 60_000 && entries.length > 0
              ? { awayRealMs, gameSecondsElapsed: caught.now - beforeNow, entries }
              : undefined,
        })
        return
      } catch (err) {
        console.error('Could not catch the saved world up; starting a new one.', err)
      }
    }

    const fresh = createWorld(newSeed(), now)
    await saveSnapshot(fresh, now)
    set({ state: fresh, status: 'ready', awayReport: undefined })
  },

  dispatch(command) {
    const current = get().state
    if (!current) return

    const now = Date.now()
    const timed = { at: gameTimeFromUtc(now, current.epochUtcMs), command }
    const next = applyCommand(current, timed)
    set({ state: next })

    // Log the intent, then snapshot. M0 does both on every command; the log is
    // what makes periodic snapshots possible later without losing anything.
    void appendCommand(timed, now).then(() => saveSnapshot(next, now))
  },

  tick() {
    const current = get().state
    if (!current) return
    const next = advanceToUtc(current, Date.now())
    if (next.now !== current.now) set({ state: next })
  },

  setOpenRoom(roomId) {
    set({ openRoomId: roomId })
  },

  dismissAwayReport() {
    set({ awayReport: undefined })
  },

  async resetWorld() {
    await clearSave()
    const now = Date.now()
    const fresh = createWorld(newSeed(), now)
    await saveSnapshot(fresh, now)
    set({ state: fresh, awayReport: undefined, openRoomId: undefined })
  },
}))

/** Persist the current state on the way out, so a reload resumes exactly. */
export function installLifecycleHandlers(): () => void {
  const flush = () => {
    const state = useGame.getState().state
    if (state) void saveSnapshot(state, Date.now())
  }

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') flush()
    else useGame.getState().tick()
  }

  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pagehide', flush)

  return () => {
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pagehide', flush)
  }
}
