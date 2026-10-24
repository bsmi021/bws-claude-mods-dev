import { describe, expect, test } from 'claude-code/testing'
import { fileUrl, openArgv, refsOf } from '../hooks/links'
import { boxOf, decodePng, fromBase64, rasterCells, svgOf } from '../hooks/png'
import { PNG_2X2, PNG_32 } from './pngs'

const px = (img: { width: number; data: Uint8Array }, x: number, y: number) => [...img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)]

describe('PNG', () => {
  test('a 2 × 2 RGB picture decodes pixel for pixel', () => {
    const img = decodePng(fromBase64(PNG_2X2))
    expect(img?.width).toBe(2)
    expect(img === null ? [] : [px(img, 0, 0), px(img, 1, 0), px(img, 0, 1), px(img, 1, 1)]).toEqual([
      [255, 0, 0, 255],
      [0, 255, 0, 255],
      [0, 0, 255, 255],
      [255, 255, 255, 255],
    ])
  })

  test('a gradient with dynamic Huffman blocks decodes, and draws as ▀ cells and an SVG', () => {
    const img = decodePng(fromBase64(PNG_32))
    expect(img === null ? [] : [px(img, 0, 0), px(img, 31, 31), px(img, 5, 9)]).toEqual([
      [0, 0, 128, 255],
      [248, 248, 128, 255],
      [40, 72, 128, 255],
    ])
    if (img === null) return
    const box = boxOf(img, 72, 22)
    expect(box).toEqual({ columns: 32, rows: 16 })
    const words = new Uint32Array(fromBase64(rasterCells(img, box.columns, box.rows)).buffer)
    expect(words.length).toBe(32 * 16 * 3)
    expect(words[0]).toBe(0x2580)
    expect(svgOf(img, PNG_32, 'g.png')).toContain('data:image/png;base64,')
  })

  test('not a PNG, or a broken one: null, never a throw', () => {
    expect(decodePng(new Uint8Array([1, 2, 3]))).toBeNull()
    const broken = fromBase64(PNG_32).slice(0, 200)
    expect(decodePng(broken)).toBeNull()
  })
})

describe('links', () => {
  const text = 'See `docs/guide.md`, C:\\proj\\pics\\dot.png and https://example.com/a?b=1. Code:\n```\nnot/this.md\n```'
  test('URLs and paths outside code fences, relative ones taken from the folder', () => {
    const refs = refsOf(text, 'C:\\proj')
    expect(refs.map(r => [r.written, r.target, r.isImage])).toEqual([
      ['https://example.com/a?b=1', 'https://example.com/a?b=1', false],
      ['docs/guide.md', 'C:/proj/docs/guide.md', false],
      ['C:\\proj\\pics\\dot.png', 'C:/proj/pics/dot.png', true],
    ])
  })

  test('file URLs encode spaces; opening refuses what is not a web or file URL', () => {
    expect(fileUrl('C:/My Docs/a b.md')).toBe('file:///C:/My%20Docs/a%20b.md')
    expect(openArgv('javascript:alert(1)', true, false)).toBeNull()
    expect(openArgv('https://example.com', true, false)?.slice(0, 4)).toEqual(['powershell', '-NoProfile', '-NonInteractive', '-EncodedCommand'])
    expect(openArgv('https://example.com', false, true)).toEqual(['open', 'https://example.com'])
  })
})
