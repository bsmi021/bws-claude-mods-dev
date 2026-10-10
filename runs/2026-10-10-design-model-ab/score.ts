// Scores results.json: metrics per reply, and each gallery drawn as the terminal draws it (Raster cells -> HTML spans).
// Run: npx -y tsx score.ts   (from this folder)
import { readFileSync, writeFileSync } from 'node:fs'
import { galleryCells, galleryFromReply, layout, printable } from '../../bws-design-picker/hooks/lib'

const HERE = 'C:/Projects/bws.mods.claude-code/runs/2026-10-10-design-model-ab'
const COLUMNS = 170 // the test window's width: 40x10 cards, what Brian saw live

type Q = { header: string; question: string; options: { label: string; description: string }[] }
type Row = { question: number; rep: number; model: string; ms: number; isAnswered: boolean; reason?: string; text?: string; usage?: { output_tokens?: number } }
type Block = { x: number; y: number; w: number; h: number; fill?: string; text?: string; ink?: string; shape: string }
type Spec = { bg: string; palette: string[]; blocks: Block[] }

const data = JSON.parse(readFileSync(`${HERE}/receipts/results.json`, 'utf8')) as { questions: Q[]; rows: Row[] }

// The renderer's box and text placement, replicated (hooks/lib.ts rasterize).
const box = (b: Block, W: number, H: number) => {
  const x0 = Math.round((b.x / 100) * W)
  const y0 = Math.round((b.y / 100) * H)
  const x1 = Math.max(x0 + 1, Math.min(W, Math.round(((b.x + b.w) / 100) * W)))
  const y1 = Math.max(y0 + 1, Math.min(H, Math.round(((b.y + b.h) / 100) * H)))
  return { x0, y0, x1, y1 }
}
const rgb = (h: string) => parseInt(h.slice(1), 16)
const lum = (c: number) => {
  const ch = [(c >> 16) & 255, (c >> 8) & 255, c & 255].map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!
}
const ratio = (a: number, b: number) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x! + 0.05) / (y! + 0.05) }

type Metrics = { specs: number; expected: number; blocks: number; textBlocks: number; clipped: number; overlaps: number; short: number; lowContrast: number; unusedPalette: number }

function score(spec: Spec, size: { columns: number; rows: number }): Omit<Metrics, 'specs' | 'expected'> {
  const W = size.columns
  const bodyRows = Math.max(1, size.rows - (spec.palette.length ? 1 : 0))
  const H = bodyRows * 2
  const placed: { row: number; a: number; b: number }[] = []
  let clipped = 0, short = 0, lowContrast = 0, overlaps = 0, textBlocks = 0
  for (const b of spec.blocks) {
    if (!b.text) continue
    textBlocks++
    const text = printable(b.text)
    const { x0, y0, x1, y1 } = box(b, W, H)
    const room = Math.max(1, x1 - x0 - (x1 - x0 >= 4 ? 2 : 0))
    if (text.length > room) clipped++
    if (b.h < 12) short++
    const t = text.slice(0, room)
    const row = Math.min(bodyRows - 1, Math.floor((y0 + y1 - 1) / 4))
    const start = b.shape !== 'rect' ? x0 + Math.floor((x1 - x0 - t.length) / 2) : x0 + (x1 - x0 >= 4 ? 1 : 0)
    for (const p of placed) if (p.row === row && start < p.b && p.a < start + t.length) overlaps++
    placed.push({ row, a: start, b: start + t.length })
    if (b.ink && ratio(rgb(b.ink), rgb(b.fill ?? spec.bg)) < 3) lowContrast++
  }
  const used = new Set([spec.bg, ...spec.blocks.flatMap(b => [b.fill, b.ink])].filter(Boolean))
  const unusedPalette = spec.palette.filter(c => !used.has(c)).length
  return { blocks: spec.blocks.length, textBlocks, clipped, overlaps, short, lowContrast, unusedPalette }
}

const out = data.rows.map(row => {
  const q = data.questions[row.question]!
  const base = { question: row.question, rep: row.rep, model: row.model, ms: row.ms, outputTokens: row.usage?.output_tokens ?? null }
  if (!row.isAnswered || !row.text) return { ...base, error: row.reason ?? 'no text' }
  const g = galleryFromReply(row.text, q as never)
  if (!g) return { ...base, error: 'unparseable reply' }
  const size = layout(q.options.length, COLUMNS)!
  const per = g.cards.map(c => score(c.spec as Spec, size))
  const sum = (k: keyof (typeof per)[0]) => per.reduce((n, m) => n + m[k], 0)
  const metrics: Metrics = {
    specs: g.cards.length, expected: q.options.length,
    blocks: sum('blocks'), textBlocks: sum('textBlocks'), clipped: sum('clipped'), overlaps: sum('overlaps'),
    short: sum('short'), lowContrast: sum('lowContrast'), unusedPalette: sum('unusedPalette'),
  }
  const art = galleryCells(g.cards, COLUMNS)!
  return { ...base, metrics, art }
})

// Totals per model.
const models = [...new Set(out.map(o => o.model))]
const totals = models.map(m => {
  const mine = out.filter(o => o.model === m)
  const ok = mine.filter((o): o is typeof o & { metrics: Metrics } => 'metrics' in o && !!o.metrics)
  const add = (k: keyof Metrics) => ok.reduce((n, o) => n + o.metrics[k], 0)
  const ms = mine.map(o => o.ms).sort((a, b) => a - b)
  return {
    model: m, calls: mine.length, answered: ok.length, specs: add('specs'), expected: add('expected'),
    textBlocks: add('textBlocks'), clipped: add('clipped'), overlaps: add('overlaps'), short: add('short'),
    lowContrast: add('lowContrast'), unusedPalette: add('unusedPalette'),
    medianMs: ms[Math.floor(ms.length / 2)] ?? 0, maxMs: ms.at(-1) ?? 0,
    outputTokens: mine.reduce((n, o) => n + (o.outputTokens ?? 0), 0),
  }
})

writeFileSync(`${HERE}/receipts/scored.json`, JSON.stringify({ columns: COLUMNS, questions: data.questions, totals, replies: out }, null, 2))
console.table(totals)
for (const o of out) if ('error' in o) console.log('ERROR', o.model, 'q' + o.question, 'rep' + o.rep, o.error)
