/**
 * The roster. Spec 004 RF-21 to RF-26. Design doc §4.1-§4.3.
 *
 * The crew are individuals and the player is an institution, so this leads
 * with what each person is doing right now rather than with a stat block --
 * but the stat block is here, in full, because "why is she better at this than
 * he is" is a question the player is entitled to answer.
 *
 * The 24-hour strip is the important part. "B watch" was previously explained
 * in a `title` tooltip, which on a phone is explained to nobody. Drawn as a
 * day with one block lit, the letter stops mattering: you can see who covers
 * 04:00 and who does not, which is the actual decision the bill is asking for.
 */
import { useState } from 'react'
import type { CrewView } from '@solsyn/sim'
import { CREW_HELP, WATCH_HELP, type Explanation } from './crewGlossary.js'
import type { Watch } from '@solsyn/data'
import { WATCH_HOURS } from '@solsyn/sim'

const WATCHES: Watch[] = ['A', 'B', 'C']
const WATCH_START: Record<Watch, number> = { A: 0, B: 8, C: 16 }

/** O*NET's names, in the words a person would use. */
const SKILL_LABEL: Record<string, string> = {
  operationMonitoring: 'Monitoring',
  equipmentMaintenance: 'Maintenance',
  troubleshooting: 'Diagnosis',
  repairing: 'Repair',
  qualityControl: 'Inspection',
  judgment: 'Judgement',
}

const KNOWLEDGE_LABEL: Record<string, string> = {
  mechanical: 'Mechanical',
  electronics: 'Electronics',
  physics: 'Physics',
  chemistry: 'Chemistry',
  biology: 'Biology',
  medicine: 'Medicine',
}

const QUAL_LABEL: Record<string, string> = {
  eclss: 'ECLSS',
  eps: 'EPS',
  tcs: 'TCS',
  prop: 'PROP',
  gnc: 'GNC',
  eva: 'EVA',
  cmo: 'CMO',
}

const QUAL_TITLE: Record<string, string> = {
  eclss: 'Environmental Control & Life Support',
  eps: 'Electrical Power System',
  tcs: 'Thermal Control System',
  prop: 'Propulsion',
  gnc: 'Guidance, Navigation & Control',
  eva: 'Extravehicular Activity',
  cmo: 'Crew Medical Officer',
}

const STAT_LABEL: Record<string, string> = {
  strength: 'STR',
  dexterity: 'DEX',
  endurance: 'END',
  intellect: 'INT',
  perception: 'PER',
  resolve: 'RES',
}

const pad = (n: number) => String(n % 24).padStart(2, '0')

/**
 * One person's day: eight asleep, eight on watch, eight off, with a marker at
 * the current time. This is the answer to "what is a watch" (RF-21).
 */
function WatchStrip({ member, nowHour }: { member: CrewView; nowHour: number }) {
  const start = WATCH_START[member.watch as Watch]
  // Segments in clock order, each labelled by what they are doing then.
  const segments = [
    { from: start, kind: 'watch', label: 'On watch' },
    { from: start + WATCH_HOURS, kind: 'off', label: 'Off' },
    { from: start + WATCH_HOURS * 2, kind: 'sleep', label: 'Asleep' },
  ]
  const nowPct = (nowHour / 24) * 100

  return (
    <div className="watchstrip">
      <div className="watchstrip__head">
        <span>{member.watch} watch</span>
        <span>
          {pad(start)}:00 – {pad(start + WATCH_HOURS)}:00
        </span>
      </div>
      <div className="watchstrip__day">
        {segments.map((seg) => (
          <span
            key={seg.kind}
            className={`watchstrip__seg is-${seg.kind}`}
            style={{ left: `${((seg.from % 24) / 24) * 100}%`, width: `${(WATCH_HOURS / 24) * 100}%` }}
          >
            {seg.label}
          </span>
        ))}
        <span className="watchstrip__now" style={{ left: `${nowPct}%` }} aria-hidden="true" />
      </div>
      <div className="watchstrip__ticks" aria-hidden="true">
        <span>00</span>
        <span>08</span>
        <span>16</span>
        <span>24</span>
      </div>
    </div>
  )
}

function Bars({
  title,
  note,
  values,
  labels,
  best,
  onExplain,
}: {
  title: string
  note: string
  values: Record<string, number>
  labels: Record<string, string>
  best: string
  onExplain: (key: string) => void
}) {
  const entries = Object.entries(values).sort(([, a], [, b]) => b - a)
  return (
    <div className="statblock">
      <p className="statblock__title">
        {title} <span className="statblock__note">{note}</span>
      </p>
      <div className="statblock__rows">
        {entries.map(([key, value]) => (
          <button
            key={key}
            type="button"
            className={`statrow ${key === best ? 'is-best' : ''}`}
            onClick={() => onExplain(key)}
            aria-label={`${labels[key] ?? key} ${value}. What this means.`}
          >
            <span className="statrow__label">{labels[key] ?? key}</span>
            <span className="statrow__track">
              <span className="statrow__fill" style={{ width: `${value}%` }} />
            </span>
            <span className="statrow__value">{value}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * The card that opens when a stat is tapped. A roster of bars is a character
 * sheet; this is what turns it into an explanation -- what the number is, and
 * what it actually moves in the sim.
 */
function Explainer({ entry, onClose }: { entry: Explanation; onClose: () => void }) {
  return (
    <div className="explain" role="dialog" aria-label={entry.label}>
      <div className="explain__head">
        <strong className="explain__label">{entry.label}</strong>
        <button type="button" className="explain__close" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <p className="explain__what">{entry.what}</p>
      <p className="explain__affects">
        <span className="explain__affects-label">What it affects</span>
        {entry.affects}
      </p>
      {entry.source && <p className="explain__source">{entry.source}</p>}
    </div>
  )
}

function Detail({ member, nowHour }: { member: CrewView; nowHour: number }) {
  const bestSkill = Object.entries(member.skills).sort(([, a], [, b]) => b - a)[0]![0]
  const bestKnowledge = Object.entries(member.knowledge).sort(([, a], [, b]) => b - a)[0]![0]
  const [explain, setExplain] = useState<Explanation | undefined>()
  const show = (key: string) => setExplain(CREW_HELP[key])

  return (
    <>
      <WatchStrip member={member} nowHour={nowHour} />

      {/* The A/B/C letters were explained in a title attribute, which on a
          phone is explained to nobody. */}
      <button type="button" className="explain__hint" onClick={() => setExplain(WATCH_HELP)}>
        What do A, B and C mean?
      </button>

      {explain && <Explainer entry={explain} onClose={() => setExplain(undefined)} />}

      <p className="crew__blurb">{member.blurb}</p>

      {member.qualifications.length > 0 && (
        <div className="quals">
          <span className="quals__label">Endorsed</span>
          {member.qualifications.map((q) => (
            <button
              key={q}
              type="button"
              className="qual"
              title={QUAL_TITLE[q]}
              onClick={() => show(q)}
            >
              {QUAL_LABEL[q] ?? q}
            </button>
          ))}
        </div>
      )}

      <Bars
        title="Skills"
        note="grow with use"
        values={member.skills}
        labels={SKILL_LABEL}
        best={bestSkill}
        onExplain={show}
      />
      <Bars
        title="Knowledge"
        note="slow to change"
        values={member.knowledge}
        labels={KNOWLEDGE_LABEL}
        best={bestKnowledge}
        onExplain={show}
      />

      <div className="statblock">
        <p className="statblock__title">
          Attributes <span className="statblock__note">out of ten</span>
        </p>
        <ul className="pips">
          {Object.entries(member.stats).map(([key, value]) => (
            <li key={key}>
              <button type="button" className="pip" onClick={() => show(key)}>
                <span className="pip__label">{STAT_LABEL[key] ?? key}</span>
                <span className="pip__value">{value}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="crew__meters">
        <Meter label="Health" value={member.health} />
        <Meter label="Fatigue" value={member.fatigue} invert />
      </div>

      <div className="assignment">
        <p className="assignment__label">Current assignment</p>
        <p className="assignment__what">{member.doing}</p>
        {member.activity === 'watch' && (
          <p className="assignment__why">
            Working at {Math.round(member.effectiveness * 100)}% · in{' '}
            {member.roomId.replace(/-/g, ' ')}
          </p>
        )}
      </div>
    </>
  )
}

function Meter({ label, value, invert = false }: { label: string; value: number; invert?: boolean }) {
  const bad = invert ? value > 65 : value < 45
  const warn = invert ? value > 40 : value < 70
  return (
    <div className="meter">
      <span className="meter__label">{label}</span>
      <div className="meter__track">
        <div
          className={`meter__fill ${bad ? 'is-bad' : warn ? 'is-warn' : ''}`}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
      <span className="meter__value">{Math.round(value)}</span>
    </div>
  )
}

export function CrewPanel({
  crew,
  nowHour,
  onSetWatch,
}: {
  crew: CrewView[]
  nowHour: number
  onSetWatch: (crewId: string, watch: Watch) => void
}) {
  // One open at a time (RF-25): four full cards will not fit a phone, and six
  // will not fit anything.
  const [openId, setOpenId] = useState<string | undefined>(crew[0]?.id)

  return (
    <section className="panel" aria-label="Crew">
      <h2 className="panel__title">Crew</h2>

      {/* A ship can have no crew now, and an empty list explains nothing. The
          only route out of salvage is hiring, and the hall is directly below
          this panel -- so say what happened and point at it (§7.4). */}
      {crew.length === 0 && (
        <div className="salvage">
          <p className="salvage__lede">There is nobody aboard.</p>
          <p className="salvage__what">
            The ship was recovered and towed in after the last of her crew was lost. She is
            intact and she is yours — the reactor is running and the berth is held — but she
            cannot fly, take a contract, or repair herself until somebody signs on.
          </p>
          <p className="panel__note">
            Hire from the hall below. One hand is enough to release her from salvage; a full
            watch bill is what makes her earn again.
          </p>
        </div>
      )}

      <ul className="roster">
        {crew.map((member) => {
          const open = member.id === openId
          return (
            <li key={member.id} className={`crew crew--${member.activity} ${open ? 'is-open' : ''}`}>
              <button
                type="button"
                className="crew__head"
                aria-expanded={open}
                onClick={() => setOpenId(open ? undefined : member.id)}
              >
                <span className="crew__initials">{member.initials}</span>
                <span className="crew__who">
                  <span className="crew__name">{member.name}</span>
                  <span className="crew__role">
                    {member.role} · {member.age} · {member.watch} watch
                  </span>
                </span>
                <span className={`crew__doing crew__doing--${member.activity}`}>{member.doing}</span>
              </button>

              {open && (
                <div className="crew__body">
                  <Detail member={member} nowHour={nowHour} />

                  <div className="watchbill" role="group" aria-label={`${member.name} watch`}>
                    <span className="watchbill__label">Move to</span>
                    {WATCHES.map((w) => (
                      <button
                        key={w}
                        type="button"
                        className={`watchbill__btn ${member.watch === w ? 'is-on' : ''}`}
                        aria-pressed={member.watch === w}
                        onClick={() => onSetWatch(member.id, w)}
                      >
                        {w}
                      </button>
                    ))}
                    <span className="watchbill__hours">00 · 08 · 16</span>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <p className="panel__note">
        Three watches of eight hours: on watch, off watch, then eight asleep.
        Only the hand on watch can work a job or keep a system in adjustment, so
        the bill decides which parts of the ship get looked after.
      </p>
    </section>
  )
}
