/**
 * The ship cross-section. Design doc §3.1.
 *
 * Portrait vertical stack: engines at the bottom, bridge at the nose. Under
 * thrust the ship's decks stack like the floors of a building, which is both
 * physically correct for a torchship and the reason this game fits a phone.
 *
 * Rendered as DOM + SVG rather than canvas (§8.1): free text layout, free
 * accessibility, trivial responsiveness, and fast to iterate on. Everything
 * below sits behind ShipViewportProps, so swapping in PixiJS later means
 * writing one new component, not rewriting the app.
 */
import { useState } from 'react'
import type { CrewView, PowerView, RoomView } from '@solsyn/sim'
import { DeckSchematic } from './DeckSchematic.js'

export interface ShipViewportProps {
  shipName: string
  className: string
  rooms: RoomView[]
  crew: CrewView[]
  power: PowerView
  openRoomId: string | undefined
  onSelectRoom: (roomId: string | undefined) => void
  onTogglePart: (partId: string, enabled: boolean) => void
  onOrderWork: (partId: string, kind: 'service' | 'repair') => void
}

type Part = RoomView['parts'][number]

function powerLabel(kw: number): string {
  if (Math.abs(kw) < 0.05) return '—'
  return `${kw > 0 ? '+' : ''}${kw.toFixed(1)} kW`
}

function conditionTone(condition: number): string {
  if (condition >= 60) return 'good'
  if (condition >= 35) return 'worn'
  if (condition >= 15) return 'poor'
  return 'critical'
}

function PartRow({
  part,
  onToggle,
  onOrderWork,
}: {
  part: Part
  onToggle: (partId: string, enabled: boolean) => void
  onOrderWork: (partId: string, kind: 'service' | 'repair') => void
}) {
  const state = part.broken ? 'broken' : part.shed ? 'shed' : part.enabled ? 'on' : 'off'

  return (
    <li className={`part part--${state}`}>
      <div className="part__main">
        <div className="part__head">
          <span className="part__name">{part.name}</span>
          <span className={`part__power ${part.effectiveKw > 0 ? 'is-source' : 'is-load'}`}>
            {powerLabel(part.effectiveKw)}
          </span>
        </div>

        {/* Condition is the number that decides whether this part is a problem
            this week or next month, so it gets a bar rather than a footnote. */}
        <div className={`condition condition--${conditionTone(part.condition)}`}>
          <div className="condition__track">
            <div className="condition__fill" style={{ width: `${Math.max(0, part.condition)}%` }} />
          </div>
          <span className="condition__value">
            {Math.round(part.condition)}% {part.conditionLabel}
          </span>
        </div>

        <p className="part__blurb">{part.blurb}</p>

        <div className="part__tags">
          <span className={`tag tag--${part.priority}`}>{part.priority}</span>
          {part.broken && <span className="tag tag--broken">failed</span>}
          {part.shed && <span className="tag tag--shed">shed on brownout</span>}
          {!part.switchable && <span className="tag tag--locked">not switchable</span>}
          {part.effectiveKw !== part.powerKw && part.powerKw > 0 && (
            <span className="tag" title="Rated output before wear">
              rated {part.powerKw.toFixed(1)} kW
            </span>
          )}
        </div>

        <div className="part__actions">
          {part.hasWorkOrder ? (
            <span className="part__ordered">Work ordered</span>
          ) : part.broken ? (
            <button
              type="button"
              className="button button--primary button--small"
              onClick={() => onOrderWork(part.id, 'repair')}
            >
              Order repair
            </button>
          ) : (
            <button
              type="button"
              className="button button--small"
              onClick={() => onOrderWork(part.id, 'service')}
            >
              Order service
            </button>
          )}
        </div>
      </div>

      <button
        type="button"
        className="switch"
        role="switch"
        aria-checked={part.enabled}
        aria-label={`${part.name}: ${part.enabled ? 'online' : 'offline'}`}
        disabled={!part.switchable || part.broken}
        onClick={() => onToggle(part.id, !part.enabled)}
      >
        <span className="switch__track">
          <span className="switch__thumb" />
        </span>
      </button>
    </li>
  )
}

export function ShipViewport({
  shipName,
  className,
  rooms,
  crew,
  power,
  openRoomId,
  onSelectRoom,
  onTogglePart,
  onOrderWork,
}: ShipViewportProps) {
  // Off by default: the schematic has to be complete on its own (SV-12).
  const [showFlow, setShowFlow] = useState(false)
  const [openCrewId, setOpenCrewId] = useState<string | undefined>()

  const openCrew = crew.find((c) => c.id === openCrewId)

  return (
    <section className="ship" aria-label="Ship cross-section">
      <header className="ship__id">
        <div className="ship__titles">
          <h1 className="ship__name">{shipName}</h1>
          <p className="ship__class">{className}</p>
        </div>
        <button
          type="button"
          className={`flowtoggle ${showFlow ? 'is-on' : ''}`}
          aria-pressed={showFlow}
          onClick={() => setShowFlow((v) => !v)}
        >
          <span className="flowtoggle__marks" aria-hidden="true">
            <span className="flowtoggle__mark flowtoggle__mark--power" />
            <span className="flowtoggle__mark flowtoggle__mark--heat" />
            <span className="flowtoggle__mark flowtoggle__mark--water" />
          </span>
          Flows
        </button>
      </header>

      {showFlow && (
        <p className="ship__legend">
          <span className="legend legend--power">Power</span>
          <span className="legend legend--heat">Heat</span>
          <span className="legend legend--water">Water</span>
          <span className="ship__legend-note">
            Width is magnitude; arrows point the way it moves.
          </span>
        </p>
      )}

      <div className="stack">
        {/* The nose. Its base matches the deck stack exactly, so the hull reads
            as one continuous outline rather than a hat sitting on a box. */}
        <svg className="stack__nose" viewBox="0 0 100 26" preserveAspectRatio="none" aria-hidden="true">
          <path d="M50 1 L99.5 25 L99.5 26 L0.5 26 L0.5 25 Z" />
        </svg>

        <ol className="decks">
          {rooms.map((room) => {
            const open = openRoomId === room.id
            return (
              <li key={room.id} className={`deck ${open ? 'is-open' : ''}`}>
                <button
                  type="button"
                  className="deck__head"
                  aria-expanded={open}
                  onClick={() => onSelectRoom(open ? undefined : room.id)}
                >
                  <span className="deck__index">{room.deck}</span>
                  <span className="deck__labels">
                    <span className="deck__name">
                      {room.short}
                      {room.needsAttention && (
                        <span className="deck__alert" aria-label="needs attention" />
                      )}
                    </span>
                    {room.name.toLowerCase() !== room.short.toLowerCase() && (
                      <span className="deck__full">{room.name}</span>
                    )}
                  </span>
                  <span
                    className={`deck__power ${room.netKw > 0 ? 'is-source' : room.netKw < 0 ? 'is-load' : ''}`}
                  >
                    {powerLabel(room.netKw)}
                  </span>
                </button>

                {/* The deck itself. Sits between the header and the part list
                    so tapping to expand still works exactly as it did. */}
                <DeckSchematic
                  room={room}
                  crew={crew.filter((c) => c.roomId === room.id)}
                  showFlow={showFlow}
                  onSelectCrew={setOpenCrewId}
                />

                {open && (
                  <div className="deck__body">
                    <p className="deck__blurb">{room.blurb}</p>
                    {room.parts.length === 0 ? (
                      <p className="deck__empty">Nothing installed.</p>
                    ) : (
                      <ul className="parts">
                        {room.parts.map((part) => (
                          <PartRow
                            key={part.id}
                            part={part}
                            onToggle={onTogglePart}
                            onOrderWork={onOrderWork}
                          />
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ol>

        {/* Engine bell, tapering in from the full hull width. */}
        <svg className="stack__tail" viewBox="0 0 100 22" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0.5 0 L99.5 0 L72 20 L28 20 Z" />
        </svg>
        <div className={`stack__plume ${power.netKw < 0 ? 'is-hot' : ''}`} aria-hidden="true" />
      </div>

      {openCrew && (
        <div className="whois" role="dialog" aria-label={openCrew.name}>
          <div className="whois__head">
            <span className="whois__initials">{openCrew.initials}</span>
            <span className="whois__names">
              <strong className="whois__name">{openCrew.name}</strong>
              <span className="whois__role">
                {openCrew.role} · {openCrew.age} · watch {openCrew.watch}
              </span>
            </span>
            <button
              type="button"
              className="whois__close"
              aria-label="Close"
              onClick={() => setOpenCrewId(undefined)}
            >
              ×
            </button>
          </div>
          <p className="whois__doing">{openCrew.doing}</p>
          <p className="whois__blurb">{openCrew.blurb}</p>
        </div>
      )}
    </section>
  )
}
