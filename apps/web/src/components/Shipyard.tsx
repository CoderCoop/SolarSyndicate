/**
 * The yard. Design doc §5.2, §10.2.
 *
 * The interplanetary board has been visible and unreachable since M2 — priced,
 * marked with the shortfall in tonnes, and impossible in a hull with 32 t of
 * tank and 91 days of food. This is where that stops being a wall and becomes a
 * goal: the yard at Tranquillity sells the ship that can make the window.
 *
 * The comparison table is the whole panel. "1,050,000 cr" means nothing on its
 * own; "100 t of tank against 32, and stores for a window run" is the actual
 * offer, so the numbers that change are shown side by side with the ones being
 * left behind.
 */
import type { HullOffer } from '@solsyn/sim'

function credits(value: number): string {
  return `${Math.round(value).toLocaleString()} cr`
}

function tonnes(kg: number): string {
  return kg >= 1000 ? `${(kg / 1000).toFixed(kg >= 10_000 ? 0 : 1)} t` : `${Math.round(kg)} kg`
}

const ROWS: {
  key: keyof HullOffer['compare']
  label: string
  /** What the number is *for*, because capacity alone is not an argument. */
  means: string
}[] = [
  { key: 'propellantCapacityKg', label: 'Propellant', means: 'how far it can go' },
  { key: 'foodCapacityKg', label: 'Food', means: 'how long the crew last' },
  { key: 'waterCapacityKg', label: 'Water', means: 'the loop’s margin' },
  { key: 'dryMassKg', label: 'Dry mass', means: 'what every burn has to move' },
]

export function Shipyard({
  offers,
  onPurchase,
}: {
  offers: HullOffer[]
  onPurchase: (hullId: string) => void
}) {
  if (offers.length === 0) return null

  return (
    <section className="panel" aria-label="Shipyard">
      <h2 className="panel__title">The yard</h2>

      {offers.map((offer) => (
        <article key={offer.id} className={`hull ${offer.affordable ? '' : 'is-blocked'}`}>
          <header className="hull__head">
            <div>
              <h3 className="offer__title">{offer.name}</h3>
              <p className="offer__client">{offer.className}</p>
            </div>
            <span className="offer__pay">{credits(offer.netCr)}</span>
          </header>

          <p className="offer__blurb">{offer.blurb}</p>

          <table className="hull__compare">
            <thead>
              <tr>
                <th scope="col">Against what you fly</th>
                <th scope="col">Now</th>
                <th scope="col">Her</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map(({ key, label, means }) => {
                const [now, next] = offer.compare[key]
                // Dry mass is the one row where more is worse.
                const better = key === 'dryMassKg' ? next < now : next > now
                return (
                  <tr key={key}>
                    <th scope="row">
                      {label}
                      <span className="hull__means">{means}</span>
                    </th>
                    <td>{tonnes(now)}</td>
                    <td className={better ? 'is-better' : 'is-worse'}>{tonnes(next)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <ul className="offer__terms">
            <li>
              <span>List</span>
              <strong>{credits(offer.priceCr)}</strong>
            </li>
            <li>
              <span>Trade-in</span>
              <strong>−{credits(offer.tradeInCr)}</strong>
            </li>
            <li>
              <span>To pay</span>
              <strong>{credits(offer.netCr)}</strong>
            </li>
          </ul>

          {offer.affordable ? (
            <>
              <button
                type="button"
                className="button button--primary offer__accept"
                onClick={() => onPurchase(offer.id)}
              >
                Sign for her
              </button>
              <p className="panel__note">
                She is delivered at her nameplate: every system at full condition and spec tune.
                The tuning work done on your current ship does not come with you — it is a
                different ship, and the crew start learning it from scratch.
              </p>
            </>
          ) : (
            <p className="option__why">{offer.why}</p>
          )}
        </article>
      ))}
    </section>
  )
}
