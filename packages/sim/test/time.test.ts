import { describe, expect, it } from 'vitest'
import {
  DAY,
  HOUR,
  TIME_SCALE,
  formatDuration,
  formatShipClock,
  gameSecondsFromRealMs,
  gameTimeFromUtc,
  realMsFromGameSeconds,
  shipClock,
  utcFromGameTime,
} from '../src/time.js'

describe('time', () => {
  it('holds the design contract: one real hour is one game day', () => {
    // §7.1. If this test fails, every balance number in the game has moved.
    expect(TIME_SCALE).toBe(24)
    expect(gameSecondsFromRealMs(60 * 60 * 1000)).toBe(DAY)
    expect(realMsFromGameSeconds(DAY)).toBe(60 * 60 * 1000)
  })

  it('round-trips UTC through game time', () => {
    const epoch = Date.UTC(2026, 6, 25, 14, 30, 0)
    for (const offsetMs of [0, 1000, 86_400_000, 3.15e10]) {
      const utc = epoch + offsetMs
      expect(utcFromGameTime(gameTimeFromUtc(utc, epoch), epoch)).toBeCloseTo(utc, 6)
    }
  })

  it("places a world's own epoch at game time zero", () => {
    // Whatever the wall clock says when a world is created, it starts on day 0.
    for (const epoch of [Date.UTC(2026, 0, 1), Date.UTC(2200, 5, 1), 0]) {
      expect(gameTimeFromUtc(epoch, epoch)).toBe(0)
    }
  })

  it('breaks a timestamp into a ship clock', () => {
    expect(shipClock(0)).toEqual({ day: 0, hour: 0, minute: 0, second: 0 })
    expect(shipClock(DAY * 3 + HOUR * 9 + 61)).toEqual({ day: 3, hour: 9, minute: 1, second: 1 })
    expect(formatShipClock(DAY * 142 + HOUR * 9 + 31 * 60)).toBe('D142 09:31')
  })

  it('formats durations coarsely', () => {
    expect(formatDuration(45)).toBe('45s')
    expect(formatDuration(90)).toBe('1m')
    expect(formatDuration(HOUR * 2 + 60 * 30)).toBe('2h 30m')
    expect(formatDuration(DAY * 3 + HOUR * 4)).toBe('3d 4h')
    expect(formatDuration(Infinity)).toBe('never')
  })
})
