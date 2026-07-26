# Feature Specification: Travel and Contracts (M2)

**Status:** approach approved; two open questions remain before implementation
**Milestone:** M2, "Going somewhere" (design §10.2)
**Depends on:** M1 (resource networks, crew, wear)

## Why

M1 produced a ship worth tending but with nowhere to go. Every consumable is
topped up by station services, so the clocks that make life support *matter*
never start. The propellant tank has no consumers. Money does not exist, so
maintenance has no cost and no decision behind it.

M2 casts off. It turns the ship from a system you keep alive into a system you
keep alive **in service of something**, and it starts the two clocks that make
the rest of the game work: consumables, and a deadline.

## User scenarios

### Taking a contract

A representative reviews the contract board at their home port, sees a cargo
run with a payment and a deadline, and accepts it. The ship loads cargo, which
adds mass.

The astrogator works the trajectories and comes back with what they mean, not
with orbital mechanics:

```
  ASTROGATION — Luna → Ceres          Sandoval recommends option 2

  ┌ 1  DIRECT ────────────────────────────────── arrives D 47 ┐
  │    Δv 8.4 km/s · 11.2 t propellant · 39 days               │
  │    Beats the deadline by 6 days.                           │
  │    ⚠ Leaves 1.1 t reserve — one abort, no second.          │
  └────────────────────────────────────────────────────────────┘
  ┌ 2  WAIT FOR THE WINDOW ───────────────────── arrives D 51 ┐
  │    Δv 5.1 km/s · 6.8 t propellant · 33 days + 12 idle      │
  │    Makes the deadline with 2 days to spare.                │
  │    Twelve days alongside: stores replenish, scrubber       │
  │    service completes.                                      │
  └────────────────────────────────────────────────────────────┘
  ┌ 3  SLOW TRANSFER ─────────────────────────── arrives D 58 ┐
  │    Δv 4.2 km/s · 5.6 t propellant · 50 days                │
  │    ✗ Seven days late. Contract pays 40%.                   │
  │    Consumables cover it with 9 days margin.                │
  └────────────────────────────────────────────────────────────┘
```

Nobody is asked to read a porkchop plot. The representative is asked whether a
six-day cushion is worth their propellant reserve — a question a desk is
qualified to answer and a pilot's skill cannot settle for them. They authorise
one, the ship burns, and it is under way.

### Discovering the margin is thin

Mid-transfer, the CO2 scrubber fails. The ship is no longer alongside, so
nothing replenishes: the crew are on the stores in the tanks. The dispatch
names the problem and the horizon — how many days of consumables remain versus
how many days to arrival. The representative orders a repair, and the outcome
turns on whether the spares aboard and the hands on watch are enough.

### Arriving, or not

On arrival the cargo is delivered, the contract pays if it was on time, and the
ship is alongside again — stores replenish, and the next board is available.
A late delivery pays less or not at all. A ship that arrives with a wrecked
scrubber and an exhausted crew has still arrived.

## Requirements

### Travel

- **TR-1** The solar system is a 2D map of real bodies on real orbital radii
  and periods. Bodies move; the distance between two ports depends on when you
  ask.
- **TR-2** A transfer between two ports has an honest delta-v cost derived from
  the rocket equation against the ship's current mass, including cargo.
- **TR-3** The astrogator computes the trajectories; the representative chooses
  between **outcomes**, not between orbital mechanics. Each option is stated in
  the terms a desk reasons in — what it costs, when it arrives, what margin it
  leaves, what it risks — with the underlying delta-v shown as supporting
  detail rather than as the decision.
- **TR-3a** Astrogation skill gates which options are *surfaced* (design §5.2).
  A green astrogator finds the obvious fast option and the obvious cheap one; a
  good one notices that waiting twelve days for a window beats both. The
  representative is never told what was missed — you do not know what a
  mediocre employee failed to think of.
- **TR-3b** The astrogator's recommendation is highlighted; alternatives remain
  selectable. Every surfaced option must be the right answer under *some*
  circumstance — a set that differs only in propellant is a fake choice and
  fails this requirement.
- **TR-4** Ship position between events is a closed-form function of time. No
  numerical integration; catch-up must stay analytic (constitution V, VI).
- **TR-5** Departure and arrival burns consume propellant and produce
  acceleration the crew experience; sustained thrust is not required for M2.
- **TR-6** The ship cannot depart without the propellant for the chosen
  transfer, nor with consumables that do not cover the duration plus a margin
  — unless the representative explicitly overrides, which must state the
  consequence in terms of named crew (constitution III).

### Consumables in flight

- **TR-7** `docked` becomes false in transit. Station replenishment stops, and
  oxygen, water, food and spares deplete against the stores actually aboard.
- **TR-8** Every consumable displays a horizon in days alongside its level, and
  the horizon is compared against time-to-arrival wherever both are known.

### Contracts and money

- **TR-9** A contract states cargo mass, origin, destination, payment, and a
  deadline, and is generated from world state rather than at random.
- **TR-10** Accepting a contract loads cargo, which changes ship mass and
  therefore delta-v (TR-2). Cargo occupies hold capacity.
- **TR-11** Delivery pays on arrival; late delivery pays a reduced amount or
  nothing, stated on the contract before acceptance.
- **TR-12** Money is a guild budget, not a wallet (design §6.2). Wages,
  propellant, spares and port fees draw against it and are itemised.
- **TR-13** Spares and consumables are purchased at port rather than
  replenished free, replacing M1's station-services placeholder.

### Preserved from M1

- **TR-14** Wear, failure, work orders and the watch bill continue to operate
  unchanged in transit.
- **TR-15** Load shedding and the thermal trip continue to protect the ship
  unattended, and still cannot disable a life-critical system.

## Acceptance criteria

1. A world can be created, a contract accepted, a transfer authorised, and the
   destination reached, entirely through `Command` objects.
2. Advancing across a full transfer in one jump is bit-identical to advancing
   it in a thousand steps (constitution V).
3. Departing with insufficient propellant is refused; departing with
   insufficient consumables is refused unless explicitly overridden.
4. A part failing in transit degrades the same networks it does alongside, and
   the resulting dispatch states the consumable horizon against time to
   arrival.
5. Delivering on time credits the stated payment; delivering late credits the
   stated reduced amount.
6. A month-long transfer with the app closed produces a readable return digest
   and leaves the ship in a state the player could have prevented.
7. Balance sanity: a fully loaded ship on the starter hull can complete the
   opening contract with margin, and cannot complete it with the engines
   over-drawing power the whole way.
8. For every surfaced set of transfer options there exists, for each option, a
   ship state under which that option is the best available choice (TR-3b).
9. Two astrogators of materially different skill, given the same departure,
   surface different option sets (TR-3a).

## Out of scope

Guilds and standing, hiring at destination ports, crew ageing and mortality,
salvage, passengers, the part market, light-lag. These are M3 and M4.
Continuous low-thrust trajectories are M4 with the NEP tier; M2 uses
high-thrust conic transfers only.

## Decided

**Choosing between commitments, not trajectories.** Resolved in favour of the
astrogator computing and the representative choosing (TR-3, TR-3a, TR-3b).

The tension was that comparing transfer solutions makes the player the
astrogator — the crew job constitution I.5 says they do not do — while pure
approval of a single recommendation reduces travel to a button. The resolution
is that the player was never the right person to answer "which trajectory";
they *are* the right person to answer "what am I willing to spend, and what am
I willing to risk". Those are the same underlying choice, expressed in terms a
manager is qualified to weigh.

It also pre-builds M3: once light-lag exists, a ship hours away cannot wait for
approval, and "the astrogator has a recommendation, and standing orders say
whether to act on it unapproved" becomes a policy toggle rather than a new
system.

## Open questions

1. **How many ports at M2?** Enough to make windows matter without building
   the whole system. Proposal: Earth orbit, Luna, Mars/Phobos, Ceres.
2. **What replaces station services for pacing?** Once replenishment costs
   money, the opening budget has to be sized so a new player cannot strand
   themselves in their first hour. Needs playtesting, not a decision now.
