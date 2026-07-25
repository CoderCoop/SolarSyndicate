/**
 * End-to-end verification of the M0 walking skeleton.
 *
 * The unit tests prove the sim; this proves the tracer bullet actually goes
 * through all the layers -- PWA shell, React, the sim, IndexedDB persistence,
 * and back after a reload.
 *
 *   node scripts/verify-m0.mjs [--headed] [--shots <dir>]
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

const server = createServer(async (req, res) => {
  const url = (req.url ?? '/').split('?')[0]
  let file = join(DIST, url === '/' ? 'index.html' : url.slice(1))
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
const base = `http://127.0.0.1:${server.address().port}`

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

const netAfter = await page.textContent('.status__net')
check('engine preheat drives the ship into deficit', netAfter?.trim() === '-4.5 kW', netAfter ?? '')

const margin = await page.textContent('.status__row--fine span:last-child')
check('the deficit is given a deadline', /to empty$/.test(margin?.trim() ?? ''), margin?.trim() ?? '')

const logged = await page.$$eval('.log__text', (els) => els.map((e) => e.textContent))
check(
  'the order appears in the dispatch log',
  logged.some((t) => t?.includes('NTR Preheat switched on')),
)

await page.screenshot({ path: join(SHOTS, '03-deficit.png'), fullPage: true })

// --- persistence: the world survives a reload -------------------------------
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('.ship', { timeout: 10_000 })
const netReloaded = await page.textContent('.status__net')
check('state survives a reload (IndexedDB, §8.3)', netReloaded?.trim() === '-4.5 kW', netReloaded ?? '')

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
check('deficit set before leaving', (await p1.textContent('.status__net'))?.trim() === '-4.5 kW')
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

const brownout = await p2.isVisible('.status__brownout')
check('the ship shed loads on its own authority', brownout)

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
  (await p2.textContent('.status__net'))?.trim() === '-4.5 kW',
)

check('no errors during catch-up', awayErrors.length === 0, awayErrors.slice(0, 2).join(' | '))

await browser.close()
server.close()

const failed = checks.filter((c) => !c.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
console.log(`screenshots in ${SHOTS}\n`)
process.exit(failed.length === 0 ? 0 : 1)
