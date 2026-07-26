/**
 * The guild, and the hall. Design doc §4.4, §6.1, §10.1.
 *
 * Two panels that answer one question between them: who you work for, and who
 * works for you. They sit on the Crew tab because that is where the player is
 * already thinking about people — a separate tab would file the payroll away
 * from the roster it pays.
 *
 * The wage is shown twice on purpose: what the candidate asked, and what the
 * guild's floor makes it. §6.1 says Wrightworks' wage rules are "genuinely good
 * for crew, costs money", and folding the two into one number would hide
 * exactly the half the player is meant to feel.
 */
import { getPort } from '@solsyn/data'
import type { Candidate, GuildView } from '@solsyn/sim'

function credits(value: number): string {
  return `${Math.round(value).toLocaleString()} cr`
}

const BAND_LABEL: Record<GuildView['band'], string> = {
  hostile: 'A liability',
  poor: 'A risk',
  neutral: 'An unknown quantity',
  trusted: 'Reliable',
  valued: 'One of their own',
}

export function GuildPanel({ guilds }: { guilds: GuildView[] }) {
  const own = guilds.find((g) => g.own)

  return (
    <section className="panel" aria-label="Guild">
      <h2 className="panel__title">The Local</h2>

      {own && (
        <div className="guild guild--own">
          <div className="guild__head">
            <strong className="guild__name">{own.name}</strong>
            <span className="guild__badge">Your seat</span>
          </div>
          <p className="guild__identity">{own.identity}</p>
          <p className="guild__culture">{own.culture}</p>
        </div>
      )}

      <p className="panel__note">
        Standing runs with every guild, not only your own — delivering for one is never
        neutral to the rest.
      </p>

      <ul className="standings">
        {guilds.map((g) => (
          <li key={g.id} className={`standing ${g.own ? 'is-own' : ''} is-${g.band}`}>
            <div className="standing__top">
              <span className="standing__name">{g.name}</span>
              <span className="standing__value">{g.standing > 0 ? '+' : ''}{g.standing}</span>
            </div>
            <div className="standing__track" role="meter" aria-valuenow={g.standing} aria-valuemin={-100} aria-valuemax={100}>
              {/* Zero sits in the middle, so a negative reading reads as one. */}
              <span className="standing__zero" aria-hidden="true" />
              <span
                className="standing__fill"
                style={{
                  left: `${g.standing >= 0 ? 50 : 50 + g.standing / 2}%`,
                  width: `${Math.abs(g.standing) / 2}%`,
                }}
              />
            </div>
            <p className="standing__band">{BAND_LABEL[g.band]}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function HiringHall({
  candidates,
  berths,
  dailyWagesCr,
  portId,
  docked,
  onHire,
}: {
  candidates: Candidate[]
  berths: { used: number; total: number; free: number }
  dailyWagesCr: number
  portId: string
  docked: boolean
  onHire: (crewId: string) => void
}) {
  return (
    <section className="panel" aria-label="Hiring hall">
      <h2 className="panel__title">The hall</h2>

      <ul className="offer__terms hall__summary">
        <li>
          <span>Berths</span>
          <strong>
            {berths.used} / {berths.total}
          </strong>
        </li>
        <li>
          <span>Payroll</span>
          <strong>{credits(dailyWagesCr)}/day</strong>
        </li>
        <li>
          <span>Free</span>
          <strong className={berths.free === 0 ? 'is-bad' : ''}>{berths.free}</strong>
        </li>
      </ul>

      {!docked ? (
        <p className="panel__note">Nobody signs on under way.</p>
      ) : candidates.length === 0 ? (
        <p className="panel__note">
          Nobody is standing in the hall at {getPort(portId).name}. Halls are places — the deep
          bench is at the guild’s own yard.
        </p>
      ) : (
        <div className="board">
          {candidates.map((c) => (
            <article key={c.id} className={`hire ${c.hireable ? '' : 'is-blocked'}`}>
              <header className="hull__head">
                <div>
                  <h3 className="offer__title">{c.name}</h3>
                  <p className="offer__client">
                    {c.role} · {c.age}
                  </p>
                </div>
                <span className="offer__pay">{credits(c.wageCrPerDay)}/day</span>
              </header>

              <p className="offer__blurb">{c.blurb}</p>

              {c.qualifications.length > 0 && (
                <div className="quals">
                  <span className="quals__label">Endorsed</span>
                  {c.qualifications.map((q) => (
                    <span key={q} className="qual qual--static">
                      {q.toUpperCase()}
                    </span>
                  ))}
                </div>
              )}

              {c.wageCrPerDay !== c.asksCrPerDay && (
                <p className="hire__floor">
                  Asks {credits(c.asksCrPerDay)}; the guild’s wage floor makes it{' '}
                  {credits(c.wageCrPerDay)}. That is what the card costs you.
                </p>
              )}

              {c.hireable ? (
                <button
                  type="button"
                  className="button button--primary offer__accept"
                  onClick={() => onHire(c.id)}
                >
                  Sign them on
                </button>
              ) : (
                <p className="option__why">{c.why}</p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
