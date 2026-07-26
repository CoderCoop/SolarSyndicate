# Changelog

All notable changes to Solar Syndicate.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning is [semantic](https://semver.org/), read for a game rather than a
library — see [Versioning](#versioning) at the bottom for what each position
means here.

## [Unreleased]

## [0.3.1] — 2026-07-26

A patch by the stated rule: new surfaces, no gameplay capability changed.

### Added

- **The game offers to install itself.** It has been an installable PWA since
  M0 — manifest, service worker, offline shell — and nothing ever said so.
  A dismissible banner under the status bar when the browser allows it, a
  permanent entry on the Help tab for anyone who said "not now", and written
  instructions on iOS Safari, which never fires `beforeinstallprompt` and needs
  Share → Add to Home Screen. Dismissal is remembered in `localStorage`, not in
  the save: it is a fact about the browser, not about the world.
- `scripts/stop-hook-git-check.sh` — a working copy of the session stop hook,
  with the two bugs fixed that made it fire on every merge.

## [0.3.0] — 2026-07-26

The milestone-2 follow-up: a clock you can sit through, missions instead of
ports, and the ship's mass budget made honest.

### Added

- **Mission tab**, replacing Port. A mission is what the player selects; the
  port is only where the selecting happens.
- **Route strip**, drawn from one component on the board and again under way —
  two ends as body-and-port marks, an arc visibly flatter for a hop inside one
  well than for a crossing, a badge for the kind of errand, and the ship riding
  the arc once it is flying. Prints both orbital radii and the span between.
- **Mission types** from design §5.3 — cargo, bulk, survey, medical, relief.
  Changes no arithmetic; exists because two identical rows of numbers can
  describe completely different errands.
- **Flows is the mockup's node-and-edge diagram** — sources feeding one bus,
  consumers ranked by draw with link width as magnitude, buffer to the side,
  dashed return edge for loops.
- **Everything on the ship drawing answers when tapped.** Fixtures carry a name
  and blurb in content now, like parts do.
- **Every crew number explains itself** — what it is, and what it moves in the
  sim. Definitions are O*NET for knowledge and skills, ISS system names for
  endorsements.
- **Help tab** with fifteen questions, and links out to the project site.
- **Return legs** from Tranquillity and Phobos, so no port a run can end at has
  an empty board.
- Ports carry `orbitRadiusKm`, and the moon they are stationed at when that is
  not the primary. Bodies carry a real gravitational parameter.

### Changed

- **Time scale 24× → 720×.** Set by the voyage rather than by crew life: the
  flyable crossings now take 7–10 real minutes instead of four to five real
  hours. Closes design open question 1.
- **Same-body transfers use real physics.** The in-system leg had a hand-set
  five days and 1.59 km/s next to honestly derived interplanetary legs; it is
  now solved with the same vis-viva and Kepler maths against the parent body —
  **3.91 km/s over 4.98 days** between Gateway and Tranquillity.
- **Propellant capacity 18 t → 32 t**, so the ship can afford the honest price
  rather than the price being bent to fit the tank. Propellant mass fraction
  31% → 44%. Starting fill 62% → 75%.
- Contract propellant allowances re-derived from the honest burns.
- Gateway's blurb no longer says "high Earth orbit"; its data says 400 km up.

### Fixed

- **A missing node in the flow view.** Station resupply while alongside was in
  every consumable's net with no node, so water showed 21.5 kg/day leaving,
  18.3 coming back, and a tank reporting "holding". An invariant test now
  asserts each store-backed channel's nodes sum to the number printed on it.
- SVG markers on the flow diagram inherited `markerUnits="strokeWidth"`, so an
  edge whose width meant magnitude drew an arrowhead several times the size of
  the box it pointed at.

### Known limits

- **Mars and the Belt are out of reach**, and the board says so with the
  shortfall in tonnes. Stores gate Mars harder than mass ratio: the Kestrel
  carries 91 days of food against a 259-day crossing. That is a different hull,
  which is what design §10.2's M4 upgrade path is for.
- **Light-lag is much weaker at 720×** — a Saturn round trip falls from seven
  real minutes to fourteen seconds. Design §4.6 records three ways out; none is
  chosen yet.
- Offline catch-up is thirty times more dramatic. An hour away is 30 game days.

### Save format

`SIM_STATE_VERSION` 5 → 6. Reservoirs store their own capacity, so a v5 save
keeps an 18 t tank and could not afford the honestly priced Luna run. Older
saves start a new world.

## [0.2.0] — 2026-07-26

**M2 — the ship goes somewhere.** Contracts with a resupply allowance stated
before acceptance, real transfer orbits chosen by the player, a star chart, and
books that settle on arrival: efficiency finally has a price in credits.

## [0.1.0] — 2026-07-25

**M1 — the living ship.** Five resource networks, wear and failure, work
orders, four crew on a watch bill, the tune mechanic, and the room-interior
ship view.

## [0.0.1] — 2026-07-25

**M0 — the shell.** PWA, offline catch-up against the wall clock, IndexedDB
persistence, and the cross-section.

---

## Versioning

Semantic versioning, read for a game:

- **MAJOR** — `1.0.0` is the shipped game. Before that it stays `0.x`, which is
  semver's own way of saying the public surface is still moving.
- **MINOR** — a milestone from design §10.2, or a feature set of comparable
  weight. Balance reworks that change what the player can reach go here too,
  because "the ship can now fly to the Moon honestly" is not a patch.
- **PATCH** — fixes, tuning, and content that changes no capability.

Two version numbers exist and they are deliberately independent:

- `package.json` is the **product** version, above.
- `SIM_STATE_VERSION` is the **save format**. It moves only when a save written
  by an older build can no longer be read correctly, which can happen on a patch
  and can fail to happen on a minor.

Every release is tagged `vMAJOR.MINOR.PATCH`.
