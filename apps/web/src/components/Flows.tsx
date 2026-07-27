/**
 * The flow view. Spec 004 RF-13 to RF-20, and the 004 mockup's diagram.
 *
 * The first attempt was an overlay in the ship view's right margin, which could
 * encode *how much* passes each deck and nothing else. The second was a ranked
 * list with a trunk down the left, which was legible but was still a bar chart:
 * it could not show that water is a **loop**, and — because nothing summed the
 * bars — it let a contributor go missing entirely without looking wrong.
 *
 * This is the diagram the mockup argued for. Same grammar on every channel, so
 * learning one teaches the rest:
 *
 *   sources    across the top, feeding down
 *   the bus    one bar, the thing everything passes through
 *   consumers  ranked by magnitude, link width = draw
 *   buffer     off to the side, arrow in or out, because it is neither
 *   returns    a dashed edge up the left margin and back into the source
 *   net        a footer with the horizon and the counterfactual
 *
 * Link width is magnitude on a shared scale, so "the biggest consumer is the
 * thickest line" is true by construction rather than by being careful. Every
 * figure comes from the same selectors the rest of the UI reads (SV-14).
 */
import { useState } from 'react'
import type { FlowChannel } from '@solsyn/sim'

const W = 340
const PAD = 14
const COL_W = 214
/** Longest part name a row can show before it collides with its own figure. */
const NAME_MAX = 21
const ROW_H = 34
const ROW_GAP = 22
const BUS_Y = 96
const BUS_H = 24

/** Consumers drawn individually before the tail collapses into one line. */
const MAX_ROWS = 5

function formatDays(days: number): string {
  if (!Number.isFinite(days)) return 'no end in sight'
  if (days < 1) return `${Math.round(days * 24)} h`
  if (days < 400) return `${Math.round(days)} days`
  return `${(days / 365).toFixed(1)} years`
}

function formatMagnitude(value: number, unit: string): string {
  if (unit === 'kg' && value >= 1000) return `${(value / 1000).toFixed(1)} t`
  const decimals = value >= 100 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(decimals)}${unit ? ` ${unit}` : ''}`
}

/**
 * Edge width from magnitude. Everything gets a visible stub so a part switched
 * off stays on the diagram rather than vanishing from it — "where did it go" is
 * a worse question than "why is it thin".
 */
function edgeWidth(magnitude: number, scale: number): number {
  if (magnitude <= 0) return 1.2
  return 1.6 + (magnitude / scale) * 4.5
}

function Diagram({ channel }: { channel: FlowChannel }) {
  const sources = channel.nodes.filter((n) => n.role === 'source')
  const returns = channel.nodes.filter((n) => n.role === 'return')
  const buffer = channel.nodes.find((n) => n.role === 'buffer')
  const consumers = [...channel.nodes.filter((n) => n.role === 'consumer')].sort(
    (a, b) => b.magnitude - a.magnitude,
  )

  const scale = Math.max(
    0.0001,
    ...[...sources, ...consumers, ...returns].map((n) => n.magnitude),
  )

  const shown = consumers.slice(0, MAX_ROWS)
  const rest = consumers.slice(MAX_ROWS)
  const restTotal = rest.reduce((s, n) => s + n.magnitude, 0)

  const firstRowY = BUS_Y + BUS_H + 26
  const height = firstRowY + shown.length * (ROW_H + ROW_GAP) + (rest.length > 0 ? 20 : 4)

  // Sources sit across the top, sharing the width.
  const srcW = Math.min(150, (W - PAD * 2 - 8 * (sources.length - 1)) / Math.max(1, sources.length))

  return (
    <svg
      className="fdia"
      viewBox={`0 0 ${W} ${height}`}
      role="img"
      aria-label={describe(channel)}
    >
      <defs>
        {/* markerUnits defaults to strokeWidth, which makes a thick edge draw a
            giant arrowhead. Pin the head to user space so width means magnitude
            and nothing else. */}
        <marker
          id="fdia-ar"
          viewBox="0 0 8 8"
          refX="6"
          refY="4"
          markerWidth="5"
          markerHeight="5"
          markerUnits="userSpaceOnUse"
          orient="auto"
        >
          <path d="M0 0 L8 4 L0 8 Z" className="fdia__arrowhead" />
        </marker>
      </defs>

      {/* --- sources, feeding the bus ---------------------------------- */}
      {sources.map((n, i) => {
        const x = PAD + i * (srcW + 8)
        const cx = x + srcW / 2
        return (
          <g key={n.id} className={`fdia__src ${n.idle ? 'is-idle' : ''}`}>
            <rect x={x} y={14} width={srcW} height={40} rx="6" />
            <text className="fdia__src-name" x={cx} y={31} textAnchor="middle">
              {n.name}
            </text>
            <text className="fdia__src-value" x={cx} y={46} textAnchor="middle">
              +{formatMagnitude(n.magnitude, channel.unit)}
            </text>
            <path
              className="fdia__edge"
              d={`M${cx} 54 V${BUS_Y}`}
              strokeWidth={edgeWidth(n.magnitude, scale)}
              markerEnd="url(#fdia-ar)"
            />
          </g>
        )
      })}

      {sources.length === 0 && (
        <text className="fdia__none" x={PAD} y={40}>
          Nothing feeds this but the tank.
        </text>
      )}

      {/* --- the bus / the store --------------------------------------- */}
      <g className="fdia__bus">
        <rect x={PAD} y={BUS_Y} width={W - PAD * 2} height={BUS_H} rx="4" />
        <text className="fdia__bus-label" x={PAD + 10} y={BUS_Y + 16}>
          MAIN BUS
        </text>
        <text
          className={`fdia__bus-net ${channel.net < 0 ? 'is-negative' : ''}`}
          x={W - PAD - 10}
          y={BUS_Y + 16}
          textAnchor="end"
        >
          {channel.net > 0 ? '+' : channel.net < 0 ? '−' : ''}
          {formatMagnitude(Math.abs(channel.net), channel.unit)}
        </text>
      </g>

      {/* --- the buffer, off to the side ------------------------------- */}
      {buffer && (
        <g className={`fdia__buffer ${channel.net < 0 ? 'is-draining' : ''}`}>
          <path
            className="fdia__edge fdia__edge--buffer"
            d={`M${W - PAD - 46} ${BUS_Y + BUS_H} V${BUS_Y + BUS_H + 14}`}
            strokeWidth="2.6"
            markerEnd="url(#fdia-ar)"
          />
          <rect x={W - PAD - 96} y={BUS_Y + BUS_H + 16} width="96" height="34" rx="6" />
          <text className="fdia__buffer-name" x={W - PAD - 48} y={BUS_Y + BUS_H + 30} textAnchor="middle">
            {buffer.name}
          </text>
          <text className="fdia__buffer-note" x={W - PAD - 48} y={BUS_Y + BUS_H + 43} textAnchor="middle">
            {buffer.note ?? formatMagnitude(buffer.magnitude, channel.unit)}
          </text>
        </g>
      )}

      {/* --- consumers, ranked ----------------------------------------- */}
      {shown.map((n, i) => {
        const y = firstRowY + i * (ROW_H + ROW_GAP)
        const stemX = PAD + 26
        return (
          <g key={n.id} className={`fdia__row ${n.idle ? 'is-idle' : ''}`}>
            <path
              className="fdia__edge"
              d={`M${stemX} ${i === 0 ? BUS_Y + BUS_H : y - ROW_GAP} V${y}`}
              strokeWidth={edgeWidth(n.magnitude, scale)}
              markerEnd="url(#fdia-ar)"
            />
            <rect x={PAD} y={y} width={COL_W} height={ROW_H} rx="5" />
            <rect
              className={`fdia__row-tab ${n.priority ? `is-${n.priority}` : ''}`}
              x={PAD}
              y={y}
              width="4.5"
              height={ROW_H}
              rx="2"
            />
            <text className="fdia__row-name" x={PAD + 14} y={y + 13}>
              {n.name.length > NAME_MAX ? `${n.name.slice(0, NAME_MAX - 1)}…` : n.name}
            </text>
            <text className="fdia__row-where" x={PAD + 14} y={y + 24}>
              {n.idle ? 'idle' : n.priority ? `${n.where} · ${n.priority}` : n.where}
            </text>
            <text className="fdia__row-value" x={PAD + COL_W - 8} y={y + 26} textAnchor="end">
              −{formatMagnitude(n.magnitude, channel.unit)}
            </text>
          </g>
        )
      })}

      {rest.length > 0 && (
        <text className="fdia__more" x={PAD} y={height - 6}>
          + {rest.length} more drawing {formatMagnitude(restTotal, channel.unit)}
        </text>
      )}

      {/* --- the return edge: up the left margin, back into the top ----- */}
      {returns.map((n) => (
        <g key={n.id} className={`fdia__return ${n.idle ? 'is-idle' : ''}`}>
          <path
            className="fdia__edge fdia__edge--return"
            d={`M${PAD} ${firstRowY + 12} H7 V${BUS_Y + 8} H${PAD}`}
            strokeWidth={Math.min(3.5, edgeWidth(n.magnitude, scale))}
            markerEnd="url(#fdia-ar)"
          />
          <text
            className="fdia__return-label"
            x="18"
            y={(BUS_Y + firstRowY) / 2}
            textAnchor="middle"
            transform={`rotate(-90 18 ${(BUS_Y + firstRowY) / 2})`}
          >
            {n.idle ? `${n.name} offline` : `${n.name} · ${formatMagnitude(n.magnitude, channel.unit)}`}
          </text>
        </g>
      ))}
    </svg>
  )
}

function describe(channel: FlowChannel): string {
  const bits = channel.nodes
    .filter((n) => n.role !== 'buffer')
    .map((n) => `${n.name} ${n.role === 'consumer' ? 'takes' : 'gives'} ${n.magnitude.toFixed(1)}`)
  return `${channel.label}: ${bits.join('; ')}. Net ${channel.net.toFixed(1)} ${channel.unit}.`
}

function Channel({ channel }: { channel: FlowChannel }) {
  return (
    <div className={`flowch flowch--${channel.key}`}>
      {channel.level && (
        <div className="flowch__level">
          <div className="flowch__level-top">
            <span>{channel.label}</span>
            <span className="flowch__level-value">
              {formatMagnitude(channel.level.value, channel.level.unit)}
              <span className="flowch__level-cap">
                {' '}
                / {formatMagnitude(channel.level.capacity, channel.level.unit)}
              </span>
            </span>
          </div>
          <div className="flowch__level-track">
            <div
              className="flowch__level-fill"
              style={{
                width: `${Math.min(100, (channel.level.value / channel.level.capacity) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      <Diagram channel={channel} />

      <div className={`flowch__net ${channel.net < 0 ? 'is-negative' : ''}`}>
        <div className="flowch__net-row">
          <span className="flowch__net-label">Net</span>
          <span className="flowch__net-value">
            {channel.net > 0 ? '+' : ''}
            {formatMagnitude(Math.abs(channel.net), channel.unit)}
          </span>
          {Number.isFinite(channel.horizonDays) && (
            <span className="flowch__net-horizon">{formatDays(channel.horizonDays)} left</span>
          )}
        </div>
        <p className="flowch__foot">{channel.footnote}</p>
        {channel.counterfactual && <p className="flowch__what-if">{channel.counterfactual}</p>}
      </div>
    </div>
  )
}

export function Flows({ channels }: { channels: FlowChannel[] }) {
  const [key, setKey] = useState(channels[0]?.key ?? 'power')
  const current = channels.find((c) => c.key === key) ?? channels[0]

  return (
    <section className="panel" aria-label="Flows">
      <h2 className="panel__title">Flows</h2>

      <div className="chans" role="tablist" aria-label="Channel">
        {channels.map((c) => (
          <button
            key={c.key}
            type="button"
            role="tab"
            aria-selected={c.key === key}
            className={`chans__btn ${c.key === key ? 'is-on' : ''}`}
            onClick={() => setKey(c.key)}
          >
            {c.key === 'heat' ? 'Heat' : c.key === 'co2' ? 'CO₂' : c.key === 'o2' ? 'O₂' : c.label}
          </button>
        ))}
      </div>

      {current && <Channel channel={current} />}

      <p className="panel__note">
        Every channel here is a gauge on the Life tab, seen as connections rather than as a
        level. Sources feed the bus, consumers are ranked by draw, the buffer sits to the side
        because it is neither, and a dashed edge up the margin is what comes back.
      </p>
    </section>
  )
}
