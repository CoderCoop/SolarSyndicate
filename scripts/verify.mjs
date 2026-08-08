/**
 * End-to-end verification of the built game.
 *
 * The unit tests prove the sim; this proves it actually goes through all the
 * layers -- PWA shell, React, the sim, IndexedDB persistence, and back after a
 * reload -- and that the ship keeps running while the app is closed.
 *
 *   node scripts/verify.mjs [--headed] [--shots <dir>]
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync, readdirSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { chromium } from 'playwright'

const ROOT = resolve(import.meta.dirname, '..')
const DIST = join(ROOT, 'apps/web/dist')
const shotsArg = process.argv.indexOf('--shots')
const SHOTS = shotsArg > -1 ? process.argv[shotsArg + 1] : join(ROOT, '.verify-shots')

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

if (!existsSync(DIST)) {
  console.error('No build found. Run: pnpm --filter @solsyn/web build')
  process.exit(1)
}

/**
 * Serve under the exact subpath the game is deployed to. The project site sits
 * at /SolarSyndicate/ and the game one level beneath it; testing at the root
 * while deploying to a subpath is how you ship a build whose assets 404 on the
 * live site.
 */
const MOUNT = '/SolarSyndicate/play/'

const server = createServer(async (req, res) => {
  const url = (req.url ?? '/').split('?')[0]
  if (!url.startsWith(MOUNT)) {
    res.writeHead(404).end('not found -- the app is mounted at ' + MOUNT)
    return
  }
  const rel = url.slice(MOUNT.length)
  let file = join(DIST, rel === '' ? 'index.html' : rel)
  if (!existsSync(file)) file = join(DIST, 'index.html')
  try {
    const body = await readFile(file)
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404).end('not found')
  }
})

await new Promise((r) => server.listen(0, r))
const base = `http://127.0.0.1:${server.address().port}${MOUNT}`

/**
 * Click something, having first centred it in the viewport. The status bar is
 * sticky, so Playwright's own scroll-into-view can leave a target underneath
 * it and the click lands on the header instead.
 */
async function tap(page, selector) {
  const el = await page.waitForSelector(selector)
  await el.evaluate((e) => e.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(120)
  await el.click()
}

const checks = []
const check = (name, ok, detail = '') => {
  checks.push({ name, ok, detail })
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ` -- ${detail}` : ''}`)
}

/**
 * Use the pre-installed browser rather than downloading one. The directory is
 * versioned (chromium-1194), so find it rather than hardcoding the build.
 */
function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
  if (!existsSync(base)) return undefined
  const dir = readdirSync(base)
    .filter((d) => d.startsWith('chromium-'))
    .sort()
    .pop()
  if (!dir) return undefined
  const exe = join(base, dir, 'chrome-linux', 'chrome')
  return existsSync(exe) ? exe : undefined
}

const executablePath = findChromium()
const browser = await chromium.launch({
  headless: !process.argv.includes('--headed'),
  ...(executablePath ? { executablePath } : {}),
})

// A mid-range phone viewport: this is a portrait mobile game (§3.1).
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
})
const page = await context.newPage()

const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})

console.log(`\nServing ${DIST}\nOpening ${base}\n`)
await page.goto(base, { waitUntil: 'networkidle' })
await page.waitForSelector('.ship', { timeout: 10_000 })

// --- the ship renders -------------------------------------------------------
const shipName = await page.textContent('.ship__name')
check('ship renders from sim state', shipName === 'Ariadne', `name=${shipName}`)

const deckNames = await page.$$eval('.deck__name', (els) => els.map((e) => e.textContent))
check(
  'decks stack nose-first (§3.1)',
  JSON.stringify(deckNames) ===
    JSON.stringify(['Bridge', 'Quarters', 'Life Support', 'Cargo', 'Machinery', 'Reactor', 'Engines']),
  deckNames.join(' / '),
)

const clock = await page.textContent('.status__clock')
check('ship clock reads', /^D\d+ \d{2}:\d{2}$/.test(clock ?? ''), clock ?? '')

const net0 = await page.textContent('.status__net')
check('starts with a power surplus', net0?.startsWith('+') === true, net0 ?? '')

await page.screenshot({ path: join(SHOTS, '01-bridge.png'), fullPage: true })

// --- a room opens and reveals its parts -------------------------------------
await page.click('.deck:nth-child(3) .deck__head') // Life Support
await page.waitForSelector('.deck.is-open .parts')
const partNames = await page.$$eval('.deck.is-open .part__name', (els) => els.map((e) => e.textContent))
check('room opens to its installed parts', partNames.length === 4, partNames.join(', '))

const lockedSwitch = await page.$('.deck.is-open .part:has-text("O2 Electrolysis") .switch')
check('life-critical parts cannot be switched off (§7.4)', await lockedSwitch?.isDisabled())

await page.screenshot({ path: join(SHOTS, '02-life-support.png'), fullPage: true })

// --- a command changes the world --------------------------------------------
await page.click('.deck:nth-child(3) .deck__head') // close
await page.click('.deck:nth-child(7) .deck__head') // Engines
await page.waitForSelector('.deck.is-open .parts')
await page.click('.deck.is-open .part .switch')
await page.waitForTimeout(300)

// Relative, not a magic number: with M1 the reactor is worn, so the exact
// figure moves with condition. What must hold is the sign.
const netAfter = await page.textContent('.status__net')
const deficitKw = Number.parseFloat(netAfter ?? '')
check('engine preheat drives the ship into deficit', deficitKw < 0, netAfter ?? '')

const margin = await page.textContent('.status__row--fine span:last-child')
check('the deficit is given a deadline', /to empty$/.test(margin?.trim() ?? ''), margin?.trim() ?? '')

// M1 moved the dispatches to their own tab.
await page.click('.tabs__btn:has-text("Log")')
await page.waitForSelector('.log__list')
const logged = await page.$$eval('.log__text', (els) => els.map((e) => e.textContent))
check(
  'the order appears in the dispatch log',
  logged.some((t) => t?.includes('NTR Preheat switched on')),
  logged[0] ?? '',
)
// --- the log is sorted, not just long (§7.4) --------------------------------
const topics = await page.$$eval('.log__topic', (els) => [
  ...new Set(els.map((e) => e.textContent?.trim())),
])
check('every dispatch says what it is about', topics.length > 1, topics.join(' · '))

const logFigures = await page.$$eval('.log__figure', (els) => els.map((e) => e.textContent?.trim()))
check(
  'and the number that matters is pulled out of the prose',
  logFigures.length > 0,
  logFigures.slice(0, 3).join(' | '),
)

const allCount = await page.$$eval('.log__entry', (els) => els.length)
await page.click('.log__filters .chip--power')
const powerOnly = await page.$$eval('.log__topic', (els) => [
  ...new Set(els.map((e) => e.textContent?.trim())),
])
const powerCount = await page.$$eval('.log__entry', (els) => els.length)
check(
  'filtering to one topic shows only that topic',
  powerOnly.length === 1 && powerOnly[0] === 'Power' && powerCount < allCount,
  `${powerCount} of ${allCount}`,
)
await page.click('.log__filters .chip:has-text("All")')

await page.screenshot({ path: join(SHOTS, '03b-log.png'), fullPage: true })

await page.click('.tabs__btn:has-text("Ship")')
await page.waitForSelector('.ship')

await page.screenshot({ path: join(SHOTS, '03-deficit.png'), fullPage: true })

// --- M1: condition, work orders, crew ---------------------------------------
console.log('\n  -- M1: the living ship --')

await page.click('.deck:nth-child(3) .deck__head') // Life Support
await page.waitForSelector('.deck.is-open .parts')

const conditions = await page.$$eval('.deck.is-open .condition__value', (els) =>
  els.map((e) => e.textContent),
)
check('parts show condition, not just on/off (§3.3)', conditions.length === 4, conditions.join(' | '))
check(
  'condition is a percentage with a plain-language label',
  conditions.every((c) => /^\d+% (good|serviceable|worn|poor|critical)$/.test(c ?? '')),
  conditions[0] ?? '',
)

// The scrubber opens at 61%, which is past the point where a full service
// stops overflowing the ceiling -- so the ship has already raised the job by
// itself and there is no button left to press. That is the standing order
// working, and it is worth asserting rather than working around.
check(
  'the ship has already ordered the service it should have (§7.3)',
  await page.isVisible('.deck.is-open .part:has-text("CO2 Scrubber") .part__ordered'),
)

// The manual path still exists, on something not yet worth a spare.
await tap(page, '.deck:nth-child(3) .deck__head') // close Life Support
await tap(page, '.deck:nth-child(6) .deck__head') // Reactor, at 79%
await page.waitForSelector('.deck.is-open .parts')
await tap(page, '.deck.is-open .part:has-text("Beacon") .button')
await page.waitForTimeout(300)
check('ordering work by hand marks the part', await page.isVisible('.part__ordered'))

await page.click('.tabs__btn:has-text("Crew")')
await page.waitForSelector('.roster')

const names = await page.$$eval('.crew__name', (els) => els.map((e) => e.textContent))
check('four crew on the roster (§4.1)', names.length === 4, names.join(', '))

const doings = await page.$$eval('.crew__doing', (els) => els.map((e) => e.textContent))
check(
  'the watch bill puts some crew asleep and some on watch (§4.3)',
  doings.includes('Asleep') && doings.some((d) => d?.startsWith('Servicing') || d === 'On watch'),
  doings.join(' | '),
)

// --- the crew tab (RF-21 to RF-26) ------------------------------------------
const stripLabels = await page.$$eval('.watchstrip__seg', (els) => els.map((e) => e.textContent))
check(
  'a watch is explained as a day, not as a letter (RF-21)',
  stripLabels.includes('On watch') && stripLabels.includes('Off') && stripLabels.includes('Asleep'),
  stripLabels.join(' · '),
)
check('with a marker at the current hour', await page.isVisible('.watchstrip__now'))

const blocks = await page.$$eval('.statblock__title', (els) =>
  els.map((e) => e.textContent?.trim().split(' ')[0]),
)
check(
  'skills, knowledge and attributes are shown separately (RF-22, RF-23)',
  ['Skills', 'Knowledge', 'Attributes'].every((b) => blocks.includes(b)),
  blocks.join(' / '),
)

const skillNames = await page.$$eval('.statblock .statrow__label', (els) =>
  els.map((e) => e.textContent),
)
check(
  'skills are the O*NET technical cluster',
  ['Monitoring', 'Maintenance', 'Diagnosis', 'Repair', 'Inspection'].every((n) =>
    skillNames.includes(n),
  ),
  skillNames.slice(0, 6).join(', '),
)

const quals = await page.$$eval('.qual', (els) => els.map((e) => e.textContent))
check('endorsements are named by their real system (RF-26)', quals.length > 0, quals.join(' '))

await page.screenshot({ path: join(SHOTS, '10-crew-detail.png'), fullPage: true })

await page.screenshot({ path: join(SHOTS, '06-crew.png'), fullPage: true })

// --- the work queue has its own area now (§4.3) -----------------------------
await page.click('.tabs__btn:has-text("Work")')
await page.waitForSelector('.orders')

check('the work order appears with an owner and a duration', await page.isVisible('.orders'))
const eta = await page.textContent('.order__eta')
check('the job has an honest completion estimate', /to go$/.test(eta?.trim() ?? ''), eta?.trim() ?? '')
const hand = await page.textContent('.order__hand')
check('a named crew member has the job', /has it$/.test(hand?.trim() ?? ''), hand?.trim() ?? '')

const autoTags = await page.$$eval('.tag--auto', (els) => els.length)
check('jobs the ship raised say so', autoTags > 0, `${autoTags} tagged`)

// §4.3: "you approve the watch bill and the work-order priorities". Moving a
// job has to actually change the order it is worked in, not just the list.
const queueBefore = await page.$$eval('.order__part', (els) => els.map((e) => e.textContent))
await tap(page, '.order:nth-child(2) .order__move button:last-child')
await page.waitForTimeout(200)
const afterDown = await page.$$eval('.order__part', (els) => els.map((e) => e.textContent))
check(
  'the queue can be reordered, and stays reordered',
  queueBefore.length > 1 && afterDown[0] !== queueBefore[0] === false
    ? JSON.stringify(afterDown) !== JSON.stringify(queueBefore)
    : true,
  `${queueBefore.join(' / ')}  ->  ${afterDown.join(' / ')}`,
)

const topDisabled = await page.$eval('.order:first-child .order__move button:first-child', (b) => b.disabled)
check('the top job cannot be moved above itself', topDisabled === true)

const hands = await page.$$eval('.hand__name', (els) => els.map((e) => e.textContent))
check('every hand is accounted for beside the queue', hands.length === 4, hands.join(', '))

await page.screenshot({ path: join(SHOTS, '06b-work.png'), fullPage: true })

// --- spec 003: the ship you can see -----------------------------------------
console.log('\n  -- the ship you can see --')

await page.click('.tabs__btn:has-text("Ship")')
await page.waitForSelector('.ship')

// SV-3, SV-4: every part and fixture is drawn, from data.
const glyphCounts = await page.$$eval('.decks > .deck', (decks) =>
  decks.map((d) => d.querySelectorAll('.schema .glyph').length),
)
check(
  'every deck draws its contents',
  glyphCounts.every((n) => n > 0),
  glyphCounts.join(' / '),
)
// 12 parts + 2 couches + 6 bunks + 1 table + 4 bays + 3 lockers.
const totalGlyphs = glyphCounts.reduce((a, b) => a + b, 0)
check('parts and fixtures both come from content (SV-3, SV-4)', totalGlyphs === 28, `${totalGlyphs} glyphs`)

// A tap target is not a drawn object. `.hit` sits inside `.glyph`, which sets a
// stroke, and stroke inherits -- so every part and fixture on the ship was
// outlined by its own hit box, two units proud of the thing it belonged to.
// Nothing in the DOM was wrong, which is why no test caught it: the drawing was
// simply full of boxes nobody had drawn.
const strokedTargets = await page.$$eval('.schema .hit', (els) =>
  els.filter((e) => {
    const s = getComputedStyle(e)
    return s.stroke !== 'none' && parseFloat(s.strokeWidth) > 0
  }).length,
)
check('tap targets are invisible, not drawn as boxes', strokedTargets === 0, `${strokedTargets} stroked`)

// SV-7: everyone is somewhere, and nobody is in two places.
const markers = await page.$$eval('.schema .person__tag', (els) => els.map((e) => e.textContent))
check(
  'all four crew stand on the ship, once each (SV-7)',
  markers.length === 4 && new Set(markers).size === 4,
  markers.join(' '),
)

// RF-5: posture, not only colour, distinguishes the three activities.
const activities = await page.$$eval('.schema .person', (els) =>
  els.map((e) => [...e.classList].find((c) => c.startsWith('person--'))),
)
check(
  'figures distinguish on watch, off watch and asleep (RF-5)',
  new Set(activities).size >= 2,
  activities.join(' '),
)

// SV-10: tapping a crew member opens them.
await tap(page, '.schema .person .hit')
await page.waitForSelector('.whois')
const whoName = await page.textContent('.whois__name')
check('tapping a crew marker opens that person (SV-10)', Boolean(whoName), whoName ?? '')
await page.click('.whois__close')

// RF-9, RF-10: tapping a machine opens that machine, not a list.
// The reactor deck: plenty of machinery, and nobody stationed on it, so the
// target under test is unambiguously the machine.
await tap(page, '.deck:nth-child(6) .schema .hit')
await page.waitForSelector('.station')
const stationName = await page.textContent('.station__name')
check('tapping a machine opens that machine (RF-9)', Boolean(stationName), stationName ?? '')

const meterLabels = await page.$$eval('.station .meterline__label', (els) =>
  els.map((e) => e.textContent),
)
check(
  'the card shows both health axes, separately (RF-36d)',
  meterLabels.includes('Condition') && meterLabels.includes('Tune'),
  meterLabels.join(' / '),
)
const tuneHint = await page.textContent('.station .meterline:last-child .meterline__hint')
check(
  'and explains what moves tune',
  /on this deck/.test(tuneHint ?? ''),
  tuneHint?.trim() ?? '',
)

check('the machine is held highlighted while its card is open', await page.isVisible('.picked'))
await page.screenshot({ path: join(SHOTS, '08-station.png'), fullPage: true })
await tap(page, '.station__close')

// RF-13: the margin overlay is gone, not merely hidden.
check('the flow overlay is gone (RF-13)', (await page.$$('.flowtoggle, .flow__ch')).length === 0)

// RF-5, RF-8: people are drawn in the room and are targets.
const figures = await page.$$('.schema .person')
check('crew are drawn in their rooms as figures (RF-5)', figures.length === 4, `${figures.length} aboard`)

// --- everything on the drawing answers when tapped (SV-10) ------------------
await page.click('.tabs__btn:has-text("Ship")')
await page.waitForSelector('.ship')
await page.click('.deck:nth-child(2) .deck__head') // Quarters: bunks and a table
await page.waitForSelector('.deck.is-open .schema')
// An *unoccupied* berth. Okonkwo sleeps in the first bunk and Sandoval stands
// at the mess table, and tapping either of those opens the person rather than
// the furniture -- which is correct, and makes both the wrong target here.
await tap(page, '.deck.is-open .hit--fixture >> nth=1')
const fixtureName = await page.textContent('.whois--fixture .whois__name')
check('furniture answers when tapped, not just machines', Boolean(fixtureName), fixtureName ?? '')
const fixtureBlurb = await page.textContent('.whois--fixture .whois__blurb')
check('and says why it is there', (fixtureBlurb?.length ?? 0) > 30, `${fixtureBlurb?.slice(0, 48)}…`)
await page.click('.whois--fixture .whois__close')
await page.click('.deck:nth-child(2) .deck__head')

// --- an answer opens where the question was asked ---------------------------
//
// Crew and fixture cards used to render at the foot of the whole ship section:
// tapping a person on deck 1 opened their card 1,400 px below the fold, which
// is indistinguishable from a tap that did nothing -- and was reported as
// exactly that. The card has to be near the thing it describes.
await tap(page, '.deck .person .hit')
const tappedName = await page.textContent('.whois:not(.whois--fixture) .whois__name')
check('tapping a person opens them', Boolean(tappedName), tappedName ?? '')

/* eslint-disable no-undef */
const nearness = await page.evaluate(() => {
  const card = document.querySelector('.whois:not(.whois--fixture)')
  const deck = card?.closest('.deck')
  const person = deck?.querySelector('.person .hit')
  if (!card || !person) return null
  return Math.abs(card.getBoundingClientRect().top - person.getBoundingClientRect().bottom)
})
/* eslint-enable no-undef */
check(
  'and opens beside them, not at the bottom of the ship',
  nearness !== null && nearness < 400,
  nearness === null ? 'card is not in the same deck' : `${Math.round(nearness)} px away`,
)
await page.click('.whois .whois__close')

// --- nothing in a room is drawn through anything else (RF-8) ----------------
//
// The room lays itself out, so "it looks wrong" is a measurable claim: no two
// objects may share space, and no two tap targets either -- an invisible
// overlap steals taps meant for the machine behind the person.
/* eslint-disable no-undef */
const collisions = await page.evaluate(() => {
  const bad = []
  document.querySelectorAll('.schema').forEach((svg) => {
    const boxes = []
    svg.querySelectorAll('.glyph, .person').forEach((g) => {
      const label = (g.querySelector('.hit')?.getAttribute('aria-label') ?? '?').split('.')[0]
      const shape = g.querySelector('g')
      const hit = g.querySelector('.hit')
      if (shape) {
        const b = shape.getBBox()
        const t = shape.transform.baseVal.consolidate()
        boxes.push({
          kind: 'drawn',
          person: g.classList.contains('person'),
          occupying: g.classList.contains('is-occupying'),
          label,
          x: b.x + (t ? t.matrix.e : 0),
          y: b.y + (t ? t.matrix.f : 0),
          w: b.width,
          h: b.height,
        })
      }
      if (hit) {
        boxes.push({
          kind: 'tap target',
          person: g.classList.contains('person'),
          occupying: g.classList.contains('is-occupying'),
          label,
          x: +hit.getAttribute('x'),
          y: +hit.getAttribute('y'),
          w: +hit.getAttribute('width'),
          h: +hit.getAttribute('height'),
        })
      }
    })
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]
        const c = boxes[j]
        if (a.kind !== c.kind || a.label === c.label) continue
      // People may stand in front of things -- that is what standing in a room
      // looks like, and on a full deck there is nowhere else to be. What must
      // not happen is two *objects* sharing space, or two tap targets fighting
      // over the same press.
      // A person may share space with the furniture they are using, drawn and
      // tappable alike: tapping somebody standing at the mess table should open
      // the person, not the table. What must not happen is two objects sharing
      // space, or a person standing through something they are not using.
      if (a.occupying || c.occupying) continue
      if (a.kind === 'drawn' && (a.person || c.person)) continue
        const ox = Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x)
        const oy = Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y)
        if (ox > 0.5 && oy > 0.5) bad.push(`${a.kind}: ${a.label} × ${c.label}`)
      }
    }
  })
  return bad
})
/* eslint-enable no-undef */
check(
  'nothing in any room overlaps anything else, drawn or tappable',
  collisions.length === 0,
  collisions.slice(0, 3).join(' | '),
)

// --- crew stats explain themselves (RF-26) ----------------------------------
await page.click('.tabs__btn:has-text("Crew")')
await page.waitForSelector('.watchstrip')
await tap(page, '.explain__hint')
const watchHelp = await page.textContent('.explain__what')
check(
  'the A/B/C watches are explained on screen, not in a tooltip',
  /eight-hour/.test(watchHelp ?? ''),
  watchHelp?.slice(0, 60) ?? '',
)

await tap(page, '.statrow')
const skillLabel = await page.textContent('.explain__label')
const skillAffects = await page.textContent('.explain__affects')
check('tapping a skill says what it is', Boolean(skillLabel), skillLabel ?? '')
check(
  'and, crucially, what it affects',
  /What it affects/.test(skillAffects ?? '') && (skillAffects?.length ?? 0) > 60,
  skillAffects?.slice(0, 60) ?? '',
)

await tap(page, '.qual')
const qualWhat = await page.textContent('.explain__what')
check('endorsements explain themselves too', (qualWhat?.length ?? 0) > 30, qualWhat?.slice(0, 50) ?? '')

// --- M3: the guild and the hall (§6.1, §10.1) -------------------------------
const ownGuild = await page.textContent('.guild__name')
check('the desk flies affiliated', /Wrightworks/.test(ownGuild ?? ''), ownGuild ?? '')

const standings = await page.$$eval('.standing__name', (els) => els.map((e) => e.textContent))
check(
  'standing is tracked with every guild, not only your own',
  standings.length === 4,
  standings.join(' · '),
)

const berthText = await page.textContent('.hall__summary')
check('the hall states berths and payroll', /\d+\s*\/\s*\d+/.test(berthText ?? ''), berthText?.replace(/\s+/g, ' ').trim() ?? '')

// Gateway carries the general trade; the deep bench is at the guild's own yard.
const hires = await page.$$('.hire')
check('candidates are standing in the hall', hires.length > 0, `${hires.length} in the hall`)
const floorNote = await page.textContent('.hire__floor')
check(
  'the guild wage floor is shown, not folded into one number',
  /wage floor/.test(floorNote ?? ''),
  floorNote?.trim() ?? '',
)
await page.screenshot({ path: join(SHOTS, '17-hall.png'), fullPage: true })

// --- help, and the way out to the site --------------------------------------
await page.click('.tabs__btn:has-text("Help")')
await page.waitForSelector('.help__list')
const questions = await page.$$eval('.help__q', (els) => els.map((e) => e.textContent))
check('help answers real questions', questions.length >= 10, `${questions.length} topics`)
check(
  'including the two that are least guessable',
  questions.some((q) => /A, B and C/.test(q ?? '')) &&
    questions.some((q) => /five days/.test(q ?? '')),
  questions.filter((q) => /A, B and C|five days/.test(q ?? '')).join(' | '),
)

// The install offer. Headless Chromium does not fire beforeinstallprompt, so
// the banner cannot appear here -- but the Help entry must always say
// something, because "your browser did not offer" is still an answer.
const installPanel = await page.textContent('section[aria-label="Install"]')
check(
  'help always answers how to install',
  /install/i.test(installPanel ?? '') && (installPanel?.length ?? 0) > 60,
  installPanel?.slice(12, 72).trim() ?? '',
)

const siteHref = await page.getAttribute('.help__link', 'href')
check(
  'and a way to reach the project site',
  siteHref === 'https://codercoop.github.io/SolarSyndicate/',
  siteHref ?? '',
)
check('which opens in a new tab', (await page.getAttribute('.help__link', 'target')) === '_blank')

// A bug report has to be able to name a build.
const version = await page.textContent('.help__version')
check('the build names its own version', /^Version \d+\.\d+\.\d+$/.test(version?.trim() ?? ''), version?.trim() ?? '')
await page.screenshot({ path: join(SHOTS, '16-help.png'), fullPage: true })

// --- the chart (§5.1) -------------------------------------------------------
await page.click('.tabs__btn:has-text("Chart")')
await page.waitForSelector('.chart')

const orbits = await page.$$('.chart__orbit')
check('the chart draws every body with a port on it', orbits.length === 3, `${orbits.length} orbits`)

const caption = await page.textContent('.chart__caption')
check(
  'and says where the ship is, in words',
  /Berthed at .+/.test(caption ?? ''),
  caption?.trim() ?? '',
)
check('with the ship marked on the plate', await page.isVisible('.chart__ship-mark'))
check('and its port highlighted', await page.isVisible('.chart__body.is-current'))

// §5.1: "planets move, so launch windows are real gameplay". The maths for
// this shipped in M2 and was referenced by nothing at all until now.
const ranges = await page.$$eval('.chart__range', (els) => els.map((e) => e.textContent?.trim()))
check(
  'every world says how far away it is right now (§5.1)',
  ranges.length === 3 && ranges.some((r) => /AU$/.test(r ?? '')) && ranges.includes('here'),
  ranges.join(' | '),
)

const windows = await page.$$eval('.window', (els) =>
  els.map((e) => e.textContent?.replace(/\s+/g, ' ').trim()),
)
check(
  'and the chart says when a crossing is worth flying',
  windows.length === 2 && windows.every((w) => /opens (now|in \d)/.test(w ?? '')),
  windows.join(' || '),
)

const ticks = await page.$$eval('.chart__ruler text', (els) => els.map((e) => e.textContent))
check(
  'the square-root scale is drawn rather than asserted',
  ticks.includes('AU') && ticks.length > 3,
  ticks.join(' '),
)

// The ship's own state (§5.1). The dot was always in the right place and said
// nothing else about her -- not how fast, not which way.
const bearings = await page.$$eval('.chart__graticule text', (els) =>
  els.map((e) => e.textContent?.trim()),
)
check(
  'longitude can be read off the plate, not just off the readout',
  bearings.length === 4 && bearings.includes('0°') && bearings.includes('180°'),
  bearings.join(' '),
)

const telem = await page.$$eval('.telemetry__row', (els) =>
  els.map((e) => e.textContent?.replace(/\s+/g, ' ').trim()),
)
check(
  'the chart reports the ship as position, velocity and course',
  telem.length >= 3 &&
    /^Position\d+\.\d+ AU/.test(telem[0] ?? '') &&
    /^Velocity\d+\.\d+ km\/s/.test(telem[1] ?? '') &&
    /^Course/.test(telem[2] ?? ''),
  telem.join(' | '),
)
check(
  'a berthed ship is moving with her berth, not standing still (§5.1)',
  // 29.8 km/s round the sun. Reporting nought would be quoting a frame the
  // plate is not drawn in.
  /^Velocity29\.[0-9]+ km\/s/.test(telem[1] ?? ''),
  telem[1] ?? '',
)
check('and the heading needle is drawn from her', await page.isVisible('.chart__velocity line'))

await page.screenshot({ path: join(SHOTS, '11-chart.png'), fullPage: true })

// --- the mission: board, allowance, astrogator (TR-3b, TR-16, TR-20) -------
await page.click('.tabs__btn:has-text("Mission")')
await page.waitForSelector('.berth__name')

check(
  'the mission tab names the berth the ship is actually at',
  (await page.textContent('.berth__name'))?.includes('Gateway') === true,
  (await page.textContent('.berth__name'))?.trim() ?? '',
)

const offers = await page.$$('.offer')
check('the board offers work', offers.length > 0, `${offers.length} on offer`)

// TR-20: the allowance is answerable when choosing, not discovered on arrival.
const allowanceBlocks = await page.$$('.offer .allowance')
check(
  'every offer states its resupply allowance up front (TR-20)',
  allowanceBlocks.length === offers.length,
  `${allowanceBlocks.length}/${offers.length}`,
)

const allowanceLabels = await page.$$eval('.offer:first-child .allowance__label', (els) =>
  els.map((e) => e.textContent),
)
check(
  'the allowance is itemised by store, not a single number',
  allowanceLabels.length === 5,
  allowanceLabels.join(' · '),
)

// The route strip: where a run starts, where it ends, what kind of job it is.
const routes = await page.$$('.offer .route')
check('every offer draws its route', routes.length === offers.length, `${routes.length}/${offers.length}`)

const routeEnds = await page.$$eval('.offer:first-child .route__port', (els) =>
  els.map((e) => e.textContent),
)
check('the route names both ends', routeEnds.length === 2, routeEnds.join(' → '))

// A hop between two ports around one body is not a journey between two places.
// Drawing it as one put *two Earths* side by side and said nothing about the
// fifty-seven-fold difference in altitude between them.
const sameBodyOffer = await page.$('.offer:has(.route__orbit)')
check('a route inside one gravity well draws that body once, with its orbits', !!sameBodyOffer)
if (sameBodyOffer) {
  const orbits = await sameBodyOffer.$$eval('.route__orbit', (els) => els.length)
  const bodies = await sameBodyOffer.$$eval('.route__body', (els) => els.length)
  const named = await sameBodyOffer.$$eval('.route__body-name', (els) =>
    els.map((e) => e.textContent?.trim()),
  )
  check(
    'one primary and two orbits, not two planets',
    orbits === 2 && bodies === 1,
    `${bodies} body, ${orbits} orbits, named ${named.join('/')}`,
  )
  const alts = await sameBodyOffer.$$eval('.route__alt', (els) => els.map((e) => e.textContent?.trim()))
  check(
    'and each orbit says the altitude that puts it there',
    alts.some((a) => /6,778 km/.test(a ?? '')) && alts.some((a) => /384,400 km/.test(a ?? '')),
    alts.join(' | '),
  )
}

const types = await page.$$eval('.mtype__name', (els) => els.map((e) => e.textContent))
check('each offer says what kind of mission it is (§5.3)', types.length === offers.length, types.join(' · '))
check('and the types are not all the same word', new Set(types).size > 1, [...new Set(types)].join(' · '))

const balance = await page.textContent('.books__balance')
check('the books show a balance', /cr$/.test(balance?.trim() ?? ''), balance?.trim() ?? '')

await page.screenshot({ path: join(SHOTS, '12-board.png'), fullPage: true })

await tap(page, '.offer:first-child .offer__accept')
await page.waitForSelector('.options')

check('accepting a run takes the board off the table', (await page.$$('.offer__accept')).length === 0)

const optionLabels = await page.$$eval('.option__label', (els) => els.map((e) => e.textContent))
check('the astrogator works up more than one trajectory', optionLabels.length === 3, optionLabels.join(' · '))

// Every Luna trajectory is affordable, and that is not a balance slip: from
// low orbit a faster run to the Moon really is nearly free, which is why Apollo
// flew a three-day trajectory rather than a five-day one. So the cislunar
// choice is genuinely low-stakes.
const lunaSpread = await page.$$eval('.option__dv', (els) =>
  els.map((e) => Number.parseFloat(e.textContent ?? '0')),
)
check(
  'a faster run to the Moon costs little, as it really does',
  Math.max(...lunaSpread) / Math.min(...lunaSpread) < 1.1,
  lunaSpread.map((v) => v.toFixed(2)).join(' → '),
)
check('and all of them are flyable', (await page.$$('.option.is-blocked')).length === 0)

await page.screenshot({ path: join(SHOTS, '13-astrogator.png'), fullPage: true })

// TR-3b: an option the ship cannot fly is shown with the reason, not hidden.
// Mars is where that bites -- 259 days away, and the Kestrel carries 91 days
// of food and a third of the propellant it would need.
await tap(page, '.panel:has(.allowance) .button--quiet')
await page.waitForSelector('.offer')
await tap(page, '.offer:has-text("Phobos") .offer__accept')
await page.waitForSelector('.options')

const blocked = await page.$$('.option.is-blocked')
check('an unflyable option is shown, not dropped (TR-3b)', blocked.length > 0, `${blocked.length} blocked`)
const why = await page.textContent('.option.is-blocked .option__why')
check('and says what it is short of, in tonnes', /t more/.test(why ?? ''), why?.trim() ?? '')
check(
  'with no way to fly it anyway',
  (await page.$$('.option.is-blocked .option__go')).length === 0,
)
await page.screenshot({ path: join(SHOTS, '13b-unflyable.png'), fullPage: true })

// Walking away costs money and never the ship (TR-21).
const balanceBefore = await page.textContent('.books__balance')
await tap(page, '.panel:has(.allowance) .button--quiet')
await page.waitForSelector('.offer')
check(
  'abandoning a run puts the board back and charges for it (TR-21)',
  (await page.textContent('.books__balance')) !== balanceBefore,
  `${balanceBefore?.trim()} -> ${(await page.textContent('.books__balance'))?.trim()}`,
)

// --- the yard: the Kestrel's replacement (§5.2, §10.2) ----------------------
// Gateway has no yard, which is the point -- buying a ship is a reason to fly
// somewhere rather than a catalogue at every berth.
check('no yard at a berth without one', (await page.$$('.hull')).length === 0)

// --- the flow view (RF-13 to RF-20) -----------------------------------------
await page.click('.tabs__btn:has-text("Flows")')
await page.waitForSelector('.chans')

const chanLabels = await page.$$eval('.chans__btn', (els) => els.map((e) => e.textContent))
check(
  'one channel per Life gauge, plus power (RF-14)',
  chanLabels.length === 8 && chanLabels[0] === 'Power',
  chanLabels.join(' / '),
)

// The grammar is structural now, not a set of headings: sources feed a bus,
// consumers hang off it ranked by draw, and the buffer sits to one side.
await page.waitForSelector('.fdia')
const grammar = {
  sources: (await page.$$('.fdia__src')).length,
  bus: (await page.$$('.fdia__bus')).length,
  consumers: (await page.$$('.fdia__row')).length,
  buffer: (await page.$$('.fdia__buffer')).length,
}
check(
  'every channel uses the same grammar (RF-15)',
  grammar.sources > 0 && grammar.bus === 1 && grammar.consumers > 0 && grammar.buffer === 1,
  JSON.stringify(grammar),
)

// A warm body is a heat source. `crewNode` used to default to `consumer`, the
// CO2 channel remembered to override it and the heat channel did not -- so four
// people were drawn on the diagram as though they absorbed 0.47 kW between
// them, while the balance underneath counted them correctly the whole time.
await page.click('.chans__btn:text-is("Heat")')
await page.waitForSelector('.fdia')
const heatSources = await page.$$eval('.fdia__src-name', (els) =>
  els.map((e) => e.textContent?.trim()),
)
const heatConsumers = await page.$$eval('.fdia__row-name', (els) =>
  els.map((e) => e.textContent?.trim()),
)
check(
  'the crew are drawn making heat, not absorbing it',
  heatSources.some((n) => /^Crew/.test(n ?? '')) &&
    !heatConsumers.some((n) => /^Crew/.test(n ?? '')),
  `sources: ${heatSources.join(', ')} | consumers: ${heatConsumers.join(', ') || 'none'}`,
)
await page.click('.chans__btn:text-is("Power")')
await page.waitForSelector('.fdia')

// --- the engineering panel (mockup 003, option C) --------------------------
//
// Stations as nodes, networks as lines between them. The claim it has to
// support is §1 pillar 1: that you can trace why a margin is thin by following
// a line with your finger. That needs three things to be true at once, and all
// three have been broken at some point in this file's history.
const stations = await page.$$eval('.fgr__node .fgr__name', (els) =>
  els.map((e) => e.textContent?.trim()),
)
check(
  'the ship is drawn as its stations',
  stations.includes('REACTOR') && stations.includes('SCRUBBER') && stations.includes('HAB'),
  stations.slice(0, 5).join(' · '),
)

// Every label has to be *inside* its box. A label wider than its box is not
// merely ugly: the next box along paints over the overflow, so it reads as
// missing rather than as long -- which is exactly how this shipped once.
/* eslint-disable no-undef */
const clipped = await page.evaluate(() =>
  [...document.querySelectorAll('.fgr__node')]
    .filter((g) => {
      const box = g.querySelector('.fgr__box')
      const label = g.querySelector('.fgr__name')
      if (!box || !label) return false
      const b = label.getBBox()
      return b.x + b.width > +box.getAttribute('x') + +box.getAttribute('width') - 2
    })
    .map((g) => g.querySelector('.fgr__name')?.textContent),
)
/* eslint-enable no-undef */
check('and every station name fits in its box', clipped.length === 0, clipped.join(', '))

// No box may sit on another. Same rule as the ship view, same reason.
/* eslint-disable no-undef */
const boxOverlaps = await page.evaluate(() => {
  const boxes = [...document.querySelectorAll('.fgr__box')].map((r) => ({
    x: +r.getAttribute('x'),
    y: +r.getAttribute('y'),
    w: +r.getAttribute('width'),
    h: +r.getAttribute('height'),
  }))
  const bad = []
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]
      const b = boxes[j]
      if (
        Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.5 &&
        Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.5
      ) {
        bad.push(`${i}×${j}`)
      }
    }
  }
  return bad
})
/* eslint-enable no-undef */
check('and no two stations are drawn on top of each other', boxOverlaps.length === 0, boxOverlaps.join(' '))

const netEdges = await page.$$eval('.fgr__edge', (els) =>
  els.map((e) => e.getAttribute('class')?.match(/fgr__edge--(\w+)/)?.[1]),
)
check(
  'more than one network runs between them',
  new Set(netEdges).size > 1,
  [...new Set(netEdges)].join(' · '),
)

// Crew presence is the one thing 003 said it would not compromise on.
check('the crew are on the diagram, not just the machines', (await page.$$('.fgr__crew')).length > 0)

// Tapping a station says what it is wired to.
await tap(page, '.fgr__node .fgr__hit')
check('tapping a station opens it', await page.isVisible('.fgr__card'))
const wiring = await page.$$eval('.fgr__links li', (els) => els.map((e) => e.textContent?.trim()))
check(
  'and lists what it is connected to',
  wiring.length > 0 && wiring.some((w) => /^(to|from) /.test(w ?? '')),
  wiring.slice(0, 2).join(' | '),
)

await page.screenshot({ path: join(SHOTS, '08b-systems.png'), fullPage: true })

// Link width is magnitude, so the biggest consumer must draw the thickest line.
const widths = await page.$$eval('.fdia__row .fdia__edge', (els) =>
  els.map((e) => Number.parseFloat(e.getAttribute('stroke-width'))),
)
check(
  'the thickest link is the biggest draw (RF-16)',
  widths.length > 1 && widths[0] === Math.max(...widths),
  widths.map((w) => w.toFixed(1)).join(' > '),
)

// ...and it has to be *visible* to be true. The rows were 10 px apart with an
// arrowhead in the gap, so every link was the same stub whatever its width
// claimed -- "link width is magnitude" was correct in the DOM and unreadable on
// the screen, which is not the same thing as working.
const edgeLengths = await page.$$eval('.fdia__row .fdia__edge', (els) =>
  els.map((e) => e.getBBox().height),
)
check(
  'and the links are long enough for their width to read',
  edgeLengths.every((h) => h >= 14),
  edgeLengths.map((h) => Math.round(h)).join(' · '),
)

// The mockup's sub-label. The flow view's real question is not "what draws the
// most" but "what can I switch off", and priority is the answer to it.
const rowWhere = await page.$$eval('.fdia__row-where', (els) => els.map((e) => e.textContent))
check(
  'each consumer says where it is and what shedding it would cost',
  rowWhere.every((t) => /·\s(critical|high|normal|low)$/.test(t ?? '')),
  rowWhere.slice(0, 2).join(' | '),
)

const busLabel = await page.textContent('.fdia__bus-label')
check('the bus is named the same on every channel', busLabel === 'MAIN BUS', busLabel ?? '')

const powerNames = await page.$$eval('.fdia__src-name, .fdia__row-name', (els) =>
  els.map((e) => e.textContent),
)
check(
  'nodes are named parts, not decks (RF-16)',
  powerNames.includes('Beacon-4 Fission Plant') && powerNames.includes('O2 Electrolysis Unit'),
  powerNames.slice(0, 3).join(', '),
)

// The crew are a node wherever they are actually a load -- which is the air and
// the stores, not the electrical bus.
await tap(page, '.chans__btn:has-text("O₂")')
const o2Names = await page.$$eval('.fdia__src-name, .fdia__row-name', (els) =>
  els.map((e) => e.textContent),
)
check(
  'and the crew are a node where the crew are a load',
  o2Names.some((n) => n?.startsWith('Crew')),
  o2Names.join(', '),
)

await tap(page, '.chans__btn:has-text("Water")')
await page.waitForSelector('.fdia__return')
const returnName = await page.textContent('.fdia__return-label')
check('the water loop is drawn as a loop (RF-17)', /Recycler/.test(returnName ?? ''), returnName ?? '')

const whatIf = await page.textContent('.flowch__what-if')
check(
  'and states what happens without it (RF-18)',
  /Recycler offline: .* days of tank\./.test(whatIf ?? ''),
  whatIf?.trim() ?? '',
)

await page.screenshot({ path: join(SHOTS, '09-flows.png'), fullPage: true })

await tap(page, '.chans__btn:has-text("Propellant")')
const propFoot = await page.textContent('.flowch__foot')
check(
  'propellant is a budget, not a rate (RF-19)',
  /budget, not a rate/.test(propFoot ?? ''),
  propFoot?.trim() ?? '',
)

await page.click('.tabs__btn:has-text("Life")')
await page.waitForSelector('.gauges')
const gaugeLabels = await page.$$eval('.gauge-row__label', (els) => els.map((e) => e.textContent))
check(
  'all five networks plus stores are shown (§3.2)',
  ['Cabin CO2', 'Cabin temperature', 'Oxygen', 'Water', 'Food', 'Propellant', 'Spares'].every((l) =>
    gaugeLabels.includes(l),
  ),
  gaugeLabels.join(', '),
)
const closure = await page.textContent('.gauge-row:has-text("Water") .gauge-row__detail')
check('water reports loop closure', /loop closure/.test(closure ?? ''), closure?.trim() ?? '')

// §1 pillar 1: a level and a horizon say what and when. Only "why" is
// actionable, and it used to live one tab away on the flow diagram.
const withSupply = await page.$$eval('.gauge-row', (rows) =>
  rows.filter((r) => r.querySelector('.gauge-row__supply')).length,
)
check(
  'every gauge says what puts it in and what takes it out (§3.2)',
  withSupply === 7,
  `${withSupply} of 7 gauges`,
)

/** Read one gauge's breakdown as `{ in: [...], out: [...] }`. */
/* The body of page.evaluate runs in the browser, not in Node -- so its globals
   are the page's, which is why eslint cannot see them here. */
/* eslint-disable no-undef */
const supplyOf = (label) =>
  page.evaluate((wanted) => {
    const row = [...document.querySelectorAll('.gauge-row')].find(
      (r) => r.querySelector('.gauge-row__label')?.textContent === wanted,
    )
    const side = (which) =>
      [...(row?.querySelectorAll(`.supply--${which} .supply__name`) ?? [])].map((e) =>
        e.textContent?.trim(),
      )
    return { in: side('in'), out: side('out') }
  }, label)
/* eslint-enable no-undef */

const water = await supplyOf('Water')
check(
  'the recycler is named on the side that fills the tank',
  water.in.includes('Water Recycler') && water.out.includes('Crew ×4'),
  `in ${water.in.join(', ')} | out ${water.out.join(', ')}`,
)

// The channel that runs the other way. Get this backwards and the panel says
// the scrubbers are the thing making the carbon dioxide.
const co2 = await supplyOf('Cabin CO2')
check(
  'and the scrubbers on the side that empties the cabin',
  co2.in.includes('Crew ×4') && co2.out.includes('CO2 Scrubber'),
  `in ${co2.in.join(', ')} | out ${co2.out.join(', ')}`,
)

// Heat has twelve contributors -- every part aboard makes some -- so the top
// three are not the whole story and the tail has to open rather than being a
// count you cannot act on.
const heatShort = await supplyOf('Cabin temperature')
check(
  'a long list is summarised rather than dumped',
  heatShort.in.length === 3,
  `${heatShort.in.length} named of twelve`,
)
await tap(page, '.gauge-row:has-text("Cabin temperature") .supply--in .supply__more')
const heat = await supplyOf('Cabin temperature')
check(
  'and opens in full when asked, down to the four warm bodies',
  heat.in.length > heatShort.in.length &&
    heat.in.includes('Crew ×4') &&
    heat.out.includes('Thermal Loop & Radiators'),
  `${heat.in.length} in | out ${heat.out.join(', ')}`,
)

await page.screenshot({ path: join(SHOTS, '07-life-support.png'), fullPage: true })

await page.click('.tabs__btn:has-text("Ship")')
await page.waitForSelector('.ship')

// --- persistence: the world survives a reload -------------------------------
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('.ship', { timeout: 10_000 })
const netReloaded = await page.textContent('.status__net')
check(
  'state survives a reload (IndexedDB, §8.3)',
  Math.abs(Number.parseFloat(netReloaded ?? '') - deficitKw) < 0.2,
  `${netReloaded} vs ${netAfter}`,
)

// --- the PWA is installable -------------------------------------------------
const manifestHref = await page.getAttribute('link[rel="manifest"]', 'href')
check('manifest is linked', Boolean(manifestHref), manifestHref ?? '')

const manifest = await (await fetch(new URL(manifestHref, base))).json()
check('manifest is portrait and standalone (§8.3)', manifest.display === 'standalone' && manifest.orientation === 'portrait')
check('manifest declares icons', manifest.icons?.length >= 2, `${manifest.icons?.length} icons`)

for (const icon of manifest.icons ?? []) {
  const res = await fetch(new URL(icon.src, base))
  check(`icon ${icon.sizes} is served`, res.ok && res.headers.get('content-type') === 'image/png')
}

const assetHrefs = await page.$$eval('script[src], link[href]', (els) =>
  els.map((e) => e.getAttribute('src') ?? e.getAttribute('href')).filter(Boolean),
)
check(
  'assets are referenced relatively, so the build runs from any subpath',
  assetHrefs.every((h) => !h.startsWith('/')),
  assetHrefs.join(' '),
)
check(
  'the manifest start_url is not the domain root',
  manifest.start_url !== '/',
  `start_url=${manifest.start_url}`,
)

const swRegistered = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker?.getRegistration()
  return Boolean(reg)
})
check('service worker registers (offline-capable shell)', swRegistered)

// --- no runtime errors ------------------------------------------------------
// The banner must not appear unbidden: without an install opportunity there is
// nothing to offer, and a dead banner over the status bar is worse than none.
check('no install banner when the browser has not offered', (await page.$$('.install')).length === 0)

// Fire the event the way Chromium would, and the offer should appear.
/* The body of page.evaluate runs in the browser, not in Node -- so its globals
   are the page's, which is why eslint cannot see them here. */
/* eslint-disable no-undef */
await page.evaluate(() => {
  const e = new Event('beforeinstallprompt')
  e.prompt = () => Promise.resolve()
  e.userChoice = Promise.resolve({ outcome: 'accepted' })
  window.dispatchEvent(e)
})
/* eslint-enable no-undef */
await page.waitForSelector('.install', { timeout: 3000 })
check('the game offers to install itself once the browser allows it', await page.isVisible('.install'))
const offerWhy = await page.textContent('.install__why')
check('and says why it is worth doing', /offline/.test(offerWhy ?? ''), offerWhy?.trim() ?? '')

await page.click('.install .button--quiet')
check('"Not now" dismisses it', (await page.$$('.install')).length === 0)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('.ship')
check('and the dismissal is remembered across a reload', (await page.$$('.install')).length === 0)

check('no console or page errors', errors.length === 0, errors.slice(0, 3).join(' | '))

// ---------------------------------------------------------------------------
// A save this build cannot read (§8.3).
//
// The bug this exists for: 0.5.0 added guildId to SimState without moving
// SIM_STATE_VERSION, so a save from the build before it claimed to be current,
// loaded untouched, and threw on the first payroll of catch-up. That happens
// during boot, where nothing caught it -- the game sat on "Reading the Local's
// books..." for ever. Unit tests now stop that particular save from existing;
// this proves the boot path survives one anyway, whatever the reason.
//
// Both shapes of unreadable save must end at a playable ship.
// ---------------------------------------------------------------------------
console.log('\n  -- a save this build cannot read --')

for (const bad of [
  { id: 'old', label: 'a save from an older format' },
  { id: 'mislabelled', label: 'a save mislabelled as current' },
]) {
  const staleCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })
  const stale = await staleCtx.newPage()
  const staleErrors = []
  const staleWarnings = []
  stale.on('pageerror', (e) => staleErrors.push(String(e)))
  stale.on('console', (m) => {
    if (m.type() === 'error') staleErrors.push(m.text())
    if (m.type() === 'warning') staleWarnings.push(m.text())
  })

  await stale.goto(base, { waitUntil: 'networkidle' })
  await stale.waitForSelector('.ship', { timeout: 10_000 })

  // Damage the stored snapshot the way a version skew would.
  /* eslint-disable no-undef */
  await stale.evaluate(
    (id) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('solar-syndicate')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const db = open.result
          const tx = db.transaction('saves', 'readwrite')
          const store = tx.objectStore('saves')
          const read = store.get('primary')
          read.onsuccess = () => {
            const record = read.result
            if (id === 'old') {
              // An honest old save: says what it is.
              record.snapshot.version = 1
            } else {
              // The 0.5.0 bug: current version number, older shape.
              delete record.snapshot.guildId
              delete record.snapshot.standing
            }
            record.commands = []
            // Long enough ago that catch-up crosses a day roll and draws wages,
            // which is where the crash actually happened.
            record.savedUtcMs -= 3_600_000
            store.put(record)
          }
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }
      }),
    bad.id,
  )
  /* eslint-enable no-undef */

  let booted = true
  await stale.reload({ waitUntil: 'networkidle' })
  try {
    await stale.waitForSelector('.ship', { timeout: 10_000 })
  } catch {
    booted = false
  }

  check(`${bad.label} still boots to a playable ship`, booted, booted ? '' : 'stuck on the loading screen')
  check(
    `  and says in the console why the world restarted`,
    staleWarnings.some((w) => /Starting a new world/.test(w)),
    staleWarnings.slice(0, 2).join(' | '),
  )
  check(`  without an uncaught error`, staleErrors.length === 0, staleErrors.slice(0, 2).join(' | '))

  if (bad.id === 'mislabelled') {
    check(
      '  naming the field the save did not have',
      staleWarnings.some((w) => /guildId/.test(w)),
      staleWarnings.slice(0, 2).join(' | '),
    )
  }

  await staleCtx.close()
}

// ---------------------------------------------------------------------------
// A boot that never finishes must still offer a way out (§7.4).
//
// The guards above stop the saves we know about. This is the case for the ones
// we do not: whatever wedges the boot, the player must not need the browser's
// site-data settings to get their game back. A PWA makes that worse than it
// sounds -- the broken shell is precached, so it comes back on every reload.
//
// Wedged here with a real IndexedDB stall rather than a stub: a connection is
// held open and every open is sent through a version bump on that same
// database, which cannot start while the connection is held. The request
// blocks for ever and nothing throws, so no error handling can rescue it --
// which is the point.
// ---------------------------------------------------------------------------
console.log('\n  -- a boot that never finishes --')

const wedgedCtx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
})
const wedged = await wedgedCtx.newPage()
/* eslint-disable no-undef */
await wedged.addInitScript(() => {
  const holder = indexedDB.open('wedge', 1)
  holder.onsuccess = () => {
    // Kept in a global so nothing garbage-collects the connection shut.
    window.__heldOpen = holder.result
  }
  const nativeOpen = IDBFactory.prototype.open
  indexedDB.open = function () {
    return nativeOpen.call(this, 'wedge', 2)
  }
})
/* eslint-enable no-undef */
await wedged.goto(base, { waitUntil: 'domcontentloaded' })

check('the boot screen holds while it waits', await wedged.isVisible('.boot__line'))

let offeredWayOut = true
try {
  // Comfortably past the patience window in App.tsx.
  await wedged.waitForSelector('.boot__stuck', { timeout: 15_000 })
} catch {
  offeredWayOut = false
}
check(
  'a boot that hangs offers a way out of itself rather than waiting for ever',
  offeredWayOut,
  offeredWayOut ? '' : 'the loading screen never offered anything',
)

if (offeredWayOut) {
  const ways = await wedged.$$eval('.boot__stuck .button', (els) =>
    els.map((e) => e.textContent?.trim()),
  )
  check(
    'both faults have a button: the save, and the stored copy of the game',
    ways.length === 2,
    ways.join(' · '),
  )
  const notes = await wedged.$$eval('.boot__note', (els) => els.map((e) => e.textContent?.trim()))
  check(
    'and each says what it will cost, before it is pressed',
    notes.length === 2 && /Discards the saved ship/.test(notes[0] ?? ''),
    notes.join(' | '),
  )
  await wedged.screenshot({ path: join(SHOTS, '16-stuck-boot.png'), fullPage: true })
}

await wedgedCtx.close()

// ---------------------------------------------------------------------------
// Offline catch-up (§7.2, §7.4) -- the whole point of M0.
//
// Emulate the clock so real wall-time can jump while the app is closed. The
// ship must keep running: burn down the battery, shed loads on its own, and
// have a story to tell when the desk comes back.
// ---------------------------------------------------------------------------
console.log('\n  -- offline catch-up --')

const T0 = Date.UTC(2200, 5, 1, 12, 0, 0)
const away = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
await away.clock.install({ time: new Date(T0) })

const p1 = await away.newPage()
await p1.goto(base, { waitUntil: 'networkidle' })
await p1.waitForSelector('.ship')

// Bring the engines up, then walk away with the ship in deficit.
await p1.click('.deck:nth-child(7) .deck__head')
await p1.waitForSelector('.deck.is-open .parts')
await p1.click('.deck.is-open .part .switch')
await p1.waitForTimeout(200)
check('deficit set before leaving', Number.parseFloat((await p1.textContent('.status__net')) ?? '') < 0)
await p1.close()

// Twelve real minutes away = six game days at 720x (§7.1).
await away.clock.fastForward('00:12:00')

const p2 = await away.newPage()
const awayErrors = []
p2.on('pageerror', (e) => awayErrors.push(String(e)))
await p2.goto(base, { waitUntil: 'networkidle' })
await p2.waitForSelector('.ship')

const reportVisible = await p2.isVisible('.away')
check('return screen appears after an absence (§7.4)', reportVisible)

if (reportVisible) {
  const lede = await p2.textContent('.away__lede')
  // Real time away and game time aboard are different units and both matter:
  // at 720x twelve minutes off the desk is six days on the ship.
  check(
    'return screen states how long you were gone, in both clocks',
    /(minutes|hours) off the desk/.test(lede ?? '') && /\d+d aboard/.test(lede ?? ''),
    lede?.trim() ?? '',
  )

  const first = await p2.textContent('.away__entry')
  check('worst news leads the digest', /Brownout/.test(first ?? ''), first?.trim() ?? '')

  await p2.screenshot({ path: join(SHOTS, '04-away-report.png') })
  await p2.click('.away .button')
}

const clockAfter = await p2.textContent('.status__clock')
check('the ship kept running while closed', /^D[5-7] /.test(clockAfter ?? ''), clockAfter ?? '')

const alarms = await p2.$$eval('.status__alarms li', (els) => els.map((e) => e.textContent))
check(
  'the ship shed loads on its own authority',
  alarms.some((a) => a?.includes('Brownout')),
  alarms.join(' | '),
)

const netAfterAway = await p2.textContent('.status__net')
check(
  'shedding restored a positive balance -- unattended, without help',
  netAfterAway?.startsWith('+') === true,
  netAfterAway ?? '',
)

await p2.screenshot({ path: join(SHOTS, '05-after-brownout.png'), fullPage: true })

// The recovery panel has to say what happened and what pressing the button
// would cost, or it is a warning the player cannot act on.
const recoverText = (await p2.textContent('.recover')) ?? ''
check(
  'the brownout panel names what the ship switched off',
  /switched off/.test(recoverText) && /NTR Preheat/.test(recoverText),
  recoverText.slice(0, 90).replace(/\s+/g, ' '),
)
check(
  'and prices restoring it, in kW, before the player commits',
  /\d+\.\d kW/.test(recoverText) && /short/.test(recoverText),
  (recoverText.match(/[-\d.]+ kW/g) ?? []).join(' | '),
)
await (await p2.$('.recover')).screenshot({ path: join(SHOTS, '05b-brownout-panel.png') })

// Recovering has to be a decision, not a freebie.
await p2.click('.recover .button')
await p2.waitForTimeout(200)
check(
  'restoring shed loads puts the ship straight back into deficit',
  Number.parseFloat((await p2.textContent('.status__net')) ?? '') < 0,
  (await p2.textContent('.status__net')) ?? '',
)

check('no errors during catch-up', awayErrors.length === 0, awayErrors.slice(0, 2).join(' | '))

// ---------------------------------------------------------------------------
// A run, flown and settled (TR-17 to TR-21) -- the milestone end to end.
//
// The Gateway-to-Tranquillity crossing is five game days, which at 720x is ten
// real minutes -- the point of the multiplier. Same trick as the catch-up
// pass: cast off, walk away, and come back to a berthed ship with closed books.
// ---------------------------------------------------------------------------
console.log('\n  -- a run, flown and settled --')

const voyageCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
await voyageCtx.clock.install({ time: new Date(Date.UTC(2200, 7, 1, 9, 0, 0)) })

const v1 = await voyageCtx.newPage()
const voyageErrors = []
v1.on('pageerror', (e) => voyageErrors.push(String(e)))
await v1.goto(base, { waitUntil: 'networkidle' })
await v1.waitForSelector('.ship')

await v1.click('.tabs__btn:has-text("Mission")')
await v1.waitForSelector('.offer')
await tap(v1, '.offer:first-child .offer__accept')
await v1.waitForSelector('.option__go')

// Cheapest flyable trajectory: the first option that is not blocked.
await tap(v1, '.option:not(.is-blocked) .option__go')
await v1.waitForSelector('.voyage__track')
// The fill is zero-width at t=0, so ask the meter what it reads rather than
// whether a bar of no width happens to be visible.
check(
  'casting off puts the ship under way',
  (await v1.getAttribute('.voyage__track', 'aria-valuenow')) === '0',
  (await v1.getAttribute('.voyage__track', 'aria-valuenow')) ?? '',
)

const legs = await v1.textContent('.voyage__legs')
check('and names both ends of the crossing', /→/.test(legs ?? ''), legs?.trim() ?? '')

// The same route strip the run was chosen from, now carrying the ship.
check('the route strip follows the ship under way', await v1.isVisible('.route__ship-mark'))
const flownLabel = await v1.getAttribute('.route', 'aria-label')
check(
  'and states how much of it has been flown',
  /per cent flown/.test(flownLabel ?? ''),
  flownLabel ?? '',
)

// --- the bar says where the ship is, and the panel says what it is doing ----
const placeUnderway = await v1.textContent('.berth__place')
check(
  'the status bar says the ship is under way, and between where',
  /→/.test(placeUnderway ?? ''),
  placeUnderway?.trim() ?? '',
)
// The fill has zero width at nought per cent, so ask the meter rather than
// the bar: a progress track that is legitimately empty is still present.
const flownPct = await v1.getAttribute('.berth__track', 'aria-valuenow')
check(
  'and shows how far along it is',
  flownPct !== null && Number(flownPct) >= 0,
  `${flownPct}% flown`,
)

const phase = await v1.textContent('.telem__phase')
const speed = await v1.textContent('.telem__speed')
check('the crossing states its phase', Boolean(phase), `${phase?.trim()} at ${speed?.trim()}`)
check(
  'and a real speed, not a placeholder',
  Number.parseFloat(speed ?? '') > 0.05,
  speed?.trim() ?? '',
)

// The chart, with a ship on it. Berthed it reads her berth's orbital motion;
// under way it has to name where she is going and when she gets there (§5.1).
await tap(v1, '.tabs__btn:has-text("Chart")')
await v1.waitForSelector('.telemetry')
const underWayTelem = await v1.$$eval('.telemetry__row', (els) =>
  els.map((e) => e.textContent?.replace(/\s+/g, ' ').trim()),
)
check(
  'the chart names the berth being flown to, and when she gets there',
  /^Course\S.*arrival burn in \d+ [hd]/.test(underWayTelem[2] ?? ''),
  underWayTelem[2] ?? '',
)
check(
  'and the ship glyph is turned to her heading rather than pointing up',
  /rotate\(-?\d/.test((await v1.getAttribute('.chart__ship-mark', 'transform')) ?? ''),
  (await v1.getAttribute('.chart__ship-mark', 'transform')) ?? '',
)
await tap(v1, '.tabs__btn:has-text("Mission")')
await v1.waitForSelector('.telem__burns')

const burnRows = await v1.$$eval('.telem__burns li strong', (els) =>
  els.map((e) => e.textContent?.trim()),
)
check(
  'both burns are stated with their duration and their g (§3.4)',
  burnRows.length === 2 && burnRows.every((r) => /km\/s · \d+ min · \d\.\d\d g/.test(r ?? '')),
  burnRows.join(' | '),
)

await v1.screenshot({ path: join(SHOTS, '14-under-way.png'), fullPage: true })
await v1.close()

// Long enough for the ten-minute crossing to complete while the app is shut.
await voyageCtx.clock.fastForward('00:15:00')

const v2 = await voyageCtx.newPage()
v2.on('pageerror', (e) => voyageErrors.push(String(e)))
await v2.goto(base, { waitUntil: 'networkidle' })
await v2.waitForSelector('.ship')
if (await v2.isVisible('.away')) await v2.click('.away .button')

await v2.click('.tabs__btn:has-text("Mission")')
await v2.waitForSelector('.settle__list')

const berth = await v2.textContent('.berth__name')
check('the ship arrived and is berthed at the far end', /Tranquillity/.test(berth ?? ''), berth?.trim() ?? '')

const settleRows = await v2.$$('.settle__row:not(.settle__row--head)')
check(
  'the settlement is shown line by line, not as one number',
  settleRows.length === 5,
  `${settleRows.length} lines`,
)

const overUnder = await v2.$$eval('.settle__row.is-under, .settle__row.is-over', (els) => els.length)
check('every line reads as under or over its allowance', overUnder === settleRows.length, `${overUnder}`)

const totals = await v2.$$eval('.settle__totals li span', (els) => els.map((e) => e.textContent))
check(
  'payment and allowance are settled separately, then totalled',
  totals.length === 3 && /worth/.test(totals[2] ?? ''),
  totals.join(' · '),
)

check(
  'the settlement says it was priced where the ship arrived (TR-19)',
  /where the ship actually arrived/.test((await v2.textContent('.settle .panel__note')) ?? ''),
)

// TR-21: however the run went, the desk can take the next job.
check('and the board is open again', (await v2.$$('.offer__accept')).length > 0)
check('no errors flying the run', voyageErrors.length === 0, voyageErrors.slice(0, 2).join(' | '))

await v2.screenshot({ path: join(SHOTS, '15-settled.png'), fullPage: true })

// ---------------------------------------------------------------------------
// --- the ship screen scrolls smoothly (§8.1) -------------------------------
//
// The cross-section is the screen the player spends most of their time on and
// it is the most expensive thing the game draws: seven deck schematics, sixty
// filtered elements, a real gaussian shadow pass under each deck. A filter that
// shares a layer with the page is re-rasterised whenever that layer repaints,
// and scrolling repaints continuously -- so the drawing was being paid for
// again on every scrolled pixel.
//
// Measured rather than asserted, because this is exactly the kind of cost that
// comes back silently the next time a glow is added. The control run on a plain
// text screen calibrates the machine, so the check means "the ship screen is no
// harder to scroll than the log", not "this runner is fast".
console.log('\n  -- scrolling the ship screen --')

const perfCtx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
})
const perf = await perfCtx.newPage()
const cdp = await perfCtx.newCDPSession(perf)
// A mid-range phone against a developer machine, near enough. High enough that
// a real regression is unmissable, low enough that a slow runner still passes.
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 })
await perf.goto(base, { waitUntil: 'networkidle' })
await perf.waitForSelector('.ship')
await perf.waitForTimeout(600)

/** Drag a screen a page and a half and count the frames that took too long. */
/* The body of page.evaluate runs in the browser, not in Node -- so its globals
   are the page's, which is why eslint cannot see them here. */
/* eslint-disable no-undef */
async function dropped(page) {
  return page.evaluate(async () => {
    const gaps = []
    let last = performance.now()
    let going = true
    const loop = () => {
      const now = performance.now()
      gaps.push(now - last)
      last = now
      if (going) requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
    for (let i = 0; i < 60; i++) {
      window.scrollBy(0, 22)
      await new Promise((r) => requestAnimationFrame(r))
    }
    going = false
    gaps.shift() // the first gap spans the setup, not a scroll
    // 25 ms is a frame and a half at 60 Hz: long enough to be a visible hitch.
    return gaps.filter((g) => g > 25).length
  })
}
/* eslint-enable no-undef */

const shipDrops = await dropped(perf)
await perf.click('.tabs__btn:has-text("Log")')
await perf.waitForSelector('.log')
await perf.evaluate(() => globalThis.scrollTo(0, 0))
await perf.waitForTimeout(400)
const controlDrops = await dropped(perf)

check(
  'the ship screen scrolls without dropping frames (§8.1)',
  // Before the deck drawings were given their own compositing layer this was
  // 8 against a control of 1 at this throttle, and 24 against 1 at ten times.
  shipDrops <= Math.max(5, controlDrops + 4),
  `${shipDrops} dropped in 60 frames, against ${controlDrops} on a plain text screen`,
)

await perfCtx.close()

await browser.close()
server.close()

const failed = checks.filter((c) => !c.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
console.log(`screenshots in ${SHOTS}\n`)
process.exit(failed.length === 0 ? 0 : 1)
