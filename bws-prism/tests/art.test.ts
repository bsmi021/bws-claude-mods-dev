import { describe, expect, test } from 'claude-code/testing'
import { CHROME_ROWS, fit, gradient, imageFrame, isImageRefused, LEVELS, MAX_IMAGE_PIXELS, PALETTES, pixels, ramp, rasterFrame, SCENES, sharpness } from '../hooks/art'
import { sceneSvg } from '../hooks/vector'

const LOOKS = SCENES.flatMap(scene => PALETTES.map(palette => ({ scene, palette })))
const neon = { scene: 'plasma', palette: PALETTES[0] } as const

describe('frames', () => {
  test('a frame is exactly columns * rows * 12 bytes of base64', async () => {
    const f = rasterFrame(neon, 1, 40, 12)
    expect([f.columns, f.rows]).toEqual([40, 12])
    expect(atob(f.cells).length).toBe(40 * 12 * 12)
  })

  test('every scene and palette moves, and fills the frame with more than one color', async () => {
    for (const look of LOOKS) {
      const a = pixels(look, 1, 48, 16)
      const b = pixels(look, 2, 48, 16)
      expect(new Set(a).size).toBeGreaterThan(4)
      expect(a.some((v, i) => v !== b[i])).toBe(true)
    }
  })

  test('the same look, time and size draw the same frame', async () => {
    expect(rasterFrame(neon, 3, 30, 10).cells).toBe(rasterFrame(neon, 3, 30, 10).cells)
  })

  test('the smallest pane draws without a hole', async () => {
    for (const look of LOOKS) expect(pixels(look, 0, 16, 4).every(v => v !== undefined)).toBe(true)
  })

  test('the widest frame costs under one tick of the 20 fps clock', async () => {
    const start = Date.now()
    for (let i = 0; i < 10; i++) rasterFrame({ ...neon, scene: 'lava' }, i, 160, 48)
    expect((Date.now() - start) / 10).toBeLessThan(50)
  })

  test('the scene shades stay inside the 1024 color pairs Raster paints at once', async () => {
    expect(LEVELS * LEVELS).toBeLessThanOrEqual(1024)
    expect(new Set(ramp(PALETTES[0].stops)).size).toBeLessThanOrEqual(LEVELS)
  })
})

describe('image frames', () => {
  test('RGBA bytes match the stated size, opaque, inside the limits', async () => {
    const f = imageFrame(neon, 1, 40, 12)
    const bytes = atob(f.rgba)
    expect(bytes.length).toBe(f.width * f.height * 4)
    expect(bytes.charCodeAt(3)).toBe(255)
    expect(f.width * f.height).toBeLessThanOrEqual(MAX_IMAGE_PIXELS)
    expect(bytes.length).toBeLessThanOrEqual(2 * 1024 * 1024)
  })

  test('a small pane is sharper, up to 4x; the largest stays bounded', async () => {
    expect(sharpness(16, 4)).toBe(4)
    expect(sharpness(160, 48)).toBe(2)
    expect(160 * 2 * 48 * 2 * 2).toBeLessThanOrEqual(MAX_IMAGE_PIXELS)
  })

  test('sharper frames use finer color than a Raster', async () => {
    const coarse = new Set(pixels(neon, 2, 40, 12)).size
    const fine = new Set(pixels(neon, 2, 40, 12, 3, ramp(PALETTES[0].stops, 256))).size
    expect(fine).toBeGreaterThan(coarse)
  })

  test('the largest Image frame computes inside its 100 ms tick', async () => {
    const start = Date.now()
    for (let i = 0; i < 5; i++) imageFrame({ ...neon, scene: 'lava' }, i, 160, 48)
    expect((Date.now() - start) / 5).toBeLessThan(100)
  })

  test('only a refusal about the alt text gives up on Image', async () => {
    expect(isImageRefused('this Image draws its alt here')).toBe(true)
    expect(isImageRefused('nothing of bws-prism is mounted at prism')).toBe(false)
  })
})

describe('layout', () => {
  test('a dock takes its height less the chrome; inline is capped', async () => {
    expect(fit(60, 40, 'dock')).toEqual({ columns: 60, rows: 40 - CHROME_ROWS })
    expect(fit(100, 40, 'inline').rows).toBe(14)
  })

  test('sizes stay inside what Raster accepts', async () => {
    expect(fit(1, 1, 'dock')).toEqual({ columns: 16, rows: 4 })
    expect(fit(900, 900, 'dock')).toEqual({ columns: 160, rows: 48 })
  })

  test('gradient gives each character a color', async () => {
    const runs = gradient('PRISM', ramp(PALETTES[1].stops))
    expect(runs.map(r => r.char).join('')).toBe('PRISM')
    expect(runs.every(r => /^#[0-9a-f]{6}$/.test(r.color))).toBe(true)
  })
})

describe('svg', () => {
  test('every look is one bounded document that animates, with no script', async () => {
    for (const look of LOOKS) {
      const s = sceneSvg(look)
      expect(s.startsWith('<svg ')).toBe(true)
      expect(s.endsWith('</svg>')).toBe(true)
      expect(s.length).toBeLessThanOrEqual(131072)
      expect(s).toContain('<animate')
      expect(s).not.toMatch(/<script|\son\w+=/i)
      expect(s).not.toMatch(/NaN|undefined/)
    }
  })
})
