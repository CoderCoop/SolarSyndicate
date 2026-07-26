/**
 * Save compatibility. Design doc §8.3.
 *
 * These exist because of a real bug, and they are written to make that exact
 * bug impossible rather than merely to notice it once. 0.5.0 added `guildId`
 * and `standing` to `SimState` and did not bump `SIM_STATE_VERSION`. A save
 * from the build before it therefore claimed to be current, loaded untouched,
 * and threw on the first payroll of catch-up — which happened during boot, so
 * the game sat on "Reading the Local's books…" for ever.
 *
 * Three properties are asserted here:
 *
 *   1. The shape of a fresh world matches the shape recorded for the current
 *      `SIM_STATE_VERSION`. Change the shape without bumping and this fails.
 *   2. A save missing a required field is refused, whatever version it claims.
 *   3. A refused save is refused *quietly* — the load path returns "no save"
 *      rather than throwing, because the caller's only sane response is to
 *      start a new world.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { advanceTo, createWorld } from '../src/engine.js'
import {
  missingStateFields,
  readableSave,
  REQUIRED_STATE_FIELDS,
  stateShape,
} from '../src/save.js'
import { DAY } from '../src/time.js'
import { SIM_STATE_VERSION, type SimState } from '../src/types.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const SHAPE_DIR = join(HERE, 'shape')

const SEED = 20260726
const START_UTC = Date.UTC(2026, 6, 26, 9, 0, 0)

function world(): SimState {
  return createWorld(SEED, START_UTC)
}

describe('the recorded shape of a save', () => {
  it('matches the shape this version promises', () => {
    // A world a few days in, so fields that only appear once something has
    // happened -- ledger entries, log lines, rng streams -- are in the picture
    // too. A shape check that only ever sees a pristine world checks half of
    // one.
    const shape = stateShape(advanceTo(world(), START_UTC / 1000 + 3 * DAY))
    const file = join(SHAPE_DIR, `v${SIM_STATE_VERSION}.txt`)

    if (process.env.UPDATE_SHAPE) {
      mkdirSync(SHAPE_DIR, { recursive: true })
      writeFileSync(file, shape.join('\n') + '\n')
      return
    }

    expect(
      existsSync(file),
      `SIM_STATE_VERSION is ${SIM_STATE_VERSION} but no shape is recorded for it. ` +
        'If the save format really did change, record the new shape with ' +
        'UPDATE_SHAPE=1 pnpm test and note the break in CHANGELOG.',
    ).toBe(true)

    const recorded = readFileSync(file, 'utf8').trim().split('\n')
    expect(
      shape,
      `SimState no longer has the shape recorded for v${SIM_STATE_VERSION}. ` +
        'An older save will load into this build and break at the first field ' +
        'it does not have. Bump SIM_STATE_VERSION, then re-record with ' +
        'UPDATE_SHAPE=1 pnpm test.',
    ).toEqual(recorded)
  })

  it('covers every required field, so a missing one is a shape change', () => {
    const shape = stateShape(world())
    for (const field of REQUIRED_STATE_FIELDS) {
      expect(shape.some((line) => line.startsWith(`$.${field}:`))).toBe(true)
    }
  })
})

describe('reading a save', () => {
  it('accepts one this build wrote', () => {
    expect(readableSave(world())).toBe(true)
    expect(missingStateFields(world())).toEqual([])
  })

  it('refuses one from an older format', () => {
    expect(readableSave({ ...world(), version: SIM_STATE_VERSION - 1 })).toBe(false)
  })

  it('refuses one that is missing a field, whatever version it claims', () => {
    // The 0.5.0 bug in miniature: a v6 save has no guild, but relabel it and
    // the version check waves it through. The shape check does not.
    const withoutGuild: Partial<SimState> = world()
    delete withoutGuild.guildId
    expect(readableSave({ ...withoutGuild, version: SIM_STATE_VERSION })).toBe(false)
    expect(missingStateFields(withoutGuild)).toEqual(['guildId'])
  })

  it('refuses rubbish without throwing', () => {
    for (const junk of [undefined, null, 0, 'save', [], {}]) {
      expect(readableSave(junk)).toBe(false)
    }
  })

  it('names what is missing, so the console says why the world restarted', () => {
    expect(missingStateFields({ version: SIM_STATE_VERSION })).toEqual(
      REQUIRED_STATE_FIELDS.filter((f) => f !== 'version'),
    )
  })
})

describe('the failure this all exists to prevent', () => {
  it('a save without a guild throws once catch-up crosses a day roll', () => {
    // Proof that the guard is load-bearing rather than decorative: this is the
    // crash, reproduced. Payroll is drawn on DAY_ROLL and looks the guild up,
    // so anything less than a day is fine and anything more is fatal.
    const stale = { ...world(), guildId: undefined } as unknown as SimState

    expect(() => advanceTo(stale, stale.now + 2 * DAY)).toThrow()
    expect(readableSave(stale)).toBe(false)
  })
})
