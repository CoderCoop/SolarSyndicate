/**
 * What every crew number means, and what it actually moves. Design doc §4.1,
 * §4.2, §4.4.
 *
 * A roster full of bars is a character sheet, not an explanation: "Monitoring
 * 78" tells a player nothing about whether hiring for it would have kept their
 * recycler in tune. Each entry therefore has two halves — **what it is**, taken
 * from the real taxonomy the stat came from, and **what it affects**, naming
 * the mechanic in the words the rest of the UI uses.
 *
 * The definitions are not invented. Knowledge domains and skills are O*NET
 * (US Department of Labor) categories; qualifications are ISS system names
 * under an STCW-shaped endorsement model. Where a definition is quoted, it is
 * quoted, because "watching gauges, dials, or other indicators to make sure a
 * machine is working properly" is the tune mechanic described by an
 * occupational taxonomist decades before this ship existed.
 */

export interface Explanation {
  /** The heading the player tapped. */
  label: string
  /** What the thing is. */
  what: string
  /** What it changes in this game, concretely. */
  affects: string
  /** Where the definition comes from, when it comes from somewhere real. */
  source?: string
}

export const SKILL_HELP: Record<string, Explanation> = {
  operationMonitoring: {
    label: 'Monitoring',
    what: '“Watching gauges, dials, or other indicators to make sure a machine is working properly.”',
    affects:
      'The single biggest driver of tune. A watchstander with high monitoring notices gunk, drift and out-of-spec fittings before they cost anything, and can push a system past its original specification. Leave a deck unattended and tune decays instead.',
    source: 'O*NET, Technical Skills cluster',
  },
  equipmentMaintenance: {
    label: 'Maintenance',
    what: 'Performing routine servicing, and determining when and what kind of servicing is needed.',
    affects:
      'How fast a service work order completes, and how much condition it recovers. Also slows the rate at which a tended part wears.',
    source: 'O*NET, Technical Skills cluster',
  },
  troubleshooting: {
    label: 'Diagnosis',
    what: 'Determining the causes of an operating error and deciding what to do about it.',
    affects:
      'How quickly a failed part is correctly identified, which is the delay before a repair can even start.',
    source: 'O*NET, Technical Skills cluster',
  },
  repairing: {
    label: 'Repair',
    what: 'Repairing machines or systems using the tools to hand.',
    affects:
      'Repair work-order speed, and how much of a broken part’s condition comes back. A poor repair gets the part running again at a condition that will fail sooner.',
    source: 'O*NET, Technical Skills cluster',
  },
  qualityControl: {
    label: 'Inspection',
    what: 'Conducting tests and inspections of products, services or processes to evaluate quality.',
    affects:
      'How accurately condition is reported, and whether a marginal part is caught before it fails rather than after.',
    source: 'O*NET, Technical Skills cluster',
  },
  judgment: {
    label: 'Judgement',
    what: 'Considering the relative costs and benefits of potential actions to choose the most appropriate one.',
    affects:
      'What the crew do when nobody is asking. Matters more the further from the desk the ship gets — under light-lag your orders are minutes old and somebody aboard has to decide.',
    source: 'O*NET, Systems Skills cluster',
  },
}

export const KNOWLEDGE_HELP: Record<string, Explanation> = {
  mechanical: {
    label: 'Mechanical',
    what: 'Machines and tools, including their designs, uses, repair and maintenance.',
    affects:
      'Weighted into how well a room is tended. Machinery, Engines and the Reactor lean on it hardest.',
    source: 'O*NET Knowledge domain',
  },
  electronics: {
    label: 'Electronics',
    what: 'Circuit boards, processors, electronic equipment and the software that runs on it.',
    affects: 'Tending the Bridge and the electrical side of Machinery.',
    source: 'O*NET: Computers and Electronics',
  },
  physics: {
    label: 'Physics',
    what: 'Physical principles, laws and their interrelationships.',
    affects:
      'Reactor and propulsion work. The Reactor deck is weighted part mechanical, part physics — which is why one invented “nuclear engineering” skill was never needed.',
    source: 'O*NET Knowledge domain',
  },
  chemistry: {
    label: 'Chemistry',
    what: 'The composition, structure and properties of substances and the processes they undergo.',
    affects:
      'Amine beds, electrolysis and propellant handling — most of what Life Support actually is.',
    source: 'O*NET Knowledge domain',
  },
  biology: {
    label: 'Biology',
    what: 'Plant and animal organisms, their tissues, cells, functions and interdependencies.',
    affects:
      'Hydroponics and closed-loop ecology. The difference between someone who waters trays and someone who spots a fungus in the root system.',
    source: 'O*NET Knowledge domain',
  },
  medicine: {
    label: 'Medicine',
    what: 'The information and techniques needed to diagnose and treat injuries and disease.',
    affects:
      'Crew health, and the human half of life support — cabin CO₂ and air quality are a physiology problem before they are a machinery problem.',
    source: 'O*NET: Medicine and Dentistry',
  },
}

export const QUAL_HELP: Record<string, Explanation> = {
  eclss: {
    label: 'ECLSS',
    what: 'Environmental Control and Life Support System. The endorsement to stand a watch on the air and water loops.',
    affects:
      'Without it a crew member tends Life Support at roughly half effectiveness, however knowledgeable they are. Qualifications are binary and most people have none.',
    source: 'ISS system name, STCW-style endorsement',
  },
  eps: {
    label: 'EPS',
    what: 'Electrical Power System. Certification on generation, distribution and load shedding.',
    affects: 'Effectiveness on the Reactor and Machinery decks.',
    source: 'ISS system name',
  },
  tcs: {
    label: 'TCS',
    what: 'Thermal Control System. Certification on the radiator loops.',
    affects: 'Effectiveness on thermal work, where a mistake cooks the cabin rather than dimming it.',
    source: 'ISS system name',
  },
  prop: {
    label: 'PROP',
    what: 'Propulsion. Certification on the engine cluster and propellant handling.',
    affects: 'Effectiveness on the Engines deck.',
    source: 'ISS system name',
  },
  gnc: {
    label: 'GNC',
    what: 'Guidance, Navigation and Control. Certification to work the boards.',
    affects: 'Effectiveness on the Bridge.',
    source: 'ISS system name',
  },
  eva: {
    label: 'EVA',
    what: 'Extravehicular Activity. Certification to work outside the hull.',
    affects: 'External repairs, and salvage work when M4 brings it.',
    source: 'ISS qualification',
  },
  cmo: {
    label: 'CMO',
    what: 'Crew Medical Officer — a real assigned ISS role rather than a profession.',
    affects: 'Treating injury and illness aboard. One person carries it in addition to their trade.',
    source: 'ISS assigned role',
  },
}

export const STAT_HELP: Record<string, Explanation> = {
  strength: {
    label: 'Strength',
    what: 'Physical force available for heavy work.',
    affects: 'Handling mass during repairs and cargo work.',
  },
  dexterity: {
    label: 'Dexterity',
    what: 'Fine motor control and steadiness of hand.',
    affects: 'Delicate repair work, and anything done in gloves.',
  },
  endurance: {
    label: 'Endurance',
    what: 'Capacity to keep working before fatigue tells.',
    affects:
      'How fast fatigue accumulates across a watch, and therefore how much of their effectiveness a person still has at the end of one.',
  },
  intellect: {
    label: 'Intellect',
    what: 'Reasoning and the ability to hold a complicated system in mind.',
    affects: 'Diagnosis, and how quickly a person improves at what they do.',
  },
  perception: {
    label: 'Perception',
    what: 'Noticing what has changed.',
    affects: 'Feeds monitoring — the difference between reading a gauge and seeing it drift.',
  },
  resolve: {
    label: 'Resolve',
    what: 'Steadiness under pressure and over long, dull stretches.',
    affects: 'Behaviour in emergencies, and morale on a long crossing.',
  },
}

/** Everything, by the key the roster renders. */
export const CREW_HELP: Record<string, Explanation> = {
  ...SKILL_HELP,
  ...KNOWLEDGE_HELP,
  ...QUAL_HELP,
  ...STAT_HELP,
}

/** The watch bill itself — the thing the A/B/C letters mean. */
export const WATCH_HELP: Explanation = {
  label: 'Watches A, B and C',
  what: 'Three eight-hour watches covering the day: A stands 00:00–08:00, B 08:00–16:00, C 16:00–00:00.',
  affects:
    'A crew member only tends the room they are stationed in, and only while on watch. Off watch they rest; asleep they do nothing at all. A deck with nobody on watch loses tune and wears faster.',
  source: 'STCW watchkeeping',
}
