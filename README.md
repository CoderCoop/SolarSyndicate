# Solar Syndicate

A spaceship management simulation set in our solar system. You are not a captain
and not a character — you are a **management representative of a guild**, working
an operations desk. You choose the guild, hire the crew, authorise the money, and
set the policy the ship runs on. The people aboard are not you; they are your
responsibility.

**[Play the current build →](https://codercoop.github.io/SolarSyndicate/)** — installable
from the browser menu on a phone; it runs entirely offline once loaded. Every push
to `main` redeploys it.

The full design lives in [`docs/design.md`](docs/design.md). Read that first — the
code deliberately references its section numbers (§7.2, §8.2, and so on) so that
any given decision can be traced back to the reason for it.

## Status: M1 — the living ship

M0 was the *tracer bullet*: the thinnest slice through every architectural
layer, built before any content so the expensive assumptions got tested while
they were still cheap to change. M1 makes the ship a system worth tending.

What works end to end:

- **Event-driven simulation** anchored to UTC — one real hour is one game day.
- **All five resource networks** (§3.2), resolved together because they are
  genuinely coupled: power, heat, atmosphere, water and stores. Every watt the
  ship consumes becomes heat it has to reject; the electrolysis unit spends
  water to make oxygen; the crew are a load on all of them.
- **Wear, degradation and failure.** Parts lose condition while they run,
  lose output before they fail, warn at thresholds, and then fail for real
  against a seeded roll.
- **Work orders.** You do not turn the wrench — you order the work, and the
  crew take real hours to do it at a pace set by who is on watch.
- **Four crew on a watch bill**, with sleep cycles, fatigue, health, and
  metabolism that tracks what each of them is actually doing.
- **Automatic self-protection**: load shedding on brownout, and a thermal trip
  that derates the reactor rather than cooking the ship (§7.4).
- **Offline catch-up** — close the app for a week and the ship keeps running.
- **Save and resume** via IndexedDB (snapshot + command log), with a real
  v1 → v2 migration.
- **Installable PWA**, offline-capable, portrait, ~78 KB gzipped.

Not in M1: travel, missions, guilds, economy, crew ageing and mortality. Those
are M2–M5 (see §10.2 of the design doc).

## Quick start

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

Two things worth trying:

- Open the **Life Support** deck and order a service on the CO2 scrubber. Note
  who picks it up — at ship midnight your best engineer is asleep, so the
  captain does it slowly. Move Okonkwo to A watch and order it again.
- Turn on **NTR Preheat** in the Engines deck, close the app, and come back a
  couple of hours later.

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

Every push to `main` deploys to GitHub Pages via `.github/workflows/pages.yml`.
The build uses relative asset paths so the same artifact runs from a project
subpath, the domain root, or straight off disk — and `pnpm verify` serves it
from a subpath so that stays true.

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

`pnpm test` runs 70 tests. The ones that matter most are in
`packages/sim/test/catchup.test.ts`, which assert the claims above rather than
the behaviour of any particular feature — including that a decade of unattended
simulation completes in well under a second, and that a snapshot round-trip
through JSON changes nothing.

`pnpm verify` is the layer above: it builds the PWA, serves it, and drives it in
Chromium at a phone viewport — 37 checks covering that the ship renders from sim
state, that life-critical systems cannot be switched off, that parts report
condition, that ordering work assigns a named crew member with an honest
estimate, that state survives a reload, and (using clock emulation to jump six
real hours) that the ship sheds its own loads while the desk is empty and has a
story to tell on return.

Both layers have earned their keep. M0: an infinite event-scheduling loop from
floating-point residue at a reservoir boundary, and a time-anchoring flaw that
put a newly created world on day 3642. M1: per-room power figures that no longer
summed to the ship total (breaking "you can trace it"), and a heat model with no
passive hull radiation, which let a crippled ship climb without limit instead of
settling at an unpleasant equilibrium.
