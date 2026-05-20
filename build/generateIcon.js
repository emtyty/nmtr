'use strict'

// Generates build/icon.ico from the same procedural {N} logo used at runtime
// (src/main/utils/logoIcon.ts). Run as `node build/generateIcon.js` — wired
// into `prebuild` so electron-builder always finds the file.
//
// ICO format: ICONDIR header + N × ICONDIRENTRY + N × image payload.
// Each payload is a 32bpp BITMAPINFOHEADER + BGRA bottom-up bitmap + 1-bit
// AND mask (we leave the AND mask all zeros — alpha channel handles
// transparency on Vista+).

const fs = require('fs')
const path = require('path')

const LBRACE = [
  [0, 1, 1],
  [0, 1, 0],
  [1, 1, 0],
  [0, 1, 0],
  [0, 1, 1]
]

const N_GLYPH = [
  [1, 0, 0, 1],
  [1, 1, 0, 1],
  [1, 0, 1, 1],
  [1, 0, 0, 1],
  [1, 0, 0, 1]
]

// Emerald #34d399 — matches createLogoIcon
const FG_R = 0x34
const FG_G = 0xd3
const FG_B = 0x99

function renderRGBA(size) {
  const buf = Buffer.alloc(size * size * 4, 0)
  const s = Math.max(1, Math.floor(size / 8))
  const startY = Math.floor((size - 5 * s) / 2)

  const setPixel = (x, y) => {
    if (x < 0 || x >= size || y < 0 || y >= size) return
    const idx = (y * size + x) * 4
    buf[idx]     = FG_R
    buf[idx + 1] = FG_G
    buf[idx + 2] = FG_B
    buf[idx + 3] = 0xff
  }

  const drawGlyph = (glyph, gx0) => {
    for (let gy = 0; gy < glyph.length; gy++) {
      for (let gx = 0; gx < glyph[gy].length; gx++) {
        if (!glyph[gy][gx]) continue
        for (let dy = 0; dy < s; dy++) {
          for (let dx = 0; dx < s; dx++) {
            setPixel(gx0 + gx * s + dx, startY + gy * s + dy)
          }
        }
      }
    }
  }

  drawGlyph(LBRACE, 0)
  drawGlyph(N_GLYPH, (3 + 1) * s)
  return buf
}

function buildBmpPayload(size) {
  const rgba = renderRGBA(size)

  // Convert RGBA top-down → BGRA bottom-up (BMP storage order)
  const bgra = Buffer.alloc(rgba.length)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const srcIdx = ((size - 1 - y) * size + x) * 4
      const dstIdx = (y * size + x) * 4
      bgra[dstIdx]     = rgba[srcIdx + 2] // B
      bgra[dstIdx + 1] = rgba[srcIdx + 1] // G
      bgra[dstIdx + 2] = rgba[srcIdx]     // R
      bgra[dstIdx + 3] = rgba[srcIdx + 3] // A
    }
  }

  // BITMAPINFOHEADER (40 bytes). NOTE: inside an ICO, biHeight is twice the
  // bitmap height because the height encompasses both the XOR colour plane
  // and the AND mask plane.
  const bi = Buffer.alloc(40)
  bi.writeUInt32LE(40, 0)        // biSize
  bi.writeInt32LE(size, 4)       // biWidth
  bi.writeInt32LE(size * 2, 8)   // biHeight (XOR + AND)
  bi.writeUInt16LE(1, 12)        // biPlanes
  bi.writeUInt16LE(32, 14)       // biBitCount
  // Remaining fields (compression, sizeImage, etc.) all zero.

  // AND mask: 1 bit per pixel, each row padded to a 4-byte boundary.
  const andRowBytes = Math.ceil(size / 32) * 4
  const andMask = Buffer.alloc(andRowBytes * size, 0)

  return Buffer.concat([bi, bgra, andMask])
}

function buildIco(sizes) {
  const payloads = sizes.map((s) => ({ size: s, data: buildBmpPayload(s) }))

  const ICONDIR_SIZE = 6
  const ENTRY_SIZE = 16

  const header = Buffer.alloc(ICONDIR_SIZE)
  header.writeUInt16LE(0, 0)              // reserved
  header.writeUInt16LE(1, 2)              // type 1 = ICO
  header.writeUInt16LE(payloads.length, 4)

  const entries = Buffer.alloc(payloads.length * ENTRY_SIZE)
  let offset = ICONDIR_SIZE + payloads.length * ENTRY_SIZE
  payloads.forEach(({ size, data }, i) => {
    const base = i * ENTRY_SIZE
    // 256x256 is encoded as 0 in the width/height byte
    entries[base + 0] = size === 256 ? 0 : size
    entries[base + 1] = size === 256 ? 0 : size
    entries[base + 2] = 0   // bColorCount
    entries[base + 3] = 0   // bReserved
    entries.writeUInt16LE(1, base + 4)            // wPlanes
    entries.writeUInt16LE(32, base + 6)           // wBitCount
    entries.writeUInt32LE(data.length, base + 8)  // dwBytesInRes
    entries.writeUInt32LE(offset, base + 12)      // dwImageOffset
    offset += data.length
  })

  return Buffer.concat([header, entries, ...payloads.map((p) => p.data)])
}

const SIZES = [16, 24, 32, 48, 64, 128, 256]
const ico = buildIco(SIZES)
const outPath = path.join(__dirname, 'icon.ico')
fs.writeFileSync(outPath, ico)
console.log(
  `  • generateIcon: wrote ${path.relative(process.cwd(), outPath)} ` +
  `(${(ico.length / 1024).toFixed(1)} KB, sizes: ${SIZES.join(', ')})`
)
