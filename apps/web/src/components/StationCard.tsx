/**
 * One machine, opened. Spec 004 RF-9, RF-10, RF-36d.
 *
 * Tapping a station opens it here, directly beneath the room it lives in and
 * with the machine itself held highlighted above -- so the thing touched and
 * the thing being read are visibly the same object. Before this, tapping a deck
 * expanded four parts and the player went hunting for the one they were already
 * looking at.
 *
 * The card shows both health axes, because they are different problems with
 * different answers: condition is wear and a work order fixes it; tune is
 * adjustment and only having someone on station fixes it (RF-36d).
 */
import type { RoomView } from '@solsyn/sim'

type Part = RoomView['parts'][number]
type Attendance = RoomView['attendance']

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

function tuneTone(tune: number): string {
  if (tune >= 90) return 'sharp'
  if (tune >= 60) return 'good'
  if (tune >= 40) return 'worn'
  return 'poor'
}

function Meter({
  label,
  value,
  caption,
  tone,
  hint,
}: {
  label: string
  value: number
  caption: string
  tone: string
  hint: string
}) {
  return (
    <div className={`meterline meterline--${tone}`}>
      <div className="meterline__top">
        <span className="meterline__label">{label}</span>
        <span className="meterline__value">
          {Math.round(value)}% {caption}
        </span>
      </div>
      <div className="meterline__track">
        <div className="meterline__fill" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
      <p className="meterline__hint">{hint}</p>
    </div>
  )
}

export interface StationCardProps {
  part: Part
  attendance: Attendance
  onClose: () => void
  onToggle: (partId: string, enabled: boolean) => void
  onOrderWork: (partId: string, kind: 'service' | 'repair') => void
}

export function StationCard({
  part,
  attendance,
  onClose,
  onToggle,
  onOrderWork,
}: StationCardProps) {
  const state = part.broken ? 'broken' : part.shed ? 'shed' : part.enabled ? 'on' : 'off'

  return (
    <div className={`station station--${state}`} role="group" aria-label={part.name}>
      <div className="station__head">
        <span className="station__name">{part.name}</span>
        <span className={`station__power ${part.effectiveKw > 0 ? 'is-source' : 'is-load'}`}>
          {powerLabel(part.effectiveKw)}
        </span>
        <button type="button" className="station__close" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="station__meters">
        <Meter
          label="Condition"
          value={part.condition}
          caption={part.conditionLabel}
          tone={conditionTone(part.condition)}
          hint="Physical wear. A work order restores it, at the cost of hours and spares."
        />
        <Meter
          label="Tune"
          value={part.tune}
          caption={part.tuneLabel}
          tone={tuneTone(part.tune)}
          hint={
            attendance.attended
              ? `${attendance.name ?? 'Someone'} is on this deck, holding it in adjustment.`
              : 'Nobody is on this deck. Small inefficiencies go unnoticed and add up.'
          }
        />
      </div>

      <p className="station__blurb">{part.blurb}</p>

      <div className="station__tags">
        <span className={`tag tag--${part.priority}`}>{part.priority}</span>
        {part.broken && <span className="tag tag--broken">failed</span>}
        {part.shed && <span className="tag tag--shed">shed on brownout</span>}
        {!part.switchable && <span className="tag tag--locked">not switchable</span>}
      </div>

      <div className="station__actions">
        {part.hasWorkOrder ? (
          <span className="station__ordered">Work ordered</span>
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
      </div>
    </div>
  )
}
