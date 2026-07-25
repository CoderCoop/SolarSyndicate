/**
 * The roster. Design doc §4.1-§4.3, §1.
 *
 * The crew are individuals with names and the player is an institution -- so
 * this panel leads with what each person is doing right now, not with their
 * stat block. The watch bill is the one control here, because it is the one
 * thing a remote manager actually decides (§4.3).
 */
import type { CrewView } from '@solsyn/sim'
import type { Watch } from '@solsyn/data'

const WATCHES: Watch[] = ['A', 'B', 'C']
const WATCH_HOURS: Record<Watch, string> = {
  A: '00:00–08:00',
  B: '08:00–16:00',
  C: '16:00–24:00',
}

function Bar({ label, value, invert = false }: { label: string; value: number; invert?: boolean }) {
  // Fatigue is bad when high; health is bad when low.
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
  onSetWatch,
}: {
  crew: CrewView[]
  onSetWatch: (crewId: string, watch: Watch) => void
}) {
  return (
    <section className="panel" aria-label="Crew">
      <h2 className="panel__title">Crew</h2>

      <ul className="roster">
        {crew.map((member) => (
          <li key={member.id} className={`crew crew--${member.activity}`}>
            <div className="crew__head">
              <div>
                <span className="crew__name">{member.name}</span>
                <span className="crew__role">
                  {member.role} · {member.age}
                </span>
              </div>
              <span className={`crew__doing crew__doing--${member.activity}`}>{member.doing}</span>
            </div>

            <p className="crew__blurb">{member.blurb}</p>

            <div className="crew__meters">
              <Bar label="Health" value={member.health} />
              <Bar label="Fatigue" value={member.fatigue} invert />
            </div>

            <div className="crew__foot">
              <span className="crew__skill">
                Mechanics {member.mechanics}
                {member.activity === 'watch' && (
                  <> · working at {Math.round(member.effectiveness * 100)}%</>
                )}
              </span>

              <div className="watchbill" role="group" aria-label={`${member.name} watch`}>
                {WATCHES.map((w) => (
                  <button
                    key={w}
                    type="button"
                    className={`watchbill__btn ${member.watch === w ? 'is-on' : ''}`}
                    aria-pressed={member.watch === w}
                    title={`${w} watch, ${WATCH_HOURS[w]}`}
                    onClick={() => onSetWatch(member.id, w)}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <p className="panel__note">
        Three watches of eight hours: on watch, off watch, then eight asleep. Only the hand on
        watch can work a job, so the bill decides who is available when something breaks.
      </p>
    </section>
  )
}
