# Solar Syndicate — working notes

## Workflow

Standard GitHub flow, no special cases:

- **Branch, commit, push, open a PR.**
- **Merge once CI is green** — squash by default. No need to ask first; this is
  a standing instruction. If CI fails, fix it and push again rather than
  merging around it.
- After a merge, start the next change from a freshly updated `main`.
- CI is `.github/workflows/ci.yml`: `pnpm check` (typecheck, lint, tests) plus
  the Chromium end-to-end pass. Both must pass.

## Conventions

- `docs/design.md` is the source of truth for *why*. Code comments reference its
  section numbers (§7.2, §8.2, …) so any decision can be traced back to the
  reason for it. Keep doing this; update the doc when a decision changes.
- **Every gameplay number lives in `packages/data`**, as JSON validated by zod.
  No balance values in TypeScript.
- **`packages/sim` has zero browser dependencies.** It must keep running
  unchanged in Node and on a server — that boundary is what keeps cloud save and
  the shared-universe roadmap open (§8.4).
- **The sim is pure and deterministic.** `Math.random`, `Date.now` and
  `new Date` are lint errors inside `packages/sim`; randomness comes from the
  seeded PRNG in `rng.ts`, and wall-clock time is always passed in.
- **Levels are derived, never accumulated.** Reservoirs are `(value, rate,
  since)`, and anchors move *only* where rates change. Adding a `settle()` call
  to a read-only code path silently breaks bit-identical catch-up, which the
  tests in `catchup.test.ts` exist to catch.
- **Every player mutation is a serializable `Command`.** The UI never writes sim
  state directly.

## Commands

`pnpm check` before committing; `pnpm verify` when UI behaviour changed.
