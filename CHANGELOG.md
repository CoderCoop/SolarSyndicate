# Changelog

All notable changes to Solar Syndicate.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning is [semantic](https://semver.org/), read for a game rather than a
library — see [Versioning](#versioning) at the bottom for what each position
means here.

## [Unreleased]

## [0.11.6] — 2026-08-08

### Added

- **The chart zooms in, and says exactly where everything is.** The square-root
  plate is the right *map* — it puts the inner system and the Belt on one page
  and states the distortion it uses to do it — and it is the wrong instrument
  for "where exactly am I". Three closer scales draw the same positions
  **linearly and centred on the ship**, so a millimetre is a millimetre
  wherever it falls: 0.2 AU across (thirty million kilometres, about the
  closest Mars ever gets), 1 AU, and 4 AU, which holds the whole inner system
  and Ceres at true scale — the picture the square root was hiding.

  The two rulers say the difference rather than claiming it. On the map the
  ticks crowd toward the rim: 39.9, then 28.2, then 21.7 plate units per AU.
  Switch to a close view and the same ruler comes out flat at 240. Close up the
  longitude spokes give way to an evenly spaced square grid, anchored to the
  sun so the ship moves through it; the sun itself is usually off the plate, so
  a chevron on the rim points at it.

  **Nothing is dropped for being off the edge.** A world that will not fit is
  pointed at from the rim with its name and its range, because a close view
  that simply loses Mars would be worse than the wide one it replaced.

- **A table of exact positions**, under the plate on every scale: radius from
  the sun and heliocentric longitude for the ship and each world, plus range
  from the ship, with the berths at each place named under it. Nobody reads
  three decimal places off a drawing and a crossing is planned in decimals
  (§1 pillar 2).

## [0.11.5] — 2026-08-08

### Added

- **Every gauge on the Life tab says what puts it in and what takes it out.**
  A level and a horizon answer *what* and *when*. Neither answers **why**, and
  why is the only one of the three a player can act on: "47 days of water" is a
  fact, "the recycler is putting back 18.3 of the 21.5 you use" is a decision
  about whether to service it.

  Every figure was already there. `flowChannels` has built one channel per
  gauge on this tab since spec 004 — ranked, summed, and checked against the
  same balance the gauge reads — and it was only ever drawn one tab along on
  the flow diagram, so reading a gauge meant leaving the gauge.

  Each row now carries two lines under it: **in** and **out**, contributors
  named biggest first, with anything switched off greyed at the end rather than
  dropped, because "where did it go" is a worse question than "why is it zero".
  Three names by default; the tail opens on a tap. Heat has twelve
  contributors — every part aboard makes some — and summarising it to "+8 more"
  hid most of the answer the panel exists to give.

  The two channels that run backwards run backwards correctly: **crew put CO2
  into the cabin and the scrubbers take it out**, and the radiators are the
  only thing on the out side of heat. Get that the wrong way round and the
  panel says the scrubbers are what makes the carbon dioxide.

### Changed

- New `channelSides(channel)` in the sim splits a flow channel the way a person
  reads it — what puts it in, what takes it out — rather than the way a diagram
  draws it. `FlowRole` is right for drawing a loop and wrong for a sentence:
  `return` lands on a different side depending on the channel, and the buffer is
  on neither. That distinction now lives once, next to the code that builds both
  kinds, instead of being re-derived by each screen that shows them.

## [0.11.4] — 2026-08-08

### Fixed

- **The crew were drawn absorbing heat.** On the flow diagram's heat channel,
  four people appeared on the consumer side for 0.47 kW — as though bodies took
  warmth *out* of a cabin. They put it in: about 110 W each, more when working,
  which between four of them is a radiator panel's worth and not a rounding
  error.

  The balance was right the whole time — `networks.ts` has counted `crewHeatKw`
  into `heatInKw` since M1 — so only the picture lied, which is why nothing
  caught it. The cause was a default: `crewNode` assumed `consumer`, the CO2
  channel remembered to override it and the heat channel did not. The role is
  now a required argument, because people are a source on two of these five
  channels and a consumer on the other three, and a default that is right
  three times in five is exactly how this happens.

  Pinned by three tests: that a removal channel — one where `return` means
  *taking the stuff away* — has nothing filed under `consumer` at all, that the
  crew are a source of both heat and CO2, and that those channels' nodes sum to
  their own net the mirrored way round. All three fail against the old code.

## [0.11.3] — 2026-08-07

### Fixed

- **The ship screen stuttered when scrolled.** The cross-section is the screen
  the player spends most of their time on and it is the most expensive thing
  the game draws: seven deck schematics, sixty filtered elements, a real
  `feGaussianBlur` shadow pass under each deck. A filter that shares a
  compositing layer with the page has to be re-rasterised whenever that layer
  repaints, and scrolling repaints continuously — so the whole drawing was
  being **paid for again on every scrolled pixel**.

  Each deck drawing now gets its own layer, so it is rasterised once and
  afterwards the scroll only moves it. Dragging the ship screen a page and a
  half at six times CPU throttling: **8 dropped frames in 60 before, 1 after**;
  at ten times, 24 before and 2 after. The artwork is unchanged — a pixel
  comparison of the two shows differences of one or two least-significant bits
  in the gradients, and nothing else.

  `scripts/verify.mjs` now measures this on every run and compares it against
  the same scroll on a plain text screen, so the check reads "the ship screen
  is no harder to scroll than the log" rather than "this runner is fast". With
  the layer removed again it fails at 20 dropped frames against a control of 0.

  What this does *not* fix is the once-a-second cosmetic tick, which costs one
  slightly long frame on the ship screen — 33 ms against 20 elsewhere at four
  times throttling, no dropped frames. Cutting it would mean memoising the deck
  drawings against a hand-written signature of what they read, and a signature
  that misses a field shows the player a stale ship. Not worth it for a frame
  that is not being dropped.

## [0.11.2] — 2026-08-07

### Added

- **The chart says how fast the ship is going, and which way.** It has always
  put her in the right place and said nothing else about her. Every number
  needed was already in the sim — vis-viva has priced each crossing since M2 —
  and none of it had ever reached the plate, so "where am I, how fast, and
  which way" were three questions a star chart could not answer.

  The plate now carries a **heading needle drawn longer the faster she is
  going**, so a ship crawling through aphelion and one whipping through
  perihelion stop being the same dot; a **graticule** every 30° with the
  cardinal bearings labelled, so a longitude can be read off the drawing rather
  than taken on trust; the **arc cut at the ship**, solid behind and dashed
  ahead, because how much of this is left was a thing to estimate by eye off a
  square-root scale; and a **marked intercept** where the arrival burn happens.
  The ship glyph is turned to her heading, which it never was.

  Underneath, the figures: radius and heliocentric longitude, speed with
  whether she is climbing or falling and by how much, the berth she is booked
  into with the arrival burn counted down, arc still to run, and the perihelion
  and aphelion of the ellipse she is on — so an Express leg visibly throws its
  far apsis past the destination.

  A **berthed ship reads 29.78 km/s**, not zero. She is alongside, and
  alongside is going round the sun; the chart is drawn in the heliocentric
  frame and reporting nought would be quoting a different one.

  The needle's *bearing on the plate* is taken through the projection, so it
  lies along the arc it belongs to — the square-root radial scale bends
  direction as well as distance. The true flight path angle is stated as a
  number in the readout, where it cannot be distorted.

### Fixed

- **An express ellipse could be clipped off the edge of the chart.** The plate
  was sized to the orbits and the ship, so the overshoot past the destination —
  the exact thing the extra delta-v buys — was the part that ran off the rim.

### Changed

- `TransferState` carries true anomaly, speed, the radial and transverse
  velocity components and the flight path angle, all from the conserved angular
  momentum so they agree with vis-viva exactly rather than approximately. New
  `bodyVelocityAt` gives a body's circular orbital velocity, which is what a
  berthed ship is doing.

## [0.11.1] — 2026-08-05

### Fixed

- **The mission board drew two Earths.** Gateway Station and Tranquillity Yards
  both orbit Earth, and the route strip put them at opposite ends of an arc
  with a planet under each — so the drawing said they were two different
  worlds, and nothing on it said that one is 407 km up and the other is 384,400
  km out. That factor of fifty-seven is the entire reason the crossing takes
  five days and 3.91 km/s, and it was the one thing the picture left out.

  A route inside one gravity well is now drawn as what it is: **one planet,
  obliquely, with the two orbits around it**. Radii use the square-root
  compression the star chart already states, which at these numbers puts
  Gateway's ring hard against Earth's limb and Luna's way out — which is
  exactly the relationship. The near half of each ring passes in front of the
  planet, because in an oblique view it does.

  Interplanetary routes keep the two-ended arc: between two bodies it is a
  journey between two places, and that form says so correctly.

### Added

- Bodies carry their real mean radius (`radiusKm`), so a drawing can show an
  orbit *around* a planet rather than beside it. 6,371 km is the number that
  makes "407 km up" mean anything.

## [0.11.0] — 2026-07-30

A minor: the chart stopped being a picture of the solar system and started
being an instrument you plan with.

### Added

- **Launch windows, at last.** §5.1 has said since the beginning that "planets
  *move* — Mars is sometimes 0.5 AU away and sometimes 2.5, so **launch windows
  are real gameplay** and the astrogator's job". The maths for it —
  `phaseAngleForTransfer`, `synodicPeriodDays` — was written and tested in M2
  and then referenced by *nothing at all*, which made it a fact about the
  simulation rather than something a player could act on. The chart now says
  when each crossing is worth flying: "Mars — opens in 227 days · 105° out ·
  comes round every 2.1 years". Waiting the stated time really does open it, to
  within a fiftieth of a degree, and that is pinned as a test — a window that
  says 227 days and is wrong is worse than no window, because the player will
  plan around it.
- **How far away everything is, right now.** The other half of that sentence.
  The chart drew the motion faithfully and never once said what it cost, which
  left the most consequential number on the plate as something to eyeball off a
  square-root scale. Measured from the ship rather than from the sun, so
  wherever she is, the ranges are hers.
- **A scale ruler.** The square-root radial scale is the one thing on the
  drawing a player has to take on trust. It is drawn now rather than asserted —
  the ticks crowd toward the rim, and that crowding *is* the distortion.
- **Where each world will be in ninety days**, as a faint arc along its own
  orbit. A body is a moving target, and an arc has to be aimed at where it is
  going.

### Changed

- **Worlds are drawn as worlds.** Three identical grey dots became Earth, Mars
  and Ceres at distinct sizes and colours, each with its lit limb facing the
  sun — the same visual vocabulary the route strip already used, so a player
  who has learned which one is Ceres does not have to learn it twice.

## [0.10.0] — 2026-07-30

A minor, and the one that finishes §7.4. "No death without foreshadowing **and a
decision**" has been the non-negotiable rule since the design doc was written;
`0.8.0` built the foreshadowing and left the decision, so a player who closed
the app on a failed scrubber was protected by nothing but the length of the
warning. Now the captain is.

### Added

- **An acute emergency opens a decision window.** Raised the moment the air
  starts costing health rather than when it starts killing — seven hours after
  a scrubber dies, not nineteen — with a deadline scaled to how long the crew
  actually have: a quarter of their margin, capped at six hours. Answer it and
  the captain stands by. Ordering the repair yourself *is* answering, because
  that job is his entire response.
- **Unanswered, the captain stands the ship to.** §4.6's whole premise is that
  you are not aboard and the person who is does not wait for a round trip. He
  orders the repair on the failing part, puts it at the head of the queue,
  sheds everything not keeping somebody alive, and secures the idle hands.
- **The window is on screen wherever you are** — under the status bar on every
  tab, because a window the player has to go looking for is not one.

### Changed

- **§7.4's central claim is now true and tested.** "If margins were sane at
  departure, safe mode always suffices." Same seed, same failed scrubber, same
  twenty days: with the captain allowed to act, nobody dies and the scrubber is
  repaired. Without, all four die. Spares in the locker and a hand able to turn
  a wrench is what "sane margins" means, and the counterfactual is pinned as a
  test.
- **Safe mode is not "everybody rest", because the numbers say that is
  lethal.** §7.4 describes the captain's default as "crew secured on rations",
  and the obvious reading is to cut metabolism and buy time. Measured before
  building it: resting the whole crew buys about a quarter more time and costs
  the thirteen-hour repair, converting a survivable failure into a certain
  death slightly later. The dominant lever is fixing the thing that is killing
  you. So the response protects repair capacity first and takes the metabolic
  saving only from hands who were idle anyway.

## [0.9.0] — 2026-07-30

A minor by the stated rule: losing your whole crew used to end the campaign, and
now it does not. §7.4 has always said "the ship survives — crew are mortal, the
campaign is not"; `0.8.0` made the first half reachable without building the
second, so this closes it.

### Fixed

- **A ship whose crew had died could not be crewed again.** Four separate
  consumers counted the dead as crew, and the worst of them was berths: the
  people who had died on the ship occupied the bunks their replacements needed,
  so on a full hull hiring was blocked by the casualties. They also drew wages,
  reported "On watch" and "Asleep" on the roster, stood at their stations in
  the ship view, and held work orders nobody was doing. One `livingCrew` helper
  now, so the next consumer does not have to remember.
- **The standing order kept raising services on a derelict.** A standing order
  is a policy the crew execute; with nobody alive aboard there was no one to
  execute it, and the ship quietly queued jobs against a locker nobody could
  open.

### Added

- **A dead-crew ship is recovered and towed, at ruinous cost.** The last
  casualty now ends the voyage rather than letting it count down to an arrival
  nobody is alive to make, tows her to the port she was bound for, forfeits the
  contract — the cargo did not arrive, and settling it as delivered would have
  been a lie (TR-19) — and posts a salvage bill of 18% of the hull's book
  value. That is 77,400 Cr on the Kestrel against a 240,000 Cr opening balance:
  the worst thing that can happen to a desk, and still a debt rather than a
  wall (TR-21).
- **The state says so, everywhere it matters.** The status bar reads "Under
  salvage · no crew aboard", and the Crew tab explains an empty roster instead
  of rendering a blank list: she is intact, she is yours, and she cannot fly or
  take a contract until somebody signs on. One hire releases her.

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
