/**
 * Generate PWA icons. No dependencies -- a minimal PNG encoder over zlib,
 * which ships with Node.
 *
 * The mark is the ship's cross-section reduced to its essentials: a nose, a
 * stack of decks, and an engine bell, in blueprint cyan on deep space.
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, '../public')

const BG = [0x0b, 0x10, 0x15]
const CYAN = [0x4f, 0xd1, 0xd9]
const AMBER = [0xe8, 0xa3, 0x3d]

function crc32(buf) {
  let table = crc32.table
  if (!table) {
    table = crc32.table = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c
    }
  }
  let crc = -1
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff]
  return (crc ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** rgb: (x, y) => [r, g, b] */
function encodePng(size, rgb) {
  const raw = Buffer.alloc(size * (size * 3 + 1))
  let p = 0
  for (let y = 0; y < size; y++) {
    raw[p++] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = rgb(x, y)
      raw[p++] = r
      raw[p++] = g
      raw[p++] = b
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type: truecolour
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** The ship mark, in normalised 0..1 coordinates. */
function shade(u, v) {
  const halfWidth = 0.19

  // Engine plume, below the bell.
  if (v > 0.80 && v < 0.95) {
    const spread = halfWidth * (0.75 + (v - 0.8) * 3)
    if (Math.abs(u - 0.5) < spread && (v * 37) % 2 < 1.15) return AMBER
  }

  // Nose cone: widens from the tip down to the first deck.
  if (v >= 0.13 && v < 0.28) {
    const t = (v - 0.13) / 0.15
    if (Math.abs(u - 0.5) < halfWidth * t) return CYAN
    return BG
  }

  // Deck stack: hull walls plus deck floors.
  if (v >= 0.28 && v < 0.72) {
    const inHull = Math.abs(u - 0.5) < halfWidth
    if (!inHull) return BG
    const wall = Math.abs(Math.abs(u - 0.5) - halfWidth) < 0.022
    const floor = ((v - 0.28) * 100) % 11 < 2.4
    return wall || floor ? CYAN : BG
  }

  // Engine bell: tapers back in.
  if (v >= 0.72 && v <= 0.80) {
    const t = (v - 0.72) / 0.08
    const w = halfWidth * (1 - 0.42 * t)
    if (Math.abs(u - 0.5) < w && Math.abs(Math.abs(u - 0.5) - w) < 0.05) return CYAN
    return BG
  }

  return BG
}

function render(size) {
  // Supersample so the diagonals do not crawl.
  const ss = 3
  return encodePng(size, (x, y) => {
    let r = 0
    let g = 0
    let b = 0
    for (let sy = 0; sy < ss; sy++) {
      for (let sx = 0; sx < ss; sx++) {
        const c = shade((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size)
        r += c[0]
        g += c[1]
        b += c[2]
      }
    }
    const n = ss * ss
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)]
  })
}

mkdirSync(outDir, { recursive: true })
for (const size of [192, 512]) {
  const file = resolve(outDir, `icon-${size}.png`)
  writeFileSync(file, render(size))
  console.log(`wrote ${file}`)
}

// Matching favicon, as vector.
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#0b1015"/>
  <path d="M32 9 L44 20 L44 47 L20 47 L20 20 Z" fill="none" stroke="#4fd1d9" stroke-width="2.5"/>
  <path d="M20 27 H44 M20 34 H44 M20 41 H44" stroke="#4fd1d9" stroke-width="1.5" opacity="0.75"/>
  <path d="M24 47 L28 56 L36 56 L40 47" fill="none" stroke="#e8a33d" stroke-width="2.5"/>
</svg>
`
writeFileSync(resolve(outDir, 'favicon.svg'), favicon)
console.log('wrote favicon.svg')
