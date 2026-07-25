/**
 * Canonical serialization + state hashing. Design doc §8.2.
 *
 * The property test that guards the whole architecture is "same seed and same
 * wall-clock window produce an identical world". That needs a stable hash of
 * SimState, which needs a canonical serialization -- key order and non-finite
 * numbers must not be able to vary.
 */

/** Deterministic JSON: object keys sorted, non-finite numbers encoded explicitly. */
export function canonicalize(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'

  const t = typeof value
  if (t === 'number') {
    const n = value as number
    // JSON.stringify turns Infinity/NaN into null, collapsing distinct states
    // into the same hash. Encode them so they stay distinguishable.
    if (Number.isNaN(n)) return '"#NaN"'
    if (n === Infinity) return '"#Inf"'
    if (n === -Infinity) return '"#-Inf"'
    if (Object.is(n, -0)) return '-0'
    return String(n)
  }
  if (t === 'boolean' || t === 'string') return JSON.stringify(value)
  if (t === 'bigint') return `"#bigint:${(value as bigint).toString()}"`

  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`
  }

  if (t === 'object') {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj).sort()
    const parts: string[] = []
    for (const k of keys) {
      if (obj[k] === undefined) continue // match JSON.stringify's omission
      parts.push(`${JSON.stringify(k)}:${canonicalize(obj[k])}`)
    }
    return `{${parts.join(',')}}`
  }

  return JSON.stringify(String(value))
}

/** cyrb53 -- 53-bit hash, ample for detecting state divergence in tests. */
export function hash53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

/** Stable fingerprint of any sim value. Equal hashes ⇒ equal state (in practice). */
export function stateHash(value: unknown): string {
  return hash53(canonicalize(value)).toString(16).padStart(14, '0')
}
