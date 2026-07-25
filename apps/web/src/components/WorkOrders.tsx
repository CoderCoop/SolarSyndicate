/**
 * The job queue. Design doc §3.3, §4.6.
 *
 * You do not turn the wrench. You order the work and watch it take hours or
 * days, at a pace set by who is on watch and what the air is like -- which is
 * the whole management framing rendered as a progress bar.
 */
import { formatDuration, type WorkOrderView } from '@solsyn/sim'

export function WorkOrders({
  orders,
  onCancel,
}: {
  orders: WorkOrderView[]
  onCancel: (id: string) => void
}) {
  if (orders.length === 0) return null

  return (
    <section className="panel" aria-label="Work orders">
      <h2 className="panel__title">Work Orders</h2>

      <ul className="orders">
        {orders.map((order) => (
          <li key={order.id} className={`order order--${order.status}`}>
            <div className="order__head">
              <span className="order__part">{order.partName}</span>
              <span className={`tag tag--${order.kind === 'repair' ? 'critical' : 'normal'}`}>
                {order.kind}
              </span>
            </div>

            <div className="order__bar">
              <div
                className="order__fill"
                style={{ width: `${Math.max(0, Math.min(100, order.fraction * 100))}%` }}
              />
            </div>

            <div className="order__foot">
              <span>
                {order.completed.toFixed(1)} / {order.required} labour-hours
                {order.spares > 0 && ` · ${order.spares} spares`}
              </span>
              <span className="order__eta">
                {order.status === 'blocked'
                  ? 'Blocked: not enough spares'
                  : order.status === 'queued'
                    ? 'Waiting for a free hand'
                    : Number.isFinite(order.secondsRemaining)
                      ? `${formatDuration(order.secondsRemaining)} to go`
                      : 'Stalled'}
              </span>
            </div>

            <div className="order__actions">
              {order.assignedName && (
                <span className="order__hand">{order.assignedName} has it</span>
              )}
              <button type="button" className="button button--quiet" onClick={() => onCancel(order.id)}>
                Cancel
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
