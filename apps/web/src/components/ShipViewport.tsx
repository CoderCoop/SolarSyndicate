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
import type { PowerView, RoomView } from '@solsyn/sim'

export interface ShipViewportProps {
  shipName: string
  className: string
  rooms: RoomView[]
  power: PowerView
  openRoomId: string | undefined
  onSelectRoom: (roomId: string | undefined) => void
  onTogglePart: (partId: string, enabled: boolean) => void
}

function powerLabel(kw: number): string {
  if (Math.abs(kw) < 0.05) return '—'
  return `${kw > 0 ? '+' : ''}${kw.toFixed(1)} kW`
}

function PartRow({
  part,
  onToggle,
}: {
  part: RoomView['parts'][number]
  onToggle: (partId: string, enabled: boolean) => void
}) {
  const state = part.shed ? 'shed' : part.enabled ? 'on' : 'off'

  return (
    <li className={`part part--${state}`}>
      <div className="part__main">
        <div className="part__head">
          <span className="part__name">{part.name}</span>
          <span className={`part__power ${part.powerKw > 0 ? 'is-source' : 'is-load'}`}>
            {powerLabel(part.powerKw)}
          </span>
        </div>
        <p className="part__blurb">{part.blurb}</p>
        <div className="part__tags">
          <span className={`tag tag--${part.priority}`}>{part.priority}</span>
          {part.shed && <span className="tag tag--shed">shed on brownout</span>}
          {!part.switchable && <span className="tag tag--locked">not switchable</span>}
        </div>
      </div>

      <button
        type="button"
        className="switch"
        role="switch"
        aria-checked={part.enabled}
        aria-label={`${part.name}: ${part.enabled ? 'online' : 'offline'}`}
        disabled={!part.switchable}
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
  power,
  openRoomId,
  onSelectRoom,
  onTogglePart,
}: ShipViewportProps) {
  return (
    <section className="ship" aria-label="Ship cross-section">
      <header className="ship__id">
        <h1 className="ship__name">{shipName}</h1>
        <p className="ship__class">{className}</p>
      </header>

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
                    <span className="deck__name">{room.short}</span>
                    {room.name.toLowerCase() !== room.short.toLowerCase() && (
                      <span className="deck__full">{room.name}</span>
                    )}
                  </span>
                  <span className={`deck__power ${room.netKw > 0 ? 'is-source' : room.netKw < 0 ? 'is-load' : ''}`}>
                    {powerLabel(room.netKw)}
                  </span>
                </button>

                {open && (
                  <div className="deck__body">
                    <p className="deck__blurb">{room.blurb}</p>
                    {room.parts.length === 0 ? (
                      <p className="deck__empty">Nothing installed.</p>
                    ) : (
                      <ul className="parts">
                        {room.parts.map((part) => (
                          <PartRow key={part.id} part={part} onToggle={onTogglePart} />
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
    </section>
  )
}
