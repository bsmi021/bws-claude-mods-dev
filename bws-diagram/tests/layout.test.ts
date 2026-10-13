import { test, expect, describe } from 'claude-code/testing'
import type { Diagram } from '../types'
import { MAX_NODES, parseDiagramReply, validateDiagram } from '../hooks/spec'
import { edgeCells, gapWidths, isDummy, layered, place } from '../hooks/layout'
import { outline, edgeLines, rasterOf, svgOf, fitLabel } from '../hooks/render'
import { layoutWidth } from '../hooks/draw'

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function words(cells: string): Uint32Array {
  const clean = cells.replace(/=+$/, '')
  const bytes: number[] = []
  for (let i = 0; i < clean.length; i += 4) {
    const n = [0, 1, 2, 3].reduce((t, k) => (t << 6) | (k + i < clean.length ? B64.indexOf(clean[i + k]!) : 0), 0)
    bytes.push((n >> 16) & 255, (n >> 8) & 255, n & 255)
  }
  const len = Math.floor((clean.length * 3) / 4)
  return new Uint32Array(Uint8Array.from(bytes.slice(0, len)).buffer)
}
const rowText = (w: Uint32Array, columns: number, row: number) => String.fromCharCode(...Array.from({ length: columns }, (_, c) => w[(row * columns + c) * 3]!))

const SAMPLE: Diagram = {
  title: 'sample',
  nodes: [
    { id: 'A', label: 'Parse request', kind: 'step' },
    { id: 'B', label: 'Valid?', kind: 'decision' },
    { id: 'C', label: 'writer.ts', kind: 'file' },
    { id: 'D', label: 'ErrorPanel', kind: 'new' },
  ],
  edges: [
    { from: 'A', to: 'B' },
    { from: 'B', to: 'C', label: 'yes' },
    { from: 'B', to: 'D', label: 'no' },
  ],
}
const chain = (n: number): Diagram => ({
  title: 'chain',
  nodes: Array.from({ length: n }, (_, i) => ({ id: `n${i}`, label: `node ${i}`, kind: 'file' as const })),
  edges: Array.from({ length: n - 1 }, (_, i) => ({ from: `n${i}`, to: `n${i + 1}` })),
})

describe('FR-DG-02: the spec, validated', () => {
  test('a well-formed spec passes; labels default to the id, the title to Diagram; edges keep their labels', async () => {
    const r = validateDiagram({ nodes: [{ id: 'a', kind: 'file' }, { id: 'b', label: '  New   thing ', kind: 'new' }], edges: [{ from: 'a', to: 'b', label: 'uses' }] })
    expect(r).toEqual({ ok: true, diagram: { title: 'Diagram', nodes: [{ id: 'a', label: 'a', kind: 'file' }, { id: 'b', label: 'New thing', kind: 'new' }], edges: [{ from: 'a', to: 'b', label: 'uses' }] } })
  })

  test('refused: not an object, no nodes, over 24 nodes, an unknown kind, a repeated id, an edge to an unknown node', async () => {
    expect(validateDiagram(null).ok).toBe(false)
    expect(validateDiagram([]).ok).toBe(false)
    expect(validateDiagram({ nodes: [] })).toEqual({ ok: false, error: 'no nodes' })
    const many = Array.from({ length: MAX_NODES + 1 }, (_, i) => ({ id: `n${i}`, kind: 'file' }))
    expect(validateDiagram({ nodes: many })).toEqual({ ok: false, error: '25 nodes; at most 24' })
    expect(validateDiagram({ nodes: many.slice(0, MAX_NODES) }).ok).toBe(true)
    expect(validateDiagram({ nodes: [{ id: 'a', kind: 'box' }] })).toEqual({ ok: false, error: 'node a has kind box; use file, new, step or decision' })
    expect(validateDiagram({ nodes: [{ id: 'a', kind: 'file' }, { id: 'a', kind: 'new' }] })).toEqual({ ok: false, error: 'node id a repeats' })
    expect(validateDiagram({ nodes: [{ id: 'a', kind: 'file' }], edges: [{ from: 'a', to: 'z' }] })).toEqual({ ok: false, error: 'edge 1 ends at unknown node z' })
    expect(validateDiagram({ nodes: [{ id: 'a', kind: 'file' }], edges: 'a->b' }).ok).toBe(false)
  })

  test('a self loop and a repeated edge are dropped, not refused', async () => {
    const r = validateDiagram({ nodes: [{ id: 'a', kind: 'file' }, { id: 'b', kind: 'file' }], edges: [{ from: 'a', to: 'a' }, { from: 'a', to: 'b' }, { from: 'a', to: 'b', label: 'again' }] })
    expect(r.ok && r.diagram.edges).toEqual([{ from: 'a', to: 'b' }])
  })

  test('a reply: fenced JSON, JSON inside prose, and a reply with no JSON', async () => {
    const json = JSON.stringify({ title: 'T', nodes: [{ id: 'a', label: 'A', kind: 'step' }], edges: [] })
    expect(parseDiagramReply('```json\n' + json + '\n```').ok).toBe(true)
    expect(parseDiagramReply('Here it is: ' + json + ' done.').ok).toBe(true)
    expect(parseDiagramReply('no diagram today')).toEqual({ ok: false, error: 'no JSON object in the reply' })
    expect(parseDiagramReply('{ nodes: [ }')).toEqual({ ok: false, error: 'the reply is not valid JSON' })
  })
})

describe('FR-DG-02: the layered layout, left to right by dependency', () => {
  test('a chain is one node a layer, in order', async () => {
    expect(layered(chain(3)).layers).toEqual([['n0'], ['n1'], ['n2']])
  })

  test('a fan-out shares a layer; unconnected nodes start at layer 0', async () => {
    const l = layered(SAMPLE)
    expect(l.layers.map(x => x.length)).toEqual([1, 1, 2])
    expect(l.layers[2]!.slice().sort()).toEqual(['C', 'D'])
    const lone = layered({ title: 't', nodes: [{ id: 'x', label: 'x', kind: 'file' }, { id: 'y', label: 'y', kind: 'new' }], edges: [] })
    expect(lone.layers).toEqual([['x', 'y']])
  })

  test('a long edge passes through a dummy slot, placed after the layer\'s nodes', async () => {
    const d: Diagram = { ...chain(3), edges: [...chain(3).edges, { from: 'n0', to: 'n2' }] }
    const l = layered(d)
    expect(l.layers[1]!.length).toBe(2)
    expect(l.layers[1]![0]).toBe('n1')
    expect(isDummy(l.layers[1]![1]!)).toBe(true)
    expect(l.chains.find(c => c.to === 'n2' && c.from === 'n0')!.slots.length).toBe(3)
  })

  test('a cycle is broken: the back edge is reversed and shares the forward edge\'s line', async () => {
    const d: Diagram = { title: 't', nodes: [{ id: 'a', label: 'a', kind: 'step' }, { id: 'b', label: 'b', kind: 'step' }], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a', label: 'retry' }] }
    const l = layered(d)
    expect(l.layers).toEqual([['a'], ['b']])
    const back = l.chains.find(c => c.from === 'b')!
    expect(back.isReversed).toBe(true)
    expect(back.slots).toBe(l.chains.find(c => c.from === 'a')!.slots)
    const g = place(d, l, 10)
    expect(g.heads.map(h => h.dir).sort()).toEqual(['<', '>'])
  })

  test('placement: nodes never overlap, edge cells never fall on a node, heads sit left of their target', async () => {
    const d: Diagram = { ...SAMPLE, nodes: [...SAMPLE.nodes, { id: 'E', label: 'Run tests', kind: 'step' }], edges: [...SAMPLE.edges, { from: 'A', to: 'E' }, { from: 'A', to: 'C' }] }
    const l = layered(d)
    const g = place(d, l, 14)
    const taken = new Set<number>()
    for (const n of g.nodes) {
      for (let r = n.row; r < n.row + 3; r++) {
        for (let x = n.x; x < n.x + 14; x++) {
          const k = r * g.columns + x
          expect(taken.has(k)).toBe(false)
          taken.add(k)
        }
      }
    }
    for (const k of edgeCells(g).keys()) expect(taken.has(k)).toBe(false)
    const target = g.nodes.find(n => n.id === 'B')!
    expect(g.heads.some(h => h.dir === '>' && h.x === target.x - 1 && h.row === target.row + 1)).toBe(true)
    expect(g.columns).toBe(layoutWidth(l.layers.length, 14, gapWidths(l)))
    expect(gapWidths(l)).toEqual([5, 6]) // gap 2 has two bending sources (B and the long edge's dummy): two tracks
  })
})

describe('FR-DG-02: drawn with the kit\'s raster.ts', () => {
  test('the Raster: sized to the layout, the labels in the cells, the edge glyphs between', async () => {
    const r = rasterOf(SAMPLE, 80)!
    expect(r.columns <= 80).toBe(true)
    expect(r.rows).toBe(9) // two slots in the tallest layer: a row above and below, 2 x 4 rows less the last gap
    const w = words(r.cells)
    expect(w.length).toBe(r.columns * r.rows * 3)
    const all = Array.from({ length: r.rows }, (_, i) => rowText(w, r.columns, i)).join('\n')
    for (const label of ['Parse request', 'Valid?', 'writer.ts', 'ErrorPanel']) expect(all.includes(label)).toBe(true)
    expect(all.includes('->')).toBe(true)
    expect(all.includes('|')).toBe(true)
  })

  test('narrow panes shrink the nodes and cut the labels; too narrow is null (the outline is drawn instead)', async () => {
    const r = rasterOf(SAMPLE, 42)!
    expect(r.columns <= 42).toBe(true)
    expect(rasterOf(chain(5), 40)).toBe(null)
    expect(fitLabel('Parse request', 'step', 10)).toBe('Pars')
    expect(fitLabel('writer.ts', 'file', 10)).toBe('writer.t')
    expect(fitLabel('café menu', 'new', 20)).toBe('caf menu')
  })

  test('24 nodes stay inside the Raster limits (512 x 256) and the Svg limit (131,072 characters)', async () => {
    const d = chain(MAX_NODES)
    const wide = rasterOf(d, 512)!
    expect(wide.columns <= 512 && wide.rows <= 256).toBe(true)
    const star: Diagram = { title: 's', nodes: chain(MAX_NODES).nodes, edges: chain(MAX_NODES).nodes.slice(1).map(n => ({ from: 'n0', to: n.id })) }
    const tall = rasterOf(star, 120)!
    expect(tall.rows <= 256).toBe(true)
    expect(svgOf(d).source.length < 131072).toBe(true)
    expect(svgOf(star).source.length < 131072).toBe(true)
  })

  test('the Svg: the kit\'s toSvg inside a cropping view box, labels as text, the outline as alt', async () => {
    const s = svgOf(SAMPLE)
    expect(s.source.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ')).toBe(true)
    expect(s.source.includes('viewBox="0 0 320 200"')).toBe(true)
    expect(s.source.includes('>Parse request</text>')).toBe(true)
    expect(s.alt.includes('[[Parse request]]')).toBe(true)
    expect(s.width >= 320 && s.width <= 900).toBe(true)
  })

  test('the outline: one line per layer with shape brackets, then every edge; labelled edges alone for the notes', async () => {
    expect(outline(SAMPLE)).toEqual(['1: [[Parse request]]', '2: <Valid?>', expect.stringMatching(/^3: /) as unknown as string, 'Parse request -> Valid?', 'Valid? -> writer.ts: yes', 'Valid? -> ErrorPanel: no'])
    expect(outline(SAMPLE)[2]!.includes('[writer.ts]') && outline(SAMPLE)[2]!.includes('(ErrorPanel)')).toBe(true)
    expect(edgeLines(SAMPLE, false)).toEqual(['Valid? -> writer.ts: yes', 'Valid? -> ErrorPanel: no'])
  })
})
