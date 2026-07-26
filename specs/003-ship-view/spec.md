# Feature Specification: The Ship You Can See

**Status:** direction approved (Schematic + Flow overlay), ready to implement
**Milestone:** interleaved with M2 — this is presentation, not new simulation
**Depends on:** M1 (rooms, parts, crew, wear, work orders)

## Why

The ship is currently a list of collapsible rows. Everything the simulation
knows is *reachable* — tap a deck, read the parts — but nothing is *visible*.
A player cannot glance at the ship and see that the reactor deck is hot, that
three of the four crew are asleep, or that the hydroponics rack is the only
green thing aboard.

Design §1 pillar 1 says the player must be able to trace any number back to the
thing that produced it. A list satisfies that literally and fails it in
practice: tracing requires seven taps. §3.1 promised a vertical cross-section
with stations and crew visible on it. This delivers that promise.

The direction was chosen from three mocked-up options. **Schematic** —
blueprint line-art, generated entirely from content data — is the base view.
**Flow** — animated power, heat and water along the ship's spine — becomes a
toggleable overlay on top of it rather than a competing view. The third option,
illustrated **Cutaway**, was rejected: it reads best of the three but requires
hand-drawn art per part, which contradicts constitution VIII (every gameplay
number, and here every gameplay *object*, comes from data) and would make each
new component an art commission.

Scrolling a tall ship is accepted, and wanted: inspecting the vessel deck by
deck is part of the appeal.

## User scenarios

### Reading the ship at a glance

A representative opens the Ship tab. The Ariadne is drawn as a continuous hull
— nose cone, seven decks of differing heights, engine bell — and each deck's
interior is drawn as what it contains. Quarters has six bunks, four of which
are dark and two of which have a sleeping crew member in them. Life Support
has three scrubber columns and a lit hydroponics tray. The reactor deck has a
core and its shadow shield.

Nothing is read. The representative can see that two people are asleep, one is
on the bridge, and one is in Machinery with a work order.

```
        ╱‾‾‾‾‾‾‾‾‾‾‾╲
   0  ╱ ▭  ▭    (B)  ╲        BRIDGE      −1.9 kW
     ├─────────────────┤
   1 │ ▬▬ ▬▬ ▬▬   ═══  │      QUARTERS    −2.6 kW
     │ ▬▬ ▬▬(s)▬▬(s)   │
     ├─────────────────┤
   2 │ ▮▮▮   ░░░░░░    │      LIFE SUPPORT −9.9 kW
     │ ▮▮▮   ░░░░░░    │
     ├─────────────────┤
   3 │ ┌──┐┌──┐┌──┐    │      CARGO         —
     │ └──┘└──┘└──┘    │
     ├─────────────────┤
   4 │ ▤▤  ⊙⊙   (M)    │  ⚠   MACHINERY   −1.6 kW
     ├─────────────────┤
   5 │   ◉════════     │      REACTOR     +25.5 kW
     ├─────────────────┤
   6 │      ╳╳         │      ENGINES       —
      ╲───────────────╱
        ╲___╱‾╲___╱
```

### Following a deficit

Power reads negative in the status bar. The representative taps the flow
toggle. Lines appear along the ship's spine: a thick one leaving the reactor,
thinner ones branching into each deck that draws. The branch into Life Support
is the widest. The battery link is drawn draining rather than charging.

They have traced a deficit to its consumers without reading a single number,
and the numbers are still there when they want them.

### Finding a person

A crew member is due to finish a repair. The representative looks for them:
they are the marker in Machinery, lit rather than dim because they are on
watch. Tapping the marker opens that person — the same crew detail the Crew tab
shows — without leaving the ship view.

### Watching a deck go wrong

The CO2 scrubber fails. Its column in the Life Support deck is drawn broken:
struck through and tinted red. The deck itself carries the existing warning
dot. The representative taps the deck, the part list expands beneath it as it
does today, and they order a repair.

Nothing about the existing interaction changes. The graphics are added above
the list, not instead of it.

## Requirements

### The schematic (base view)

- **SV-1** Each room is drawn as a deck box in a continuous hull, ordered by
  `deck`, nose at the top.
- **SV-2** Deck heights differ, and the difference comes from content data, not
  from code. The cargo hold is visibly a hold; the bridge is visibly a cockpit.
- **SV-3** Every installed part draws itself inside its room from a **fixed
  glyph vocabulary** declared in the content schema. Adding a part to
  `parts.json` places it in the schematic with no code change. Adding a *new
  kind* of glyph is a deliberate two-file change (schema plus renderer), which
  is the intended friction.
- **SV-4** Rooms may also declare **fixtures** — bunks, a table, cargo bays,
  acceleration couches — which are furniture the simulation does not model but
  the player expects to see. Fixtures come from data on the same footing as
  parts.
- **SV-5** A part's drawn state reflects its simulated state: online, off,
  shed on brownout, or broken. Broken is unmistakable without colour alone.
- **SV-6** The ship scrolls vertically. A tall ship is fine; legibility of each
  deck takes priority over fitting the whole vessel on one screen.

### Crew on the ship

- **SV-7** Every crew member appears as a marker inside exactly one room.
- **SV-8** Their room is **derived, never stored** (constitution V): asleep or
  off watch places them in Quarters; on watch with a work order places them in
  the room of the part they are working on; on watch otherwise places them at
  their station, which is declared per crew member in data.
- **SV-9** A marker's appearance distinguishes on watch, off watch, and asleep.
- **SV-10** Tapping a marker opens that crew member's detail. Their name is
  reachable by keyboard and announced to a screen reader.
- **SV-11** No new field is added to `SimState`, so no save migration is
  required and the change cannot affect determinism.

### The flow overlay

- **SV-12** A single control toggles the overlay. It is off by default; the
  base view must be complete on its own.
- **SV-13** The overlay draws three channels — power, heat, water — as links
  between the rooms that produce and the rooms that consume.
- **SV-14** Link thickness is proportional to actual magnitude, taken from the
  same selectors that feed the status bar. A link the player can see is a
  number they could also read; the two must never disagree.
- **SV-15** Direction is shown by animation. Under `prefers-reduced-motion` the
  animation stops and direction is shown statically instead — the overlay stays
  usable, it does not disappear.
- **SV-16** With the overlay on, the schematic stays legible beneath it. This is
  an overlay, not a second view.

### Boundaries

- **SV-17** All of this lives in `apps/web`. `packages/sim` gains selectors
  only — no rendering, no browser types (constitution IX).
- **SV-18** No gameplay behaviour changes. Every number shown is one the
  simulation already computed.

## Acceptance criteria

1. Every part in `parts.json` and every fixture in `rooms.json` is drawn, and a
   part added to the JSON appears in the schematic with no TypeScript edit.
2. Deck heights in the rendered hull follow the data, and the hull outline is
   continuous from nose to engine bell at any deck configuration.
3. Each of the four starting crew is drawn in exactly one room, and the room
   each is drawn in matches their activity and work order at that instant.
4. Advancing the clock so a watch turns over moves the markers, with no
   command dispatched and no state written.
5. Breaking a part changes its drawn state, and the change is visible with
   colour rendering disabled.
6. Toggling the overlay reveals links whose relative widths match the per-room
   power figures the deck headers already show.
7. With `prefers-reduced-motion: reduce`, no flow animates and direction is
   still discernible.
8. Deck expansion, part switches and work-order buttons behave exactly as they
   did before.
9. `packages/sim` still has no browser dependency, and the sim test suite is
   unchanged in behaviour.

## Decided

- **Schematic over cutaway.** Data-driven art beats better-looking art that
  cannot be generated. Colour-as-meaning is borrowed from the cutaway mockup —
  warm where people rest, green where things grow, red where something is
  wrong — because a palette is a decision, not an art pipeline.
- **Overlay over separate view.** Flow answers "why is this number moving",
  which is a question asked *about* the ship, not instead of it.
- **Crew location derived.** Storing a room per crew member would be a fifth
  way to get the same fact wrong, and would need a migration for a value that
  is a pure function of activity and work order.
- **Glyph vocabulary is closed.** An open string field would let content
  silently request art that does not exist. A zod enum fails loudly at load,
  which is how every other content mistake in this project already behaves.
