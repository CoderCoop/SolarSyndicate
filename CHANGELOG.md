# Changelog

All notable changes to Solar Syndicate.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning is [semantic](https://semver.org/), read for a game rather than a
library — see [Versioning](#versioning) at the bottom for what each position
means here.

## [Unreleased]

## [0.8.0] — 2026-07-27

A minor three times over: the ship now maintains itself to a policy you set,
the work queue is a thing you can steer rather than a list you watch, and the
atmosphere has a real physiology behind it. The last of those changes what the
player can lose.

### Added

- **A standing order that services parts at the right moment.** A service puts
  back a *fixed* 32 points of condition and the ceiling throws away the rest,
  so servicing at 90% spends a whole spare to buy ten points. There is one
  right moment on every part — at or below 68% — and finding it was pure
  clerical work: watch seven parts, notice each crossing a line, tap the same
  button. §7.3 calls standing orders "the policy toggles you set in advance",
  and this is the first of them. It fires from its own scheduled crossing, so
  it works to the minute while the app is closed; it declines when the locker
  cannot pay, when the player has already ordered work, and always for a
  repair — a failure is yours to answer. On by default, and a toggle because
  the policy is the player's to set, not because the default is in doubt.
- **A Work tab.** §4.3 promises that "you approve the watch bill and the
  work-order priorities". The watch bill has had a panel since M1; the
  priorities did not exist — the queue was strictly oldest-first, so the only
  way to get a failed scrubber seen before a routine service raised an hour
  earlier was to cancel the service and lose the hours already in it. Jobs now
  move up and down, and the hours in a job survive being reordered. Beside the
  queue, who has what: a job reading "waiting for a free hand" means nothing
  until you can see that three of the four hands are asleep.
- **Ordering a service too early now says what it costs** — "11 of the 32
  points will hit the ceiling and be lost" — rather than quietly doing it.

### Changed

- **The atmosphere has a physiology.** The old model was four `if` statements:
  CO2 over 5,000 ppm cost three health a day and over 10,000 cost nine, with
  matching cuts to how well somebody worked. Two cliffs, nothing in between,
  and no name for what was happening to anybody. It is now a graded model on
  the published limits — OSHA's 5,000 ppm exposure limit, NASA's 7,000 ppm
  180-day figure, NIOSH's 40,000 ppm "immediately dangerous to life", and the
  Satish and Allen studies for the cognitive decline that starts around 1,000.
  Oxygen is judged by **partial pressure** rather than by the tank reading,
  because that is what a body responds to; there is a cold ladder as well as a
  hot one, which there was not before. Hazards combine honestly: capacities
  multiply, health costs add.
- **Bad air stops the watch working before it makes them ill**, which is the
  coupling that matters — a failed scrubber shows up in the numbers the player
  is already watching. At NIOSH's IDLH figure nobody works at all, and the
  queue stops rather than crawling.
- **Crew can now die of it.** The health floor of 10 that made everything
  survivable is gone. §4.5 is explicit that this is a permadeath game, and
  §7.4's rule is not that death cannot happen — it is that it cannot happen
  *without foreshadowing and a decision*. Health is a reservoir, so the moment
  it runs out is a division: the game always knows who is in trouble and
  exactly how long they have, and now it says so, by name, in the readout and
  in a dispatch, long before it happens.

### Fixed

- **Nine sections did not fit across a phone.** Dividing the tab strip equally
  gave every label about forty pixels, which wrapped "Mission" onto two lines
  and clipped the last tab out of the bar entirely. The strip scrolls now.

## [0.7.0] — 2026-07-27

A minor by the stated rule: coming home fast is a real option now, and on
several runs it is the difference between making a deadline and not. It started
as a drawing bug and the drawing was the honest part — it was faithfully
reporting a trajectory the sim had got wrong.

Also carries a second pass over the ship interior, which picks up where the
lit-interior work left off: that one said it had covered perhaps half the
distance to filled and shaded forms, and this is most of the rest.

### Fixed

- **The star chart drew the same arc whatever you paid for.** It rebuilt the
  minimum-energy ellipse from the two orbit radii and nothing else, so all three
  profiles came out identical to the last bit. A player could spend 5.3 km/s
  extra on Express and watch the trajectory they had declined sweep across the
  plate. The geometry now comes from the same `Transfer` the astrogator priced,
  so the picture and the invoice cannot come apart — §1 pillar 2 does not stop
  at numbers. The caption names the profile too, so a fatter arc is explained
  rather than mysterious.
- **Stretching an ellipse only worked outbound.** Chasing the arc down found
  the real fault underneath it: the stretch scaled the semi-major axis *up*
  whichever way the ship was pointed. Outbound that raises apoapsis past the
  target, which is the fast trajectory. Inbound the ship leaves from apoapsis,
  so it raised *periapsis* — and Express to Earth cost more delta-v, took
  **longer** than minimum energy, and described an ellipse whose lowest point
  never reached Earth's orbit. Strictly worse in both currencies is precisely
  the fake choice TR-3b forbids. One rule now covers both directions: move the
  apsis the ship does not depart from away from the target orbit. Ceres→Earth
  Express is 340 days against minimum energy's 472, at 28.3 km/s against 11.2 —
  steep, because dropping perihelion to 0.55 AU means arriving with a lot of
  speed to kill, and that is what a fast return actually costs.
- **Inbound telemetry read the wrong end of the ellipse.** The speed readout
  solved Kepler from periapsis regardless of direction, so a ship casting off
  for home reported the fastest point of its orbit at the slowest moment of the
  crossing. Departure anomaly is carried on the transfer now, and one function
  turns a transfer into a position — the readout and the chart cannot disagree
  about where she is because they no longer work it out separately.
- **Every object on the ship was outlined by its own tap target.** `.hit` sits
  inside `.glyph`, which sets a stroke, and stroke inherits — so each part and
  each fixture carried a second rectangle two units proud of itself. Nothing in
  the DOM was wrong, which is why nothing caught it: the drawing was simply
  full of boxes nobody had drawn, and it is where the boxes-inside-boxes look
  came from. The end-to-end pass now measures it.

### Changed

- **The ship interior is shaded rather than outlined.** The previous pass lit
  the *room* and left the things in it flat: a mattress and a spares locker
  took the light identically, and nothing in any compartment cast a shadow, so
  every object floated a little way off the plating. Three cues fix that —
  a gradient down each form, a shadow under it, and a different response to
  light for steel, cloth and anything lit from within. The wall was lifted off
  the floor of the palette to make room for it: it used to sit within a few
  points of pure black top to bottom, which left a shadow nothing to fall on.
- **The machines got the treatment the furniture got last time.** Bunks, the
  mess table, cargo bays and lockers were reworked in the interior pass; the
  parts were still their first sketches. The flight desk has a screen that
  lights, the comms array has a feed horn and an elevation drive, the pump has
  an impeller and a finned motor, the solar wing has cells and a hinge spine,
  the engine bell has cooling tubes and a throat that glows, and the battery
  says what is in it. A machine that is running now says so with light, and one
  that is shed or failed goes dark along with its shadow.
- **The brownout panel says what happened and what the button costs.** It read
  "Shed loads are still offline. Restoring them without fixing the balance will
  simply drain the bank again", which never said the ship had switched anything
  off, never said *which* things, and named no number for "fixing the balance"
  — while offering exactly one control, the one its own text warned against. It
  now names the kit the ship shed, states what that kit draws, and states what
  pressing the button would leave: "It draws 14.0 kW and you only have 6.9 kW
  spare. Switching it back on now would leave you -7.1 kW short… Find 7.1 kW
  first." The panel turns from a warning into a confirmation once the balance
  is good. The button stays live either way — restoring into a deficit is a
  recoverable mistake, not a hazard, and §7.4 does not wall the player off from
  consequences, it just stops them being a surprise.
- **Compartments have walls rather than backgrounds.** Panel seams, structural
  frames drawn with a lit edge and a shadowed one, the compartment stencilled
  on, a return-air grille, and a painted deck edge where the reactor and the
  engines are. All of it behind the equipment, because it is what the equipment
  is bolted to.
- `Transfer` carries `eccentricity` and `departureAnomalyRad`; `radiusAtTime`
  is replaced by `transferStateAt`, which takes the transfer rather than
  re-deriving its shape at each call site. The old signature could not express
  an inbound leg, which is how the bug lasted two milestones.

## [0.6.0] — 2026-07-27

A minor by the stated rule: the ship view, the status bar and the log all
changed what the player can *see*, and one of them changed what is true about
the ship. All six items came from playing it.

### Fixed

- **Tapping a person did nothing, and only some objects answered.** One cause:
  parts opened a station card inline under their deck, while crew and fixtures
  opened theirs at the foot of the whole ship section — y≈2200 in an 844 px
  viewport. Every tap worked; the answer appeared 1,400 px below the fold. Both
  now open in the deck they belong to, and the end-to-end pass measures the
  distance rather than trusting it.
- **The room layout was drawing through itself** — 20 overlapping pairs across
  four of seven decks. Bunks through bunks, the captain through the comms
  array, three of the crew inside the bunks. People were placed independently of
  the room, so the deck line now reserves their strip first; that reserve is a
  person's full height rather than their footprint, because a standing figure
  is taller than one tier of stores; the first object on a tier never wrapped;
  and tier spacing was 1.8 units against strokes that need about 4. Nothing
  overlaps now, drawn *or* tappable — an invisible tap-target overlap steals
  taps meant for the machine behind the person, which is RF-8's whole point.
- **The flow diagram lost the mockup's spacing.** Rows 10 px apart with an
  arrowhead in the gap made every link the same stub whatever its width
  claimed: "link width is magnitude" was true in the DOM and unreadable on the
  screen. Consumers also carry their shed priority now, in the sub-label and as
  the colour of the row's stripe — because the flow view's real question is not
  "what draws the most" but "what can I switch off".

### Added

- **The status bar says where the ship is.** It carried the clock, the power
  balance and the CO2, and never once said whether she was alongside or in
  space. It now leads with the berth, or both ends of the crossing and how much
  has been flown.
- **What the crossing is actually like** — phase, speed, thrust and g. She does
  *not* accelerate for half the distance and decelerate for the other half:
  §3.4 puts a nuclear-thermal ship at 0.05–0.3 g, which buys Hohmann-class
  transfers — burn hard at each end, fall the whole way between.
  Accelerate-flip-decelerate is the fusion-torch tier. Rather than invent a
  thrust figure to fill the coast, the readout states the truth: engines cold,
  crew weightless, and a speed that really does vary. On the Luna run:
  departure 3.08 km/s over 29 min at 0.16 g, arrival 0.83 km/s over 8 min, and
  10.75 km/s leaving low Earth orbit decaying to 0.19 km/s at lunar distance —
  trans-lunar injection to two decimal places, all of it derived. Position
  comes from Kepler's equation against the transfer ellipse, recomputed from
  what the voyage already records, so the save format is unaffected.
- **Engines are data**: `ispS` and `thrustKn` per hull, since a bigger ship has
  a bigger engine.
- **The log is sorted, and the number is hoisted out of the prose.** Seven
  topics, authored where each line is raised rather than guessed from its
  wording at render time, with a filter row that only offers a topic that
  actually occurred. And a figure per line, in its own column — every dispatch
  has one number that decides whether it needs you, and buried mid-sentence it
  makes the reader parse every word to find it. In a column the log reads
  *down*: 79%, 61%, 43%, failed.

- **Flows leads with the engineering panel** — mockup 003's option C, which is
  the one that was asked for. Stations as nodes laid out the way the ship is
  laid out, the five networks as coloured lines running between them, and
  dashes that travel the way the resource does, so a line that has stopped
  moving is a network that has stopped. The crew are on it, which 003 said it
  would not compromise on. The ranked view stays underneath: a list can say the
  hydroponics rack is the biggest draw, and only a graph can say the reactor
  feeds it and the water comes back round.

  Nothing is positioned by hand — deck is the row, position within the deck is
  the column — so a part added in content lands somewhere sensible and the
  diagram keeps the ship's own shape. Short station names are authored in
  `parts.json`, because no rule over "Navigation & Flight Computers" yields NAV
  and truncation gave FLIGHT COMP.

  003's stated risk stands: "twelve parts and five networks is already near the
  limit ... the graph does not degrade gracefully." The channel filter is the
  answer for now.

### Save format

`SIM_STATE_VERSION` 7 → 8: dispatches carry a topic, and every line in a v7
save has none. The shape test added in 0.5.1 caught this within seconds of the
field being added, with the remedy in the failure message — which is exactly
what it was built for.

## [0.5.2] — 2026-07-26

### Added

- **The loading screen offers a way out of itself.** 0.5.1 stopped the save that
  wedged the boot; it did nothing for the player already looking at the wedge,
  because the fix ships *inside* the build that will not start. Six seconds in,
  the boot screen now names the two things that can be wrong and gives each a
  button: **Start a new world**, which discards the save, for a world this build
  cannot read; and **Fetch the game again**, which drops the precached shell and
  the worker serving it, for a build that is itself broken. Both say what they
  cost before they are pressed, and neither touches anything outside the
  browser.

  A PWA earns this. The shell is precached, so a build that hangs on load keeps
  being served from the cache and keeps hanging; the save survives reloads and
  takes the fault with it; and every control the game has — including "Scuttle
  and start over" — sits behind the one screen that never goes away. The only
  remedy was the browser's site-data settings, which is not something to ask of
  someone who wanted to play a game. §7.4 says a player is never stranded; this
  is that promise applied to the screen that was breaking it.

- The end-to-end pass wedges the boot for real — a held IndexedDB connection and
  a version bump that can never begin — and requires the way out to appear.
  Nothing throws, so no error handling could have rescued it, which is the
  point: this covers the faults not yet imagined, not the one already fixed.

- A Help entry for it, so the answer is findable once the game is running again.

## [0.5.1] — 2026-07-26

### Fixed

- **The game could get stuck on "Reading the Local's books…".** 0.5.0 added
  `guildId` and `standing` to `SimState` and did not move
  `SIM_STATE_VERSION`, so a save written by 0.4.1 claimed to be current and
  loaded untouched. The first payroll of catch-up then looked up a guild that
  was not there and threw — on the boot path, where nothing caught it, so the
  loading screen stayed up for ever with no way past it. `SIM_STATE_VERSION`
  6 → 7; saves from before this build start a new world, which is what should
  have happened all along.

### Changed

- **Loading a save checks its shape, not just its version number.** The version
  is a claim; the shape is what is true, and when they disagree the shape wins.
  A save missing a field this build requires is refused with the field named in
  the console, rather than loaded into a crash later.
- **Boot cannot hang.** Reading the save and catching it up are each caught, and
  either failing starts a new world. Whatever is wrong with a stored world, the
  answer is a playable ship — §7.4's "never strand the player", applied to the
  one screen that had no way out of it.

### Added

- **Three tests so this cannot come back quietly.** The required fields of
  `SimState` are a compiler-checked map, so adding one does not typecheck until
  a human has looked at it. `stateShape()` fingerprints the whole structure and
  a test compares it against the shape recorded for the current
  `SIM_STATE_VERSION` — change the shape without bumping and the build fails,
  with the remedy in the failure message. And the end-to-end pass now plants
  both kinds of unreadable save in IndexedDB, an honest old one and one
  mislabelled exactly as 0.5.0's was, and requires the game to boot anyway.

## [0.5.0] — 2026-07-26

**M3 begins — guilds and crew hiring.** The four aboard used to be a fact of the
world. They are now a decision with a running cost.

### Added

- **Four guilds** (§6.1), with standing tracked against *all* of them rather
  than only your own, because delivering for the Institute is not neutral to the
  Combine. Standing moves on outcomes — delivered, delivered late, abandoned —
  and is banded into something a person would actually say. The desk is
  Wrightworks; §10.1's four-way opening choice stays M6's job.
- **A hiring hall at every port that has one.** Six new people in the registry,
  standing where they stand: Wrightworks' home yard at Tranquillity carries the
  deep bench §6.1 promises, Gateway the general trade. Wanting a particular
  person is a reason to fly somewhere.
- **Wages**, drawn on the day roll — an event, never a rate, because money is a
  stock and catch-up must never integrate it. ~1,283 cr/day for four, about 8%
  of a Luna round trip's net.
- **Berths.** The Kestrel has drawn six bunks for a crew of four since M1
  without anything enforcing it. Now that spare pair is the room to hire into.
- **Severance** under a guild with a wage floor: the union card is worth
  something on the way out as well as on the way in.

### Changed

- `content.crew` is the whole person registry now — everyone aboard *and*
  everyone in a hall — so `startingCrew()` and `crewInHall()` say which is meant.
- The money invariant changed shape. "Credits never move during catch-up" was
  true until there was a payroll; the property that actually matters is that
  forty days in one jump equals forty days one at a time.

## [0.4.1] — 2026-07-26

### Fixed

- **Neglect is priced when you come to sell.** The allowance used to reward
  skipping repairs: a tended ship spent its whole spares budget and scored
  nothing, a neglected one banked the lot, and the wrecked ship it produced cost
  nothing on the books. Trade-in is now book value scaled by a survey — mean
  condition at 80% of the weighting, tune at 20%, a further deduction per failed
  system, and a 35% scrap floor because a wreck is still metal. On one Luna run
  that is ~8,500 cr against neglect, and an invariant test asserts the sign.
- The purchase card shows the surveyor's walk-round, so the trade-in is never a
  bare number.

### Changed

- `HullDef.tradeInCr` is now `bookValueCr` — the *undamaged* figure, which the
  survey scales. The old name implied a ship was worth the same however it had
  been treated, which was exactly the bug.

## [0.4.0] — 2026-07-26

A minor by the stated rule: it changes what the player can reach. Mars.

### Added

- **A second hull, and a yard to buy it from.** The Albatross-class long-hauler
  — 110 t of tank against the Kestrel's 32, and stores for a 259-day crossing —
  sold at Tranquillity, priced as a difference against a trade-in. Mars is now
  reachable, on minimum energy only; the faster ellipses stay blocked, so the
  window still costs something. The Belt stays out of reach, which leaves
  somewhere to go.
- She is delivered at her nameplate — full condition, spec tune — so the tuning
  work done on the old ship does not come along. Stated on the purchase card
  rather than discovered afterwards.

### Changed

- Interplanetary allowances re-derived against the Albatross, since those runs
  can only be flown in one. Cislunar allowances stay sized for a Kestrel, so a
  big ship on a small job overruns — which is correct.

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
