/**
 * Capture real screenshots of the game for the project website.
 *
 * These are the actual running build, not mockups: the site's before/after
 * pair is one ship tended and the same ship left alone, produced by driving
 * the real app with an emulated clock.
 *
 *   node scripts/capture-shots.mjs
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { chromium } from 'playwright'

const ROOT = resolve(import.meta.dirname, '..')
const DIST = join(ROOT, 'apps/web/dist')
const OUT = join(ROOT, 'docs/img')
const MOUNT = '/play/'

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
mkdirSync(OUT, { recursive: true })

const server = createServer(async (req, res) => {
  const url = (req.url ?? '/').split('?')[0]
  if (!url.startsWith(MOUNT)) return void res.writeHead(404).end('not found')
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

function findChromium() {
  const dir = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
  if (!existsSync(dir)) return undefined
  const build = readdirSync(dir).filter((d) => d.startsWith('chromium-')).sort().pop()
  if (!build) return undefined
  const exe = join(dir, build, 'chrome-linux', 'chrome')
  return existsSync(exe) ? exe : undefined
}

const executablePath = findChromium()
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })

/** One fresh context per shot, so each starts from an empty save. */
async function shot(name, drive, { height = 1500 } = {}) {
  const context = await browser.newContext({
    viewport: { width: 420, height },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  await context.clock.install({ time: new Date(Date.UTC(2200, 5, 1, 8, 0, 0)) })
  const page = await context.newPage()
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.waitForSelector('.ship')
  // A shot that simulates going away closes its page and returns the one it
  // came back to; shoot whichever page is current.
  const current = (await drive(page, context)) ?? page
  await current.screenshot({ path: join(OUT, `${name}.png`) })
  await context.close()
  console.log(`  wrote docs/img/${name}.png`)
}

console.log('Capturing…')

// The ship as delivered: everything nominal, power in surplus.
await shot('ship-tended', async (page) => {
  await page.click('.deck:nth-child(3) .deck__head')
  await page.waitForSelector('.deck.is-open .parts')
})

// The same ship left alone with the engines drawing more than it makes.
await shot('ship-neglected', async (page, context) => {
  await page.click('.deck:nth-child(7) .deck__head')
  await page.waitForSelector('.deck.is-open .parts')
  await page.click('.deck.is-open .part .switch')
  await page.waitForTimeout(300)
  await page.close()

  await context.clock.fastForward('08:00:00')
  const back = await context.newPage()
  await back.goto(base, { waitUntil: 'networkidle' })
  await back.waitForSelector('.ship')
  if (await back.isVisible('.away')) await back.click('.away .button')
  await back.waitForTimeout(300)
  return back
})

// What the ship tells you on your return.
await shot('away-report', async (page, context) => {
  await page.click('.deck:nth-child(7) .deck__head')
  await page.waitForSelector('.deck.is-open .parts')
  await page.click('.deck.is-open .part .switch')
  await page.waitForTimeout(300)
  await page.close()

  await context.clock.fastForward('08:00:00')
  const back = await context.newPage()
  await back.goto(base, { waitUntil: 'networkidle' })
  await back.waitForSelector('.away')
  return back
}, { height: 900 })

// The roster: four people on a watch bill.
await shot('crew', async (page) => {
  await page.click('.tabs__btn:has-text("Crew")')
  await page.waitForSelector('.roster')
})

// The ship as rooms, for the changelog: interiors drawn from content, crew
// standing in the room they are actually in, at human scale.
await shot('ship-rooms', async (page) => {
  await page.waitForSelector('.schema .glyph')
}, { height: 1800 })

// A machine opened in place, showing both health axes.
await shot('station-card', async (page) => {
  const el = await page.waitForSelector('.deck:nth-child(6) .schema .hit')
  await el.evaluate((e) => e.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(150)
  await el.click()
  await page.waitForSelector('.station')
}, { height: 1100 })

await browser.close()
server.close()
console.log('Done.')
