/**
 * Determinism primitives. Design doc §7.2, §12.2 risk 5.
 */
import { describe, expect, it } from 'vitest'
import { Rng, hashString, randomAt } from '../src/rng.js'
import { canonicalize, stateHash } from '../src/hash.js'

describe('seeded randomness', () => {
  it('is reproducible for the same key', () => {
    const a = new Rng(42, 'part:reactor/failure')
    const b = new Rng(42, 'part:reactor/failure')
    const seqA = Array.from({ length: 20 }, () => a.next())
    const seqB = Array.from({ length: 20 }, () => b.next())
    expect(seqA).toEqual(seqB)
  })

  it('gives independent sequences to independent streams', () => {
    // The property that matters most: adding a random draw in one system must
    // not perturb every outcome in another.
    const a = new Rng(42, 'stream-a')
    const b = new Rng(42, 'stream-b')
    expect(a.next()).not.toBe(b.next())
  })

  it('resumes a sequence from a persisted counter', () => {
    const a = new Rng(1, 's')
    a.next()
    a.next()
    const resumed = new Rng(1, 's', a.counter)
    const fresh = new Rng(1, 's')
    fresh.next()
    fresh.next()
    expect(resumed.next()).toBe(fresh.next())
  })

  it('reports how many draws were consumed', () => {
    const r = new Rng(1, 's', 5)
    r.next()
    r.next()
    expect(r.counter).toBe(7)
  })

  it('produces values in range', () => {
    const r = new Rng(9, 'range')
    for (let i = 0; i < 2000; i++) {
      const v = r.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
    const ints = new Rng(9, 'ints')
    for (let i = 0; i < 2000; i++) {
      const v = ints.int(3, 7)
      expect(v).toBeGreaterThanOrEqual(3)
      expect(v).toBeLessThanOrEqual(7)
    }
  })

  it('is roughly uniform', () => {
    const r = new Rng(11, 'uniform')
    let sum = 0
    const n = 20000
    for (let i = 0; i < n; i++) sum += r.next()
    expect(sum / n).toBeGreaterThan(0.48)
    expect(sum / n).toBeLessThan(0.52)
  })

  it('exposes a stateless draw', () => {
    expect(randomAt(3, 'x', 4)).toBe(new Rng(3, 'x', 4).next())
  })

  it('hashes strings stably', () => {
    expect(hashString('reactor')).toBe(hashString('reactor'))
    expect(hashString('reactor')).not.toBe(hashString('reactos'))
  })
})

describe('canonical hashing', () => {
  it('ignores key order', () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }))
  })

  it('keeps non-finite numbers distinguishable', () => {
    // JSON.stringify collapses all of these to null, which would silently make
    // divergent states hash the same.
    const seen = new Set(
      [Infinity, -Infinity, NaN, null, 0].map((v) => canonicalize({ v })),
    )
    expect(seen.size).toBe(5)
  })

  it('distinguishes states that differ anywhere', () => {
    const base = { ship: { parts: [{ id: 'a', enabled: true }] }, now: 10 }
    const tweaked = { ship: { parts: [{ id: 'a', enabled: false }] }, now: 10 }
    expect(stateHash(base)).not.toBe(stateHash(tweaked))
  })

  it('is stable across a JSON round-trip', () => {
    const v = { a: [1, 2, { b: 'x' }], c: true }
    expect(stateHash(JSON.parse(JSON.stringify(v)))).toBe(stateHash(v))
  })
})
