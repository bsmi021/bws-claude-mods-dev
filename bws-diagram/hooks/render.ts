// A laid-out diagram drawn with the kit's raster.ts (FR-DG-02): a `Spec` of blocks, then `rasterize` for the
// terminal's Raster or `toSvg` for the remote surfaces' Svg; plus the text outline every surface can show. Pure: no `$`.
import type { Diagram, NodeKind } from '../types'
import { printable, rasterize, toBase64, toSvg, type Block, type Spec } from './kit/raster'
import { NODE_ROWS, fitNodeWidth, wantedNodeWidth } from './draw'
import { edgeCells, gapWidths, layered, place, type Geometry, type Layered } from './layout'

export const BG = '#1b1d23'
export const EDGE = '#9ca3af'
export const COLORS: Record<NodeKind, string> = { file: '#3b82f6', new: '#10b981', step: '#f59e0b', decision: '#a855f7' }
export const SHAPE_NAMES: Record<NodeKind, string> = { file: 'square: file', new: 'rounded: new component', step: 'double: step', decision: 'oval: decision' }

const hasStep = (d: Diagram) => d.nodes.some(n => n.kind === 'step')

/** The label as it fits a node of width `w`: ASCII, cut to the node's text room (a step's inner box is narrower). */
export const fitLabel = (label: string, kind: NodeKind, w: number) => printable(label).slice(0, Math.max(1, w - (kind === 'step' ? 6 : 2)))

/** The blocks of a placed diagram, in a frame `frame` cells wide and `frameRows` rows tall (rows are 2 pixels). */
export function blocks(g: Geometry, mode: 'raster' | 'svg', frame: { columns: number; rows: number }): Block[] {
  const W = frame.columns, H = frame.rows * 2
  const at = (x: number, y: number, w: number, h: number) => ({ x: (x / W) * 100, y: (y / H) * 100, w: (w / W) * 100, h: (h / H) * 100 })
  const out: Block[] = []
  const tall = NODE_ROWS * 2
  for (const n of g.nodes) {
    const y = n.row * 2
    const c = COLORS[n.kind]
    const text = fitLabel(n.label, n.kind, g.nodeW)
    if (n.kind === 'step') {
      // A terminal pixel is a half cell, so the frames are a pixel; in the Svg they are thinner, so the label has room.
      const t = mode === 'raster' ? 1 : 0.5
      out.push({ ...at(n.x, y, g.nodeW, tall), fill: c, shape: 'rect' })
      out.push({ ...at(n.x + 1, y + t, g.nodeW - 2, tall - 2 * t), fill: BG, shape: 'rect' })
      out.push({ ...at(n.x + 2, y + 2 * t, g.nodeW - 4, tall - 4 * t), fill: c, text, shape: 'rect' })
    } else {
      out.push({ ...at(n.x, y, g.nodeW, tall), fill: c, text, shape: n.kind === 'file' ? 'rect' : n.kind === 'new' ? 'pill' : 'circle' })
    }
  }
  if (mode === 'raster') {
    // One-cell ASCII blocks: a fill in the background colour under each glyph, the glyph in the edge colour.
    for (const [k, ch] of edgeCells(g)) out.push({ ...at(k % g.columns, Math.floor(k / g.columns) * 2, 1, 2), fill: BG, ink: EDGE, text: ch, shape: 'rect' })
  } else {
    for (const s of g.segs) {
      if (s.kind === 'h') out.push({ ...at(Math.min(s.x0, s.x1), s.row * 2 + 0.8, Math.abs(s.x1 - s.x0) + 1, 0.4), fill: EDGE, shape: 'rect' })
      else out.push({ ...at(s.x + 0.4, Math.min(s.r0, s.r1) * 2 + 1, 0.2, Math.abs(s.r1 - s.r0) * 2), fill: EDGE, shape: 'rect' })
    }
    // The head is a small square at the arrow's end: the kit's Svg text sits 4 units in, off a one-cell glyph.
    for (const h of g.heads) out.push({ ...at(h.x + 0.1, h.row * 2 + 0.5, 0.8, 1), fill: EDGE, shape: 'rect' })
  }
  return out
}

export type RasterOut = { columns: number; rows: number; cells: string }

/** The Raster for a pane `columns` wide; null when even the narrowest nodes do not fit (draw the outline then). */
export function rasterOf(d: Diagram, columns: number, l: Layered = layered(d)): RasterOut | null {
  const w = fitNodeWidth(columns, l.layers.length, gapWidths(l), wantedNodeWidth(d.nodes.map(n => printable(n.label)), hasStep(d)))
  if (w === null) return null
  const g = place(d, l, w)
  const spec: Spec = { bg: BG, font: 'mono', palette: [], blocks: blocks(g, 'raster', g) }
  return { columns: g.columns, rows: g.rows, cells: toBase64(new Uint8Array(rasterize(spec, g).buffer)) }
}

/** The 16:10 frame (in cells, a cell 1 x 2 pixels) that holds `g` unstretched in the kit's 320 x 200 view box. */
export function svgFrame(g: { columns: number; rows: number }): { columns: number; rows: number } {
  const ratio = g.columns / (g.rows * 2)
  return ratio < 1.6 ? { columns: Math.ceil(g.rows * 3.2), rows: g.rows } : { columns: g.columns, rows: Math.ceil(g.columns / 3.2) }
}

/**
 * The kit's Svg text is 0.55 of a block's height, 7 to 22 units, in a 320-unit view box, so a label is wider there
 * than in cells. The Svg node width is the narrowest from the terminal's up to 60 cells whose longest label fits.
 */
export function svgNodeWidth(d: Diagram, l: Layered): number {
  const longest = d.nodes.reduce((n, x) => Math.max(n, printable(x.label).length), 0)
  const start = wantedNodeWidth(d.nodes.map(n => printable(n.label)), hasStep(d))
  for (let w = start; w < 60; w++) {
    const u = 320 / svgFrame(place(d, l, w)).columns
    const font = Math.max(7, Math.min(22, 0.55 * NODE_ROWS * 2 * u))
    if (0.62 * font * longest + 8 <= (w - (hasStep(d) ? 4 : 0)) * u) return w
  }
  return 60
}

export type SvgOut = { source: string; alt: string; width: number }

/**
 * The Svg for the remote surfaces: the same blocks through the kit's `toSvg`, edges as thin lines, in a 16:10 frame;
 * an outer view box crops the frame's unused part, so nothing is stretched.
 */
export function svgOf(d: Diagram, l: Layered = layered(d)): SvgOut {
  const g = place(d, l, svgNodeWidth(d, l))
  const frame = svgFrame(g)
  const spec: Spec = { bg: BG, font: 'mono', palette: [], blocks: blocks(g, 'svg', frame) }
  const w = (320 * g.columns) / frame.columns, h = (200 * g.rows) / frame.rows
  const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}">${toSvg(spec, ' x="0" y="0" width="320" height="200"')}</svg>`
  return { source, alt: outline(d, l).join('; '), width: Math.round(Math.min(900, Math.max(320, g.columns * 6))) }
}

const MARK: Record<NodeKind, (s: string) => string> = { file: s => `[${s}]`, new: s => `(${s})`, step: s => `[[${s}]]`, decision: s => `<${s}>` }

/** The text form: one line per layer (nodes in their shape's brackets), then every edge. */
export function outline(d: Diagram, l: Layered = layered(d)): string[] {
  const byId = new Map(d.nodes.map(n => [n.id, n]))
  const lines = l.layers.map((slots, i) => `${i + 1}: ${slots.flatMap(s => (byId.has(s) ? [MARK[byId.get(s)!.kind](byId.get(s)!.label)] : [])).join('  ')}`)
  return [...lines, ...edgeLines(d, true)]
}

/** `A -> B: label` per edge; only the labelled ones unless `all`. */
export function edgeLines(d: Diagram, all: boolean): string[] {
  const name = new Map(d.nodes.map(n => [n.id, n.label]))
  return d.edges.filter(e => all || e.label).map(e => `${name.get(e.from)} -> ${name.get(e.to)}${e.label ? `: ${e.label}` : ''}`)
}
