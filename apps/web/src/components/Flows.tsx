/**
 * The flow view. Spec 004 RF-13 to RF-20.
 *
 * One channel per gauge on the Life tab, plus power. Every channel uses the
 * same grammar -- sources in, returns back, consumers ranked by magnitude,
 * a buffer absorbing the difference, and a footer that says what the balance
 * means and what it becomes if the key part stops -- so learning one teaches
 * the rest.
 *
 * The trunk down the left is what the old margin overlay could not draw: the
 * resource passing through the ship, with each node branching off it. Width is
 * magnitude, and every magnitude comes from the same selector the rest of the
 * UI reads, so the picture cannot disagree with the numbers.
 */
import { useState } from 'react'
import type { FlowChannel, FlowNode } from '@solsyn/sim'

const ROLE_ORDER: Record<FlowNode['role'], number> = {
  source: 0,
  return: 1,
  consumer: 2,
  buffer: 3,
}

const ROLE_LABEL: Record<FlowNode['role'], string> = {
  source: 'in',
  return: 'returned',
  consumer: 'out',
  buffer: 'buffer',
}

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

function Node({
  node,
  scale,
  unit,
}: {
  node: FlowNode
  scale: number
  unit: string
}) {
  // Every node keeps a visible stub even at zero, so a part you switched off
  // stays on the diagram rather than vanishing from it.
  const width = node.magnitude <= 0 ? 3 : 3 + (node.magnitude / scale) * 97

  return (
    <li className={`fnode fnode--${node.role} ${node.idle ? 'is-idle' : ''}`}>
      <span className="fnode__branch" aria-hidden="true" />
      <div className="fnode__body">
        <div className="fnode__top">
          <span className="fnode__name">{node.name}</span>
          <span className="fnode__value">{formatMagnitude(node.magnitude, unit)}</span>
        </div>
        <div className="fnode__track">
          <div className="fnode__bar" style={{ width: `${Math.min(100, width)}%` }} />
        </div>
        <p className="fnode__where">
          {node.where}
          {node.note && <span className="fnode__note"> · {node.note}</span>}
        </p>
      </div>
    </li>
  )
}

function Channel({ channel }: { channel: FlowChannel }) {
  const nodes = [...channel.nodes].sort(
    (a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || b.magnitude - a.magnitude,
  )
  const scale = Math.max(
    0.0001,
    ...nodes.filter((n) => n.role !== 'buffer').map((n) => n.magnitude),
  )

  let lastRole: FlowNode['role'] | undefined

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
              style={{ width: `${Math.min(100, (channel.level.value / channel.level.capacity) * 100)}%` }}
            />
          </div>
        </div>
      )}

      <ol className="fnodes">
        {nodes.map((node) => {
          const heading = node.role !== lastRole ? ROLE_LABEL[node.role] : undefined
          lastRole = node.role
          return (
            <li key={node.id} className="fgroup">
              {heading && <p className="fgroup__label">{heading}</p>}
              <ul className="fgroup__list">
                <Node node={node} scale={scale} unit={channel.unit} />
              </ul>
            </li>
          )
        })}
      </ol>

      <div className={`flowch__net ${channel.net < 0 ? 'is-negative' : ''}`}>
        <div className="flowch__net-row">
          <span className="flowch__net-label">Net</span>
          <span className="flowch__net-value">
            {channel.net > 0 ? '+' : ''}
            {formatMagnitude(Math.abs(channel.net), channel.unit)}
            {channel.net === 0 ? '' : channel.net > 0 ? '' : ''}
          </span>
          {Number.isFinite(channel.horizonDays) && (
            <span className="flowch__net-horizon">{formatDays(channel.horizonDays)} left</span>
          )}
        </div>
        <p className="flowch__foot">{channel.footnote}</p>
        {channel.counterfactual && (
          <p className="flowch__what-if">{channel.counterfactual}</p>
        )}
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
        Every channel here is a gauge on the Life tab, seen as connections rather
        than as a level. Width is magnitude, and it comes from the same figures
        the rest of the ship reports.
      </p>
    </section>
  )
}
