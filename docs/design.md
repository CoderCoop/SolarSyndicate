# Solar Syndicate — Design Document

*Status: pre-implementation design. Everything here is a proposal to be argued with.*

## 1. Vision & Design Pillars

You captain a working vessel in a lived-in, near-future solar system. The ship is a
machine with real constraints; the crew are people with real needs; the economy is run
by factions with real agendas. The game rewards planning, tinkering, and care.

Four pillars — when two ideas conflict, the higher pillar wins:

1. **The ship is the protagonist.** Everything the player touches routes through the
   cross-section view. Systems are legible: you can trace why the O2 margin is thin.
2. **Plausible physics, honest numbers.** Real-world values +25–50% for near-future
   tech. Delta-v, closed-loop life support, heat rejection, g-forces. We simplify
   (2D coplanar orbits, no n-body) but we don't fake (no free thrust, no magic fuel).
3. **Time flows whether you watch or not.** The simulation is anchored to real UTC
   time. Crews sleep, ships coast, contracts expire. The game must be *kind* about
   this (see §7.4) but never freezes the world.
4. **You work for someone.** Factions aren't flavor — they gate contracts, parts,
   crew, and ports. Your alignment shapes your ship's culture and your options.

**Anti-goals (v1):** combat as a core loop (leave hooks, don't build it), planetary
landings/surface gameplay, 3D rendering, procedural galaxy (it's *our* solar system —
hand-crafted places), multiplayer (architect for it, don't build it).

---

## 2. Core Gameplay Loop

Three nested loops at different time scales:

- **Minutes (a play session):** check ship status → resolve events (breakdown, crew
  issue, hail) → adjust assignments/routing/power → queue work orders → close app.
- **Hours–days (a mission):** accept contract → plan transfer (window, delta-v,
  consumables) → depart → mid-flight events + idle progress → arrive → resolve →
  get paid → resupply.
- **Weeks–months (a career):** earn faction standing → unlock hulls/parts/ports →
  recruit and train specialists → take on longer, deeper, riskier missions (inner
  system → Belt → outer planets) — while your crew age through their own careers
  (§4.5): novices become masters, masters mentor and retire or die, and keeping
  skill alive across generations becomes the long game.

The session loop is deliberately "check in on your ship" shaped — a good 5-minute
session on a phone should feel complete. Long transfers make the idle layer the
default state, punctuated by scheduled moments that want your attention (burns,
arrivals, events).

---

## 3. The Ship

### 3.1 Cross-section view

Portrait-oriented vertical cross-section — the ship is drawn as a tall stack, which
maps perfectly to a phone screen and to a plausible ship layout (engines at bottom,
thrust axis = "down" while under burn, so the ship's decks stack like a building —
this is physically correct for a torchship and a nice realism win):

```
┌──────────────┐
│  Sensors/Nav │  ← bridge, comms, sensor mast
├──────────────┤
│ Crew Quarters│  ← bunks, galley, rec
├──────────────┤
│   Med Bay    │
├──────────────┤
│ Life Support │  ← scrubbers, recyclers, hydroponics
├──────────────┤
│  Cargo Hold  │  ← modular bays
├──────────────┤
│  Machinery   │  ← workshop, spares
├──────────────┤
│ Tanks        │  ← propellant, water (doubles as rad shielding)
├──────────────┤
│ Reactor      │
├──────────────┤
│ Engines      │
└──────────────┘   + radiators as external elements
```

Rooms are **slots in a hull frame**. A hull defines the stack (number/size of slots,
structural mass, max thrust rating); rooms install into slots; **parts** install into
rooms (a Life Support room might hold 2× CO2 scrubbers + 1× water recycler + 1×
hydroponics rack). Crew members are visible in the rooms where they're stationed,
walking between decks via a central ladder/lift shaft. Tapping a room opens its
detail panel (installed parts, assigned crew, local stats, work orders).

### 3.2 Resource networks

Five networks connect parts. Each is a per-tick balance of producers, consumers,
and buffers:

| Network | Producers | Consumers | Buffer | Failure mode |
|---|---|---|---|---|
| **Power** (kW) | reactor, solar | everything | batteries | brownout → systems shed load by priority |
| **Heat** (kW) | reactor, engines, people, equipment | — (must be rejected) | thermal mass | radiators undersized → temps climb → damage, crew stress |
| **Atmosphere** (O2/CO2/N2) | O2 generator, hydroponics | crew, leaks | tank + cabin volume | CO2 ppm rises → crew performance drops → hypoxia |
| **Water** | recycler (recovers ~95–98%) | crew, hydroponics, electrolysis | tanks | rationing → morale, health |
| **Propellant** | — (buy/mine) | engines, RCS | tanks | stranded (the cardinal sin — see §7.4) |

Heat is the underrated one: radiators are big, fragile, and mass-expensive, and give
us a real engineering trade-off that most games skip. Reactor output is ultimately
radiator-limited.

Consumption anchors (per crew member per day, ISS-derived): O2 ~0.84 kg, CO2 out
~1.0 kg, water ~3.5 L gross (recycled), food ~1.8 kg. Near-future closure: water
loop ~98%, O2 loop ~85–90% with hydroponics contributing food + CO2 draw-down.

### 3.3 Parts & upgrades

Parts are data-defined (JSON) with: mass, volume/slot size, power draw, heat output,
condition (0–100%), wear rate, spares requirement, and their functional stats
(thrust/Isp for engines, kW for reactors, scrub rate for scrubbers…).

- **Condition & maintenance:** parts wear with use; condition degrades output
  (gracefully, then a failure roll). Maintenance consumes spares + mechanic time via
  **work orders** — the queue of jobs crew execute over time. This is the mechanic's
  core gameplay.
- **Tinkering:** a mechanic above a skill threshold can apply **mods** to a part
  (overtune: +output, +wear; efficiency trim: −consumption, −peak; reinforce: +mass,
  +reliability). Mods are where "25–50% over real-world" lives — baseline parts are
  ~real-world spec, faction-tier and modded parts push toward +50%.
- **Swapping:** parts swap at port (dock fees, market availability) or in flight if
  you carry the spare and the room allows hot-swap (risky, EVA sometimes required).
- **Mass matters:** every part and cargo ton changes your delta-v budget via the
  rocket equation. Upgrading to a heavier reactor is a real trade.

### 3.4 Engine tiers (progression backbone)

Real values +25–50%; each tier changes *how travel feels*, not just numbers:

| Tier | Basis | Isp | Accel (loaded) | Character |
|---|---|---|---|---|
| Chemical (LOX/CH4) | Raptor-class | ~380 s | up to 1.5 g | Departure/capture burns, docking. High g events — crew endurance matters. Hopeless for deep space alone. |
| Nuclear thermal | NERVA+50% | ~1200 s | 0.05–0.3 g | Early-game workhorse. Hohmann-class transfers: Mars in ~5–7 months. |
| Nuclear-electric / plasma | VASIMR-class scaled up | ~5000 s | 0.5–3 milli-g | Mid-game. Continuous-burn spiral trajectories, Mars in ~2–3 months, radiator-hungry. |
| Fusion torch (late) | speculative, the one licensed exaggeration | ~10⁴–10⁵ s | ~0.01 g | Endgame. Brachistochrone: Mars ~3 weeks, Jupiter ~2 months. Faction-locked. |

G-force realism lands in two places: high-thrust burn events (crew must be secured;
endurance stat checks; un-stowed cargo is a hazard) and sustained micro-g health
decay on low-thrust legs (exercise work orders, med bay counters it) — under torch
drive, continuous thrust *is* your gravity, which the vertical deck layout reflects.

---

## 4. Crew

### 4.1 Model

- **Base stats** (slow-changing, 1–10): Strength, Dexterity, Endurance, Intellect,
  Perception, Resolve (stress/social).
- **Skills** (0–100, grow with use + training): Piloting, Astrogation, Mechanics,
  Electronics, Medicine, Life Support (botany/ECLSS), EVA, Negotiation, Leadership.
- **Traits** (flavorful modifiers, some faction-cultural): *Spacer-born* (+micro-g
  tolerance, −high-g tolerance), *Union Steward* (+morale nearby, demands rest
  compliance), *Tinkerer* (mods cheaper, occasionally "improves" things unasked)…
- **Needs** (the real-time layer): sleep (shift cycle), hunger, health, radiation
  dose (career-cumulative — a real reason veterans retire), morale, social.

### 4.2 Skills → ship effects (the contract with the player)

Every station derives a small set of multipliers from assigned crew (skill 60% /
relevant stat 30% / condition-morale 10%). Examples of the mapping we hold ourselves
to — **crew quality must be legible in the numbers the player already watches**:

- **Pilot** at helm: −5…15% delta-v cost on maneuvers (finer burns), tighter
  arrival windows, docking incident rate.
- **Astrogator**: unlocks better transfer solutions (see §5.2), +scan resolution.
- **Mechanic**: engine efficiency +0–10%, wear rate −0–30%, faster work orders,
  mod quality.
- **Medic**: heal rate, radiation mitigation, micro-g decay reduction.
- **Life Support tech**: loop closure % (directly extends range), hydroponics yield.
- **Negotiator** (at port): contract pay ±10%, market spreads, fee waivers.

### 4.3 Shifts & schedule

The ship runs a 24 h clock with a 3-shift watch bill (or 2-shift if understaffed —
morale and error rates suffer). The player sets the watch bill, not individual
minute-to-minute actions; crew autonomously sleep, eat, work their station, and
execute the work-order queue. This is what makes offline time work: the schedule
*is* the AI. Skill growth: learning-by-doing (slow, capped by challenge level) +
training work orders (uses another crew member's Leadership/skill, or courseware).

### 4.4 Hiring

Crew are hired at ports from a faction-flavored pool (union hiring halls — better
vetted, wage floor, rest rules; independent boards — cheaper, riskier, occasional
gem). Wages are a recurring cost — the economic pump that keeps missions mattering.
Hiring pools aren't generated on demand — they're drawn from the persistent person
registry (§4.5): the mechanic you passed over at Ceres last month may have shipped
out on someone else's boat by the time you come back around.

### 4.5 Lifecycle, aging & permadeath

Crew are **persistent people, and death is permanent.** No resurrection, no
save-scumming (the UTC-anchored single timeline enforces this for free). At 24×
time, one game year ≈ 15 real days — a full 30-year career unfolds over roughly a
real-world year of play. Generational crew turnover is the game's long arc.

**The career arc.** People age in game time. Stats follow a life curve: physical
stats (STR/DEX/END) peak in the late 20s–30s and decline; INT/Perception hold
longer; skills keep growing but learning slows with age. So every crew member is a
stage in an arc: cheap promising novices → expensive irreplaceable masters → aging
veterans whose hands shake but who teach like nobody else. **Mentorship becomes a
core system**: a veteran's training work orders are how skill outlives the person —
the Guild's whole ideology, mechanically real.

**Life events.** People have ambitions, ties, and histories, driven by the same
event-queue sim: an ambition ("save 40k to buy a homestead on Mars", "get certified
as an astrogator", "one big score") that, when met, may mean they *leave* — settle
down at a port, retire, start a family, take a berth on another ship. Marriages,
births, feuds, friendships between crewmates (affecting morale and watch-bill
chemistry), letters from home, a former crewmate turning up at a port bar with a
lead. Departure is negotiable but real: counter-offers, one-last-run promises,
or letting them go well (standing + morale) vs. badly.

**A world of persons.** Anyone who ever crewed with you, plus current port hiring
pools and notable NPCs, lives in a persistent **person registry** simulated coarsely
by life events (background population is statistical, not simulated). Ex-crew keep
living: they age, settle, crew other ships, occasionally re-enter your story. The
roster screen has an alumni page; the ship keeps a memorial wall.

**Ways to die.** All permanent, all attributable:
- **Old age / health decline** — foreshadowed over game-years; the medic gives
  prognoses; veterans get a *final voyage* and a retirement decision before the end.
- **Radiation dose** — the career-cumulative counter now has teeth: dose history
  raises late-life illness risk. Shielding mass, flare protocols, and rotating who
  takes EVA/high-dose work become long-horizon crew management.
- **Acute emergencies** — accidents (EVA, high-g burn with an unsecured crewman,
  reactor casualty), medical crises mid-transfer beyond the med bay's reach,
  escalations of ignored failures. Governed by the fair-play rules in §7.4.
- **Player recklessness** — overridden safety margins, rationed life support,
  skipped maintenance. The game lets you, and owns the consequences.

Death has weight: a funeral (burial in space or carriage home — crew have wishes),
a morale/culture shock scaled by tenure and ties, possible obligations (Guild death
benefit to a widow), and a permanent entry on the memorial wall. Losing a master is
meant to *hurt* — that's what makes keeping them alive the game.

---

## 5. Travel, Missions, Physics

### 5.1 The map

2D top-down solar system, coplanar circular-ish Keplerian orbits (real radii and
periods; eccentricity only where it matters — Mercury, Pluto, comets). Hand-placed
ports: Earth (LEO ring-station, Gateway), Luna, Mars (Phobos yard), the Belt (Ceres,
Vesta, a dozen named rocks), Jupiter system (Ganymede, Callisto), Saturn (Titan).
Planets *move* — Mars is sometimes 0.5 AU away and sometimes 2.5 AU, so **launch
windows are real gameplay** and the astrogator's job.

### 5.2 Trajectory model — deliberately simple, honestly derived

No n-body integration. Between events a ship's position is a **closed-form function
of time** — this is the keystone that makes offline catch-up and future
server-side simulation cheap (§7.2, §8.2):

- High-thrust (chem/NTR): conic transfer computed by a Lambert solver against the
  window; ship state = departure time + transfer params → position(t) analytic.
- Low-thrust (NEP/torch): brachistochrone or spiral approximation, also analytic.
- Astrogation skill gates which solutions the solver surfaces (a green astrogator
  sees the textbook Hohmann; a great one finds the 20%-cheaper window next Tuesday).

Delta-v is the currency of travel. The player sees a delta-v budget bar (rocket
equation, honest) next to a consumables budget bar (crew-days of O2/water/food) —
choosing a faster transfer burns delta-v; a slower one burns life support margin.
That single tension is the travel game.

### 5.3 Missions

Generated from faction need + world state, not fully random. v1 archetypes:

1. **Cargo contract** (bulk, timed): the bread and butter. Tonnage × distance ×
   deadline pressure. Bulk-hauler faction specialty.
2. **Speculative trade** (no contract): buy low here, sell high there; prices drift
   with local supply/demand and news events.
3. **Survey/exploration**: take a science package to a coordinate/rock, spend time
   scanning, return data. Long, quiet, life-support-limited. Science faction.
4. **Salvage**: reach a derelict/debris field, EVA + mechanics gameplay, recover
   parts (the source of weird/cheap/modded parts). Salvage guild.
5. **Passenger/medical run**: people are demanding cargo (life support load, comfort,
   g-limits on burns).
6. **Grey-market run** (smuggler faction): high pay, cargo you don't inspect,
   inspection events at port, standing consequences if caught.

Missions compose (carry cargo out, salvage on the return leg). Events punctuate
transit: part failures, flare warnings (get crew into the water-tank shadow),
distress calls (morality + faction standing), stowaways, crew drama. Events are
scheduled by the simulation (§7.3) — some auto-resolve by policy, some queue as
push-notification decisions.

---

## 6. Factions & Economy

### 6.1 The Union System

Ships don't fly free — they fly *affiliated*. Affiliation is v1's faction mechanic:
one primary affiliation (changeable, with cost) + standing scores (−100…+100) with
all factions. Affiliation grants: contract board access, wage/part discounts, port
berths, crew pool flavor — and imposes obligations (union rest rules, corporate
exclusivity, institute data-sharing) that create real texture in day-to-day play.

| Faction | Identity | Specialty | Culture / obligations |
|---|---|---|---|
| **Helios Combine** | mega-corporate bulk logistics | huge cargo contracts, cheap fuel at company ports | schedule discipline; penalties for late delivery; crew morale drag ("company town") |
| **Wrightworks Guild** | engineers' & salvagers' labor union | salvage rights, part discounts, best mechanics in the hiring hall | wage floors + mandatory rest (genuinely good for crew, costs money); solidarity calls |
| **Meridian Institute** | scientific consortium | survey contracts, sensor tech, astrogation training | data must be shared; low pay, high tech access |
| **The Drift** | independents & smugglers | grey market, no questions, best margins | no safety net; standing is personal and fragile; other factions' ports get suspicious |

Standing moves on contract outcomes, event choices, and cross-faction friction
(running Helios freight lowers Drift trust, etc.). Faction flavor should reach the
ship: a Guild crew expects the rest rules honored; an Institute crew gets restless
without a science bay.

### 6.2 Economy

- **Prices**: per-port commodity prices = baseline × local supply/demand modifier,
  drifting via production/consumption rates + news shocks (mine accident on Vesta →
  metals spike). Deterministic from seed + time (§7.3) so it can later be
  server-published for a shared universe.
- **Money sinks** (what makes income meaningful): wages, propellant, spares,
  port/berth fees, part purchases, insurance, faction dues.
- **Progression**: money buys parts; *standing* gates which parts/hulls/ports are
  even purchasable. Both are needed — pure cash grind can't shortcut faction play.
- **No player-driven inflation risk in v1** (single player), but keep all balance
  values in data files — the economy will need live tuning.

---

## 7. Time & Offline Simulation

The most consequential design decision in the game.

### 7.1 Time scale: game time = 24× real time (proposal)

One real hour = one game day. Anchored to UTC wall-clock, never paused (pillar 3).

- A game day passing per real hour means a play session always sees crew life:
  shift changes, meals, sleep — the ship feels alive on screen.
- Transfer pacing at 24×: NTR-era Mars run (~6 game-months) ≈ **7½ real days**;
  Belt run ≈ 2–3 real weeks; late-game torch Mars run (~3 game-weeks) ≈ **21 real
  hours**. Long-haul missions are multi-day idle commitments punctuated by
  notification moments — mobile-idle cadence, and drive upgrades compress *real*
  wait time, which makes progression viscerally felt.
- Rejected: variable/pausable time (breaks pillar 3 and any shared-universe future);
  1× real time (Mars in 6 real months is EVE-grade patience); 100×+ (crew daily
  life becomes an invisible blur, undermining the crew sim).
- **Open question for playtesting:** 24× vs 48×. Tune early, then freeze — changing
  it after launch warps every balance number and any shared universe.

### 7.2 Offline progress = same simulation, fast-forwarded

There is no separate "offline earnings calculator." On app open, the engine advances
the world from `lastSimTime` to `now` using the same code path as live play. This is
affordable because of two architectural rules:

1. **Analytic between events**: positions are closed-form in time (§5.2), and
   resource levels are linear rates between rate-change events. Nothing needs
   per-second integration.
2. **Event-driven core**: the sim is a priority queue of timestamped events (arrival,
   part-wear threshold, meal, shift change, scheduled random event, contract
   deadline). Catch-up = pop events until `now`, recompute rates at each. A week
   away is thousands of events, not millions of ticks — milliseconds of work.

Determinism: all randomness from a seeded PRNG keyed on (worldSeed, entityId,
eventCounter). Same save + same wall-clock window ⇒ identical world. This makes
offline catch-up reproducible, bugs replayable, and cloud sync verifiable (§8.4).

### 7.3 What happens while you're away

The watch bill and **standing policies** run the ship: crew work/eat/sleep, execute
queued work orders, follow policy toggles the player sets in advance (ration
thresholds, "wake me for" rules, auto-accept berth fees, event auto-resolutions).
Events that *require* the captain queue a decision and fire a push notification;
if unanswered past their window they resolve by the standing policy's conservative
default.

### 7.4 The fair-play rules (non-negotiable)

This is a permadeath game (§4.5), so the rule is not "nothing bad happens while
you're away" — it's **"no death without foreshadowing and a decision."** Permanent
consequences must always trace back to a choice the player actually made:

- **Every acute emergency opens a decision window** (push notification + in-game
  timer scaled to severity). Unanswered, it resolves by the player's standing
  policies, whose conservative defaults reach **safe mode**: minimal power, coast,
  crew secured on rations. If margins were sane at departure, safe mode always
  suffices — costing money, time, morale, standing, the mission. Death while
  unattended can only occur when the player pre-committed to thin margins
  (overrides, rationing, deferred maintenance) — and the game says so at commit
  time, in red, with names: *"If a scrubber fails past Vesta, Osei and Reyes
  don't come home."*
- **Chronic deaths are telegraphed in game-years.** Age, dose, and illness decline
  visibly; the medic gives prognoses; there is always time for a final voyage, a
  retirement, a goodbye. No one dies of old age as an offline surprise line-item.
- **No silent stranding.** The nav computer refuses departures whose delta-v /
  consumable margins can't absorb worst-case scheduled events, unless explicitly
  overridden (see above — the override *is* the foreshadowing).
- **The ship survives.** Crew are mortal; the campaign is not. Hull loss is not in
  v1 (a dead-crew ship gets recovered/towed at ruinous cost). Bounded decay still
  applies to everything non-living: condition, morale, standing have floors.
- **Return is a story.** Re-entry screen is a captain's log digest — including,
  when it must be, an honest account of a death and the policy chain that led
  there. Grief the player can read is fair; a red number is not.

---

## 8. Technical Architecture

### 8.1 Stack

- **Language:** TypeScript end-to-end, strict mode.
- **Structure:** monorepo (pnpm workspaces):
  - `packages/sim` — the entire game simulation. **Zero DOM/browser dependencies.**
    Pure functions + event queue. Runs in browser, Node (tests), or a future server
    unchanged. This package boundary *is* the MMO insurance policy.
  - `packages/data` — content definitions (parts, hulls, factions, missions, crew
    tables) as JSON validated by zod schemas. Balance lives here, not in code.
  - `apps/web` — the PWA: Vite + React + TypeScript.
- **Rendering:** the cross-section is layered 2D — start with **SVG/DOM** components
  (fast iteration, free accessibility/text/layout, trivially responsive) behind a
  narrow `ShipViewport` interface so it can be swapped for PixiJS/canvas if crew
  animation or particle work demands it. The system map is SVG (it's diagrammatic
  by nature). Don't adopt a game engine (Phaser/Unity) — this is a UI-heavy sim,
  not a scene-graph game, and PWA size budget matters.
- **UI state:** zustand (or similar). The sim owns truth; UI subscribes to
  immutable snapshots emitted on sim events + a 1 Hz cosmetic tick. React never
  writes sim state directly — everything is a `Command` (see 8.4).

### 8.2 Simulation core

- **Event-queue architecture** per §7.2: `SimState` (plain serializable object) +
  priority queue of `SimEvent`s + pure reducer `apply(state, event) → state'`.
- **Time:** all sim timestamps in game-seconds from epoch; single conversion
  function to/from UTC. The 24× constant lives in exactly one place.
- Continuous quantities (tank levels, condition, position) stored as
  *(value at last event, rate)* — current value derived on read. UI animates
  between truths; the sim never ticks per-frame.
- **Testing:** the sim's purity makes it property-testable headlessly: "simulate
  90 days, assert conservation of mass/energy," "same seed ⇒ same state hash."
  Invest here early; it's the highest-leverage test surface in the project.

### 8.3 Persistence & PWA

- **Save = snapshot + command log.** Periodic full `SimState` snapshot to IndexedDB
  (via `idb`), plus append-only log of player `Command`s since snapshot. Load =
  snapshot + replay commands + fast-forward to now. Versioned schema with explicit
  migration functions from day one — save-breaking is the cardinal PWA sin.
- **PWA:** `vite-plugin-pwa` (Workbox) precaching the full app shell — the game is
  100% offline-capable by construction; manifest with portrait orientation;
  install prompt after first mission completes (earn the ask). Push notifications
  (service worker + a minimal push relay server later) for arrivals and captain
  decisions — core to the idle loop, but must degrade gracefully (iOS PWA push
  requires ≥16.4 and installed-to-homescreen).
- Storage budget: aggressively small saves (snapshots are plain JSON, compress with
  `CompressionStream`); request persistent storage (`navigator.storage.persist()`).

### 8.4 Cloud save → shared universe (the roadmap that shapes v1)

Phased, each phase shippable:

1. **v1 — local single player.** No server. But: all mutations are serializable
   `Command` objects, sim is deterministic, sim package is server-runnable.
2. **v1.x — cloud save.** Thin backend (auth + blob storage). Sync = upload
   snapshot + command log; conflict resolution = last-writer-wins per save slot
   (single player, low stakes). Enables cross-device play.
3. **v2 — shared *world*, single-player ships.** Server publishes the economy:
   price indices, news events, faction states — same deterministic generators, now
   seeded server-side and shared by everyone. Players feel a common universe
   (prices, news, leaderboards, maybe visible ship traffic) with zero real-time
   multiplayer infrastructure. High shared-feel per engineering dollar.
4. **v3 — true MMO (optional).** Server-authoritative sim of shared space; the
   client's `Command`/determinism discipline becomes the wire protocol. Decide
   *then* whether the game wants it; nothing in v1 forecloses it.

The v1 discipline that buys all of this: **deterministic sim, command-sourced
mutations, UTC-anchored time, UUID entity ids, sim/UI separation.** All cheap now,
prohibitive to retrofit.

### 8.5 Performance targets (mobile)

Cold load < 3 s on mid-range Android; JS bundle < 500 KB gz for the shell; offline
catch-up of 30 idle days < 1 s; 60 fps ship view scroll; battery-polite when
foregrounded (1 Hz cosmetic tick, rAF only during gestures/animations).

---

## 9. Content & Data-Driven Design

Every part, hull, room, trait, faction, commodity, mission template, and event is a
JSON record with a zod schema — no gameplay numbers in TypeScript. Consequences:
balance patches are data patches; a future server can ship data updates without app
releases; modding stays possible; and designers (us, later maybe players) tune in
spreadsheets. Mission and event *templates* are data + small parameter ranges; the
deterministic generator instantiates them from world state.

---

## 10. Build Order (each milestone is playable)

- **M0 — Walking skeleton (the tracer bullet).** Sim package with event queue +
  UTC anchoring + one resource (power); ship view rendering 3 rooms from state;
  IndexedDB save/load with fast-forward; installable PWA shell. *Proves the whole
  architecture end-to-end before content exists.*
- **M1 — The living ship.** Full resource networks, parts with condition/wear,
  work orders, 4 crew with needs/shifts/one skill effect (mechanic). *Fun check:
  is keeping the ship healthy engaging on its own?*
- **M2 — Going somewhere.** System map, windows + Lambert transfers, delta-v/
  consumables budgeting, one cargo mission loop, arrival/departure burns, money.
- **M3 — A world with opinions.** All four factions, standing, contract boards,
  price drift + speculative trade, hiring halls backed by the person registry,
  aging + permadeath + first life events (ambitions, departures, funerals),
  mission archetypes 1–4, events with policies + notifications.
- **M4 — Ship of Theseus.** Part market, swapping, mods/tinkering, hull upgrade
  path, engine tiers through NEP, salvage missions.
- **M5 — Polish & ship.** Kindness-rules audit, captain's-log return screen,
  onboarding (start docked at LEO with a debt and a two-person crew), push
  notifications, save migrations, perf pass.

---

## 11. Open Questions (want answers before their milestone, not before M0)

1. **Time multiplier** (§7.1): 24× or 48×? → playtest in M2, freeze by M3.
2. **Realism ceiling:** is the late-game fusion torch acceptable as the one
   speculative exaggeration, or do we hold the +25–50% line strictly (and accept
   multi-real-week outer-system runs forever)? → M4.
3. **Captain mortality & legacy.** Crew permadeath is decided (§4.5) — but is the
   captain a person too? If the captain ages and dies, we get a legacy/succession
   system (a groomed first officer inherits the ship, debts, and standing — the
   campaign outlives the character, generational play all the way down). If not,
   the captain is an abstract immortal viewpoint. Proposal: captain is mortal,
   succession is the endgame loop. → M3.
4. **Notifications backend timing:** local notifications only (no server) for v1,
   or stand up the minimal push relay at launch? → M5.
5. **Art direction** for the cross-section: clean diagram/blueprint style (cheap,
   legible, ages well) vs. illustrated interiors (warm, expensive)? Blueprint-with-
   warm-accents proposed. → M1, since it shapes the room components.

## 12. Top Risks

1. **Scope.** A crew sim, a physics sim, an economy sim, and an idle game — each a
   genre. Mitigation: the pillar hierarchy, the milestone order (each cuttable-to),
   and ruthless v1 anti-goals.
2. **Realism vs. fun** (the §5.2 delta-v tension). Mitigation: honest numbers but
   *curated choices* — the game surfaces 2–3 good transfer options, not a porkchop
   plot; depth for those who look, clarity for those who don't.
3. **Offline resentment** (returning to a mess — sharpened by permadeath).
   Mitigation: §7.4 fair-play rules, tested explicitly ("leave every playtest
   build idle for 3 days" as a ritual; "did any death feel unfair?" as the exit
   question of every playtest).
4. **Person-simulation scope creep.** The §4.5 registry could quietly become
   Dwarf Fortress. Mitigation: hard boundary — only ever-crewed persons + current
   hiring pools are simulated, coarsely, by life events; everyone else is
   statistics. Life-event depth grows by milestone, not by enthusiasm.
5. **Determinism discipline erosion** (one `Math.random()` in the sim breaks
   catch-up and the MMO path silently). Mitigation: lint rule banning
   `Math.random`/`Date.now` in `packages/sim` + the state-hash property tests.
