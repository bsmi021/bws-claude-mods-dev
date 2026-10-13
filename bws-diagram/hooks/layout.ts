// The layering (FR-DG-02): which layer each node sits in, by dependency, top to bottom as render.ts draws it. Pure: no `$`.
//
// Layers by longest path from the sources (cycles broken by reversing the edges a depth-first walk finds going back);
// an edge that spans more than one layer passes through dummy slots, so it never crosses a node; the order inside a
// layer follows the barycentre of the neighbours, a few sweeps each way.
import type { Diagram } from '../types'

export type Chain = { from: string; to: string; slots: string[]; isReversed: boolean }
export type Layered = { layers: string[][]; chains: Chain[] }

const DUMMY = '\u0000d'
export const isDummy = (slot: string) => slot.startsWith(DUMMY)

/** The layers (node ids and dummy slots, in drawing order) and every edge as its chain of slots, top to bottom. */
export function layered(d: Diagram): Layered {
  const ids = d.nodes.map(n => n.id)
  const out = new Map<string, string[]>(ids.map(id => [id, []]))
  for (const e of d.edges) out.get(e.from)!.push(e.to)

  // Back edges: the ones a depth-first walk (in node order) meets pointing at a node still on its stack.
  const state = new Map<string, 'open' | 'done'>()
  const back = new Set<string>()
  const walk = (v: string) => {
    state.set(v, 'open')
    for (const w of out.get(v)!) {
      const s = state.get(w)
      if (s === 'open') back.add(`${v}\u0000${w}`)
      else if (s === undefined) walk(w)
    }
    state.set(v, 'done')
  }
  for (const id of ids) if (!state.has(id)) walk(id)

  const dag = d.edges.map(e => (back.has(`${e.from}\u0000${e.to}`) ? { from: e.to, to: e.from, isReversed: true, e } : { from: e.from, to: e.to, isReversed: false, e }))

  // Longest path from the sources; the edges are few, so relax until nothing moves.
  const layer = new Map<string, number>(ids.map(id => [id, 0]))
  for (let pass = 0; pass < ids.length; pass++) {
    let moved = false
    for (const x of dag) {
      const want = layer.get(x.from)! + 1
      if (layer.get(x.to)! < want) {
        layer.set(x.to, want)
        moved = true
      }
    }
    if (!moved) break
  }
  const count = Math.max(...layer.values()) + 1
  const layers: string[][] = Array.from({ length: count }, () => [])
  for (const id of ids) layers[layer.get(id)!]!.push(id)

  // A reversed edge that runs alongside a forward one (A -> F and F -> A) shares its slots: one line, a head each end.
  let dummies = 0
  const shared = new Map<string, string[]>()
  const chains: Chain[] = dag.map(x => {
    const key = `${x.from}\u0000${x.to}`
    let slots = shared.get(key)
    if (!slots) {
      slots = [x.from]
      for (let l = layer.get(x.from)! + 1; l < layer.get(x.to)!; l++) {
        const slot = `${DUMMY}${dummies++}`
        layers[l]!.push(slot)
        slots.push(slot)
      }
      slots.push(x.to)
      shared.set(key, slots)
    }
    return { from: x.e.from, to: x.e.to, slots, isReversed: x.isReversed }
  })

  // Barycentre ordering: down by the left neighbours, up by the right ones.
  const left = new Map<string, string[]>(), right = new Map<string, string[]>()
  for (const c of chains) {
    for (let i = 0; i + 1 < c.slots.length; i++) {
      const a = c.slots[i]!, b = c.slots[i + 1]!
      right.set(a, [...(right.get(a) ?? []), b])
      left.set(b, [...(left.get(b) ?? []), a])
    }
  }
  const pos = new Map<string, number>()
  const index = () => layers.forEach(l => l.forEach((s, i) => pos.set(s, i)))
  index()
  const sweep = (l: number, by: Map<string, string[]>) => {
    const key = (s: string) => {
      const ns = by.get(s) ?? []
      return ns.length ? ns.reduce((t, n) => t + pos.get(n)!, 0) / ns.length : pos.get(s)!
    }
    const keyed = layers[l]!.map((s, i) => ({ s, k: key(s), i }))
    // Nodes first, the dummy slots after them: a long edge runs below the layer's nodes, not between them.
    keyed.sort((a, b) => Number(isDummy(a.s)) - Number(isDummy(b.s)) || a.k - b.k || a.i - b.i)
    layers[l] = keyed.map(x => x.s)
    layers[l]!.forEach((s, i) => pos.set(s, i))
  }
  for (let it = 0; it < 4; it++) {
    for (let l = 1; l < count; l++) sweep(l, left)
    for (let l = count - 2; l >= 0; l--) sweep(l, right)
  }
  index()
  return { layers, chains }
}
