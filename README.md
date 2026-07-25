# Solar Syndicate

A spaceship management simulation set in our solar system. You are not a captain
and not a character — you are a **management representative of a guild**, working
an operations desk. You choose the guild, hire the crew, authorise the money, and
set the policy the ship runs on. The people aboard are not you; they are your
responsibility.

The full design lives in [`docs/design.md`](docs/design.md). Read that first — the
code deliberately references its section numbers (§7.2, §8.2, and so on) so that
any given decision can be traced back to the reason for it.

## Status: M0 — walking skeleton

M0 is a *tracer bullet*: the thinnest possible slice that passes through every
architectural layer, built before any content exists so that the expensive
assumptions get tested while they are still cheap to change.

What works end to end:

- **Event-driven simulation** anchored to UTC — one real hour is one game day.
- **One resource network of five** (power): reactor and solar generation, a
  battery buffer, and priority-based load shedding on brownout.
- **Offline catch-up** — close the app for a week and the ship keeps running.
  Advancing a month costs milliseconds because the sim is event-driven and
  levels are derived, not accumulated.
- **The ship cross-section**, rendered from sim state as a vertical deck stack.
- **Save and resume** via IndexedDB (snapshot + command log), with schema
  migrations wired in from the first version.
- **Installable PWA**, offline-capable, portrait, ~67 KB gzipped.

Not in M0: crew, travel, missions, guilds, economy, the other four resource
networks. Those are M1–M5 (see §10.2 of the design doc).

## Quick start

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

Turn on **NTR Preheat** in the Engines deck to put the ship into deficit, then
leave it alone for a couple of hours and come back.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Vite dev server |
| `pnpm build` | Typecheck, build packages, build the PWA |
| `pnpm test` | Unit + property tests (vitest) |
| `pnpm typecheck` | `tsc -b` across the workspace |
| `pnpm lint` | ESLint, including the determinism guard |
| `pnpm check` | typecheck + lint + test |
| `pnpm verify` | Build, then drive the real PWA in Chromium end to end |

## Layout

```
packages/sim     the entire simulation — zero browser dependencies
packages/data    content as JSON + zod schemas; every balance number lives here
apps/web         the PWA (Vite + React)
docs/design.md   the design document
```

## The four rules that make the rest work

Everything in M0 exists to establish these while they are still free. Retrofitting
any of them later would be prohibitive (§8.4).

**1. The sim is pure and deterministic.** All randomness comes from a seeded PRNG
keyed by `(seed, stream, counter)`; the sim never reads the clock. This is
enforced by lint, not convention — `Math.random()`, `Date.now()` and `new Date()`
are errors inside `packages/sim`:

```
error  'Math.random' is restricted from being used. Non-deterministic.
       Use the seeded PRNG in rng.ts (rngFor(seed, streamId, counter))
```

**2. Levels are derived, never accumulated.** A reservoir is `(value, rate,
since)`; its level at any time is one multiply. Anchors move only where the rate
changes, which is why advancing a month in one jump is *bit-identical* to
advancing it in seven hundred steps — the property the offline model rests on,
and one the test suite asserts directly.

**3. Catch-up is not a special case.** Opening the app after a week runs the same
loop as a second of live play; it just pops more events. There is no separate
"offline earnings" path to drift out of sync with the real one.

**4. Every mutation is a serializable command.** The UI never touches sim state.
That makes saves a snapshot plus a command log today, and makes a
server-authoritative sim possible later without rewriting the game.

## Testing

`pnpm test` runs 47 tests. The ones that matter most are in
`packages/sim/test/catchup.test.ts`, which assert the claims above rather than
the behaviour of any particular feature — including that a decade of unattended
simulation completes in well under a second, and that a snapshot round-trip
through JSON changes nothing.

`pnpm verify` is the layer above: it builds the PWA, serves it, and drives it in
Chromium at a phone viewport — checking that the ship renders from sim state,
that life-critical systems cannot be switched off, that state survives a reload,
and (using clock emulation to jump six real hours) that the ship sheds its own
loads while the desk is empty and has a story to tell on return.

Both found real bugs during M0: an infinite event-scheduling loop caused by
floating-point residue at a reservoir boundary, and a time-anchoring flaw that
put a newly created world on day 3642.
