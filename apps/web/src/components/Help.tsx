/**
 * In-game help. Design doc §1 pillar 1: "systems are legible."
 *
 * A legible system still has to be *introduced*. Everything here is a rule the
 * game already enforces and the UI already shows the consequences of — this is
 * not a manual for hidden mechanics, because there are none. It is the set of
 * sentences a player would otherwise have to infer from watching numbers move,
 * gathered in one place they can reach mid-game rather than only at onboarding.
 *
 * Written as questions, because that is how someone stuck actually thinks.
 */

import { InstallSection } from './InstallOffer.js'

/** Where the project lives. The site explains the *why*; the game is beneath it. */
export const SITE_URL = 'https://codercoop.github.io/SolarSyndicate/'

/**
 * Shown in-game so a bug report can name a build. Injected at build time from
 * package.json rather than typed here, because a version string maintained by
 * hand is a version string that is wrong.
 */
export const VERSION = __APP_VERSION__

interface Topic {
  q: string
  a: string
}

const TOPICS: { section: string; items: Topic[] }[] = [
  {
    section: 'The ship',
    items: [
      {
        q: 'What am I looking at?',
        a: 'A cross-section, nose at the top. Each deck is drawn as the inside of a room, to scale — a crew figure is 1.7 m, so a scrubber is the size a scrubber actually is next to a person. Tap any machine, any person, or any fitting to open it.',
      },
      {
        q: 'What is the difference between condition and tune?',
        a: 'Condition is wear: parts grind down, and a repair or a service brings it back. Tune is attention: gunk, drift, a hose a little out of spec. A skilled watchstander notices those and can push a system past its original specification; leave the deck unattended and tune decays on its own. They are separate, and a part can be in perfect condition and badly out of tune.',
      },
      {
        q: 'Why can I not switch some things off?',
        a: 'Anything life-critical is locked on. A ship that lets you switch off its own CO₂ scrubber is a ship that kills the crew while you are asleep, and the game does not do that.',
      },
      {
        q: 'What happens in a brownout?',
        a: 'If the bank runs out, the ship sheds load by priority on its own authority — lowest first, never the critical bus. It stays shed until you restore it, because getting the power balance right is the actual decision.',
      },
    ],
  },
  {
    section: 'The crew',
    items: [
      {
        q: 'What do A, B and C mean?',
        a: 'Three eight-hour watches covering the day: A stands 00:00–08:00, B 08:00–16:00, C 16:00–00:00. Somebody only tends a deck while they are on watch and stationed there.',
      },
      {
        q: 'How do I know what a skill does?',
        a: 'Tap it. Every bar, pip and endorsement on the Crew tab opens what it is and what it moves. The categories are real ones — knowledge domains and skills come from the O*NET occupational taxonomy, endorsements from ISS system names.',
      },
      {
        q: 'Why is a qualification worth so much?',
        a: 'Knowledge and skill are continuous and everyone has some. A qualification is binary and most people have none: an uncertified watchstander tends a deck at roughly half effectiveness however much they know.',
      },
    ],
  },
  {
    section: 'Flows and life support',
    items: [
      {
        q: 'What is the Flows tab for?',
        a: 'Every gauge on the Life tab, drawn as connections instead of as a level. Sources feed a bus, consumers hang off it ranked by draw, the buffer sits to one side because it is neither, and a dashed edge up the margin is what comes back. Link width is magnitude, so the thickest line is always the biggest draw.',
      },
      {
        q: 'What does “loop closure” mean?',
        a: 'How much of the water the ship spends comes back. The recycler returns most of it; the rest is vented, held as brine, or locked into plants — and that last part is not a loss at all, it is food. That is why closure is lower than the recycler’s own figure.',
      },
    ],
  },
  {
    section: 'Missions and money',
    items: [
      {
        q: 'What is the resupply allowance?',
        a: 'What the Guild has budgeted for the crossing, stated in kilos before you accept. On arrival your actual consumption is measured against it and settled at the arrival port’s prices: under budget is paid back, over is billed. It is the only place efficiency turns into money.',
      },
      {
        q: 'Why is one of the trajectories greyed out?',
        a: 'Because the ship cannot fly it, and the reason is printed with the shortfall in tonnes. An option you cannot take is still information — it tells you what a bigger tank would buy.',
      },
      {
        q: 'Why does a hop between two Earth ports take five days?',
        a: 'Because sharing a parent body does not make two ports neighbours. Gateway is 400 km up; Tranquillity is in lunar orbit, 384,400 km out. A minimum-energy transfer between those two orbits really does take about five days — the route strip prints both distances.',
      },
      {
        q: 'How do I get to Mars?',
        a: 'You buy a bigger ship. The Kestrel carries 32 t of propellant and 91 days of food; a Mars crossing is 259 days and wants 103 t. The yard at Tranquillity sells the Albatross, priced as a difference against trading in your current hull — and she reaches Mars on the slow trajectory only, so the window still costs you something.',
      },
      {
        q: 'Does it matter if I let the ship go?',
        a: 'Yes, and it costs money at the yard. A trade-in is book value scaled by what a surveyor finds — mean condition mostly, tune a little, and a deduction for every failed system that has to be made good before anyone else will fly her. Skipping repairs banks the unspent maintenance budget on the allowance, and loses several times that on the ship itself.',
      },
      {
        q: 'What happens if I miss a deadline, or run out of money?',
        a: 'Late delivery pays less. An overrun is billed. The balance can go negative. None of it strands you: the ship stays berthed, crewed and able to take the next job. Consequences here are financial, never a wall.',
      },
    ],
  },
  {
    section: 'The guild and the hall',
    items: [
      {
        q: 'Who do I work for?',
        a: 'Wrightworks Guild — an engineers\u2019 and salvagers\u2019 union. It gives you the best mechanics in any hall and part discounts; it asks for wage floors and mandatory rest, which are genuinely good for your crew and cost you money. Choosing between the four guilds comes later; for now you hold a Wrightworks card.',
      },
      {
        q: 'Why does standing show for guilds I do not work for?',
        a: 'Because it is tracked with all four. Delivering for the Institute is not neutral to the Combine, and standing moves on outcomes rather than intentions — what you delivered, when, and what you walked away from.',
      },
      {
        q: 'Why can I not hire anyone else?',
        a: 'Either there is no berth free — the Kestrel sleeps six and you carry four — or the desk cannot cover the wage. Crew are paid every day whether the ship is flying or sitting alongside, so a hire is a standing bill, not a purchase.',
      },
      {
        q: 'Why is the wage higher than what they asked for?',
        a: 'The guild wage floor. Wrightworks bargains its people up, so the same candidate costs more under a union card than under The Drift — which has no floor, and no safety net either. Both numbers are on the card so you can see which is which.',
      },
    ],
  },
  {
    section: 'Time',
    items: [
      {
        q: 'How fast does time run?',
        a: '720× real time — one real minute is half a game day, and a watch turns over every 40 real seconds. A flyable crossing takes 7 to 10 real minutes.',
      },
      {
        q: 'What happens while the app is closed?',
        a: 'Exactly the same simulation, fast-forwarded. There is no separate offline calculation and nothing is paused. Come back after an hour and thirty game days have passed, so leave the ship with margin — the return screen tells you what happened while you were gone.',
      },
    ],
  },
]

export function Help() {
  return (
    <>
      <section className="panel" aria-label="Help">
        <h2 className="panel__title">Help</h2>
        <p className="help__lede">
          You are not the captain. You are the desk the captain reports to — the operations
          representative for a guild local, running one ship you never board.
        </p>

        {TOPICS.map((group) => (
          <div key={group.section} className="help__group">
            <h3 className="help__section">{group.section}</h3>
            <dl className="help__list">
              {group.items.map((t) => (
                <div key={t.q} className="help__item">
                  <dt className="help__q">{t.q}</dt>
                  <dd className="help__a">{t.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </section>

      <section className="panel" aria-label="Install">
        <h2 className="panel__title">Install</h2>
        <InstallSection />
      </section>

      <section className="panel" aria-label="About">
        <h2 className="panel__title">About</h2>
        <p className="help__a">
          Solar Syndicate is built in the open. The project site carries the design document —
          the reasoning behind every mechanic here — along with a changelog and the mockups
          each decision was argued from.
        </p>
        <a className="button button--primary help__link" href={SITE_URL} target="_blank" rel="noreferrer">
          Open the project site
        </a>
        <p className="panel__note">
          Opens in a new tab. The game keeps running — it is anchored to the wall clock and
          never pauses.
        </p>
        <p className="help__version">Version {VERSION}</p>
      </section>
    </>
  )
}
