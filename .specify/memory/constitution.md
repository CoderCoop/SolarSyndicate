# Solar Syndicate — Constitution

The binding constraints. Every specification, plan and change must hold to
these, and a spec that violates one is wrong even if it is otherwise good.

This document is **normative**. [`docs/design.md`](../../docs/design.md) is the
reasoning behind these rules — the arguments, the numbers, the worldbuilding —
and remains the place to understand *why*. Where the two appear to disagree,
this file governs and `docs/design.md` needs correcting. Each principle cites
the section it was extracted from.

---

## I. The pillar hierarchy (design §1)

When two good ideas conflict, the higher pillar wins. This is the tie-breaker
for every design argument; it exists so disagreements resolve without a meeting.

1. **The ship is the protagonist.** Everything the player touches routes
   through the cross-section view, and systems stay legible — a player must be
   able to trace *why* a margin is thin. A number that cannot be traced to its
   parts is a bug.
2. **Plausible physics, honest numbers.** Real-world values, uprated 25–50% for
   near-future tech. We simplify (2D coplanar orbits, rated radiator capacity)
   but we do not fake: no free thrust, no magic fuel, no instant comms.
3. **Time flows whether you watch or not.** Anchored to real UTC, never paused.
4. **You work for someone.** The guild gates contracts, parts, crew and ports,
   and its policies constrain the player before they can be rewritten.
5. **You manage, you don't pilot.** The player's instruments are hiring,
   assignment, policy, money and orders sent across a light-delay.

## II. The player is an institution, not a person (design §1, §4.6)

There is no avatar and no name. The player is a guild, experienced from an
operations desk. Crew are individuals with names, ages and graves; the player
is not. No feature may give the player a body, a location aboard ship, or a
direct control surface.

## III. Fair play is non-negotiable (design §7.4)

Because the world runs unattended, permanent loss must always be foreshadowed
and attributable.

- **No permanent consequence without a decision the player could have made.**
  Acute emergencies open a decision window; unanswered, they resolve on
  standing orders and the ship's interlocks toward a costly but survivable
  safe state.
- **Chronic outcomes telegraph in game-years**, never as an offline surprise.
- **The ship protects itself.** Automatic responses (load shedding, thermal
  trip) may cost money, time, morale and the mission — they may never switch
  off a system the crew depend on.
- **Bounded decay.** Everything that worsens unattended has a floor.
- **Return is a story**, not a wall of red numbers.

## IV. The simulation is pure and deterministic (design §7.2, §8.2)

- All randomness comes from the seeded PRNG keyed by `(seed, stream, counter)`.
  One stream per entity per purpose, so adding a draw in one system cannot
  perturb another's sequence.
- The sim never reads the clock. Wall-clock time is always a parameter.
- Enforced by lint, not convention: `Math.random`, `Date.now` and `new Date`
  are errors inside `packages/sim`.
- Same seed and same wall-clock window must produce an identical world.

## V. Levels are derived, never accumulated (design §8.2)

Continuous quantities are reservoirs — `(value, rate, since)` — and anchors
move **only** where a rate changes, never on a read. Advancing a month in one
jump must remain bit-identical to advancing it in a thousand steps. A
`settle()` on a read-only path silently breaks this; the catch-up tests exist
to catch it.

## VI. Catch-up is not a special case (design §7.2)

Reopening after a week runs the same loop as a second of live play. There must
never be a separate "offline progress" path that can drift out of step with the
real one.

## VII. Every mutation is a serializable command (design §8.4)

The UI never writes simulation state. Player intent is a plain `Command`
object, which is what makes saves a snapshot plus a command log today and keeps
a server-authoritative simulation possible later.

## VIII. Gameplay numbers live in data (design §9)

Every part, hull, room, crew member, commodity and event is a JSON record
validated by zod in `packages/data`. No balance value may appear in TypeScript.

## IX. The sim has no browser dependencies (design §8.1, §8.4)

`packages/sim` must run unchanged in a browser, in Node, or on a server. This
boundary is the insurance policy for cloud save and the shared-universe
roadmap, and it is cheap to keep only if never crossed.

## X. Scope discipline (design §12.1)

Scope is the project's dominant risk. M0–M3 constitutes a complete, shippable
game; everything beyond is the long tail. Cut lines are agreed in advance
rather than fought over under deadline, and systems are designed as
**continuous scales rather than unlocked tiers**, because a scale can be
truncated where a tier can only be absent.

---

## Amendment

Changing a principle means changing this file and the `docs/design.md` section
it cites, in the same change. Discovering that code contradicts a principle is
a finding to raise, not a licence to quietly relax the principle.

**Version 1.0.0** · adopted at the close of M1
