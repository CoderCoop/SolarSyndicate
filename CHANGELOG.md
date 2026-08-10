# Changelog

All notable changes to Solar Syndicate.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning is [semantic](https://semver.org/), read for a game rather than a
library — see [Versioning](#versioning) at the bottom for what each position
means here.

## [Unreleased]

## [0.16.1] — 2026-08-10

### Fixed

- **The chart stuttered instead of moving.** It was redrawn on the 1 Hz cosmetic
  tick, which at 720x is **twelve game minutes a frame**. That is invisible for
  a planet and hopeless for a station: Gateway's orbit is 92.6 minutes, so its
  berth jumped **forty-seven degrees a step** and read as a fault rather than as
  a low orbit.

  The chart now draws on a clock that runs between ticks, re-anchored on every
  tick so it cannot drift from the simulation. **Nothing is interpolated**, and
  that is the point: every position in this sim is a closed-form function of
  time, so asking for the position at 03:41:07.35 is asking for the truth at
  03:41:07.35 rather than for a guess between two samples. Smoothing the drawing
  by lerping between frames would have been easier and would have put the ship
  somewhere she is not.

  Only while the chart is up — nothing else aboard changes fast enough to be
  worth a frame budget — and the solved crossing is remembered, since a
  trajectory cannot change as the clock runs and a window search is sixty-odd
  Lambert solves.


## [0.16.0] — 2026-08-10

A minor: a contract against a distant window is a **booking**, and the board
says so.

### Changed

- **The deadline runs from launch, not from signing.** Taking the Phobos survey
  when its window is 227 days out used to start a 300-day clock immediately,
  which made an honestly-flown crossing late by construction — the wait ate two
  thirds of the deadline before the engine lit. What a deadline measures now is
  the **crossing**: sign, wait for the geometry, and the 300 days start when she
  burns.

  This is what makes the fourth departure option usable rather than theoretical.
  It also means sitting in dock no longer makes a run late; what is late is a
  crossing that overruns.

- **A run whose window is months out is shown, marked and explained.** Hiding it
  would take the one decision §5.1 calls the astrogator's job off the board
  altogether. The offer states when the window opens, that signing books the
  trip, that the deadline runs from launch, and that walking away before the
  burn costs only the stated penalty (TR-21) — so "you cannot go" becomes "you
  can go in seven months", which is a plan.

- **The wait is named separately from the crossing.** An option that quietly
  takes 227 days longer than the one above it is the fake choice TR-3b forbids,
  however honest its delta-v — so the astrogator lists "Launches in 227 days"
  above "Under way 259 days" rather than folding them into one figure.


## [0.15.0] — 2026-08-10

A minor: crossings between worlds are solved for the geometry they actually
have, so a launch window costs what a launch window costs.

### Added

- **Lambert's problem, in place of a Hohmann formula.** A Hohmann transfer
  answers "what is the cheapest way between two circular orbits" — and it
  answers it for a departure at exactly the right moment. The game priced every
  crossing that way and let you leave whenever you liked, so the two halves
  disagreed: the chart drew an arc ending half a turn from where the ship left,
  the target was wherever its own orbit had put it, and the two were the same
  point only by luck.

  The honest question is Lambert's: given where the ship is, where the target
  will be in T, and T, *what orbit connects them*. The two burns are then the
  difference between that orbit's velocity and each body's own — which is what a
  burn is. **The arc now ends on the target**, to under a metre in two hundred
  and thirty million kilometres.

  Two things took real work. The universal-variable formulation is **singular at
  exactly 180°**, which is precisely the Hohmann geometry every window is built
  around; that branch is solved directly. And the half-turn family runs in
  **opposite directions** outbound and inbound — outbound the Hohmann ellipse is
  the fastest half turn there is (259 days, then 512, then 1331 as it stretches),
  inbound it is the slowest (259 down toward 114, because departing past
  apoapsis means falling). Assuming one direction for both reported an ordinary
  Mars-to-Earth crossing as impossible.

  Pinned by the test that matters: where a Hohmann is the right answer, Lambert
  reproduces it to **under a metre per second on 5.6 km/s**, both directions.

- **"Wait for the window" is a departure you can choose.** Leaving Earth for
  Mars at game time zero honestly costs **19.07 km/s** against 5.59 at the
  window. That is not a surcharge — it is beyond every hull in the game,
  including the Albatross that exists to reach Mars. A correct number with
  nowhere to wait would simply have read as "Mars is broken".

  So the astrogator offers the departure the geometry wants, and says how long
  until then: 226.7 days for Mars from a standing start, 202.1 for Ceres. The
  ship sits at her berth through it and the chart draws her there — the same
  coast an in-well crossing takes for ninety minutes, at a very much larger
  scale. The window is found by **search** rather than by the phase-angle
  formula, because a search is still right when the planets get real ellipses.

### Changed

- **Profiles are chosen by time, and the price falls out.** Minimum energy,
  Standard and Express are now 1.00, 0.85 and 0.65 of the Hohmann flight time
  for that pair. That is the right way round: the ellipse connecting two moving
  bodies in a stated time has exactly one answer, whereas stretching a
  semi-major axis chose a *shape* and left the arrival to land where it landed.
  Near a window slower really is cheaper; far from one the ordering can invert,
  and every option carries its own delta-v for the desk to read.

## [0.14.0] — 2026-08-10

A minor: every berth is somewhere, and a crossing between two of them has to
wait for its geometry.

### Added

- **Ports have real positions, and their periods are derived rather than
  stated.** A port used to be a radius and nothing else — a ring with no
  position on it — so the chart drew departure at zero, the destination
  opposite, and said in a comment that the bearings were the drawing's own. Each
  port now carries an epoch phase, the one genuinely free number in a circular
  orbit; the period follows from the radius and the body's µ by Kepler's third
  law.

  Deriving it is the point. It is the *same* µ the crossing between two of that
  body's ports is priced with, so the drawn position and the priced transfer are
  one object. Luna comes out at 27.45 days against an observed 27.32 — the half
  per cent is the two-body approximation ignoring her own mass — and a stated
  27.32 would look more accurate while putting her where the transfer maths does
  not think she is.

  | | radius | period |
  |---|---|---|
  | Gateway Station | 6,778 km | 92.6 min |
  | Tranquillity Yards (Luna) | 384,400 km | 27.45 d |
  | Phobos Yard | 9,376 km | 7.66 h |
  | Ceres Local | 1,150 km | 8.60 h |

  None of this is stored. Positions have always been closed-form functions of
  game time, so the save format is untouched, `SIM_STATE_VERSION` stays at 12,
  and offline catch-up is still bit-identical.

- **A crossing between two berths waits for its window.** With real positions
  the ellipse can no longer be started whenever you like: it sweeps a fixed
  angle in a fixed time, so the far end has to already be where it will finish.
  The ship coasts in her parking orbit until it is, and the chart shows her
  sitting at her berth while she does.

  The wait is bounded by the synodic period of the two orbits, which around
  Earth is about ninety minutes — so it is absorbed into the crossing rather
  than offered as a decision. A launch window you can always meet inside two
  hours is arithmetic, not gameplay. The interplanetary ones, which run to
  months, are gameplay (§5.1) and are still reported as windows rather than
  waited out silently.

### Changed

- **The two frames now agree about where the ship is, exactly.** `0.13.2` held
  her still across a change of frame by moving the camera, because the
  heliocentric plate had her at Earth's centre for the whole cislunar crossing
  and could not resolve a 0.0026 AU offset whose direction nothing modelled.
  That direction is a known vector now, so the heliocentric plate places her at
  her world *plus* her orbit about it — the same point the world's own plate
  draws. The alignment is a fact about the model rather than a compensation.

- **A berthed ship reports the whole of her motion.** Alongside Gateway she is
  doing Earth's 29.78 km/s round the sun *and* 7.67 km/s round the Earth. Both
  are real and they add, so the readout now swings between 22.1 and 37.5 over
  the ninety-two minutes instead of sitting at a flat 29.8. Reporting nought
  quoted a frame the plate is not drawn in; reporting only the world's motion
  quoted half of one that it is.

## [0.13.2] — 2026-08-09

### Fixed

- **Changing frame on the chart moved the ship.** Every way of doing it, and by
  a lot.

  Pressing **Route** from the system plate put her in the middle of the plate
  wherever she had been drawn on it — berthed at Gateway that is a jump of 68
  plate units, half the radius — so one press both changed the projection and
  moved the only thing on it you were watching. Crossing into a world's own
  frame was worse: the heliocentric view has her at Earth's centre for the whole
  cislunar crossing and the local one has her out on her arc, so a single wheel
  notch across the boundary threw her about **42 plate units**, a third of the
  way across, in either direction.

  The frames are now **aligned on the ship**. She is the only object drawn in
  all three, and she is the subject, so she is what holds still: change frame
  and the world rearranges around her rather than the other way about. This
  covers the level buttons, the pinch and wheel across the boundary, and
  dragging off the system plate.

  They cannot be made to agree about everything, and it would be a lie if they
  were: the sim does not track where Luna is in its month, so the local plate's
  bearing against the stars is not claimed and the heliocentric plate cannot
  resolve a 0.0026 AU offset whose direction it does not know. Something has to
  move — this makes it the neighbourhood rather than the ship.

  Going *out* to the system plate is the one exception, and it has to be: that
  projection is the sun at the centre with a square-root radius and no camera at
  all, so there is nothing to solve for.

  Three checks measure her plate position either side of a frame change — by
  button, by wheel across the boundary, and off the system plate — and hold it
  to within six plate units.

## [0.13.1] — 2026-08-09

### Fixed

- **The chart's close-in frame only worked at Earth.** Three numbers had all
  been chosen while Earth was the only world anyone had pointed it at, and every
  one of them was wrong everywhere else.

  The zoom floor was 0.0002 AU — 30,000 km — but **Phobos Anchorage orbits
  9,376 km up and the Ceres berth 1,150 km**, so at both of them the closest the
  chart would go was a plate wider than anything on it: Ceres came out a 1.6%
  dot with its only station inside the dot. The floor is now 300 km across.

  The smallest grid and ruler step was 0.002 AU, which is 299,195 km and a round
  number to nobody. Close in on Mars that made the whole grid **one cell wider
  than the plate**, with no line anywhere near the thing being looked at. Steps
  are now round in the unit the ruler is labelled in — 20 km to 500,000 km
  below the switch to AU — so Mars reads 2,000 km a division and Ceres 200.

  And the ruler wrote its labels in thousands of kilometres, rounded to a whole
  number: a 200 km step printed as **"0", four times over**. Below 5,000 km a
  division it now writes plain kilometres.

  Held by a check that zooms to an orbit height and asserts the ticks are
  increasing, non-zero and in kilometres, and that the grid still has lines in
  it.

## [0.13.0] — 2026-08-09

A minor: the chart is navigated by naming a frame rather than by working a
scale.

### Changed

- **One button per frame on the chart, and the ± steppers are gone.** The chart
  draws in three frames, and they are not three magnifications of one picture:
  **System** is a square-root projection of the whole solar system, **Route** is
  the same positions drawn linearly at true scale, and **Earth** — whichever
  world she is at — is a different origin entirely, the planetocentric frame
  where a cislunar crossing has been happening all along.

  Pinching from the outermost to the innermost crosses both of those boundaries,
  which is why it read as a zoom that stuttered twice. The three are now named
  and one press away; it was twenty-six wheel notches from the system plate down
  to Earth's own frame, and nothing anywhere said the frame had changed under
  you. The pressed button is the answer to "where am I looking".

  The steppers went with them. They could only move the scale, which is the one
  thing pinch, wheel and double-tap already do — and the scale *inside* a frame
  stays continuous, so these are places to go rather than the fixed stops the
  control had before. The readout still states the span, which is what keeps a
  continuous zoom legible between named frames.

  **Route** is measured from the ship to the far end of her own arc rather than
  from a fixed reach, so it is a different size for the Luna hop than for a Belt
  run, and falls back to half an AU across when she is alongside.

### Fixed

- **The chart offered a close-in view of a world the ship had left.** The local
  frame is built from where the voyage *departed*, so on a crossing between
  worlds it drew her tied up at the berth she cast off from — three weeks and a
  third of an AU ago. That frame is not a level, it is a wrong picture: it is
  withheld while she is between worlds, where the chart now offers two frames
  and a pinch bottoms out in the heliocentric one. Pinned by a test on the pair
  of flags the picker reads, because deriving it by guessing from a distance is
  how it would come back.

## [0.12.1] — 2026-08-09

### Fixed

- **The chart's zoom jumped, and would not go back out.** Two faults reading as
  one symptom.

  Stepping off the whole-system plate started from a *fixed* reach rather than
  the scale the plate was already showing, so the first notch went **6.20 AU
  across to 0.37 AU** — a seventeen-fold leap out of a control that is supposed
  to be continuous. It now keeps the scale and changes only the projection:
  6.20 → 4.59 → 3.40 → 2.52, a steady 1.35 a notch.

  And the wheel was React's `onWheel`, which is attached passively at the root
  — so `preventDefault` was ignored and the **page scrolled instead of the
  chart zooming**. Zooming in happened to work, because the page was already at
  the top; every notch back out slid the plate from under the cursor and the
  next one landed on something else entirely, so the chart appeared to have a
  floor. The listener is now bound by hand, non-passive, and the gesture is the
  chart's.

  Both are held by a check that walks the scale in and back out and asserts the
  page did not move.

## [0.12.0] — 2026-08-09

A minor: stores stopped being free, and where you buy them started to matter.

### Added

- **Every kilogramme is bought, at the price of the port selling it.** The
  price table has been in `ports.json` since M2 and it is a good one —
  volatiles get cheaper the further out you go, because ice is abundant in the
  Belt and dear in low Earth orbit, while food runs the other way because
  nothing grows out there. Ceres water is a fifth of Gateway water; Ceres food
  is twice Gateway food. Nothing consulted any of it except the settlement, so
  all that geography was written down and inert.

  Now a stop posts a line to the ledger: `Stores at Ceres Local, −4,182 cr`.

- **The contract reimburses the allowance it budgeted**, at the arrival port's
  rates (TR-18), instead of netting the underrun into a single figure. Money
  out at the pump, money in at the desk — two events rather than one number
  that has already had the subtraction done to it. The settlement panel shows
  both, because **the gap between them is the mechanic**: a tended ship buys
  back less than it was given and keeps the difference.

  ```
  Payment                              +74,000 cr
  Allowance reimbursed                 +51,544 cr
  Stores bought at Tranquillity Yards  −44,775 cr
  The run was worth                    +80,770 cr
  ```

  **This is not a balance change for an ordinary run.** Buy back what the
  crossing spent, at the port you arrived at, and the arithmetic is what it
  always was — the same delivery paid 80,768 cr before and 80,770 cr after. It
  becomes a change the moment the player does something interesting: top up
  where a store is cheap, decline the stores and keep the reimbursement, or sit
  at a berth between contracts, which used to be free and is now a bill.

### Fixed

- **The delivery restock was quietly buying a quarter of a propellant tank.**
  It filled every store to *capacity*, but the ship sets out at 75% propellant
  and 88% water — so once stores had a price, every delivery bought eight
  tonnes the Guild had never budgeted for: 34,000 credits on a job paying
  74,000, and a cost that depended on how empty the ship happened to have been
  when she signed on. A resupply allowance restores the ship to the state she
  set out in, so that is what it does now. Topping up beyond that is still
  possible, and is now a real decision made at a port's own prices.

## [0.11.14] — 2026-08-08

### Added

- **The ship says what it takes on, and you can tell it not to.** Two separate
  refills have been running since M1 and M2 and *neither* said a word:

  - **On contract delivery**, every store is filled to capacity in one step,
    because the allowance has just settled what the crossing consumed. This
    moves more mass than anything else in the game — a Luna run comes back
    27.9 t of propellant light — and it happened in complete silence. Five
    gauges jumped to full and nothing anywhere said why. It now names the port
    and the amounts.
  - **While alongside**, water, food, oxygen, spares and propellant trickle up
    at fixed daily rates. The log now says what came aboard when the ship casts
    off, in the units each store is counted in — tonnes for propellant, a count
    for spares, kilogrammes for the rest.

- **A `resupply` standing order** (§7.3), on by default. Automatic is the right
  default — nobody wants to press a button to be handed water they have already
  been budgeted for — but a default that cannot be turned off is not a policy,
  it is a fact, and this one quietly changes what the allowance settles at. The
  toggle sits on the Life tab, which is the screen where a player watches it
  happen.

  It governs the delivery restock too. A switch that a contract closing can
  override is not a switch. The allowance still settles either way: declining
  the stores does not un-spend what the crossing consumed.

### Fixed

- Switching a reservoir-rate standing order did not re-resolve the network, so
  turning the pumps off left them running until some unrelated event happened
  to resolve it. Found by the test that asserted the rate was zero.

- A delivery of half a kilogramme of propellant printed as "took on 0.0 t". The
  filter now runs on what the line would actually *say* rather than on a
  threshold in kilogrammes, which is a unit two of the five stores are not
  counted in.

### Changed

- `SIM_STATE_VERSION` 11 → 12. `standingOrders` gains a field and the ship
  carries the reading the resupply count is differenced against; an older save
  would load with the order reading `undefined`, which is falsy, and silently
  stop its own pumps.

## [0.11.13] — 2026-08-08

### Added

- **The chart is drawn in the frame real solar-system work is quoted in, and
  the ship has coordinates.** Heliocentric ecliptic: longitude measured from
  the **First Point of Aries**, anticlockwise seen from ecliptic north, radius
  vector in AU. That is the Solar Ecliptic / HAE convention — X toward the
  vernal equinox, Z northward from the ecliptic plane — and it is exactly how
  this plate was already drawn. Declaring the zero point costs nothing and buys
  the difference between an angle and a *coordinate*: 149° now means the same
  thing here as it does in an ephemeris, rather than "anticlockwise from
  whichever spoke we drew first".

  ♈ is marked on the rim with the arrow that points along it, and the tick ring
  is labelled every 30° the way an orrery's is — twelve marks is the count that
  makes a bearing readable off the plate instead of estimated between two
  quadrant labels.

  The ship's position is now stated as a set of coordinates: **λ, β, r** — the
  triple heliocentric work uses — plus the Cartesian **x, y** JPL's vector
  tables give, because the two answer different questions. λ and r are what you
  plan a transfer with; x and y are what the plate is literally drawn from.
  Longitude is given in decimal degrees and in the sexagesimal an ephemeris
  prints.

  **β always reads 0.000°, and that is the point.** §5.1 states the model does
  not do inclination, and a latitude row that never moves is the simplification
  saying so in the one place a player would otherwise assume it had been
  handled.

  Planetary symbols are deliberately *not* used for the worlds. The IAU
  discourages them in modern work and proposes letter abbreviations for tables
  — and "Mars" is a better label than ♂ for anybody who has not memorised the
  set. ♈ stays, because a direction marker is where those symbols are still
  standard practice.

### Changed

- The chart's telemetry block no longer repeats the ship's position. It is
  stated properly an inch above, to five decimals; two versions of one number
  on a screen is something the reader has to stop and reconcile.

## [0.11.12] — 2026-08-08

### Changed

- **A locate crosshair, and a control that says what it does.** The chart can
  be dragged off its own edge, so it needs the one button every maps
  application on a phone has taught: a crosshair meaning *put me back in the
  middle*. It is always there rather than appearing once the ship is already
  lost — a control you have to notice mid-problem is a poor one — and it
  brightens when it is the one you want. From the whole-system plate it is also
  the fastest way in to her, keeping whatever scale is already in force.

- **"Map" is now "System".** The old label named the projection rather than
  what pressing it does, and what a player wants from that button is not a
  square-root scale, it is the whole solar system on one plate. The scale
  readout says `system · 6.20 AU` to match.

## [0.11.11] — 2026-08-08

### Added

- **Keep pinching and the chart lands in the world's own frame, where the ship
  is actually moving.** Gateway to Tranquillity is 384,400 km — 0.0026 AU — so
  on every heliocentric plate the two berths and the ship are one dot. The
  chart said so honestly by pinning her at Earth, and she sat there for five
  days while the mission board's route strip showed her crossing the whole
  time: the instrument meant to be the truthful one was the one that looked
  broken.

  Below about a million kilometres across, the plate switches to the body's own
  frame: the planet drawn to the **same scale as the orbits around it**, a ring
  for each berth, and the ship on her real transfer ellipse between them.
  Earth's limb comes up almost to Gateway's ring and Luna's is fifty-seven
  times further out, which is the whole reason the hop costs five days and
  3.91 km/s.

  Not the route strip's stylised half-ellipse with the ship interpolated along
  it: this is `stretchedBetween` about Earth's own gravitational parameter,
  read at `now`. This is the plate that claims its numbers are real.

  The angles here are the transfer's own reference, and the chart says so. The
  sim does not track where Luna is in its month, and inventing a bearing would
  be a number the player could check and find made up — so the angles *between*
  things on this plate are true while their bearing against the stars is not
  claimed.

  The ruler switches to kilometres at these scales, because "0.002 AU" is not a
  number anybody can hold, and the caption names the **berth** rather than the
  planet: "under way to Earth" was true of the dot and useless about the
  errand.

### Fixed

- **Rapid gestures were being thrown away.** Wheel notches and pinch moves
  arrive faster than React re-renders, and each handler was reading the camera
  its render had closed over — so thirty notches moved the scale about as far
  as two, which reads as a chart ignoring you. Every gesture now applies
  against the latest camera.

- **Crossing into the local frame threw the ship off the plate.** The camera's
  centre is a pair of numbers whose meaning changes with the frame — "1 AU from
  the sun" and "1 AU from Earth" are not the same place — so the first pinch
  across the boundary put her six hundred thousand plate-widths away, which was
  the heliocentric distance to Earth quoted in a frame that had just stopped
  meaning that. The camera now records which origin it is measured from.

- The scale readout said "here across" once the plate was measuring the gap
  between two berths: `distance` is right to call anything under a thousandth
  of an AU "here" when answering *how far is that*, and wrong as a legend.

## [0.11.10] — 2026-08-08

### Changed

- **The chart pinches and drags, like a map.** The four fixed scales shipped in
  `0.11.6` were a scale *picker*, and a chart is not something you pick a
  setting for — it is something you lean into. One finger drags, two pinch
  about the point between them, a wheel notch steps and a double tap goes in,
  continuously from three million kilometres across out to Ceres' orbit.

  The point under the fingers **stays under the fingers**, which is the whole
  difference between this feeling right and feeling broken: the gesture
  converts plate coordinates back into AU before rescaling rather than zooming
  about the middle of the plate.

  The square-root map stays as a place to return to rather than becoming a
  fifth stop on the scale. It is a different *projection*, not a different
  magnification, and pinching your way into it would be a lie about what the
  gesture does — but dragging a map does move you into the close view, because
  grabbing a chart and having it refuse to budge is the wrong answer to a
  gesture that plainly means "move".

  Buttons remain for what a pinch cannot serve: closer, wider, back to the map,
  and — once the ship has actually been left behind — centre on her again. They
  also give the plate somewhere to say **what scale it is at**, which a
  continuous zoom needs far more than fixed stops did; with four buttons the
  scale was the label on the pressed one.

### Fixed

- `setPointerCapture` was called unguarded. It is an optimisation that keeps a
  drag alive past the edge of the plate, and it is allowed to fail — a pointer
  can be gone by the time the handler runs, and an uncaught throw there would
  have taken the whole gesture with it rather than degrading to an ordinary
  drag. Found by the end-to-end pinch, which drives synthetic pointers.

## [0.11.9] — 2026-08-08

### Changed

- **The Life tab only raises an alarm when something is actually hurting
  somebody.** It used to put up a coloured panel for every reading that was not
  perfectly nominal, which meant a healthy ship carried a standing warning:
  1,567 ppm is "stuffy", costs four per cent of a work rate and no health at
  all, and it is where a working cabin *sits*. An alarm that is always on is
  not an alarm — and this is the one place the game promises to foreshadow a
  death (§7.4), so it is the worst possible thing to teach a player to look
  past.

  The threshold is the same `statusFor` the gauge bands use, so the strip and
  the bars cannot disagree about whether something is wrong. A red panel over
  seven green gauges would have been the worse version of this.

- **Everything shown is quantified twice: what it costs the schedule, and what
  it costs the people.** Capacity is stated as how much longer work takes,
  which is the form a decision gets made in — "the crew work at 64%" is a fact
  about people, "jobs take 56% longer" is a fact about the plan. Each hazard
  says its own cost and its own health rate, and a combined line gives the
  total the sim is actually applying, since capacities multiply and health
  costs add.

  Nothing below the threshold is hidden, only demoted: the quiet line still
  says what the crew are working at when it is not 100%, so a player who
  notices jobs running slow gets the reason without an alarm being faked to
  give it to them.

## [0.11.8] — 2026-08-08

### Fixed

- **The gauge bands were hard to see.** Drawn at 0.3 alpha on a near-black
  panel, all three came out muddy variants of the same dark and telling green
  from amber was a guess. They are now mixed toward the ground instead, which
  keeps them recognisably coloured and — unlike opacity — cannot be dulled
  further by whatever is drawn over them. The bar is taller, the tank fill is
  lighter so the colour beneath stays legible, and the needle is a bright mark
  with a dark edge so it reads against any band rather than vanishing into its
  own.

- **Amber and red were 43 apart.** Measured, once `verify.mjs` started reading
  the colours rather than the class names: the interface amber and red are both
  warm, and mixing both with the same dark ground closed the gap on the two
  colours it matters most to tell apart. The bands now use their own pair,
  pushed away from each other in hue *and* lightness — the warning brighter and
  yellower, the danger darker and redder — so the difference survives a
  colour-blind eye and a phone in sunlight. 115 / 72 / 119 apart now, and the
  check holds them there.

## [0.11.7] — 2026-08-08

### Added

- **Green, amber and red on every Life gauge, with the ranges drawn on the
  bar.** The panel could say what a level was, and since `0.11.5` what was
  pushing it about. It could not say whether the number was *all right* — which
  is the first thing anybody wants from a gauge. Two of the seven carried a
  status; the other five carried none, so 11 kg of oxygen and 900 kg of water
  were the same colour.

  For anything the crew breathe or sit in, the colours are a **reading of
  `physiology.ts`** rather than a second set of numbers free to drift from it:
  green while nobody is losing health, amber at `impaired` where health starts
  costing, red at `dangerous` and worse. That lands the carbon dioxide marks on
  OSHA's 5,000 ppm and NIOSH's 10,000 — where a reader who knows the real
  figures would put them. For a store the colours come from **time**: amber
  inside thirty days, red inside seven, which are shorter than the runs on the
  board.

  Each bar now carries its **ranges**, not just its current colour, so the
  player can see how much room is left before the next boundary. A store's
  bands move as consumption does — the same tank is comfortable with four
  aboard and thin with eight, and a fixed mark would say the same in both.

  **The cabin is banded at both ends.** The cold table has been in
  `physiology.ts` since it was written and no gauge had ever drawn it; the
  temperature bar now runs red-amber-green-amber-red across 5 to 45 °C.

  Hazard bars show a needle and no fill: a tank can be drawn part-full and mean
  something, but shading everything below 1,567 ppm would say the cabin is 3%
  full of a problem, which is not a thought anybody has.

### Fixed

- **Oxygen could be painted red with its needle in the green.** It is dangerous
  for two unrelated reasons — the tank emptying on a clock, and the cabin
  thinning below what a body can use — and neither implies the other: a tank
  that is not draining lasts for ever and can still hold too little to breathe.
  Colouring the row from one calculation and drawing the bar from the other put
  the needle in the wrong band. Both rules are now read along the same track,
  with each pressure threshold solved back through the ideal-gas relation to
  the exact mass that produces it. Caught by the test written for it.

- The hand-written CO2 and temperature thresholds in `engine.ts` are gone. They
  duplicated the physiology tables and had already drifted: 28 °C was amber
  there while the model called it `noticeable`, costing eight per cent of a
  work rate and no health at all.

### Changed

- New `stores` block in `packages/data/tuning.json` — watch and critical days,
  the spares reserve, and the propellant watch multiple. Balance numbers belong
  in data (§9); the bar denominators they replace were magic numbers in a
  component.

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
