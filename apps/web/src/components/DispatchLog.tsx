/**
 * The dispatch inbox. Design doc §7.4.
 *
 * You are not aboard (§4.6), so this is not a debug console -- it is what the
 * ship tells you happened. In M1 these lines get a captain's voice; for now
 * they are the ship's own log, which is the same idea one rank down.
 */
import { formatShipClock, type LogEntry } from '@solsyn/sim'

export function DispatchLog({ entries }: { entries: LogEntry[] }) {
  if (entries.length === 0) return null

  return (
    <section className="log" aria-label="Dispatches">
      <h2 className="log__title">Dispatches</h2>
      <ol className="log__list">
        {entries.map((entry) => (
          <li key={entry.seq} className={`log__entry log__entry--${entry.level}`}>
            <span className="log__time">{formatShipClock(entry.at)}</span>
            <span className="log__text">{entry.text}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
