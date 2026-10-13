import { test, expect, describe } from 'claude-code/testing'
import type { Diagram } from '../types'
import { MAX_NODES, parseDiagramReply, validateDiagram } from '../hooks/spec'
import { isDummy, layered } from '../hooks/layout'
import { outline, edgeLines } from '../hooks/render'

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

  test('now: kept when it names a node, dropped when it does not', async () => {
    const base = { nodes: [{ id: 'a', kind: 'step' }, { id: 'b', kind: 'step' }], edges: [{ from: 'a', to: 'b' }] }
    const of = (v: unknown) => (validateDiagram(v) as { diagram: Diagram }).diagram.now
    expect(of({ ...base, now: 'b' })).toBe('b')
    expect(of({ ...base, now: 'zzz' })).toBeUndefined()
    expect(of(base)).toBeUndefined()
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

describe('FR-DG-02: the layered layout, top to bottom by dependency', () => {
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
  })
})

describe('FR-DG-02: the text forms', () => {
  test('the outline: one line per layer with shape brackets, then every edge; labelled edges alone for the notes', async () => {
    expect(outline(SAMPLE)).toEqual(['1: [[Parse request]]', '2: <Valid?>', expect.stringMatching(/^3: /) as unknown as string, 'Parse request -> Valid?', 'Valid? -> writer.ts: yes', 'Valid? -> ErrorPanel: no'])
    expect(outline(SAMPLE)[2]!.includes('[writer.ts]') && outline(SAMPLE)[2]!.includes('(ErrorPanel)')).toBe(true)
    expect(edgeLines(SAMPLE, false)).toEqual(['Valid? -> writer.ts: yes', 'Valid? -> ErrorPanel: no'])
  })
})
