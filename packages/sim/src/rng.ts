/**
 * Deterministic randomness. Design doc §7.2.
 *
 * All randomness is a pure function of (worldSeed, streamId, counter). No
 * global generator state, no Math.random. This is what makes offline catch-up
 * reproducible, bugs replayable, and a future server able to verify a client's
 * claimed history by replaying it.
 *
 * Streams are keyed by a string (usually an entity id plus a purpose, e.g.
 * "part:reactor-1/failure") so that two unrelated systems drawing numbers can
 * never perturb each other's sequence. That property matters more than it
 * sounds: without it, adding a new random draw anywhere changes every
 * subsequent outcome everywhere.
 */

/** 32-bit string hash (FNV-1a). Stable across platforms and JS engines. */
export function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    // h *= 16777619, kept in 32-bit range via Math.imul
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32 -- small, fast, good enough for game randomness, fully portable. */
function mulberry32(a: number): () => number {
  let t = a >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = t
    r = Math.imul(r ^ (r >>> 15), r | 1)
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A draw sequence for one (seed, stream) pair, starting at `counter`.
 *
 * Consumers must persist `rng.counter` back into SimState so the next draw
 * continues the sequence rather than repeating it.
 */
export class Rng {
  readonly seed: number
  readonly stream: string
  private _counter: number
  private readonly streamHash: number

  constructor(seed: number, stream: string, counter = 0) {
    this.seed = seed
    this.stream = stream
    this._counter = counter
    this.streamHash = hashString(stream)
  }

  get counter(): number {
    return this._counter
  }

  /** Uniform in [0, 1). */
  next(): number {
    // Mix seed, stream and counter into the generator state so that every
    // (seed, stream, counter) triple is independently addressable.
    const mixed = (Math.imul(this.seed ^ this.streamHash, 0x9e3779b1) ^ Math.imul(this._counter + 1, 0x85ebca6b)) >>> 0
    this._counter += 1
    return mulberry32(mixed)()
  }

  /** Uniform in [min, max). */
  float(min: number, max: number): number {
    return min + this.next() * (max - min)
  }

  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1))
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p
  }

  /** Uniform choice. Returns undefined for an empty array. */
  pick<T>(items: readonly T[]): T | undefined {
    if (items.length === 0) return undefined
    return items[this.int(0, items.length - 1)]
  }
}

/** One-shot draw without carrying a counter. */
export function randomAt(seed: number, stream: string, counter: number): number {
  return new Rng(seed, stream, counter).next()
}

/**
 * Draw from a named stream, advancing that stream's persisted counter.
 *
 * Typed structurally rather than against SimState so that this module stays
 * free of state imports -- randomness is a primitive, not a game system.
 */
export function draw(
  state: { seed: number; rngCounters: Record<string, number> },
  stream: string,
): number {
  const rng = new Rng(state.seed, stream, state.rngCounters[stream] ?? 0)
  const value = rng.next()
  state.rngCounters[stream] = rng.counter
  return value
}
