import { nativeImage } from 'electron'

/**
 * Renders the {N} logo as a bitmap NativeImage.
 *
 * Scale formula: s = size / 8 (so 16→s=2, 32→s=4, 64→s=8).
 * Total glyph width = 8s = full icon width.
 * Glyph height = 5s, centred vertically.
 *
 * {  glyph (3 × 5 logical px):     N  glyph (4 × 5 logical px):
 *   . # #                            # . . #
 *   . # .                            # # . #
 *   # # .   ← bump left              # . # #
 *   . # .                            # . . #
 *   . # #                            # . . #
 *
 * Gap between glyphs = 1 logical pixel (= s screen pixels).
 * Layout: {(3) + gap(1) + N(4) = 8 logical px = icon width.
 */

const LBRACE: number[][] = [
  [0, 1, 1],
  [0, 1, 0],
  [1, 1, 0],
  [0, 1, 0],
  [0, 1, 1]
]

const N_GLYPH: number[][] = [
  [1, 0, 0, 1],
  [1, 1, 0, 1],
  [1, 0, 1, 1],
  [1, 0, 0, 1],
  [1, 0, 0, 1]
]

export function createLogoIcon(size: number): Electron.NativeImage {
  const buf = Buffer.alloc(size * size * 4, 0) // transparent bg

  const s = Math.max(1, Math.floor(size / 8))
  const startY = Math.floor((size - 5 * s) / 2)

  function setPixel(x: number, y: number): void {
    if (x < 0 || x >= size || y < 0 || y >= size) return
    const idx = (y * size + x) * 4
    buf[idx]     = 0x34 // R  ─┐
    buf[idx + 1] = 0xd3 // G   │ emerald #34d399
    buf[idx + 2] = 0x99 // B  ─┘
    buf[idx + 3] = 0xff // A
  }

  function drawGlyph(glyph: number[][], gx0: number): void {
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

  drawGlyph(LBRACE, 0)            // { starts at x=0
  drawGlyph(N_GLYPH, (3 + 1) * s) // N starts after 3px glyph + 1px gap

  return nativeImage.createFromBitmap(buf, { width: size, height: size })
}
