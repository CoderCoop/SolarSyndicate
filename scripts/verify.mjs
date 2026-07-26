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

await page.click('.deck.is-open .part:has-text("CO2 Scrubber") .button')
await page.waitForTimeout(300)
check('ordering work marks the part', await page.isVisible('.part__ordered'))

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

check('the work order appears with an owner and a duration', await page.isVisible('.orders'))
const eta = await page.textContent('.order__eta')
check('the job has an honest completion estimate', /to go$/.test(eta?.trim() ?? ''), eta?.trim() ?? '')
const hand = await page.textContent('.order__hand')
check('a named crew member has the job', /has it$/.test(hand?.trim() ?? ''), hand?.trim() ?? '')

await page.screenshot({ path: join(SHOTS, '06-crew.png'), fullPage: true })

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
check('no console or page errors', errors.length === 0, errors.slice(0, 3).join(' | '))

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

// Six real hours away = six game days at 24x (§7.1).
await away.clock.fastForward('06:00:00')

const p2 = await away.newPage()
const awayErrors = []
p2.on('pageerror', (e) => awayErrors.push(String(e)))
await p2.goto(base, { waitUntil: 'networkidle' })
await p2.waitForSelector('.ship')

const reportVisible = await p2.isVisible('.away')
check('return screen appears after an absence (§7.4)', reportVisible)

if (reportVisible) {
  const lede = await p2.textContent('.away__lede')
  check('return screen states how long you were gone', /hours off the desk/.test(lede ?? ''), lede?.trim() ?? '')

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

// Recovering has to be a decision, not a freebie.
await p2.click('.recover .button')
await p2.waitForTimeout(200)
check(
  'restoring shed loads puts the ship straight back into deficit',
  Number.parseFloat((await p2.textContent('.status__net')) ?? '') < 0,
  (await p2.textContent('.status__net')) ?? '',
)

check('no errors during catch-up', awayErrors.length === 0, awayErrors.slice(0, 2).join(' | '))

await browser.close()
server.close()

const failed = checks.filter((c) => !c.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
console.log(`screenshots in ${SHOTS}\n`)
process.exit(failed.length === 0 ? 0 : 1)
