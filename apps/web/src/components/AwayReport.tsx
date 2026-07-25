/**
 * The return screen. Design doc §7.4: "Return is a story."
 *
 * The rule this component exists to honour is that coming back must never be
 * a wall of red numbers. It leads with how long you were gone and what the
 * ship did about it, in the ship's own words.
 */
import { formatDuration, type LogEntry } from '@solsyn/sim'
import type { AwayReport as AwayReportData } from '../store.js'

function realAway(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'}`
  return `${Math.round(hours / 24)} days`
}

interface DigestLine {
  entry: LogEntry
  count: number
}

const RANK = { alert: 0, warn: 1, info: 2 } as const

/**
 * Lead with what mattered, and say each thing once.
 *
 * A fortnight away generates a lot of near-identical routine lines ("watch
 * change, battery 100%"). Printed verbatim they bury the one line that
 * actually needed reading, which is the failure mode §7.4 exists to prevent.
 * Entries are grouped by their shape -- text with the numbers masked out -- so
 * repetition collapses into a count.
 */
function digest(entries: LogEntry[]): DigestLine[] {
  const groups = new Map<string, DigestLine>()
  for (const entry of entries) {
    const key = `${entry.level}|${entry.text.replace(/[\d.]+/g, '#')}`
    const existing = groups.get(key)
    if (existing) existing.count += 1
    else groups.set(key, { entry, count: 1 })
  }

  return [...groups.values()]
    .sort((a, b) => RANK[a.entry.level] - RANK[b.entry.level] || a.entry.seq - b.entry.seq)
    .slice(0, 10)
}

export function AwayReport({ report, onDismiss }: { report: AwayReportData; onDismiss: () => void }) {
  const lines = digest(report.entries)
  const shownCount = lines.reduce((sum, l) => sum + l.count, 0)
  const hidden = report.entries.length - shownCount

  return (
    <div className="away" role="dialog" aria-modal="true" aria-labelledby="away-title">
      <div className="away__card">
        <h2 className="away__title" id="away-title">
          While you were away
        </h2>
        <p className="away__lede">
          {realAway(report.awayRealMs)} off the desk — {formatDuration(report.gameSecondsElapsed)} aboard.
        </p>

        <ol className="away__list">
          {lines.map(({ entry, count }) => (
            <li key={entry.seq} className={`away__entry away__entry--${entry.level}`}>
              {entry.text}
              {count > 1 && <span className="away__count">×{count}</span>}
            </li>
          ))}
        </ol>

        {hidden > 0 && <p className="away__more">{hidden} more in the dispatch log.</p>}

        <button type="button" className="button button--primary" onClick={onDismiss}>
          Take the watch
        </button>
      </div>
    </div>
  )
}
