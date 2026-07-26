# Feature Specification: Rooms, Flows and People

**Status:** direction approved, ready to implement
**Milestone:** interleaved with M2 — presentation, plus one simulation change
**Depends on:** spec 003 (the schematic it replaces), M1

## Why

Spec 003 drew the ship from data and proved that worked. It also drew every
component as an abstract mark, and a cylinder reads as a cylinder — not as a
CO₂ scrubber you could walk up to and service. Three consequences followed,
and this spec addresses all three.

**Rooms did not read as rooms.** No floor, no ceiling, no sense of how big a
person is next to a scrubber. Abstraction was doing the wrong job: it made
things distinguishable from each other without making any of them
recognisable.

**Nothing was tappable.** The drawing sat above the list that did the real
work, so it was decoration. Tapping a deck expanded four parts and you went
hunting for the one you were already looking at.

**The flow overlay could not show topology.** Three parallel lines in a
12-unit margin encode *how much* passes each deck and nothing else, because
there is no room to route an edge sideways. Flow views exist to show what
connects to what; that one structurally could not.

And behind all of it, a gameplay point (§3.2, §4.2): **ship equipment and crew
are supposed to determine how well the networks run.** Condition already does
that. Crew barely do — the life-support bonus is at most +1.5 percentage points
of closure and is drawn from the best skill *aboard*, whether that person is on
watch, off watch, or asleep. Assignment does not matter, which is the opposite
of the intent.

## User scenarios

### Reading a room

A representative opens the Ship tab. Life Support is drawn as an interior seen
side-on: back wall with structural ribs, conduit tray at the ceiling, grated
floor. Two amine beds stand on a plinth with pipework running into the ceiling.
A hydroponics rack glows under three lamp bars. Sandoval is a figure at the
recycler, at roughly the height a person would be.

The scrubber is struck through in red. Nobody had to read anything to know it.

### Opening a machine

They tap the scrubber. A card opens directly beneath the room — condition,
draw, what it does, what a repair costs — and the machine stays highlighted
above it, so the thing touched and the thing being read are visibly the same
object. Ordering the repair happens here.

Tapping the deck header still expands the full part list, which is what you
want when auditing rather than fixing.

### Following water

They open Flows and pick the Water channel. The tank feeds crew, electrolysis
and hydroponics; grey water gathers into the recycler; a dashed edge carries
97% of it back to the tank. The 2 kg/day the hydroponics locks into plants
visibly leaves the loop — which is why the Life tab says 86.1% closure and not
97%. The footer states both horizons: **566 days of tank now, 38 days with the
recycler offline.**

### Putting a tech on the loop

Sandoval comes on watch at 16:00 and her station is Life Support. The recycler's
closure rises, the return edge thickens, and the daily water loss drops. At
midnight she goes off watch and it falls back. Nothing was ordered; the watch
bill did it.

A representative who wants that permanently moves her watch — or buys a better
recycler, which raises the base the skill multiplies against.

### Reading a person

They open Crew. Okonkwo's card shows a 24-hour strip: eight hours asleep, eight
on watch, eight off, with a marker at the current time. "B watch" stops being a
letter. Below it, five skills as bars and six attributes as a compact grid, then
the current assignment — repairing the CO₂ scrubber, 9.4 of 26 hours done, and
*why she is fast at it*: 71 mechanics turning into 1.05 labour-hours per hour.

## Requirements

### Rooms (replaces SV-1 to SV-6)

- **RF-1** Each room is drawn as an interior elevation: back wall, ceiling
  conduit tray, floor line and grating. Equipment stands on the floor or mounts
  to the wall.
- **RF-2** Every part draws itself from a closed vocabulary declared in the
  content schema, as in spec 003. Adding a part to `parts.json` places it in
  the room with no code change; adding a new *kind* of object remains a
  deliberate two-file change.
- **RF-3** Each part declares a **fitting** — floor-standing, wall-mounted, or
  racked — which decides how it is placed against the room, and a **size** in
  metres so that proportions between objects are stated by data rather than
  chosen per drawing.
- **RF-4** A crew figure is drawn at human scale relative to that metre grid.
  Everything in the room is therefore scaled against a person.
- **RF-5** Crew posture reflects activity: standing at a station on watch,
  seated or standing off watch, lying down when asleep in a bunk. Activity is
  legible from posture before colour is considered.
- **RF-6** A part's drawn state reflects its simulated state — online, off,
  shed, broken — and broken remains unmistakable with colour disabled.
- **RF-7** The ship scrolls vertically. Decks are sized to make their contents
  legible, not to fit the vessel on one screen.

### Stations are targets

- **RF-8** Every part, every crew figure, and each fixture group is an
  individually activatable target, reachable by pointer and by keyboard, and
  labelled for a screen reader.
- **RF-9** Activating a part opens its detail card in place, beneath the room,
  with the part held visibly highlighted while the card is open.
- **RF-10** The card carries everything the current part row carries — name,
  net draw, condition with plain-language label, blurb, priority, switchability
  — plus its actions, and a link into the flow view for that part.
- **RF-11** Activating a crew figure opens that person, and offers a route to
  their full record in the Crew tab.
- **RF-12** The deck header still expands the full part list. The card is a
  shortcut, not a replacement.

### Flows (replaces SV-12 to SV-16; the overlay is removed)

- **RF-13** Flows is its own view, not an overlay. The margin overlay and its
  styles are deleted.
- **RF-14** It carries **one channel per Life gauge, plus power**: power, heat,
  CO₂, O₂, water, food, propellant, spares. Every gauge on the Life tab maps to
  exactly one channel, and every channel maps back.
- **RF-15** Every channel uses one grammar: sources at the top, consumers
  ranked by magnitude, buffers to one side, returns as a distinct edge, and a
  net footer giving the horizon in days. Learning one channel teaches the rest.
- **RF-16** Nodes are **parts and crew**, not decks. Link width is proportional
  to magnitude and comes from the same selectors the rest of the UI reads
  (spec 003 SV-14 continues to apply).
- **RF-17** Closed loops are drawn as loops. The water recycler's return edge is
  the acceptance case: it must be visible as a return, and removing the recycler
  must visibly remove it.
- **RF-18** A footer states the counterfactual where one exists — what the
  horizon becomes if the recycler, scrubber or radiators stop.
- **RF-19** Propellant's footer is a budget against a planned manoeuvre rather
  than a daily rate, because a tank that only empties during a burn has no
  meaningful kg/day.
- **RF-20** Nodes link back to the machine on the ship, and part cards link
  forward into the channel.

### Crew

- **RF-21** Each crew member shows a **24-hour watch strip** — asleep, on watch,
  off watch — with a marker at the current time. The strip, not a letter, is the
  primary explanation of what a watch is. The letter and the hours are both
  written out.
- **RF-22** All five skills are shown, 0–100, as bars, labelled as growing with
  use.
- **RF-23** All six attributes are shown, 1–10, in a compact grid, visually
  distinct from skills and labelled as slow to change.
- **RF-24** The current assignment is stated with its arithmetic: what job, how
  far through, how long left, and which skill is producing that rate.
- **RF-25** One crew member is expanded at a time; the rest are single rows
  giving name, watch, location and activity.
- **RF-26** `CrewView` publishes the full stat block. This is a selector change
  only — the simulation already holds all of it.

### Crew and equipment drive the networks

- **RF-27** A crew member contributes to a system's efficiency only when they
  are **on watch and stationed in the room that system is in** — either by
  their declared station or by an active work order. Being aboard and asleep
  contributes nothing.
- **RF-28** The contribution scales with the relevant skill *and* with that
  person's current effectiveness, so fatigue, cabin CO₂ and cabin temperature
  feed back into it. A tired tech in a hot room is worth less than a rested one.
- **RF-29** The contribution is large enough to notice and to plan around. The
  existing +1.5 percentage-point ceiling is not.
- **RF-30** Equipment quality sets the **base** the crew term improves against.
  Recyclers and scrubbers gain tiers in `parts.json` with rising base
  efficiency, mass and cost, and diminishing returns.
- **RF-31** Efficiency changes only at moments the simulation already
  re-resolves — watch changes, work-order events, part state changes. No new
  event kind, and no periodic recomputation, or offline catch-up stops being
  bit-identical (constitution VI).
- **RF-32** The sim and the UI derive a crew member's room from **one shared
  function**. Spec 003 put that logic in the selector layer; it moves to
  `crew.ts` so there is one definition, not two that can drift.

### Boundaries

- **RF-33** Rendering stays in `apps/web`. `packages/sim` gains selectors and
  the efficiency rule; no browser types (constitution IX).
- **RF-34** Every balance number, including the new crew coefficients and the
  upgrade tiers, lives in `packages/data` (constitution VIII).

## Acceptance criteria

1. Every part and fixture is drawn; a part added to `parts.json` appears in its
   room, at a size and fitting taken from its data, with no TypeScript edit.
2. A crew figure and a scrubber drawn in the same room have the height ratio
   their declared metre sizes imply.
3. Each part, crew figure and fixture group is reachable by keyboard and
   announces itself; activating a part opens its card and highlights it.
4. Ordering a repair from a part card produces the same command as ordering it
   from the deck list.
5. Every Life gauge has exactly one flow channel and vice versa, asserted
   against the content pack rather than a hardcoded list.
6. In the water channel, the recycler's return edge is present; disabling the
   recycler removes it and the stated horizon shortens accordingly.
7. Flow link widths are ordered the same as the magnitudes the corresponding
   selectors report.
8. A crew card shows five skill bars, six attributes, and a watch strip whose
   lit segment matches that member's activity at the current time.
9. Putting a skilled life-support tech on watch in Life Support measurably
   raises loop closure; moving them off watch lowers it again; and the same
   world advanced in one jump versus a thousand steps still ends bit-identical
   (`catchup.test.ts` continues to pass).
10. A tech whose effectiveness is degraded by fatigue or bad air contributes
    less than the same tech when rested.
11. `packages/sim` still has no browser dependency.

## Decided

- **Elevation over dimetric.** Projection eats horizontal space: the same four
  machines no longer fit across a 358 px phone, and every part becomes three
  faces with overlap ordering to resolve. It looks more like a game and costs
  the viewport, which on a portrait mobile game is the wrong trade.
- **The overlay is deleted, not fixed.** Nothing is lost: per-deck magnitude is
  already printed in every deck header, which is the only thing the overlay
  communicated successfully.
- **Crew contribution requires presence.** The alternative — best skill aboard —
  makes the watch bill decorative and rewards hoarding specialists who never
  work. Requiring station and watch makes §4.3's schedule the mechanism it was
  always described as.
- **Upgrades raise the base, crew raise the multiplier.** Keeping them on
  separate terms means neither obsoletes the other: a superb tech cannot
  substitute for a worn-out recycler, and a new recycler still runs better with
  someone tending it.

## Attendance: two terms, not one

Both open questions resolve together, and the resolution is that **presence
should mostly buy condition, not output**. "A ship needs skilled crew to keep
its systems in good operational status" is a statement about *status over
time*, which is wear — not about instantaneous efficiency. Splitting it that
way makes the mechanic legible and stops it being punishing.

### The rated figure is the unattended figure

- **RF-35** A part's values in `parts.json` are what it delivers **with nobody
  attending it**. That is what "rated" means. An unattended ship runs to spec
  indefinitely; it does not decay toward some worse steady state.

This is the floor, and it is structural rather than a timer — no bonus lingers
after someone leaves station, because there is no deficit to paper over. §7.4
holds by construction: absence can never kill, never spiral, and never make the
ship worse than the hardware you bought.

### Presence is a small, immediate efficiency bonus

- **RF-36** A crew member on watch and stationed in a system's room adds up to
  **+3 percentage points** of loop closure, or **+6%** of rated output, at skill
  100 and effectiveness 1.0. It scales linearly with `skill / 100` and with
  `crewEffectiveness`, and it is never negative.

Enough to see in the flow diagram when a watch turns over. Not enough that an
unattended run is in trouble.

### Presence is a larger, cumulative wear effect

- **RF-37** Wear on the parts in a room is multiplied by an attendance factor:
  **0.55×** with a skill-100 hand on station at full effectiveness, rising to
  **1.0×** at skill 0, and **1.15×** when nobody is stationed there at all.

This is where attention actually pays, and it pays the way the fiction says it
should — a tended plant stays in good order and an ignored one drifts toward its
next service. The unattended penalty is deliberately mild: 15% faster wear is
weeks of drift, visible in the condition bar long before it becomes a failure,
and always recoverable with a work order. It is a reason to staff a watch, never
a punishment for closing the app.

With three watches and four crew, most rooms are unattended most of the time.
That is the intended shape: the watch bill becomes a real allocation decision
about *which* systems get looked after, rather than a formality.

- **RF-38** Every coefficient above lives in `packages/data` (constitution
  VIII), including the unattended multiplier, so balance is a JSON edit.
- **RF-39** The existing ship-wide `mechanicBonuses` and `lifeSupportBonus` —
  which read the best skill aboard regardless of watch, station or
  consciousness — are replaced by the per-room rule. Nothing may still reward a
  specialist who never works.

### Acceptance additions

12. An unattended ship holds its rated closure and output indefinitely; the
    only difference from a tended one is the rate of wear.
13. Moving a skilled life-support tech onto the Life Support watch raises
    closure and lowers that room's wear rate; moving them off restores both.
14. A room with nobody stationed in it wears faster than the same room with an
    unskilled hand in it, and both are within 15% of the rated rate.
15. A fatigued tech in a hot cabin contributes measurably less than the same
    tech rested, on both terms.
