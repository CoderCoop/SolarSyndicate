# Solar Syndicate — Design Document

*Status: the reasoning behind the game — the arguments, the numbers, the
worldbuilding. This is the place to understand **why** any decision was made.*

*The binding subset lives in [`.specify/memory/constitution.md`](../.specify/memory/constitution.md),
which **governs where the two disagree**. If you find this document describing a
rule the constitution contradicts, this document is the one that needs fixing.*

## 1. Vision & Design Pillars

A working vessel in a lived-in, near-future solar system. The ship is a machine with
real constraints; the crew are people with real needs; the economy is run by guilds
with real agendas. The game rewards planning, tinkering, and care.

**There is no avatar, and no name.** You are not a character aboard the ship, and
not a character anywhere else either — you are **the guild itself**, as experienced
from an operations desk. You choose which guild you embody, you hire and assign the
crew, you authorize the money, and you set the policy the ship runs on. Nobody
addresses you by name because there is no one to address: dispatches are filed to
*Operations, Ceres Local 12*, and the crew speak of you in the third person and the
institutional voice — "the Guild wants us on the Vesta run," "the Local approved
the overtime." The people aboard are not you: they are your responsibility.

This is a deliberate inversion of the usual space-game fantasy, and it's the
game's thesis. The crew are individuals with names, ages, ambitions and graves;
the player is an institution. Everything that makes the game feel different from
its neighbours falls out of that asymmetry. (§4.6 and §6.3 cover how.)

Five pillars — when two ideas conflict, the higher pillar wins:

1. **The ship is the protagonist.** Everything the player touches routes through the
   cross-section view. Systems are legible: you can trace why the O2 margin is thin.
2. **Plausible physics, honest numbers.** Real-world values +25–50% for near-future
   tech. Delta-v, closed-loop life support, heat rejection, g-forces, light-lag. We
   simplify (2D coplanar orbits, no n-body) but we don't fake (no free thrust, no
   magic fuel, no instant comms).
3. **Time flows whether you watch or not.** The simulation is anchored to real UTC
   time. Crews sleep, ships coast, contracts expire. The game must be *fair* about
   this (see §7.4) but never freezes the world.
4. **You work for someone — until you *are* someone.** The guild isn't flavor: it
   gates contracts, parts, crew, and ports, and it's the seat you occupy. Its
   policies constrain you early and become yours to write late (§6.4). The long arc
   of the game is from serving an institution to deciding what that institution
   does to people.
5. **You manage, you don't pilot.** Your instruments are hiring, assignment,
   policy, money, and orders sent across a light-delay. You never fly the ship.
   The crew do that — well or badly, depending on who you hired and what you asked
   of them.

**Anti-goals (v1):** combat as a core loop (leave hooks, don't build it), planetary
landings/surface gameplay, 3D rendering, procedural galaxy (it's *our* solar system —
hand-crafted places), multiplayer (architect for it, don't build it).

---

## 2. Core Gameplay Loop

**Session zero (once):** choose your guild → receive your desk, your operating
budget, and a tired starter hull → **crew up at the hiring hall** → take the first
contract. Crewing the ship *is* the tutorial (§10.1).

Then three nested loops at different time scales:

- **Minutes (a play session):** read the ship's status report → answer pending
  authorizations (breakdown, crew dispute, hail, expense) → adjust watch bill /
  routing / power policy → queue work orders → close app.
- **Hours–days (a mission):** accept contract → approve a transfer plan (window,
  delta-v, consumables) → departure burn → mid-flight events + idle progress →
  arrival → resolve → get paid → resupply.
- **Weeks–months (a desk):** build guild standing and rank → unlock
  hulls/parts/ports/contracts → recruit, train, and *keep* specialists → push into
  longer, deeper, riskier work (inner system → Belt → outer planets) — while your
  crew age through their own careers (§4.5): novices become masters, masters mentor
  and retire or die, and keeping skill alive across generations becomes the long
  game.
- **The whole campaign (an institution):** accumulate the rank, capital, and
  reputation to relocate your headquarters (§6.3) and then to **change guild policy
  itself** (§6.4) — wages, rest rules, safety mandates, apprenticeships. The rules
  you spent the early game working around become the rules you write.

The session loop is deliberately "check in on your ship" shaped — a good 5-minute
session on a phone should feel complete. Long transfers make the idle layer the
default state, punctuated by scheduled moments that want your attention (burns,
arrivals, events). Because you're remote, "check in" is diegetically exact: you're
reading dispatches and sending orders, not standing on a bridge.

**No game over.** There's no avatar to kill and no run to lose. Ships can be
crippled, crews can die, contracts can be lost, and you can be demoted or drummed
out of a guild — but the campaign continues, because the desk continues. This suits
an always-on real-time sim: a permanent world needs a permanent seat.

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

**Visual direction (decided, spec 003).** Three styles were mocked up: blueprint
*schematic*, illustrated *cutaway*, and a *flow* node-graph. Schematic won,
with flow demoted to a toggleable overlay on top of it and cutaway rejected
outright.

The deciding argument was not which looked best — cutaway did — but which
survives the game growing. Every object aboard draws itself from a small closed
vocabulary of shapes, so the picture is *generated* from the same JSON that
drives the simulation. A cutaway would have made each new component an art
commission and quietly turned §9's content pipeline into an art pipeline. What
the cutaway *was* right about is colour as meaning, and that was kept: warm
where people rest, green where things grow, red where something has failed.

The flow overlay makes pillar 1 literal — you can watch the reactor feed the
scrubbers — but it answers a question asked *about* the ship, not instead of
it, so it is a layer rather than a second view. It stays off until asked for.

Ships are allowed to be taller than a screen. Scrolling through a vessel deck
by deck is inspection, which is the activity this game is about.

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

**Removers have a floor.** A sorbent bed does not strip a gas out of an
atmosphere; it reaches equilibrium with its own sorbent. The ISS runs around
2,000–3,000 ppm of CO2 with CDRA working perfectly, and Earth ambient is about
420. So every remover declares the lowest partial pressure it can hold, and the
best one running sets how clean the cabin can get — plants pull lower than the
amine bed, which is why the hydroponics rack earns its power beyond the food it
grows. Nothing reaches zero, because nothing physical does.

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
  ~real-world spec, guild-tier and modded parts push toward +50%.
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
| Fusion torch (late) | speculative, the one licensed exaggeration | ~10⁴–10⁵ s | ~0.01 g | Endgame. Brachistochrone: Mars ~3 weeks, Jupiter ~2 months. Guild-locked. |

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
- **Traits** (flavorful modifiers, some guild-cultural): *Spacer-born* (+micro-g
  tolerance, −high-g tolerance), *Union Steward* (+morale nearby, demands rest
  compliance), *Tinkerer* (mods cheaper, occasionally "improves" things unasked)…
- **Needs** (the real-time layer): sleep (shift cycle), hunger, health, radiation
  dose (career-cumulative — a real reason veterans retire), morale, social.

### 4.2 Skills → ship effects (the contract with the player)

**The taxonomy is borrowed, not invented (decided, spec 004).** Three layers,
each taken from a real classification, because a made-up skill list produces
made-up questions like "what does the *life support* skill mean?"

**Knowledge** — six domains from the [O\*NET Content
Model](https://www.onetcenter.org/content.html), the US Department of Labor's
occupational taxonomy, which separates *Knowledge* (organised bodies of fact,
slow to acquire, broadly transferable) from *Skills* (developed capacities
applied across jobs). Ours are its Mathematics-and-Science,
Engineering-and-Technology and Health-Services domains, narrowed to what a ship
this size turns on: **Mechanical, Electronics, Physics, Chemistry, Biology,
Medicine**.

Note what is not there. "Life support" is not a body of knowledge, it is a
*system*. Someone who runs it well knows chemistry and biology, monitors well,
and is certificated on that system — three separate things, which is why one
skill by that name always read oddly.

**Skills** — O\*NET's Cross-Functional *Technical* cluster, verbatim, plus one
Systems-cluster entry for command:

| Skill | O\*NET's definition | What it drives here |
|---|---|---|
| Operation Monitoring | "Watching gauges, dials, or other indicators to make sure a machine is working properly" | **tune** (§3.3) |
| Equipment Maintenance | "Performing routine maintenance and determining when and what kind of maintenance is needed" | service orders |
| Troubleshooting | "Determining causes of operating errors and deciding what to do about it" | diagnosis |
| Repairing | "Repairing machines or systems using the needed tools" | repair orders |
| Quality Control Analysis | "Conducting tests and inspections to evaluate quality or performance" | inspection |
| Judgment and Decision Making | weighing costs and benefits of potential actions | autonomy under light-lag (§4.6) |

These were not picked to fit the game and justified afterwards. Operation
Monitoring is defined that way in a taxonomy that predates this project by
decades, and it describes the tune mechanic almost word for word. The split is
the point: keeping a system sweet, spotting that something is wrong, and
putting it right are three different competences, and a crew member can be
excellent at one and poor at another.

**Qualifications** — endorsements, modelled on
[STCW](https://www.imo.org/en/OurWork/HumanElement/Pages/STCW-Conv-LINK.aspx),
the IMO convention under which a mariner holds a Certificate of Competency plus
*endorsements* and watchkeeping itself is a certificated function; and on ISS
crew training, which is organised by **system** rather than by trade. The names
are the real ISS ones because they are already the right vocabulary: **ECLSS**
(Environmental Control and Life Support), **EPS** (Electrical Power), **TCS**
(Thermal Control), **PROP**, **GNC** (Guidance, Navigation and Control),
**EVA**, and **CMO** (Crew Medical Officer — a real assigned ISS role).

Knowledge and skill are continuous and everyone has some. A qualification is
binary and most people have none: it is what makes a particular hire worth
chasing (§4.4). An uncertificated hand is discounted rather than refused — a
competent engineer without the ticket still helps, or a short-handed ship would
be unplayable.

**How a room asks for people.** A room declares a *weighted knowledge
requirement* and, usually, the endorsement that certifies you for it. The
engine room is part physics and part mechanical; saying so in data beats
inventing a "nuclear engineering" skill that nothing else uses. Adding nuance
is a JSON edit.

Because you're remote, these are the *only* way crew quality reaches you — you
never fly a better line yourself. Hiring is the skill ceiling of the game.

**Attendance (decided, spec 004).** A multiplier only applies while that person
is **on watch and stationed in the room the system is in** — by the watch bill or
by an active work order. Being aboard is not enough; being asleep in the same
compartment is not enough. This is what makes §4.3's schedule the mechanism it is
described as rather than a formality, and it is why the roster is an allocation
problem: with three watches and a small crew, most rooms are unattended most of
the time, and you are choosing *which* systems get looked after.

The contribution scales with the person's current effectiveness as well as their
skill, so fatigue, cabin CO₂ and cabin temperature all feed back into it. A tired
technician in a hot room is worth less than a rested one, which closes the loop
between §3.2's networks and the people working inside them.

**Two axes, and attention is what moves the second one.** A part carries a
*condition* and a *tune*, and they are not the same thing:

| | **Condition** | **Tune** |
|---|---|---|
| What it is | Physical wear | Accumulated small inefficiencies |
| Falls because | The part is running | Nobody is paying attention |
| Rises because | A **work order** — labour-hours and spares | A skilled hand **on station** |
| Ceiling | Rated | *Above* rated, with a good enough operator |
| Failure mode | Breaks outright | Quietly costs you margin |

A water recycler does not simply wear out. Gunk builds up in a line. A hose sits
slightly outside its specified diameter and nobody measures it. Cabin humidity
drifts and the setpoints were never re-trimmed for it. In hydroponics a fungus
takes hold in the root system and wants the medium sterilised, or a batch of
seed needs lower light for a few days after germination or half the seedlings
die. **Anyone can run the plant. A skilled operator notices** — and a very good
one finds ways to run it better than the manufacturer intended.

So tune falls through inattention and rises only through assignment, while
condition falls through use and rises only through maintenance. A part can be
mechanically sound and badly out of adjustment, or freshly trimmed and about to
break. They are shown separately and fixed separately.

At spec tune a part delivers exactly its nameplate; below that it underperforms,
above it it beats the tin. An unskilled hand keeps a system running but spots
nothing, and it settles below spec. A specialist holds it above. Only a very
good operator, rested and breathing clean air, reaches the top.

Attendance also multiplies **wear**: ×0.55 with a skilled hand on station,
against ×1.0 for an unskilled one and ×1.15 for a deserted room.

**The fair-play floor (§7.4).** Tune decay is bounded. A wholly neglected system
bottoms out at a stated fraction of rated output — inefficient, never
non-viable, and never spiralling — and the ship's stores and margins are set
against that floor rather than against spec. A ship left alone gets *worse at
its job*; it does not die of it, and a competent hand back on station recovers
it. The ship is delivered exactly at spec, so the nameplate is what you get on
day one and every change from there is something you did or failed to do.

Upgrades raise the **base**; crew raise the **multiplier**. Keeping them on
separate terms means neither obsoletes the other: a superb technician cannot
substitute for a worn-out recycler, and a new recycler still runs better tended.

Tiers give **diminishing returns**, in efficiency and in value per credit. The
recycler line runs 97.0% → 98.3% → 98.9% closure for roughly 134k → 312k → 740k,
because the last six tenths of a percent genuinely do cost more than the first
ninety-seven. If the gains were linear the top tier would always be correct and
the choice would stop being one. Upgrades cost **mass** as well as money, and
mass is delta-v (§5.2) — an upgrade that cost only credits would be free.

### 4.3 Shifts & schedule

The ship runs a 24 h clock with a 3-shift watch bill (or 2-shift if understaffed —
morale and error rates suffer). You approve the watch bill and the work-order
priorities; you never issue minute-to-minute orders (you couldn't — see §4.6). Crew
autonomously sleep, eat, work their station, and execute the queue, with the captain
reshuffling as circumstances demand. This is what makes offline time work: the
schedule *is* the AI. Skill growth: learning-by-doing (slow, capped by challenge
level) + training work orders (uses another crew member's Leadership/skill, or
courseware).

### 4.4 Hiring

Hiring is your primary instrument — the thing you do that nobody aboard can do for
you. Crew are hired at ports from guild-flavored pools (your own guild's hiring hall
— vetted, wage floor, rest rules, cultural fit; rival halls and independent boards —
cheaper, riskier, occasional gem, and standing consequences for poaching). Wages are
a recurring cost, the economic pump that keeps missions mattering. Hiring pools
aren't generated on demand — they're drawn from the persistent person registry
(§4.5): the mechanic you passed over at Ceres last month may have shipped out on
someone else's boat by the time you come back around.

Because you're remote, hiring at a distant port is *itself* a delegated act: you
review dossiers (incomplete, occasionally flattering) and your captain interviews.
A high-trust captain tells you when a dossier is lying. Firing is equally remote and
equally consequential — a berth left empty until the next port is a hole in the
watch bill for the whole transfer.

### 4.5 Lifecycle, aging & permadeath

Crew are **persistent people, and death is permanent.** No resurrection, no
save-scumming (the UTC-anchored single timeline enforces this for free). At 720×
time, one game year ≈ 12 real hours — a full 30-year career unfolds over roughly a
real-world fortnight of play. Generational crew turnover is the game's long arc,
and at this multiplier it is an arc a player can actually reach.

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

### 4.6 The chair you're not in: command, autonomy & light-lag

You are not aboard. This is the design's biggest structural asset, and it earns its
keep three ways.

**The ship has a captain, and they are an NPC.** Your first and most consequential
hire (§10.1). The captain is a crew member like any other — stats, skills, age,
mortality — with Leadership and Resolve as their defining attributes, and they hold
one unique power: **they decide what happens when you aren't reachable.** A cautious
captain diverts to a safe port and eats the penalty; a bold one runs the burn and
makes the deadline; a bad one freezes. Captains have judgment, not just numbers.

This creates the game's central relationship — and because you're nameless, it is
**institutional trust, not friendship**: the captain's regard is for *the Guild*,
not for a person they've never met. Countermanding recommendations, overriding
safety calls, pushing crews past guild rest rules, or refusing hazard pay all erode
it. High trust buys a captain who executes intent faithfully and flags problems
early; low trust gets literal compliance, quiet resentment, requests for transfer —
and eventually a resignation from the person who knows your ship best. That the
relationship is with an institution rather than a friend is exactly what makes the
guild contrast land: a Helios captain's cynicism about "the Combine" and a
Wrightworks captain's solidarity with "the Local" are the same mechanic wearing
different clothes. A captain who dies is a crew-succession problem (promote the
first officer? hire outside? the crew have opinions), not a meta-game problem.

**Light-lag is real, and it's the best mechanic this framing unlocks.** Orders and
reports travel at *c*, between **your headquarters and the ship** — so the numbers
below are for a starting Earth HQ, and relocating the desk (§6.3) rewrites the whole
table:

| Ship at | One-way | Round trip | Real time at 720× | (was, at 24×) |
|---|---|---|---|---|
| Luna | ~1.3 s | ~3 s | instant | instant |
| Mars | 4–21 min | 9–42 min | 0.8–3.5 s | 0.4–1.7 min |
| Ceres | 15–31 min | 29–63 min | 2.4–5.3 s | 1.2–2.6 min |
| Jupiter | 35–52 min | 70–103 min | 5.8–8.6 s | 2.9–4.3 min |
| Saturn | 71–87 min | 141–175 min | 11.8–14.6 s | 5.9–7.3 min |

⚠ **720× costs us light-lag as a *felt* mechanic, and this is the real price of
the new multiplier.** At 24× a Saturn round trip was a seven-minute wait — long
enough that you stopped issuing orders and started setting policy, which is the
entire point of §4.6. At 720× it is fourteen seconds: perceptible, but not
enough to change how anyone plays. The distance-to-autonomy curve still exists
in *game* time and still gates what a captain must decide alone, but the player
no longer feels it in their own clock.

Three ways out when M3 gets here, none of them chosen yet: decouple comms lag
from the time multiplier and hold it in real seconds; lean on conjunction
blackouts (still game-weeks long, so still real hours) to carry the mechanic
instead of routine lag; or accept that autonomy is communicated through *what
the captain did without asking* rather than through waiting. Flagged here rather
than quietly rescaled, because §4.6 called light-lag "the best mechanic this
framing unlocks" and it has just been substantially weakened.

Consequences that still fall straight out, in game time: near-Earth ops are
tightly managed and feel supervised; the Belt gets a real conversational lag;
the outer system is *genuinely autonomous*, where you set policy and trust your
captain because you cannot do anything else. The distance progression of the game is simultaneously a
progression in **how much control you give up** — which is a far more interesting
difficulty curve than bigger numbers, and it makes hiring a great captain the actual
unlock for deep-space work. Real conjunctions (Sun between HQ and ship) produce
scheduled comms blackouts lasting game-weeks: pre-authorize, or go dark and hope.

**It fixes the offline problem honestly.** Everything §7.3–7.4 needs was awkward
with an avatar aboard ("why didn't I just handle it?") and is natural here: you're
not there because *you're never there*. Standing policies are standing orders. A
timed-out decision isn't the game cheating — it's a ship 40 light-minutes away
doing its job. Push notifications are dispatches. The session-open digest is your
inbox.

**And it opens two doors we want later:** managing more than one ship (the desk
scales; the fiction doesn't strain), and a shared universe where many players are
representatives of the same few guilds (§8.4) — colleagues and rivals at adjacent
desks, competing for the same contracts, hulls, and people.

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

#### The Kestrel is a cislunar hauler, and that is now true in the numbers

The in-system leg used to get its own hand-set duration and price — five days
and 1.59 km/s — sitting next to honestly derived interplanetary legs. It is now
solved with the same vis-viva and Kepler maths, against the parent body's
gravitational parameter: **3.91 km/s over 4.98 days**, Gateway's 6,778 km orbit
to Tranquillity's 384,400 km one. Two ports around one body is the same problem
as two planets around the sun; only the primary changes.

The tank was resized to afford the truth rather than the truth being bent to fit
the tank: **18 t → 32 t**, a propellant mass fraction of 31% → 44%. For scale,
the Apollo Service Module ran 75% and a Falcon 9 upper stage 97%; 31% was a
building, not a vehicle.

**What that buys, and what it does not.** The Earth–Moon system works properly
now, with margin. Mars does not — and the reason is worth stating because it is
*not* the tank:

| Constraint | Kestrel | Albatross | Earth→Phobos needs |
|---|---|---|---|
| Propellant | 32 t | 110 t | 103 t |
| **Food endurance** | **91 days** | **382 days** | **259 days** |
| Water endurance | 281 days | 1,000 days | 259 days |

Stores gate Mars harder than mass ratio does. Feeding four people for a Mars
crossing needs roughly three times the pantry the Kestrel has *and* three times
the tank — which is a different ship, not a bigger number.

**So it is a different ship you have to go and buy.** §10.2's M4 hull-upgrade
path, pulled forward, because it was the only thing standing between the player
and half the board. The Albatross is sold at Tranquillity — hulls are sold where
hulls are built, and having to fly somewhere to buy a ship is what stops the map
being decoration. It is priced as a difference: list less what the yard allows
for the Kestrel, so the upgrade costs what replacing a working ship costs.

Three consequences worth having chosen deliberately:

- **Mars is reachable on minimum energy only.** The faster ellipses stay
  blocked, so buying the hull opens the destination without removing the trade.
- **The Belt stays out of reach** at 14.9 km/s, which leaves somewhere to go.
  §10.2 already puts NEP in M4, and high-Isp electric propulsion is the honest
  answer for outer-system work — the Belt is gated behind a *drive*, not a tank.
- **A new ship is new.** She arrives at nameplate condition and spec tune, so
  months of attention paid to the old recycler do not transfer. That is a real
  cost of switching, and the purchase card says so rather than letting it be
  discovered.

**A real result that fell out of doing this honestly:** a faster run to the Moon
is nearly free. Minimum energy is 3.91 km/s and the three-and-a-half-day express
is 4.04 — a 3% premium for 30% off the clock. That is why Apollo flew a
three-day trajectory rather than a five-day one, and it means the cislunar
trajectory choice is genuinely low-stakes. The interesting version of that
decision lives on interplanetary crossings, where stretching the ellipse costs
delta-v steeply (Earth→Phobos: 9.62 km/s at minimum energy, 14.93 express).

⚠ **Open, and found by flying it:** on a 259-day crossing the allowance
currently *rewards neglect on the spares line*. A tended ship spends its whole
11-unit spares budget on repairs and scores 0 there; a ship left alone spends
none and banks 9,680 cr — while arriving with a dead reactor, four broken
systems and no way home. The punishment is real but it is entirely deferred,
and the settlement reads backwards at the moment the player looks at it.
Deliberately not patched by inflating the spares allowance, because the honest
fix is that a broken part should be a *liability on the books* — asset
valuation, which is a mechanic rather than a number. Decide before M4.

**Still open, and deliberately so:** the Belt needs 14.9 km/s and ~148 t of
propellant, which no single-stage NTR of this class reaches. §10.2 already puts
NEP in M4, and high-Isp electric propulsion is the honest answer for outer-system
work — so the Belt is gated behind a drive, not behind a bigger tank.

### 5.3 Missions

Generated from guild need + world state, not fully random. v1 archetypes:

1. **Cargo contract** (bulk, timed): the bread and butter. Tonnage × distance ×
   deadline pressure. Helios specialty.
2. **Speculative trade** (no contract): buy low here, sell high there; prices drift
   with local supply/demand and news events.
3. **Survey/exploration**: take a science package to a coordinate/rock, spend time
   scanning, return data. Long, quiet, life-support-limited. Meridian Institute specialty.
4. **Salvage**: reach a derelict/debris field, EVA + mechanics gameplay, recover
   parts (the source of weird/cheap/modded parts). Salvage guild.
5. **Passenger/medical run**: people are demanding cargo (life support load, comfort,
   g-limits on burns).
6. **Grey-market run** (The Drift): high pay, cargo you don't inspect,
   inspection events at port, standing consequences if caught.

Missions compose (carry cargo out, salvage on the return leg). Events punctuate
transit: part failures, flare warnings (get crew into the water-tank shadow),
distress calls (morality + guild standing), stowaways, crew drama. Events are
scheduled by the simulation (§7.3) — some auto-resolve by policy, some queue as
push-notification decisions.

---

## 6. Guilds & Economy

### 6.1 The Union System

Ships don't fly free — they fly *affiliated*. And you don't float free either: **the
guild is the seat you occupy**, chosen at the start of the game (§10.1) and the
single most defining choice you make. It sets your starting hull, budget, contract
board, hiring hall, home port, tutorial, and the culture your crew expect. Guild
choice is the game's "class selection," and the four play genuinely differently.

| Guild | Identity | Specialty | Culture / obligations | Plays like |
|---|---|---|---|---|
| **Helios Combine** | mega-corporate bulk logistics | huge cargo contracts, cheap fuel at company ports | schedule discipline; late-delivery penalties; crew morale drag ("company town") | Logistics optimization. Big margins, tight deadlines, replaceable people — and the temptation that comes with treating them that way |
| **Wrightworks Guild** | engineers' & salvagers' labor union | salvage rights, part discounts, best mechanics in the hall | wage floors + mandatory rest (genuinely good for crew, costs money); solidarity calls you're expected to answer | Tinkerer mode. Poorer, slower, the best-maintained ship in the system, and crew who stay for decades |
| **Meridian Institute** | scientific consortium | survey contracts, sensor tech, astrogation training | data must be shared; low pay, high tech access | The long game. Bad money, unmatched tech and training, missions that go further out than anyone else's |
| **The Drift** | independents & smugglers | grey market, no questions, best margins | no safety net, no insurance, no death benefit; standing is personal and fragile | High risk. Best pay, worst consequences, and the only guild where your crew might be running from something |

Standing (−100…+100) is tracked with *all* guilds and moves on contract outcomes,
event choices, and cross-guild friction. Guild culture must reach the ship: a
Wrightworks crew expects rest rules honored and notices when they aren't; an
Institute crew gets restless without a science bay; Drift crew don't ask questions
but don't take loyalty for granted either.

**Rank within your guild** is your personal progression axis (the replacement for
character levels): reliable delivery, honored obligations, and cultivated crews earn
promotion — bigger budgets, better hulls, priority berths, a voice in guild politics,
and eventually a second ship. Failures and betrayals earn demotion, audits, and
oversight.

**Defection** is possible and expensive: switching guilds costs rank, standing,
contract access, and crew (some follow you, some refuse on principle, some report
you). It's a mid-game story beat, not a menu toggle — and it's the one time the
"class selection" can be re-rolled.

### 6.2 Economy

- **Prices**: per-port commodity prices = baseline × local supply/demand modifier,
  drifting via production/consumption rates + news shocks (mine accident on Vesta →
  metals spike). Deterministic from seed + time (§7.3) so it can later be
  server-published for a shared universe.
- **Whose money?** The guild's. You operate a **budget**, not a wallet: revenue flows
  to the guild, you draw against an operating allowance, and capital purchases (hulls,
  major parts) need authorization your rank has to carry. Running lean earns rank and
  latitude; overspending earns an audit. This makes the economy accountable rather
  than acquisitive, which is the whole difference between a manager and a merchant —
  and it gives the guild a lever to express its values (Helios questions every hour
  of overtime; Wrightworks questions every hour of *unpaid* overtime).
- **Money sinks** (what makes income meaningful): wages, propellant, spares,
  port/berth fees, part purchases, insurance, guild dues, hazard pay, death benefits.
- **The resupply allowance** — the mechanism that gives efficiency a price. Every
  contract states, *before it is accepted*, what the guild has budgeted for the
  crossing: so many kg of water, O2, food, propellant, spares. On arrival the ship's
  actual consumption is measured against it and the difference settled at the
  **arrival** port's prices. Come in under and the balance is paid back; go over and
  it is billed. This is what finally counts loop closure, tune, attendance and
  upgrade tiers — all of which had been moving numbers that nothing scored.
  The signal scales with voyage length: on a five-day Earth-system hop the water
  line is worth tens of credits against a five-figure payment, and the money is
  really in the spares line (wear avoided). It only bites on long crossings.
- **Every port that can be arrived at must offer work back out.** A one-way board
  strands the ship commercially even though it is berthed, fuelled and crewed —
  the same failure as a mechanical strand, which §7.4 forbids. Enforced by test
  rather than by care.
- **Progression**: budget buys parts; *standing and rank* gate which parts/hulls/
  ports are even purchasable. Both are needed — pure cash grind can't shortcut
  guild play.
- **No player-driven inflation risk in v1** (single player), but keep all balance
  values in data files — the economy will need live tuning.

### 6.3 The desk: headquarters & relocation

Your HQ is a real place in the world, not a menu background. It starts wherever your
guild posts you (§10.1) — most likely Earth orbit or Luna — and **later in the game
you can move it**, which is the deepest strategic decision available to a player who
never touches a control surface. Because you are the guild's embodiment rather than
a person, relocation isn't you moving house: it's **the guild opening a new local**,
with all the institutional weight that implies.

**What HQ determines:**

1. **Light-lag to everything** (§4.6) — the headline effect. Comms delay is measured
   from your desk, so relocating rewrites your entire control topology.
2. **Your hiring hall** — who walks through the door. An Earth hall is deep,
   credentialed, and expensive; a Ceres hall is full of Belters with real vacuum
   hours and no paperwork; a Ganymede hall is small, weird, and fiercely loyal.
   This is how HQ shapes your crew's *culture* over the long run.
3. **Your contract board** — local work, local prices, local politics.
4. **Refit and resupply** — where your ship can actually get major work done cheaply,
   and how far it has to deadhead to reach you.
5. **Guild standing effects** — a frontier local is prestigious in Wrightworks and
   Meridian, suspicious in Helios, and the natural home of The Drift.

**The trade is genuinely non-obvious, which is why it's good.** Moving outward buys
supervision of the frontier at the cost of the core — but it also **increases your
variance**, because outer bodies separate further at opposition. One-way light time,
computed from real orbital radii:

| HQ at | ↔ Earth | ↔ Mars | ↔ Ceres | ↔ Jupiter | ↔ Saturn |
|---|---|---|---|---|---|
| **Earth** | — | 4–21 min | 15–31 | 35–52 | 71–88 |
| **Mars** | 4–21 min | — | 10–36 | 31–56 | 67–92 |
| **Ceres** | 15–31 min | 10–36 | — | 20–66 | 57–103 |
| **Jupiter** | 35–52 min | 31–56 | 20–66 | — | 36–**123** |

Note the Jupiter row: it gives the best Ceres access in the game (20 min at
conjunction) and the *worst* Saturn number anywhere (123 min at opposition, worse
than Earth's 88). An outer HQ trades steady mediocrity for spectacular windows and
brutal droughts — you start planning contracts around when your own headquarters is
well-placed, which is an astrogation-flavored strategic layer for the player rather
than the crew. Mars is the safe all-rounder; Ceres is the Belt-operations play;
Jupiter is a commitment.

**Cost and pacing.** Relocation is a major capital action: it needs rank, a
substantial budget draw, and game-weeks of transition during which your hiring hall
and contract board are degraded. Crucially it also has a **human cost** — some of
your shore-side people and your ship's crew have lives anchored to the old port
(§4.5 ambitions and families), and a move will lose you some of them. It should feel
like founding something, not like changing a setting.

**Later:** multiple locals. Once relocation exists, running two or three HQs is the
natural fleet-era expression of a guild that has grown (see §11.4) — a network with
different lag profiles, halls, and boards, which is exactly the shape a shared
universe wants (§8.4).

### 6.4 Guild politics: influence & policy

Early on, guild policy is the **constraint** you work inside — Wrightworks' mandatory
rest costs you throughput, Helios' delivery penalties squeeze your margins,
Meridian's data-sharing mandate caps your income. Over time those same policies
become **something you author**. You start by serving the institution and end up
deciding what it does to people.

That is the ethical spine of the game, and it should be presented without a thumb on
the scale: you can make Helios more humane or make Wrightworks more ruthless, and
the game's job is to show you the consequences honestly, not to grade you.

#### There is no gate — only scale

**Influence is available from your first week; only its *magnitude* is limited.**
There's no unlock, no rank threshold, no "politics chapter." Political capital buys
change on a continuous curve: a little capital buys a small, local, temporary
change; a great deal of capital buys a large, permanent, guild-wide one. The system
you learn in week one is the system you're still using a game-decade later, played
for three orders of magnitude more.

The tiers are the same lever at different scales, and each has its own in-fiction
name, blast radius, and cadence — so the scale is legible without a tutorial:

| Tier | What it is | Affects | Takes effect | Capital |
|---|---|---|---|---|
| **Waiver** | a one-off exception, called in as a favour | one ship, one voyage | immediately (subject to light-lag — you're asking your local, and they have to answer) | trivial |
| **Variance** | a standing exception for your operation | your ship(s), until revoked | days | small |
| **Local rule** | how *your* port actually does things | everyone based at your HQ | next local meeting (~weeks) | moderate |
| **Guild policy** | a motion carried at assembly | every ship in the guild | quarterly assembly (≈3 real hours at 720×) | large |
| **Charter amendment** | the guild's founding terms | the guild, permanently, including its identity | annual, needs a supermajority built over time | enormous |

Cost scales multiplicatively along four axes, which keeps the formula legible:

> **cost = base(policy) × scope × permanence × ideological resistance**

The last term is what makes each guild play differently: changes *aligned* with a
guild's values are cheap, changes *against* them are brutally expensive. Raising the
wage floor in Wrightworks is a modest ask; cutting it is a war. Helios is the mirror.
This means the same political capital buys a very different game depending on which
guild you embody — and it's where schism pressure comes from.

#### The choice that makes it interesting

Because capital is one pool, **every waiver you buy is a charter amendment you
don't.** The manager who keeps purchasing small exceptions to get through this
quarter never accumulates enough to change the rule that keeps forcing the
exceptions. That's a real strategic tension, it's the same shape as the
delta-v-versus-consumables trade that governs travel (§5.2), and it happens to be
true about institutions — which is the best thing this system does.

The safety mandate shows the whole curve in one lever. Early: spend a little to
waive the departure margin for *one* voyage, risking *your* crew, whose names you
know. Middle: a standing variance for your operation — you've stopped asking
each time. Late: carry a motion loosening the mandate for every ship in the
guild, and read the accident statistics for the next game-year. Same decision,
three scales, and the game never once tells you which was wrong.

#### What policy actually controls

Deliberately, the numbers the player already watches, so influence is legible rather
than abstract. Each entry below can be targeted at any tier above:

| Policy | Immediate effect | Long-run effect |
|---|---|---|
| Wage floor | your operating costs | hiring-hall quality and crew retention, guild-wide |
| Mandatory rest | throughput vs. error rates | veteran lifespans; who's willing to sign on |
| Hazard pay & death benefits | cost per dangerous contract | crew willingness to take deep-space and salvage work |
| Safety margin mandates | the §7.4 departure thresholds — *for everyone* | accident and fatality rates across the guild |
| Apprenticeship program | a real budget line, no immediate return | the hall's skill floor rises over game-years — for you *and* your rivals |
| Salvage rights / data sharing / exclusivity | contract income and access | inter-guild friction and standing |
| Insurance pool | premiums | how much a disaster actually costs you |

The **apprenticeship program** deserves emphasis as the system's best dilemma: a
pure collective good — expensive, slow, benefits competitors exactly as much as you,
and compounds for decades. At waiver scale it's funding one apprentice's berth on
your own ship; at charter scale it's a guild that trains everyone's crews forever.
Whether players ever fund it at the top of the ladder is the most interesting
question this design asks.

#### Earning capital

Political capital is a third currency alongside budget and standing, earned by
things money can't buy: contracts delivered without incident, obligations honored
when they cost you, crew retained for years, dangerous work done well, other locals
backed when they asked. Crucially, **treating crew well is a political asset** — the
thing that costs you money in the short run is the thing that buys you power in the
long run. Capital accrues slowly and continuously, so there is always a cheap tier
you can afford and always an expensive one you're saving toward.

At the upper tiers you don't spend capital alone: motions are debated and voted at
assemblies, arising from world state and from rival locals as well as from you. You
sponsor, vote, block, trade support, and build blocs with NPC representatives who
hold consistent agendas — so late-game capital buys *votes*, not outcomes.

**Schism.** Push policy far enough from a guild's identity — enough expensive
against-the-grain motions — and traditionalists organize: motions get blocked,
capital costs rise further, and a sustained campaign can end in a split, a faction
leaving with locals, ships, and crew. Being on either side of a schism is a
late-game story beat, and a more interesting answer to "what if I want to be
something else" than defection (§6.1).

**The Drift is the deliberate exception.** It has no bylaws, no assemblies, and no
charter — that's its entire proposition. The same ladder exists as purely personal
obligation: a favour owed, a standing arrangement, a reputation across a port, and
finally being the name that everyone in the grey market trusts. Same currency, same
curve, no institution to spend it in.

---

## 7. Time & Offline Simulation

The most consequential design decision in the game.

### 7.1 Time scale: game time = 720× real time

One real minute = half a game day. Anchored to UTC wall-clock, never paused
(pillar 3). Open question 1 is now closed, and the answer came from playing it.

**Set by the voyage, not by the ship.** A crossing is the only span the player
*chooses and then waits out*, so it is the span the multiplier has to fit. The
flyable Earth-system transfers are 3.6–5.0 game days; at 720× they take
**7.2–10 real minutes**, which resolves inside the sitting in which the
decision was made.

The original 24× was set from the other end — "one real hour = one game day"
reads well and keeps crew life visible on screen. But it made those same
crossings **four to five real hours**. That is the right cadence for a game
checked twice a day and the wrong one for a game whose central verb is casting
off: the player pressed the button they came to press and then had nothing to
look at.

- Handy conversions: one real second is 12 game minutes; a watch turns over
  every 40 real seconds; a game day passes in 2 real minutes; a game year in
  roughly 12 real hours.
- Transfer pacing at 720×: NTR-era Mars run (~6 game-months) ≈ **6 real
  hours**; Belt run ≈ half a real day; the Luna hop ≈ **10 real minutes**.
  Drive upgrades still compress *real* wait time, which is what makes
  progression viscerally felt — there is simply less of it to compress.
- **The cost, stated plainly:** offline catch-up is now far more dramatic. An
  hour away is 30 game days and a night away is most of a game year, so a ship
  left with a thin margin will not merely have drifted — it will have run its
  stores out and be sitting on a dead loop. §7.4's fair-play rules still hold
  (nothing is destroyed that the player could not have foreseen), but the
  *stakes* of walking away have gone up by thirty times, and the away report
  has that much more to explain. Watch this in playtest; it is the most likely
  reason to revisit the number.
- Rejected: variable/pausable time (breaks pillar 3 and any shared-universe future);
  1× real time (Mars in 6 real months is EVE-grade patience).
- The old objection to 100×+ was that "crew daily life becomes an invisible
  blur, undermining the crew sim". 720× goes well past that line, and the
  objection was half right: a watch now turns over every 40 real seconds, so
  you no longer *witness* shift changes, you read them in the log. What saves
  it is that M1 made the crew sim legible through state rather than through
  animation — the watch strip, the roster, the attendance model — none of which
  depends on watching a change happen live. If crew life does start reading as
  noise, the fix is a slower multiplier, not a busier screen.
- **Now frozen.** Changing it after launch warps every balance number and any
  shared universe. The two things that would reopen it: offline catch-up proving
  too punishing (§7.1 above), or light-lag's loss (§4.6) mattering more in
  practice than it does on paper.

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

The watch bill, your **standing orders**, and your **captain's judgment** run the
ship — in that order of precedence. Crew work/eat/sleep and execute queued work
orders; standing orders are the policy toggles you set in advance (ration
thresholds, escalation rules, spending limits, auto-accept berth fees, default
event resolutions); anything your orders don't cover falls to the captain, whose
Leadership and temperament decide how well it goes (§4.6).

Events that need *your* authorization queue a decision and fire a push notification.
The decision window is bounded by physics: the captain can only wait as long as
operational reality allows, and every exchange costs a light-lag round trip. Past
that, they act — on your standing orders if they cover it, on their own judgment if
they don't. This is the offline system and the command system being the same system.

### 7.4 The fair-play rules (non-negotiable)

This is a permadeath game (§4.5), so the rule is not "nothing bad happens while
you're away" — it's **"no death without foreshadowing and a decision."** Permanent
consequences must always trace back to a choice the player actually made:

- **Every acute emergency opens a decision window** (push notification + in-game
  timer scaled to severity and light-lag). Unanswered, it resolves by your standing
  orders and your captain, whose conservative defaults reach **safe mode**: minimal
  power, coast, crew secured on rations. If margins were sane at departure, safe
  mode always suffices — costing money, time, morale, standing, the mission. Death
  while unattended can only occur when *you* pre-committed to thin margins
  (overrides, rationing, deferred maintenance, a captain you knew was green) — and
  the game says so at commit time, in red, with names: *"If a scrubber fails past
  Vesta, Osei and Reyes don't come home."*
- **Chronic deaths are telegraphed in game-years.** Age, dose, and illness decline
  visibly; the medic gives prognoses; there is always time for a final voyage, a
  retirement, a goodbye. No one dies of old age as an offline surprise line-item.
- **No silent stranding.** The nav computer refuses departures whose delta-v /
  consumable margins can't absorb worst-case scheduled events, unless explicitly
  overridden (see above — the override *is* the foreshadowing).
- **The ship survives.** Crew are mortal; the campaign is not. Hull loss is not in
  v1 (a dead-crew ship gets recovered/towed at ruinous cost). Bounded decay still
  applies to everything non-living: condition, morale, standing have floors.
- **Return is a story.** The session-open screen is your inbox: the captain's
  dispatches since you last read in, written in their voice — including, when it
  must be, an honest account of a death and the chain of orders that led there.
  Grief the player can read is fair; a red number is not. (A captain who trusts you
  writes candidly; one who doesn't files a clean, defensive report — the digest
  itself carries the relationship.)

---

## 8. Technical Architecture

### 8.1 Stack

- **Language:** TypeScript end-to-end, strict mode.
- **Structure:** monorepo (pnpm workspaces):
  - `packages/sim` — the entire game simulation. **Zero DOM/browser dependencies.**
    Pure functions + event queue. Runs in browser, Node (tests), or a future server
    unchanged. This package boundary *is* the MMO insurance policy.
  - `packages/data` — content definitions (parts, hulls, guilds, missions, crew
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
  function to/from UTC. The 720× constant lives in exactly one place.
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
   price indices, news events, guild states — same deterministic generators, now
   seeded server-side and shared by everyone. Players feel a common universe
   (prices, news, leaderboards, maybe visible ship traffic) with zero real-time
   multiplayer infrastructure. High shared-feel per engineering dollar.
   **The guild-rep framing pays off here:** every player is a representative of one
   of four guilds, so "all Wrightworks reps" is a real, ready-made faction with
   shared standing, shared contract pools, and collective outcomes — social
   structure for free, without any player-to-player systems.
   **And guild politics (§6.4) is the killer feature of this phase:** assemblies
   become *real* votes among real players on wage floors, safety mandates, and
   apprenticeship funding — genuine collective decisions with consequences everyone
   lives with, implemented as async server-side tallies. Enormous shared-world feel
   for almost no infrastructure, and the game's central question ("what does this
   institution do to people?") becomes something a player community answers
   together. This is the strongest argument for building v2 at all.
4. **v3 — true MMO (optional).** Server-authoritative sim of shared space; the
   client's `Command`/determinism discipline becomes the wire protocol. Natural
   shape: colleagues and rivals at adjacent desks competing for the same contracts,
   berths, hulls, and *people* — a shared person registry means the mechanic you
   didn't hire gets hired by someone else, for real. Decide *then* whether the game
   wants it; nothing in v1 forecloses it.

The v1 discipline that buys all of this: **deterministic sim, command-sourced
mutations, UTC-anchored time, UUID entity ids, sim/UI separation.** All cheap now,
prohibitive to retrofit.

### 8.5 Performance targets (mobile)

Cold load < 3 s on mid-range Android; JS bundle < 500 KB gz for the shell; offline
catch-up of 30 idle days < 1 s; 60 fps ship view scroll; battery-polite when
foregrounded (1 Hz cosmetic tick, rAF only during gestures/animations).

---

## 9. Content & Data-Driven Design

Every part, hull, room, trait, guild, commodity, mission template, and event is a
JSON record with a zod schema — no gameplay numbers in TypeScript. Consequences:
balance patches are data patches; a future server can ship data updates without app
releases; modding stays possible; and designers (us, later maybe players) tune in
spreadsheets. Mission and event *templates* are data + small parameter ranges; the
deterministic generator instantiates them from world state.

---

## 10. Onboarding & Build Order

### 10.1 Session zero: the guild, then the crew

The opening is not a cutscene — it's the game's two core verbs performed once,
slowly, with the training wheels on.

**1. Choose your guild.** Four cards, each stating its identity, what it gives you,
and what it asks of you (§6.1) — no wrong answers, four different games. This choice
sets starting hull, budget, **HQ location** (§6.3), contract board, hiring hall, and
the cultural expectations your crew will hold you to. It is presented as what it is:
a guild opening a desk. *"Wrightworks Guild, Luna Local 12: one operations desk, one
very tired hauler, and no one to fly her."*

This is the entire character-creation flow. There is no name to enter and no
portrait to pick — the guild card *is* the character sheet, which is the point
(§1). The first thing the game asks you for is not who you are but who you'll hire.

**2. Crew the ship.** Your hull is docked, sound, and empty. You have a budget that
won't cover the crew you want, and a hiring hall full of dossiers — this is the
tutorial, and it teaches by making you *shop*:

- **Hire your captain first.** Three or four candidates with visibly different
  temperaments (the cautious veteran with a dose history and a bad knee; the sharp,
  green, cheap one; the expensive one nobody has a bad word about; the one whose
  last berth ended badly and whose dossier is vague about why). This single choice
  teaches stats, skills, traits, wages, and — because §4.6 makes it matter —
  establishes from minute one that you are hiring judgment, not statistics.
- **Then fill the watch bill.** You need a pilot, a mechanic, and life support
  covered; you can afford roughly two of the three properly. The gaps you accept
  here become the first act's problems, which is exactly what a good tutorial
  should do. Your captain comments on your picks (their first read on you).
- **Then set standing orders** on a short first contract — a Luna run, where
  light-lag is ~3 seconds and you can micromanage freely. Distance, and the loss of
  control that comes with it, arrives in act two: the game teaches delegation by
  gradually taking supervision away.

No avatar creation, no name-your-hero screen. You get a guild, a desk, a ship, and
a payroll. The people are the characters — and the first thing you learn about
yourself is what kind of employer you are.

### 10.2 Build order (each milestone is playable)

- **M0 — Walking skeleton (the tracer bullet).** Sim package with event queue +
  UTC anchoring + one resource (power); ship view rendering 3 rooms from state;
  IndexedDB save/load with fast-forward; installable PWA shell. *Proves the whole
  architecture end-to-end before content exists.*
- **M1 — The living ship.** Full resource networks, parts with condition/wear,
  work orders, 4 crew with needs/shifts/one skill effect (mechanic). *Fun check:
  is keeping the ship healthy engaging on its own?*
- **M2 — Going somewhere.** System map, windows + Lambert transfers, delta-v/
  consumables budgeting, one cargo mission loop, arrival/departure burns, money.
- **M3 — A world with opinions.** All four guilds, standing + rank, contract boards,
  price drift + speculative trade, hiring halls backed by the person registry,
  aging + permadeath + first life events (ambitions, departures, funerals),
  the captain-autonomy and trust system, light-lag, mission archetypes 1–4,
  standing orders + notifications — **plus political capital and the bottom two
  rungs of the influence ladder** (waivers and variances). Cheap to build (they're
  costed modifiers), and they validate the political system early instead of
  betting a late milestone on an unproven idea.
- **M4 — Ship of Theseus, and the long game.** Part market, swapping, mods/
  tinkering, hull upgrade path, engine tiers through NEP, salvage missions —
  plus **HQ relocation** (§6.3), which needs M3's light-lag and hiring halls in
  place and gives the late game a strategic axis that isn't a bigger engine.
- **M5 — The institution.** The upper rungs of the ladder (§6.4): local rules, guild
  policy, charter amendments; quarterly assemblies; ~8–10 policies targetable at
  every tier; NPC representatives with consistent agendas. *Not* in v1: vote-trading
  blocs, schism, multi-local politics — post-v1 depth on a system that only needs to
  exist, not to be deep, for the arc to land. **This is the designated cut line**
  (§12.1), and the continuous-scale design makes it a safe one: cutting M5 leaves a
  complete, working political system capped at local scale rather than no politics
  at all. Players still spend capital from week one; the ceiling is just lower.
- **M6 — Polish & ship.** Fair-play audit, dispatch-inbox return screen, session
  zero (§10.1) with all four guild openings, push notifications, save migrations,
  perf pass.

---

## 11. Open Questions (want answers before their milestone, not before M0)

1. ~~**Time multiplier** (§7.1): 24× or 48×?~~ **Answered in M2: 720×**, set by
   how long a crossing should take rather than by how fast crew life should
   read. Neither candidate was close — both were chosen from the ship-management
   side and left the voyage a multi-hour wait. Freeze by M3; the thing to watch
   first is offline catch-up (§7.1).
2. **Realism ceiling:** is the late-game fusion torch acceptable as the one
   speculative exaggeration, or do we hold the +25–50% line strictly (and accept
   multi-real-week outer-system runs forever)? → M4.
3. **How literal is light-lag in the UI?** Hard version: telemetry is *stale* —
   the ship view shows the ship as it was N minutes ago, and orders visibly take
   time to land. Gorgeous, thematic, and potentially baffling on a phone. Soft
   version: state is live, only *decisions* are delayed. Proposal: soft by default,
   with stale-telemetry markers on the outer-system screens (a "last heard: 47 min
   ago" timestamp) — full hard mode as an optional realism setting. → M3.
4. **When does the desk get a second ship, and a second local?** Rank progression
   points naturally at both a small fleet and a network of HQs (§6.3), and the
   framing supports them with no fiction strain — but each multiplies UI and balance
   work. Proposal: single ship + single (relocatable) HQ through v1; fleet and
   multi-local together as the headline v1.x feature, since they share a "portfolio"
   UI and are the strongest argument for cloud save. → post-v1.
5. **How far can HQ go?** Is relocating to Jupiter or Saturn a real option, or does
   the game cap you at the Belt to keep lag legible? Proposal: allow it, gate it
   behind high rank, and let the 123-minute Saturn opposition be a lesson players
   teach themselves. → M4.
6. **How steep is the influence curve?** Now that influence starts at session one
   (§6.4), the question isn't *when* but *how many orders of magnitude* separate a
   one-voyage waiver from a charter amendment, and how fast capital accrues along
   it. Too flat and guild-scale change is trivial; too steep and the top rungs are
   decorative. Proposal: a waiver costs roughly a week of accrual, a charter
   amendment roughly two game-years — with the explicit goal that a dedicated player
   carries their first *guild policy* motion within ~30 real days.
   → tune in M3 (bottom rungs), validate in M5.
7. **Notifications backend timing:** local notifications only (no server) for v1,
   or stand up the minimal push relay at launch? → M6.
8. **Art direction** for the cross-section: clean diagram/blueprint style (cheap,
   legible, ages well) vs. illustrated interiors (warm, expensive)? Blueprint-with-
   warm-accents proposed. → M1, since it shapes the room components.

**Decided (was open):** crew permadeath with full lifecycles (§4.5); no POV
character and no captain avatar (§4.6); **the player is nameless — an embodiment of
the guild, never addressed as a person** (§1).

## 12. Top Risks

### 12.1 Scope — now the dominant risk

The design has grown four major systems since the first draft (lifecycles and
permadeath, the guild-rep framing with light-lag, HQ relocation, guild politics).
Each is individually well-motivated and they reinforce each other unusually well —
but stated plainly: **this is now a large game, and scope is the thing most likely
to kill it.** The mitigations have to be real, not rhetorical:

- **The milestone order is a priority order, not a plan.** M0–M3 is a complete,
  shippable game: a living ship, real travel, a world with guilds, mortal crew.
  Everything after that is the long tail. If we ship M0–M3 and nothing else, we
  have a good game.
- **Designated cut lines, decided in advance** (so they're not fought over under
  deadline pressure): M5 degrades to the lower rungs of the influence ladder only
  (§6.4 — a complete system with a lower ceiling, not a missing one); M4 HQ
  relocation degrades to a one-time mid-game move with a fixed destination list;
  multi-ship and multi-local are already out. Designing systems as *continuous
  scales* rather than *unlocked tiers* is what makes cuts survivable — a scale can
  be truncated, a tier can only be absent.
- **Every milestone ends with a fun check**, and a milestone that fails its check
  gets fixed or cut before the next one starts. Adding systems on top of an
  unproven core is how this design dies.
- The pillar hierarchy (§1) and the v1 anti-goals settle conflicts without a
  meeting.

### 12.2 Other risks

1. **Genre stacking.** A crew sim, a physics sim, an economy sim, a political sim,
   and an idle game — each is a genre with its own depth expectations. Mitigation:
   each system must earn its place by feeding the others (they currently do:
   crew quality → ship performance → contract outcomes → capital → policy → crew
   quality); anything that doesn't close a loop gets cut.
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
6. **Politics that doesn't feel like anything.** §6.4 fails if motions read as a
   menu of stat modifiers. Mitigation: every policy must visibly change *people* —
   the hiring hall's faces, a captain's dispatch tone, an accident report — not
   just a number. If a motion can't be shown through a person, it isn't a motion.
