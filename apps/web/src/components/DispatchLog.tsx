/**
 * The dispatch inbox. Design doc §7.4.
 *
 * You are not aboard (§4.6), so this is not a debug console -- it is what the
 * ship tells you happened.
 *
 * Two things make a long list readable, and neither is more prose. The first is
 * a topic, so a run of forty dispatches can be narrowed to the one system you
 * are actually asking about. The second is the figure: every line has one
 * number that decides whether it needs you, and buried mid-sentence it makes
 * the reader parse every word to find it. Hoisted into its own column, the log
 * reads *down* -- 79%, 61%, 43%, failed -- which is the shape of the story.
 */
import { useState } from 'react'
import { formatShipClock, LOG_TOPICS, type LogEntry, type LogTopic } from '@solsyn/sim'

/** What each topic is called, and the one-word gloss on the filter chip. */
const TOPIC_LABEL: Record<LogTopic, string> = {
  ship: 'Ship',
  power: 'Power',
  life: 'Life',
  upkeep: 'Upkeep',
  crew: 'Crew',
  money: 'Money',
  voyage: 'Voyage',
}

export function DispatchLog({ entries }: { entries: LogEntry[] }) {
  const [topic, setTopic] = useState<LogTopic | 'all'>('all')

  if (entries.length === 0) return null

  // Only offer a filter for topics that actually occurred. A chip that always
  // yields an empty list is the fake choice TR-3b forbids, one screen over.
  const present = LOG_TOPICS.filter((t) => entries.some((e) => e.topic === t))
  const shown = topic === 'all' ? entries : entries.filter((e) => e.topic === topic)

  return (
    <section className="log" aria-label="Dispatches">
      <h2 className="log__title">Dispatches</h2>

      <div className="log__filters" role="group" aria-label="Filter by topic">
        <button
          type="button"
          className={`chip ${topic === 'all' ? 'is-on' : ''}`}
          aria-pressed={topic === 'all'}
          onClick={() => setTopic('all')}
        >
          All <span className="chip__count">{entries.length}</span>
        </button>
        {present.map((t) => (
          <button
            key={t}
            type="button"
            className={`chip chip--${t} ${topic === t ? 'is-on' : ''}`}
            aria-pressed={topic === t}
            onClick={() => setTopic(t)}
          >
            {TOPIC_LABEL[t]}{' '}
            <span className="chip__count">{entries.filter((e) => e.topic === t).length}</span>
          </button>
        ))}
      </div>

      <ol className="log__list">
        {shown.map((entry) => (
          <li
            key={entry.seq}
            className={`log__entry log__entry--${entry.level} log__entry--${entry.topic}`}
          >
            <span className="log__time">{formatShipClock(entry.at)}</span>
            <span className="log__topic">{TOPIC_LABEL[entry.topic]}</span>
            <span className="log__text">{entry.text}</span>
            {entry.figure && <span className="log__figure">{entry.figure}</span>}
          </li>
        ))}
      </ol>

      {shown.length === 0 && <p className="panel__note">Nothing under this heading yet.</p>}
    </section>
  )
}
