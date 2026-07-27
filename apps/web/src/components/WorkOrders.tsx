/**
 * The job queue. Design doc §3.3, §4.3, §4.6.
 *
 * You do not turn the wrench. You order the work and watch it take hours or
 * days, at a pace set by who is on watch and what the air is like -- which is
 * the whole management framing rendered as a progress bar.
 *
 * §4.3 states the two things a remote manager actually controls: "you approve
 * the watch bill and the work-order **priorities**". The watch bill has had a
 * panel since M1; the priorities did not exist. The queue was strictly oldest
 * first, so the only way to get a failed scrubber looked at before a routine
 * service raised an hour earlier was to cancel the service and lose the hours
 * already in it. That is not a decision, it is a workaround.
 *
 * This is also where the standing order lives, because the order and the queue
 * it fills are one subject: a player wondering "why is the ship servicing
 * things by itself" should find the answer in the same place as the evidence.
 */
import { formatDuration, type WorkOrderView } from '@solsyn/sim'

export interface WorkOrdersProps {
  orders: WorkOrderView[]
  /** Whether the ship raises its own services (§7.3). */
  autoService: boolean
  /** Condition at or below which it does, so the panel can state the rule. */
  autoServiceAt: number
  onCancel: (id: string) => void
  onMove: (id: string, direction: 'up' | 'down') => void
  onSetAutoService: (on: boolean) => void
}

export function WorkOrders({
  orders,
  autoService,
  autoServiceAt,
  onCancel,
  onMove,
  onSetAutoService,
}: WorkOrdersProps) {
  return (
    <section className="panel" aria-label="Work orders">
      <h2 className="panel__title">Work Orders</h2>

      {/* The standing order, above the queue it fills. */}
      <div className="standing">
        <button
          type="button"
          className="standing__toggle switch"
          role="switch"
          aria-checked={autoService}
          onClick={() => onSetAutoService(!autoService)}
        >
          <span className="switch__track">
            <span className="switch__thumb" />
          </span>
          <span className="standing__label">Service parts without asking</span>
        </button>
        <p className="panel__note standing__note">
          A service puts back a fixed 32 points of condition and the ceiling throws away the
          rest, so there is one right moment to spend a spare: at or below{' '}
          <strong>{Math.round(autoServiceAt)}%</strong>. With this set the ship waits for that
          moment on every part, including while the app is closed. It never orders a repair —
          a failure is yours to answer.
        </p>
      </div>

      {orders.length === 0 ? (
        <p className="deck__empty">
          Nothing queued. {autoService ? 'Nothing is worn enough to be worth a spare yet.' : ''}
        </p>
      ) : (
        <>
          <p className="panel__note orders__note">
            Worked top down, one job per free hand. Move a job up to have it taken first — the
            hours already put into a job are never lost when it is reordered.
          </p>

          <ol className="orders">
            {orders.map((order) => (
              <li key={order.id} className={`order order--${order.status}`}>
                <div className="order__head">
                  <span className="order__part">{order.partName}</span>
                  <span className={`tag tag--${order.kind === 'repair' ? 'critical' : 'normal'}`}>
                    {order.kind}
                  </span>
                  {/* Whose idea this job was. Without it, a queue that fills
                      itself looks like a queue that is malfunctioning. */}
                  {order.auto && (
                    <span className="tag tag--auto" title="Raised by the standing order">
                      standing order
                    </span>
                  )}
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
                    {` · part at ${Math.round(order.condition)}%`}
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

                {/* Ordering a service too early is the mistake the standing
                    order exists to prevent, so when the player makes it by hand
                    the queue says what it is costing rather than silently
                    doing it. */}
                {order.wasted > 0 && (
                  <p className="order__waste">
                    {Math.round(order.wasted)} of the 32 points will hit the ceiling and be lost.
                    Worth waiting unless this part is about to fail.
                  </p>
                )}

                <div className="order__actions">
                  {order.assignedName && (
                    <span className="order__hand">{order.assignedName} has it</span>
                  )}
                  <span className="order__move">
                    <button
                      type="button"
                      className="button button--quiet button--small"
                      disabled={order.first}
                      aria-label={`Move ${order.partName} up the queue`}
                      onClick={() => onMove(order.id, 'up')}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="button button--quiet button--small"
                      disabled={order.last}
                      aria-label={`Move ${order.partName} down the queue`}
                      onClick={() => onMove(order.id, 'down')}
                    >
                      ↓
                    </button>
                  </span>
                  <button
                    type="button"
                    className="button button--quiet"
                    onClick={() => onCancel(order.id)}
                  >
                    Cancel
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  )
}

/**
 * Who has what. Design doc §4.3, §4.6.
 *
 * The queue answers "what is being done"; this answers "by whom, and who is
 * spare". Both belong on the same screen because they are the two halves of
 * one question -- a job sitting at "waiting for a free hand" means nothing
 * until you can see that three of the four hands are asleep.
 *
 * Assignment itself stays automatic: the best hand *for that job* takes the top
 * of the queue, because servicing and repairing are different competences
 * (§4.2) and picking the wrong one by hand is not an interesting decision. What
 * the player controls is the order of the queue, which is what §4.3 actually
 * promises.
 */
export function Assignments({
  crew,
  orders,
}: {
  crew: { id: string; name: string; role: string; activity: string; doing: string; workOrderId?: string }[]
  orders: WorkOrderView[]
}) {
  const jobFor = (id: string | undefined) => orders.find((o) => o.id === id)

  return (
    <section className="panel" aria-label="Assignments">
      <h2 className="panel__title">Hands</h2>
      <ul className="hands">
        {crew.map((c) => {
          const job = jobFor(c.workOrderId)
          return (
            <li key={c.id} className={`hand hand--${c.activity} ${job ? 'is-working' : ''}`}>
              <span className="hand__who">
                <strong className="hand__name">{c.name}</strong>
                <span className="hand__role">{c.role}</span>
              </span>
              <span className="hand__doing">
                {job ? (
                  <>
                    <span className="hand__job">{job.partName}</span>
                    <span className="hand__eta">
                      {Number.isFinite(job.secondsRemaining)
                        ? `${formatDuration(job.secondsRemaining)} to go`
                        : 'stalled'}
                    </span>
                  </>
                ) : (
                  <span className="hand__idle">{c.doing}</span>
                )}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="panel__note">
        Jobs go to the best hand for that job — servicing and repairing are different
        competences, so the ranking is per job rather than per watch. Only crew on watch can
        take one; the queue waits rather than waking anybody.
      </p>
    </section>
  )
}
