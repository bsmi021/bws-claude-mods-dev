// A laid-out diagram drawn as plain text rows (FR-DG-02), top to bottom, in thin box-drawing characters: a box per
// node (its corners say what it is), `▼ label` where an edge arrives, a legend and a footer. Every surface draws the
// same rows, so there is no Raster or Svg and nothing to fall back from. Pure: no `$`.
import type { Diagram, DiagramNode, NodeKind } from '../types'
import { printable } from './kit/raster'
import { isDummy, layered, type Layered } from './layout'

export const INK = '#22b8cf'

const NODE_H = 3 // top border, label, bottom border
const MARGIN = 1
const SPACE = 2 // columns between two slots of a layer
export const MIN_W = 8
export const MAX_W = 26

// Direction bits per cell; the glyph is chosen once every segment is in, so crossings and joins come out right.
const U = 1, D = 2, L = 4, R = 8
const JOIN = [' ', '│', '│', '│', '─', '┘', '┐', '┤', '─', '└', '┌', '├', '─', '┴', '┬', '┼']

type Frame = { tl: string; tr: string; bl: string; br: string; h: string; v: string }
const FRAMES: Record<NodeKind, Frame> = {
  file: { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' },
  new: { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' },
  step: { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║' },
  decision: { tl: '╱', tr: '╲', bl: '╲', br: '╱', h: '─', v: '│' },
}

export type Drawn = { rows: string[]; needed: number; isCut: boolean }

type Hop = { a: string; b: string; gap: number; down: boolean; up: boolean; label: string; upLabel: string; xa: number; xb: number; track: number }

/**
 * The rows for a pane `columns` wide. Nodes shrink (down to MIN_W, labels cut) until the widest layer fits; if even
 * that overflows, the rows are drawn anyway, `isCut` is true and `needed` says how many columns they want.
 */
export function textRows(d: Diagram, columns: number, l: Layered = layered(d)): Drawn {
  const labelOf = (n: DiagramNode) => (n.id === d.now ? '▶ ' : '') + printable(n.label)
  const byId = new Map(d.nodes.map(n => [n.id, n]))
  const longest = d.nodes.reduce((m, n) => Math.max(m, labelOf(n).length), 0)
  const widthAt = (w: number) => Math.max(...l.layers.map(s => MARGIN * 2 + s.reduce((t, v) => t + (isDummy(v) ? 1 : w), 0) + SPACE * (s.length - 1)))
  let W = Math.max(MIN_W, Math.min(MAX_W, longest + 4))
  while (W > MIN_W && widthAt(W) > columns) W--
  const wOf = (s: string) => (isDummy(s) ? 1 : W)

  // x of each slot: packed left, then pulled toward the centre of its neighbours a few sweeps each way.
  const x = new Map<string, number>()
  for (const slots of l.layers) {
    let cx = MARGIN
    for (const s of slots) {
      x.set(s, cx)
      cx += wOf(s) + SPACE
    }
  }
  const packed = new Map(x)
  const cen = (s: string) => x.get(s)! + Math.floor(wOf(s) / 2)
  const above = new Map<string, string[]>(), below = new Map<string, string[]>()
  for (const c of l.chains) {
    for (let i = 0; i + 1 < c.slots.length; i++) {
      const a = c.slots[i]!, b = c.slots[i + 1]!
      below.set(a, [...(below.get(a) ?? []), b])
      above.set(b, [...(above.get(b) ?? []), a])
    }
  }
  const settle = (slots: string[], toward: Map<string, string[]>) => {
    let cx = MARGIN
    for (const s of slots) {
      const ns = toward.get(s) ?? []
      const want = ns.length ? Math.round(ns.reduce((t, n) => t + cen(n), 0) / ns.length) - Math.floor(wOf(s) / 2) : x.get(s)!
      const nx = Math.max(want, cx)
      x.set(s, nx)
      cx = nx + wOf(s) + SPACE
    }
  }
  for (let it = 0; it < 3; it++) {
    for (let i = 1; i < l.layers.length; i++) settle(l.layers[i]!, above)
    for (let i = l.layers.length - 2; i >= 0; i--) settle(l.layers[i]!, below)
  }
  const shift = Math.min(...x.values()) - MARGIN
  for (const [s, v] of x) x.set(s, v - shift)
  const span = () => Math.max(...[...x].map(([s, v]) => v + wOf(s))) + MARGIN
  if (span() > columns && widthAt(W) <= columns) for (const [s, v] of packed) x.set(s, v)
  const needed = Math.max(span(), widthAt(W))
  const isCut = needed > columns

  // Every edge as hops between neighbouring layers; a reversed edge keeps its line and gets its head at the upper end.
  const layerOf = new Map<string, number>()
  l.layers.forEach((slots, i) => slots.forEach(s => layerOf.set(s, i)))
  const labelFor = (from: string, to: string) => d.edges.find(e => e.from === from && e.to === to)?.label ?? ''
  const hops = new Map<string, Hop>()
  for (const c of l.chains) {
    for (let i = 0; i + 1 < c.slots.length; i++) {
      const a = c.slots[i]!, b = c.slots[i + 1]!
      const key = `${a}|${b}`
      let h = hops.get(key)
      if (!h) {
        h = { a, b, gap: layerOf.get(a)!, down: false, up: false, label: '', upLabel: '', xa: 0, xb: 0, track: 0 }
        hops.set(key, h)
      }
      if (c.isReversed) {
        if (i === 0) {
          h.up = true
          h.upLabel = labelFor(c.from, c.to)
        }
      } else if (i + 2 === c.slots.length) {
        h.down = true
        h.label = labelFor(c.from, c.to)
      }
    }
  }
  const all = [...hops.values()]

  // Ports: where each edge leaves a node's bottom and arrives at its top, spread when several share a side.
  const port = (s: string, k: number, j: number) => {
    const x0 = x.get(s)!
    const mid = x0 + Math.floor(wOf(s) / 2)
    if (isDummy(s) || k === 1) return mid
    const lo = x0 + 2, hi = x0 + wOf(s) - 3
    return hi <= lo ? mid : lo + Math.round((j * (hi - lo)) / (k - 1))
  }
  for (const s of x.keys()) {
    const outs = all.filter(h => h.a === s).sort((p, q) => cen(p.b) - cen(q.b))
    outs.forEach((h, j) => (h.xa = port(s, outs.length, j)))
    const ins = all.filter(h => h.b === s).sort((p, q) => cen(p.a) - cen(q.a))
    ins.forEach((h, j) => (h.xb = port(s, ins.length, j)))
  }

  // One horizontal track row per bending hop that would overlap another in its gap.
  const gaps = Math.max(0, l.layers.length - 1)
  const tracks: number[] = Array.from({ length: gaps }, () => 0)
  for (let g = 0; g < gaps; g++) {
    const rows: [number, number][][] = []
    const bending = all.filter(h => h.gap === g && h.xa !== h.xb).sort((p, q) => Math.min(p.xa, p.xb) - Math.min(q.xa, q.xb) || p.xa - q.xa)
    for (const h of bending) {
      const lo = Math.min(h.xa, h.xb), hi = Math.max(h.xa, h.xb)
      let t = rows.findIndex(r => r.every(([a, b]) => hi < a || b < lo))
      if (t < 0) {
        rows.push([])
        t = rows.length - 1
      }
      rows[t]!.push([lo, hi])
      h.track = t + 1
    }
    tracks[g] = rows.length
  }
  const top: number[] = []
  let y = 0
  l.layers.forEach((_, i) => {
    top.push(y)
    y += NODE_H + (i < gaps ? 2 + tracks[i]! : 0)
  })
  const height = y
  const width = Math.max(needed, columns)
  const mask: number[][] = Array.from({ length: height }, () => Array.from({ length: width }, () => 0))
  const text: (string | null)[][] = Array.from({ length: height }, () => Array.from({ length: width }, () => null))
  const link = (cx: number, cy: number, m: number) => {
    const row = mask[cy]
    if (row && cx >= 0 && cx < width) row[cx] = row[cx]! | m
  }
  const put = (cx: number, cy: number, ch: string) => {
    const row = text[cy]
    if (row && cx >= 0 && cx < width) row[cx] = ch
  }

  // Boxes, and a straight line down through each dummy slot's band.
  l.layers.forEach((slots, li) => {
    for (const s of slots) {
      const x0 = x.get(s)!, y0 = top[li]!
      const n = byId.get(s)
      if (!n) {
        for (let r = 0; r < NODE_H; r++) link(x0, y0 + r, U | D)
        continue
      }
      const f = FRAMES[n.kind]
      const inner = W - 2
      const room = W - 4
      let label = labelOf(n)
      if (label.length > room) label = `${label.slice(0, Math.max(0, room - 1))}…`
      const left = Math.floor((inner - label.length) / 2)
      const mid = ' '.repeat(left) + label + ' '.repeat(inner - left - label.length)
      const rows = [f.tl + f.h.repeat(inner) + f.tr, f.v + mid + f.v, f.bl + f.h.repeat(inner) + f.br]
      rows.forEach((line, r) => Array.from(line).forEach((ch, c) => put(x0 + c, y0 + r, ch)))
    }
  })

  // Lines between the layers, then the heads and labels on top.
  const tags: { x: number; y: number; text: string }[] = []
  for (const h of all) {
    const base = top[h.gap]! + NODE_H
    const arrow = base + tracks[h.gap]! + 1
    const first = isDummy(h.a) ? U | D : D
    if (h.xa === h.xb) {
      for (let r = base; r < arrow; r++) link(h.xa, r, r === base ? first : U | D)
    } else {
      const t = base + h.track
      const right = h.xb > h.xa
      for (let r = base; r < t; r++) link(h.xa, r, r === base ? first : U | D)
      link(h.xa, t, U | (right ? R : L))
      for (let c = Math.min(h.xa, h.xb) + 1; c < Math.max(h.xa, h.xb); c++) link(c, t, L | R)
      link(h.xb, t, D | (right ? L : R))
      for (let r = t + 1; r < arrow; r++) link(h.xb, r, U | D)
    }
    if (h.down) {
      put(h.xb, arrow, '▼')
      if (h.label) tags.push({ x: h.xb, y: arrow, text: printable(h.label) })
    } else link(h.xb, arrow, U | D)
    if (h.up) {
      put(h.xa, base, '▲')
      if (h.upLabel) tags.push({ x: h.xa, y: base, text: printable(h.upLabel) })
    }
  }
  const isFree = (cx: number, cy: number) => text[cy]![cx] === null && mask[cy]![cx] === 0
  for (const t of tags.sort((p, q) => p.y - q.y || p.x - q.x)) {
    let end = t.x + 2
    while (end < width && isFree(end, t.y)) end++
    const room = (end < width ? end - 1 : end) - (t.x + 2)
    if (room < 1) continue
    const s = t.text.length > room ? `${t.text.slice(0, room - 1)}…` : t.text
    Array.from(s).forEach((ch, i) => put(t.x + 2 + i, t.y, ch))
  }
  const rows = Array.from({ length: height }, (_, r) => Array.from({ length: width }, (_, c) => text[r]![c] ?? JOIN[mask[r]![c]!]!).join('').trimEnd())
  return { rows, needed, isCut }
}

/** The legend under the heading; `▶ now` only when the diagram marks a node. */
export function legendOf(d: Diagram): string {
  return `┌ file   ╭ component   ╔ step   ╱ decision${d.now ? '   ▶ now' : ''}`
}

const MARK: Record<NodeKind, (s: string) => string> = { file: s => `[${s}]`, new: s => `(${s})`, step: s => `[[${s}]]`, decision: s => `<${s}>` }

/** The text form for a headless run: one line per layer (nodes in their shape's brackets), then every edge. */
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
