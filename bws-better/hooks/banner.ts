// bws-better: the gold banner at the top of the Better tab. A gold title bar, then a row of pills: the four steps, or
// on the review the word counts and what was added. One picture: Raster cells on the terminal (bws-kit/raster.ts),
// a banner-shaped SVG on Desktop and phones, and its alt text where neither draws. Pure: no `$`.
import { rasterize, toBase64 } from './kit/raster'
import type { Block, Spec } from './kit/raster'
import { GOLD, GREEN, INK, MUTED, ON_GOLD, TITLE } from './lib'

// The mod cannot learn the dashboard's width, so the banner is narrow enough for any usable one.
export const BANNER_COLS = 56
const NAVY = '#0D1117'
const PANEL = '#161B22'
const DONE = '#12261C'
const RED = '#F85149'

export type PillTone = 'done' | 'now' | 'todo' | 'bad' | 'stat' | 'good'
export type Pill = { label: string; tone: PillTone }

const STYLE: Record<PillTone, { fill: string; ink: string }> = {
  done: { fill: DONE, ink: GREEN },
  now: { fill: GOLD, ink: ON_GOLD },
  todo: { fill: PANEL, ink: MUTED },
  bad: { fill: RED, ink: '#FFFFFF' },
  stat: { fill: PANEL, ink: GOLD },
  good: { fill: DONE, ink: GREEN },
}

export const STEP_LABELS = ['1 Prompt', '2 Questions', '3 Rewrite', '4 Review'] as const

// The four steps: finished ones green, the current one gold (red when it failed), the rest dim.
export function stepPills(current: number, isFailed = false): Pill[] {
  return STEP_LABELS.map((label, i) => ({ label, tone: i < current ? 'done' : i === current ? (isFailed ? 'bad' : 'now') : 'todo' }))
}

// Three pills of 18 cells: "words" goes when big counts need the room.
export function reviewPills(before: number, after: number, added: number): Pill[] {
  const counts = `${before} > ${after}`
  return [
    { label: counts.length <= 10 ? `${counts} words` : counts, tone: 'stat' },
    { label: `${added} ${added === 1 ? 'detail' : 'details'} added`, tone: 'stat' },
    { label: 'Ready to run', tone: 'good' },
  ]
}

export type Banner = { alt: string; columns: number; rows: number; cells: string; svg: string }

// The banner's blocks in percent: the title bar on pixel rows 1-5, the pills on 7-11, so each has a half-row edge.
export function bannerSpec(pills: readonly Pill[], isAuto: boolean): { spec: Spec; rows: number } {
  const rows = pills.length > 0 ? 6 : 3
  const px = 100 / (rows * 2)
  const cell = 100 / BANNER_COLS
  const blocks: Block[] = [{ x: 0, y: px, w: 100, h: 4 * px, fill: GOLD, ink: ON_GOLD, text: TITLE, shape: 'rect' }]
  if (isAuto) blocks.push({ x: (BANNER_COLS - 11) * cell, y: 2 * px, w: 10 * cell, h: 2 * px, fill: NAVY, ink: GOLD, text: 'AUTO ON', shape: 'rect' })
  const n = pills.length
  const w = Math.floor((BANNER_COLS - (n - 1)) / Math.max(1, n))
  pills.forEach((p, i) => {
    const s = STYLE[p.tone]
    blocks.push({ x: i * (w + 1) * cell, y: 7 * px, w: w * cell, h: 4 * px, fill: s.fill, ink: s.ink, text: p.label, shape: 'pill' })
  })
  return { spec: { bg: NAVY, font: 'sans', palette: [], blocks }, rows }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// The same blocks as an SVG with a terminal cell's shape (10 by 20), so it keeps the banner's proportions.
export function bannerSvg(spec: Spec, rows: number, alt: string): string {
  const W = BANNER_COLS * 10
  const H = rows * 20
  const parts = [`<rect width="${W}" height="${H}" rx="6" fill="${spec.bg}"/>`]
  for (const b of spec.blocks) {
    const x = (b.x / 100) * W
    const y = (b.y / 100) * H
    const w = (b.w / 100) * W
    const h = (b.h / 100) * H
    const isPill = b.shape === 'pill'
    parts.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${isPill ? (h / 2).toFixed(1) : 4}" fill="${b.fill}"/>`)
    if (b.text) {
      const isTitle = b.text === TITLE
      const size = isTitle ? 20 : 15
      const tx = isPill ? x + w / 2 : x + 14
      parts.push(
        `<text x="${tx.toFixed(1)}" y="${(y + h / 2).toFixed(1)}" fill="${b.ink ?? INK}" font-size="${size}"${isTitle ? ' font-weight="700" letter-spacing="2"' : ' font-weight="600"'} dominant-baseline="central"${isPill ? ' text-anchor="middle"' : ''}>${esc(b.text)}</text>`,
      )
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui, Segoe UI, sans-serif"><title>${esc(alt)}</title>${parts.join('')}</svg>`
}

export function banner(pills: readonly Pill[], isAuto: boolean): Banner {
  const { spec, rows } = bannerSpec(pills, isAuto)
  const alt = [TITLE, ...(isAuto ? ['AUTO ON'] : []), ...pills.map(p => (p.tone === 'now' || p.tone === 'bad' ? `[${p.label}]` : p.label))].join(' · ')
  const words = rasterize(spec, { columns: BANNER_COLS, rows })
  return { alt, columns: BANNER_COLS, rows, cells: toBase64(new Uint8Array(words.buffer)), svg: bannerSvg(spec, rows, alt) }
}
