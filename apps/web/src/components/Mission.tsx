/**
 * The mission. Spec 002 TR-3b, TR-16 to TR-21. Design doc §2, §5.1, §5.3, §6.2.
 *
 * One tab for the whole mission loop, because it is one loop: what is on offer
 * here, what the astrogator can fly, where the ship is while it flies, and what
 * the run was worth when it got there. Splitting those across tabs would hide
 * the fact that they are the same decision seen at four moments.
 *
 * Called "mission" rather than "port" because a mission is what the player is
 * choosing. The port is only where the choosing happens, and naming the tab
 * after the furniture rather than the decision made it read as a shop.
 *
 * Two requirements shape the layout:
 *
 * **TR-20 — the allowance is stated at the board.** It sits next to the
 * payment on every offer, before acceptance, because "can I run this inside
 * the budget" is a question asked when choosing, not discovered on arrival.
 *
 * **TR-3b — no fake choices.** An option the ship cannot fly is shown with the
 * shortfall in tonnes rather than hidden. A choice the ship cannot take is
 * still information: it says what a bigger tank would buy.
 */
import { getPort } from '@solsyn/data'
import {
  formatDuration,
  type ActiveContractView,
  type BoardEntry,
  type LedgerView,
  type Settlement,
  type SettlementLine,
  type HullOffer,
  type TransferOption,
  type VoyageView,
} from '@solsyn/sim'
import { MISSION_BLURB, MISSION_LABEL, RouteMap } from './RouteMap.js'
import { Shipyard } from './Shipyard.js'

/** Allowance lines are kg except spares, which are whole units. */
function formatStores(key: string, value: number): string {
  if (key === 'spares') return `${value.toFixed(value < 10 ? 1 : 0)} u`
  if (value >= 1000) return `${(value / 1000).toFixed(1)} t`
  return `${value.toFixed(value < 10 ? 1 : 0)} kg`
}

const STORE_LABEL: Record<string, string> = {
  water: 'Water',
  o2: 'Oxygen',
  food: 'Food',
  propellant: 'Propellant',
  spares: 'Spares',
}

function credits(value: number): string {
  const rounded = Math.round(value)
  return `${rounded < 0 ? '−' : ''}${Math.abs(rounded).toLocaleString()} cr`
}

function portName(id: string): string {
  return getPort(id).name
}

function days(value: number): string {
  const whole = Math.abs(value)
  if (whole < 1) return `${Math.round(whole * 24)} h`
  return `${whole.toFixed(whole < 10 ? 1 : 0)} days`
}

/* ------------------------------------------------------------------ books */

function Books({ ledger }: { ledger: LedgerView }) {
  return (
    <section className="panel" aria-label="Books">
      <h2 className="panel__title">Books</h2>
      <p className={`books__balance ${ledger.overdrawn ? 'is-overdrawn' : ''}`}>
        {credits(ledger.credits)}
      </p>
      {ledger.overdrawn && (
        <p className="panel__note">
          Overdrawn. The Local charges interest and remembers, but the ship still flies —
          a desk that cannot undock because it is short is a stranded ship.
        </p>
      )}
      {ledger.entries.length === 0 ? (
        <p className="panel__note">Nothing posted yet.</p>
      ) : (
        <ul className="books__list">
          {ledger.entries.slice(0, 8).map((e, i) => (
            <li key={`${e.at}-${i}`} className="books__row">
              <span className="books__reason">{e.reason}</span>
              <span className={`books__amount ${e.credits < 0 ? 'is-debit' : 'is-credit'}`}>
                {e.credits >= 0 ? '+' : ''}
                {credits(e.credits).replace('−', '−')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/* --------------------------------------------------------------- the board */

function Allowance({
  allowance,
}: {
  allowance: Record<string, number>
}) {
  return (
    <div className="allowance">
      <p className="allowance__title">Resupply allowance</p>
      <ul className="allowance__grid">
        {Object.entries(allowance).map(([key, value]) => (
          <li key={key} className="allowance__cell">
            <span className="allowance__label">{STORE_LABEL[key] ?? key}</span>
            <span className="allowance__value">{formatStores(key, value)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Said once per screen rather than once per card — it is the same rule every time. */
const ALLOWANCE_RULE =
  'The allowance is what the Guild has budgeted for the crossing. Come in under it and the ' +
  'difference is paid back at the arrival port’s prices; go over and it is billed. It is the ' +
  'only place efficiency turns into money.'

function Offer({ offer, onAccept }: { offer: BoardEntry; onAccept: (id: string) => void }) {
  return (
    <article className="offer">
      <header className="offer__head">
        <div>
          <h3 className="offer__title">{offer.title}</h3>
          <p className="offer__client">{offer.client}</p>
        </div>
        <span className="offer__pay">{credits(offer.payCr)}</span>
      </header>

      {/* Where it starts, where it ends, and what kind of errand it is --
          before any of the numbers. */}
      <RouteMap fromPortId={offer.fromPortId} toPortId={offer.toPortId} type={offer.type} />

      <p className={`mtype mtype--${offer.type}`}>
        <span className="mtype__name">{MISSION_LABEL[offer.type]}</span>
        <span className="mtype__what">{MISSION_BLURB[offer.type]}</span>
      </p>

      <p className="offer__blurb">{offer.blurb}</p>

      <ul className="offer__terms">
        <li>
          <span>Cargo</span>
          <strong>{(offer.cargoKg / 1000).toFixed(1)} t</strong>
        </li>
        <li>
          <span>Deadline</span>
          <strong>{offer.deadlineDays} days</strong>
        </li>
        <li>
          <span>Walk away</span>
          <strong>{credits(offer.abandonCr)}</strong>
        </li>
      </ul>

      <Allowance allowance={offer.allowance} />

      {/* Shown rather than hidden. A run to Mars from the wrong side of the sun
          is not unavailable, it is *later*, and taking it off the board would
          take the one decision §5.1 calls the astrogator's job with it. The
          deadline runs from launch, so signing is booking a future trip -- and
          walking away before the burn costs only the stated penalty. */}
      {offer.windowDays >= 1 && (
        <p className="offer__window">
          Window opens in <strong>{Math.round(offer.windowDays)} days</strong>. Signing books
          the trip; the {offer.deadlineDays}-day deadline runs from launch, and you can walk
          away before the burn.
        </p>
      )}

      <button
        type="button"
        className="button button--primary offer__accept"
        onClick={() => onAccept(offer.id)}
      >
        {offer.windowDays >= 1 ? 'Book the run' : 'Accept the run'}
      </button>
    </article>
  )
}

/* --------------------------------------------------------- the current run */

function Astrogator({
  options,
  onDepart,
}: {
  options: TransferOption[]
  onDepart: (id: string) => void
}) {
  if (options.length === 0) return null

  return (
    <section className="panel" aria-label="Trajectories">
      <h2 className="panel__title">Astrogator</h2>
      <ul className="options">
        {options.map((o) => (
          <li
            key={o.id}
            className={`option ${o.feasible ? '' : 'is-blocked'} ${o.onTime ? '' : 'is-late'}`}
          >
            <div className="option__head">
              <span className="option__label">{o.label}</span>
              <span className="option__dv">{(o.deltaVMs / 1000).toFixed(2)} km/s</span>
            </div>

            <ul className="option__figures">
              {/* Named separately from the crossing, because they are separate
                  things to agree to: a window months out is a booking, and the
                  deadline does not start until the engine lights. Folding the
                  wait into "under way" would hide 227 days inside a five-day
                  figure, which is the fake choice TR-3b forbids. */}
              {o.waitDays >= 1 && (
                <li className="option__wait">
                  <span>Launches in</span>
                  <strong>{Math.round(o.waitDays)} days</strong>
                </li>
              )}
              <li>
                <span>Under way</span>
                <strong>{formatDuration(o.flightDays * 86400)}</strong>
              </li>
              <li>
                <span>Propellant</span>
                <strong>{(o.propellantKg / 1000).toFixed(1)} t</strong>
              </li>
              <li>
                <span>Deadline</span>
                <strong className={o.onTime ? '' : 'is-bad'}>{o.onTime ? 'Met' : 'Missed'}</strong>
              </li>
            </ul>

            {o.feasible ? (
              <button
                type="button"
                className="button button--primary option__go"
                onClick={() => onDepart(o.id)}
              >
                Cast off
              </button>
            ) : (
              /* TR-3b: shown with the reason, not quietly dropped. */
              <p className="option__why">{o.why}</p>
            )}
          </li>
        ))}
      </ul>
      <p className="panel__note">
        Every figure is computed from the ship’s current wet mass, cargo included — a full hold
        costs propellant on every burn.
      </p>
    </section>
  )
}

function TheRun({
  active,
  options,
  onDepart,
  onAbandon,
}: {
  active: ActiveContractView
  options: TransferOption[]
  onDepart: (id: string) => void
  onAbandon: () => void
}) {
  return (
    <>
      <section className="panel" aria-label="Current contract">
        <h2 className="panel__title">The run</h2>
        <h3 className="offer__title">{active.title}</h3>
        <p className="offer__client">{active.client}</p>

        {/* Same drawing as the board card, still unflown. */}
        <RouteMap fromPortId={active.fromPortId} toPortId={active.toPortId} type={active.type} />

        <p className={`mtype mtype--${active.type}`}>
          <span className="mtype__name">{MISSION_LABEL[active.type]}</span>
          <span className="mtype__what">{MISSION_BLURB[active.type]}</span>
        </p>

        <ul className="offer__terms">
          <li>
            <span>Pays</span>
            <strong>{credits(active.payCr)}</strong>
          </li>
          <li>
            <span>Cargo</span>
            <strong>{(active.cargoKg / 1000).toFixed(1)} t</strong>
          </li>
          <li>
            <span>{active.late ? 'Overdue by' : 'Time left'}</span>
            <strong className={active.late ? 'is-bad' : ''}>{days(active.daysRemaining)}</strong>
          </li>
        </ul>

        <Allowance allowance={active.allowance} />
        <p className="panel__note">{ALLOWANCE_RULE}</p>

        <button type="button" className="button button--quiet" onClick={onAbandon}>
          Abandon the run — {credits(active.abandonCr)}
        </button>
      </section>

      <Astrogator options={options} onDepart={onDepart} />
    </>
  )
}

/* ------------------------------------------------------------- under way */

function UnderWay({ voyage, active }: { voyage: VoyageView; active?: ActiveContractView }) {
  const pct = Math.round(voyage.fractionComplete * 100)
  return (
    <section className="panel" aria-label="Voyage">
      <h2 className="panel__title">Under way</h2>
      <p className="voyage__legs">
        {portName(voyage.fromPortId)} → {portName(voyage.toPortId)}
      </p>

      {/* The same route the run was chosen from, now with the ship on it. */}
      {active && (
        <RouteMap
          fromPortId={voyage.fromPortId}
          toPortId={voyage.toPortId}
          type={active.type}
          progress={voyage.fractionComplete}
        />
      )}

      <div
        className="voyage__track"
        role="meter"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="voyage__fill" style={{ width: `${pct}%` }} />
      </div>

      <ul className="offer__terms">
        <li>
          <span>Flown</span>
          <strong>{pct}%</strong>
        </li>
        <li>
          <span>Arrives in</span>
          <strong>{days(voyage.daysRemaining)}</strong>
        </li>
        <li>
          <span>Burned</span>
          <strong>{(voyage.propellantSpentKg / 1000).toFixed(1)} t</strong>
        </li>
      </ul>

      {/* The flight profile, stated rather than implied. A nuclear-thermal ship
          burns at each end and falls the whole way between (§3.4) -- so the
          honest answer to "what is the thrust right now" is nothing at all for
          all but the first and last half hour, and the readout says so. */}
      <div className={`telem telem--${voyage.phase}`}>
        <div className="telem__now">
          <span className="telem__phase">
            {voyage.phase === 'coast'
              ? 'Coasting'
              : voyage.phase === 'departure'
                ? 'Departure burn'
                : 'Arrival burn'}
          </span>
          <span className="telem__speed">{(voyage.speedMs / 1000).toFixed(2)} km/s</span>
        </div>
        <ul className="telem__row">
          <li>
            <span>Thrust</span>
            <strong>{voyage.thrustKn.toFixed(0)} kN</strong>
          </li>
          <li>
            <span>Weight</span>
            <strong>{voyage.gees.toFixed(2)} g</strong>
          </li>
        </ul>
        <ul className="telem__burns">
          {voyage.burns.map((b) => (
            <li key={b.kind}>
              <span>{b.kind === 'departure' ? 'Departure' : 'Arrival'}</span>
              <strong>
                {(b.deltaVMs / 1000).toFixed(2)} km/s · {Math.round(b.durationS / 60)} min ·{' '}
                {b.gees.toFixed(2)} g
              </strong>
            </li>
          ))}
        </ul>
        <p className="panel__note">
          {voyage.phase === 'coast'
            ? 'Engines cold and the crew weightless. She is falling along the transfer ellipse, fastest at the low end and slowest at the high one — the whole crossing is the fall between two burns, not a push all the way across.'
            : 'Under thrust. Everything not stowed has weight again, and the crew are strapped in.'}
        </p>
      </div>

      {active && (
        <p className="panel__note">
          {active.late
            ? `Already past the deadline by ${days(active.daysRemaining)}. Late delivery still pays, at a reduced rate.`
            : `${days(active.daysRemaining)} of deadline left when the ship arrives at the berth.`}
        </p>
      )}
      <p className="panel__note">
        Nothing to do but keep the ship running. Every kilo the loops save out here is a kilo
        credited back against the allowance on arrival.
      </p>
    </section>
  )
}

/* ------------------------------------------------------------- settlement */

function SettlementRow({ line }: { line: SettlementLine }) {
  // Under or over the budget is still the thing worth seeing at a glance --
  // the colour says how the run went. The figure beside it is the whole
  // allowance reimbursed, because what was consumed is bought back at the pump
  // and netting it here would charge for it twice.
  const under = line.allowedKg - line.usedKg >= 0
  return (
    <li className={`settle__row ${under ? 'is-under' : 'is-over'}`}>
      <span className="settle__key">{STORE_LABEL[line.key] ?? line.key}</span>
      <span className="settle__against">
        {formatStores(line.key, line.usedKg)} of {formatStores(line.key, line.allowedKg)}
      </span>
      <span className="settle__cr">+{Math.round(line.creditsCr).toLocaleString()}</span>
    </li>
  )
}

function SettlementPanel({ settlement }: { settlement: Settlement }) {
  return (
    <section className="panel settle" aria-label="Last settlement">
      <h2 className="panel__title">Settled</h2>
      <h3 className="offer__title">{settlement.title}</h3>
      <p className="offer__client">
        Delivered to {portName(settlement.portId)}
        {settlement.late ? ' — late, at reduced payment' : ' — on time'}
      </p>

      <ul className="settle__list">
        <li className="settle__row settle__row--head">
          <span className="settle__key">Store</span>
          <span className="settle__against">Used against allowance</span>
          <span className="settle__cr">cr back</span>
        </li>
        {settlement.lines.map((line) => (
          <SettlementRow key={line.key} line={line} />
        ))}
      </ul>

      <ul className="settle__totals">
        <li>
          <span>Payment</span>
          <strong>{credits(settlement.payCr)}</strong>
        </li>
        <li>
          <span>Allowance reimbursed</span>
          <strong className="is-good">{credits(settlement.allowanceCr)}</strong>
        </li>
        {/* The bill beside the budget. The gap between them is the mechanic:
            a tended ship buys back less than it was given and keeps the
            difference, which is invisible if the two are added up first. */}
        <li>
          <span>Stores bought at {portName(settlement.portId)}</span>
          <strong className={settlement.storesCr < 0 ? 'is-bad' : ''}>
            {credits(settlement.storesCr)}
          </strong>
        </li>
        <li className="settle__total">
          <span>The run was worth</span>
          <strong>{credits(settlement.totalCr)}</strong>
        </li>
      </ul>

      <p className="panel__note">
        The Guild reimburses the whole allowance at the rates of{' '}
        {portName(settlement.portId)}, where the ship actually arrived — not at the port it
        left. Refilling the tanks is bought from that port at its own prices, so what you
        keep is the difference: spend less than you were budgeted and the gap is yours.
        Volatiles are cheap in the Belt and dear in low orbit; food runs the other way.
      </p>
    </section>
  )
}

/* -------------------------------------------------------------------- tab */

export function Mission({
  ledger,
  board,
  active,
  options,
  voyage,
  settlement,
  portId,
  docked,
  hullOffers,
  onPurchase,
  onAccept,
  onAbandon,
  onDepart,
}: {
  ledger: LedgerView
  board: BoardEntry[]
  active: ActiveContractView | undefined
  options: TransferOption[]
  voyage: VoyageView | undefined
  settlement: Settlement | undefined
  portId: string
  docked: boolean
  hullOffers: HullOffer[]
  onPurchase: (hullId: string) => void
  onAccept: (contractId: string) => void
  onAbandon: () => void
  onDepart: (optionId: string) => void
}) {
  const port = getPort(portId)

  return (
    <>
      {docked ? (
        <section className="panel berth" aria-label="Berth">
          <h2 className="panel__title">Berthed</h2>
          <p className="berth__name">{port.name}</p>
          <p className="berth__blurb">{port.blurb}</p>
        </section>
      ) : (
        voyage && <UnderWay voyage={voyage} active={active} />
      )}

      {docked && active && (
        <TheRun active={active} options={options} onDepart={onDepart} onAbandon={onAbandon} />
      )}

      {docked && !active && (
        <section className="panel" aria-label="Contract board">
          <h2 className="panel__title">The board</h2>
          {board.length === 0 ? (
            <p className="panel__note">Nothing on offer here.</p>
          ) : (
            <>
              <div className="board">
                {board.map((offer) => (
                  <Offer key={offer.id} offer={offer} onAccept={onAccept} />
                ))}
              </div>
              <p className="panel__note">{ALLOWANCE_RULE}</p>
            </>
          )}
        </section>
      )}

      {/* A yard is a place: this is empty at every berth that has no yard. */}
      {docked && <Shipyard offers={hullOffers} onPurchase={onPurchase} />}

      {settlement && !active && <SettlementPanel settlement={settlement} />}

      <Books ledger={ledger} />
    </>
  )
}
