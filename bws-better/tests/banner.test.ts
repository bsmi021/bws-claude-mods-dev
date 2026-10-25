import { test, expect, describe } from 'claude-code/testing'
import { banner, BANNER_COLS, bannerSpec, reviewPills, stepPills } from '../hooks/banner'
import { textWidth } from '../hooks/kit/raster'

const fromB64 = (s: string) => {
  const bin = atob(s)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Uint32Array(bytes.buffer)
}

// The text a row of cells shows.
const rowText = (words: Uint32Array, row: number) => {
  let s = ''
  for (let c = 0; c < BANNER_COLS; c++) {
    const cp = words[(row * BANNER_COLS + c) * 3]!
    s += cp === 0x2580 ? ' ' : String.fromCharCode(cp)
  }
  return s
}

describe('the banner', () => {
  test('steps: done green, current gold, failed red, the rest dim', () => {
    expect(stepPills(2).map(p => p.tone)).toEqual(['done', 'done', 'now', 'todo'])
    expect(stepPills(0, true).map(p => p.tone)).toEqual(['bad', 'todo', 'todo', 'todo'])
  })

  test('every pill label fits its pill whole', () => {
    for (const pills of [stepPills(1), reviewPills(1234, 5678, 12)]) {
      const w = Math.floor((BANNER_COLS - (pills.length - 1)) / pills.length)
      for (const p of pills) expect(textWidth(p.label)).toBeLessThanOrEqual(w)
    }
  })

  test('cells: title on row 1, pills on row 4, auto on the right of the title', () => {
    const b = banner(stepPills(1), true)
    expect(b.rows).toBe(6)
    const words = fromB64(b.cells)
    expect(words.length).toBe(BANNER_COLS * 6 * 3)
    expect(rowText(words, 1)).toMatch(/^ PROMPT UPGRADE +AUTO ON +$/)
    const pills = rowText(words, 4)
    for (const label of ['1 Prompt', '2 Questions', '3 Rewrite', '4 Review']) expect(pills).toContain(label)
    expect(b.alt).toBe('PROMPT UPGRADE · AUTO ON · 1 Prompt · [2 Questions] · 3 Rewrite · 4 Review')
  })

  test('no pills: the title bar alone, three rows', () => {
    const b = banner([], false)
    expect(b.rows).toBe(3)
    expect(fromB64(b.cells).length).toBe(BANNER_COLS * 3 * 3)
    expect(bannerSpec([], false).spec.blocks.length).toBe(1)
  })

  test('svg: banner-shaped, labels escaped, alt as its title', () => {
    const b = banner(reviewPills(3, 40, 2), false)
    expect(b.svg).toMatch(/^<svg [^>]*width="560" height="120"/)
    expect(b.svg).toContain('3 &gt; 40 words')
    expect(b.svg).toContain('<title>PROMPT UPGRADE · 3 &gt; 40 words · 2 details added · Ready to run</title>')
  })
})
