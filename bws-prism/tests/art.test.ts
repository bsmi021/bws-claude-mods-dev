import { describe, expect, test } from 'claude-code/testing'
import { CHROME_ROWS, fit, gradient, LEVELS, PALETTES, pixels, ramp, rasterFrame, SCENES } from '../hooks/art'
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
