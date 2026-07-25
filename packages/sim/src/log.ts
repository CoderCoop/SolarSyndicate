/**
 * The dispatch log. Design doc §7.4.
 *
 * "Return is a story": offline catch-up has to produce readable history, not
 * just a final state. Every consequential thing the sim does while the player
 * is away writes a line here, and the session-open screen reads them back.
 */
import type { GameTime } from './time.js'
import type { LogEntry, LogLevel, SimState } from './types.js'

/** Keep saves small; the inbox only ever shows the recent tail. */
export const LOG_LIMIT = 200

export function pushLog(state: SimState, at: GameTime, level: LogLevel, text: string): void {
  const entry: LogEntry = { seq: state.nextSeq++, at, level, text }
  state.log.push(entry)
  if (state.log.length > LOG_LIMIT) {
    state.log.splice(0, state.log.length - LOG_LIMIT)
  }
}

/** Newest first, for display. */
export function recentLog(state: SimState, limit = 50): LogEntry[] {
  return state.log.slice(-limit).reverse()
}
