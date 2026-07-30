# Solar Syndicate — working notes

## Workflow

Standard GitHub flow, no special cases:

- **One branch per feature or bugfix.** Not per session, not per release.
- **Name it `feature/<name>` or `bug/<name>`** — the prefix says which of the
  two it is, and the name says what it is: `feature/work-orders-tab`,
  `bug/star-chart-ignores-profile`.
- **Branch, commit, push, open a PR.** Always a PR, however small the change.
- **Merge once CI is green** — squash by default. No need to ask first; this is
  a standing instruction. If CI fails, fix it and push again rather than
  merging around it.
- After a merge, start the next change from a freshly updated `main`:
  `git checkout -B feature/<name> origin/main`.
- CI is `.github/workflows/ci.yml`: `pnpm check` (typecheck, lint, tests) plus
  the Chromium end-to-end pass. Both must pass.

The one-change rule is the newest of these and the easiest to let slide, because
bundling is always cheaper *in the moment* — the work is done, it is green, and
splitting it costs an afternoon. It is worth holding anyway. `0.8.0` went in as
one PR carrying six unrelated changes, and by then the version and `CHANGELOG`
had been touched by four of them, so unpicking it would have meant re-deriving
the `SIM_STATE_VERSION` chain per branch. A PR that does one thing can be
reviewed, reverted and bisected on its own; one that does six can only be taken
or left whole.

Scope is judged by *what changed for the player*, not by how many files moved. A
fix and the test that pins it are one change. A fix and an unrelated tidy-up
found along the way are two — take the note, do it next.

## Versioning

Semantic versioning, tagged `vX.Y.Z`, with `CHANGELOG.md` kept in the same
commit as the change it describes:

- **MINOR** for a milestone (§10.2) or a rework that changes what the player can
  reach — a balance pass that makes a destination flyable is not a patch.
- **PATCH** for fixes, tuning, and content that changes no capability.
- `1.0.0` is the shipped game; until then it stays `0.x`.

`SIM_STATE_VERSION` is a *separate* number and moves on its own schedule — only
when an older save can no longer be read. Keep the two independent.

All workspace packages share the root version.

**Tagging is CI's job** — `.github/workflows/release.yml` tags whatever version
`package.json` claims when it changes on `main`, and cuts a GitHub release using
that version's `CHANGELOG.md` section as the notes. So releasing is just bumping
the version in a reviewed PR.

Never tag from a feature branch: squash-merging creates a new commit, so the tag
would point at history that never lands on `main`. (A work session cannot do it
in any case — the git proxy refuses tag pushes and the GitHub tooling it has is
read-only for tags.)

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
