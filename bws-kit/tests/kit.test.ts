import { describe, expect, test } from 'claude-code/testing'

import { contrast, galleryCells, layout, printable, rasterize, textWidth, toBase64, toSvg } from '../raster'
import type { Spec } from '../raster'
import { handoffFolder, handoffPrompt, joinPath, keptName, startPrompt, transcriptPrompt } from '../runfolder'
import { isShown, makeSummary, parseSummary } from '../summary'
import { transcriptText, words } from '../transcript'

const SPEC: Spec = {
  bg: '#101820',
  font: 'sans',
  palette: ['#ff0000', '#00ff00'],
  blocks: [
    { x: 0, y: 0, w: 100, h: 20, fill: '#336699', text: 'Title', shape: 'rect' },
    { x: 10, y: 40, w: 30, h: 30, fill: '#ffcc00', shape: 'circle' },
  ],
}

describe('summary atom', () => {
  test('makeSummary trims and clips; detail is optional', () => {
    expect(makeSummary('busy', '  memory   updating ')).toEqual({ state: 'busy', label: 'memory updating' })
    const s = makeSummary('ok', 'x'.repeat(100), 'y'.repeat(500))
    expect(s.label.length).toBe(40)
    expect(s.detail?.length).toBe(200)
  })
  test('parseSummary accepts the shape and rejects everything else as null', () => {
    expect(parseSummary({ state: 'warn', label: 'dream due', detail: 'x' })).toEqual({ state: 'warn', label: 'dream due', detail: 'x' })
    expect(parseSummary({ state: 'warn', label: 'dream due', extra: 1 })).toEqual({ state: 'warn', label: 'dream due' })
    for (const bad of [null, undefined, 'x', 3, [], {}, { state: 'nope', label: 'a' }, { state: 'ok' }, { state: 'ok', label: '  ' }, { state: 'ok', label: 5 }]) {
      expect(parseSummary(bad)).toBeNull()
    }
  })
  test('only a present, non-idle summary is shown', () => {
    expect(isShown(null)).toBe(false)
    expect(isShown(makeSummary('idle', 'memory'))).toBe(false)
    expect(isShown(makeSummary('busy', 'memory updating'))).toBe(true)
  })
})

describe('transcript and run folder', () => {
  test('transcriptText keeps the newest rows under the cap and lists tool calls', () => {
    const rows = [
      { role: 'user', text: 'a'.repeat(100) },
      { role: 'assistant', text: 'ok', toolUses: [{ tool: 'Bash', input: { command: 'ls' }, text: 'file' }] },
    ]
    const t = transcriptText(rows)
    expect(t).toContain('USER: ')
    expect(t).toContain('[Bash {"command":"ls"}] -> file')
    expect(transcriptText(rows, 80)).not.toContain('USER')
    expect(transcriptText([])).toBe('')
    expect(words(' a  b\nc ')).toBe(3)
  })
  test('folder and kept names are dated; prompts name the folder', () => {
    const now = Date.parse('2026-10-02T14:30:00')
    expect(handoffFolder(now)).toBe('runs/2026-10-02-handoff')
    expect(keptName(now)).toBe('HANDOFF.20261002-1430.md')
    expect(joinPath('C:/p/', 'x')).toBe('C:/p/x')
    expect(handoffPrompt('runs/f', 'the tests')).toContain('Focus the handoff on: the tests.')
    expect(handoffPrompt('runs/f', '')).not.toContain('Focus the handoff')
    expect(startPrompt('runs/f')).toContain('runs/f/HANDOFF.md')
    expect(transcriptPrompt('T', 'runs/f', '')).toContain('<transcript>\nT\n</transcript>')
  })
})

describe('raster and svg', () => {
  test('rasterize returns [codePoint, fg, bg] words for every cell, the palette strip on the last row', () => {
    const w = rasterize(SPEC, { columns: 20, rows: 6 })
    expect(w.length).toBe(20 * 6 * 3)
    const lastRow = w.subarray(5 * 20 * 3, 6 * 20 * 3)
    expect(lastRow[0]).toBe(0x20)
    expect(lastRow[2]).toBe(0xff0000)
    expect(lastRow[19 * 3 + 2]).toBe(0x00ff00)
  })
  test('text is drawn at cell resolution; non-printable characters are dropped', () => {
    const w = rasterize({ ...SPEC, palette: [] }, { columns: 20, rows: 6 })
    const row = [...Array(20).keys()].map(c => w[c * 3]!)
    expect(String.fromCharCode(...row.filter(cp => cp >= 0x30 && cp < 0x7f))).toContain('Title')
    expect(printable('a\u00e9b\u2014c')).toBe('abc')
    expect(textWidth('ab')).toBe(4)
    expect(textWidth('a')).toBe(1)
  })
  test('toBase64 pads like the standard; contrast picks readable ink; layout refuses a too narrow gallery', () => {
    expect(toBase64(new Uint8Array([77, 97, 110]))).toBe('TWFu')
    expect(toBase64(new Uint8Array([77]))).toBe('TQ==')
    expect(contrast(0xffffff)).toBe(0x111111)
    expect(contrast(0x000000)).toBe(0xf5f5f5)
    expect(layout(3, 20)).toBeUndefined()
    expect(layout(2, 100)?.columns).toBe(40)
    const g = galleryCells([{ number: 1, label: 'A', spec: SPEC }], 60)
    expect(g?.rows).toBeGreaterThan(1)
    expect(g?.cells.length).toBeGreaterThan(0)
  })
  test('toSvg draws the blocks, the palette strip and escapes text', () => {
    const svg = toSvg({ ...SPEC, blocks: [{ x: 0, y: 0, w: 50, h: 20, fill: '#336699', text: 'a<b&c', shape: 'pill' }] })
    expect(svg).toContain('<svg')
    expect(svg).toContain('a&lt;b&amp;c')
    expect(svg).toContain('fill="#ff0000"')
  })
})
