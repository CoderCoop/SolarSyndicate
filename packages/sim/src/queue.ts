/**
 * The event queue. Design doc §7.2, §8.2.
 *
 * Kept as a sorted array rather than a binary heap. At the event volumes this
 * game produces (tens of pending events, thousands popped during a long
 * catch-up) the difference is irrelevant, and a sorted array has a property a
 * heap does not: its serialized form is canonical. Two states holding the same
 * pending events always hash identically regardless of the order those events
 * were scheduled in, which is exactly what save verification and the
 * determinism tests need. Revisit only if profiling ever says so.
 */
import type { GameTime } from './time.js'
import type { SimEvent } from './types.js'

/** Ordering: earliest first, ties broken by schedule order. */
function before(a: SimEvent, b: SimEvent): boolean {
  return a.at < b.at || (a.at === b.at && a.seq < b.seq)
}

/** Insert into a sorted queue, in place. */
export function schedule(queue: SimEvent[], event: SimEvent): void {
  let lo = 0
  let hi = queue.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    const at = queue[mid]!
    if (before(at, event)) lo = mid + 1
    else hi = mid
  }
  queue.splice(lo, 0, event)
}

/** Remove every event of a given kind. Used when a rate change invalidates a prediction. */
export function cancelKind(queue: SimEvent[], kind: SimEvent['kind']): void {
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i]!.kind === kind) queue.splice(i, 1)
  }
}

/** The next event due at or before `t`, or undefined. */
export function peekDue(queue: SimEvent[], t: GameTime): SimEvent | undefined {
  const head = queue[0]
  return head && head.at <= t ? head : undefined
}

/** Pop the earliest event. */
export function pop(queue: SimEvent[]): SimEvent | undefined {
  return queue.shift()
}
