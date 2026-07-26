/**
 * Capture the design mockups for the changelog.
 *
 * The mockups in docs/mockups are the artefacts a direction was actually
 * chosen from, kept in the repo rather than in a chat log so the changelog can
 * show *what was rejected* alongside what shipped. This renders each phone
 * frame in them to a PNG.
 *
 *   node scripts/capture-mockups.mjs
 */
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const ROOT = resolve(import.meta.dirname, '..')
const SRC = join(ROOT, 'docs/mockups')
const OUT = join(ROOT, 'docs/img')

/**
 * Which frame of which mockup becomes which image. Explicit rather than
 * "shoot everything": the changelog references these by name, so a mockup
 * gaining a frame must not silently renumber the rest.
 */
const SHOTS = [
  { file: '003-ship-view-directions.html', selector: '.phone', index: 0, name: 'mockup-003-schematic' },
  { file: '003-ship-view-directions.html', selector: '.phone', index: 1, name: 'mockup-003-cutaway' },
  { file: '003-ship-view-directions.html', selector: '.phone', index: 2, name: 'mockup-003-flow' },
  { file: '004-rooms-flows-crew.html', selector: '.phone', index: 0, name: 'mockup-004-elevation' },
  { file: '004-rooms-flows-crew.html', selector: '.phone', index: 1, name: 'mockup-004-dimetric' },
  { file: '004-rooms-flows-crew.html', selector: '.phone', index: 2, name: 'mockup-004-station-card' },
  { file: '004-rooms-flows-crew.html', selector: '.phone', index: 3, name: 'mockup-004-flows-power' },
  { file: '004-rooms-flows-crew.html', selector: '.phone', index: 4, name: 'mockup-004-flows-water' },
  { file: '004-rooms-flows-crew.html', selector: '.phone', index: 5, name: 'mockup-004-crew' },
]

function findChromium() {
  const dir = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
  if (!existsSync(dir)) return undefined
  const build = readdirSync(dir).filter((d) => d.startsWith('chromium-')).sort().pop()
  if (!build) return undefined
  const exe = join(dir, build, 'chrome-linux', 'chrome')
  return existsSync(exe) ? exe : undefined
}

mkdirSync(OUT, { recursive: true })
const executablePath = findChromium()
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
const context = await browser.newContext({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 2 })
const page = await context.newPage()

let loaded = ''
let missing = 0

for (const { file, selector, index, name } of SHOTS) {
  const path = join(SRC, file)
  if (!existsSync(path)) {
    console.error(`  MISSING ${file}`)
    missing++
    continue
  }
  if (loaded !== file) {
    await page.goto(pathToFileURL(path).href, { waitUntil: 'load' })
    loaded = file
  }
  const frames = await page.$$(selector)
  const frame = frames[index]
  if (!frame) {
    console.error(`  MISSING ${file} ${selector}[${index}] -- only ${frames.length} present`)
    missing++
    continue
  }
  await frame.screenshot({ path: join(OUT, `${name}.png`) })
  console.log(`  wrote docs/img/${name}.png`)
}

await browser.close()

if (missing > 0) {
  console.error(`\n${missing} shot(s) could not be taken.`)
  process.exit(1)
}
console.log('Done.')
