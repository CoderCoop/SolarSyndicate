import { describe, expect, it } from 'vitest'
import { boundTime, fillFraction, levelAt, makeReservoir, settle } from '../src/resources.js'

describe('reservoirs', () => {
  it('derives level from rate without ticking', () => {
    const r = makeReservoir(100, 0, 200, 0)
    r.rate = 1
    expect(levelAt(r, 0)).toBe(100)
    expect(levelAt(r, 50)).toBe(150)
    // The point of the whole design: a distant read costs the same as a near one.
    expect(levelAt(r, 1e9)).toBe(200)
  })

  it('clamps to bounds in both directions', () => {
    const r = makeReservoir(10, 0, 100, 0)
    r.rate = -1
    expect(levelAt(r, 5)).toBe(5)
    expect(levelAt(r, 10)).toBe(0)
    expect(levelAt(r, 1000)).toBe(0)
  })

  it('settles idempotently', () => {
    const r = makeReservoir(100, 0, 200, 0)
    r.rate = 2
    settle(r, 10)
    expect(r.value).toBe(120)
    expect(r.since).toBe(10)
    settle(r, 10)
    expect(r.value).toBe(120)
  })

  it('predicts the next boundary', () => {
    const draining = makeReservoir(100, 0, 200, 0)
    draining.rate = -2
    expect(boundTime(draining)).toBe(50)

    const charging = makeReservoir(100, 0, 200, 0)
    charging.rate = 4
    expect(boundTime(charging)).toBe(25)

    const idle = makeReservoir(100, 0, 200, 0)
    expect(boundTime(idle)).toBe(Infinity)
  })

  it('reports no boundary when already resting against it', () => {
    // Guards an infinite scheduling loop: an event at the current instant that
    // re-schedules itself at the current instant.
    const empty = makeReservoir(0, 0, 200, 0)
    empty.rate = -5
    expect(boundTime(empty)).toBe(Infinity)

    const full = makeReservoir(200, 0, 200, 0)
    full.rate = 5
    expect(boundTime(full)).toBe(Infinity)
  })

  it('reports fill fraction', () => {
    const r = makeReservoir(50, 0, 200, 0)
    expect(fillFraction(r, 0)).toBe(0.25)
  })

  it('does not re-predict a boundary it has effectively reached', () => {
    // Regression: settling exactly at a predicted boundary can leave the level
    // a fraction of a ULP short, and an exact comparison then predicts another
    // boundary a nanosecond later -- forever. Caught in M0 by the engine's
    // event-storm guard.
    const r = makeReservoir(0, 0, 200, 0)
    r.rate = 200 / 3600 // full in one hour

    const bound = boundTime(r)
    settle(r, bound)

    expect(r.value).toBe(200) // snapped exactly, not 199.999...
    expect(boundTime(r)).toBe(Infinity)
  })

  it('snaps to empty as well as to full', () => {
    const r = makeReservoir(200, 0, 200, 0)
    r.rate = -200 / 3600
    settle(r, boundTime(r))
    expect(r.value).toBe(0)
    expect(boundTime(r)).toBe(Infinity)
  })
})
