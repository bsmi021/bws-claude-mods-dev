import { test, expect, describe } from 'claude-code/testing'
import { mermaidBlocks, parseMermaid } from '../hooks/mermaid'
import { pinsFrom } from '../hooks/diagram'
import { DUMP, drain, run, START, turn, world } from './world'

const PROBE = ['graph LR', '  A[Parse request] --> B{Valid?}', '  B -- yes --> C[Write file]', '  B -- no --> D[Show error]'].join('\n')
const reply = (...blocks: string[]) => ['Here is the flow:', ...blocks.map(b => '```mermaid\n' + b + '\n```'), 'Done.'].join('\n\n')

describe('FR-DG-04: mermaid blocks parsed to a spec', () => {
  test('the probe reply: graph LR, shapes, plain and labelled edges', async () => {
    const p = parseMermaid(PROBE)
    expect(p).toEqual({
      ok: true,
      diagram: {
        title: 'Pinned: Parse request',
        nodes: [
          { id: 'A', label: 'Parse request', kind: 'file' },
          { id: 'B', label: 'Valid?', kind: 'decision' },
          { id: 'C', label: 'Write file', kind: 'file' },
          { id: 'D', label: 'Show error', kind: 'file' },
        ],
        edges: [{ from: 'A', to: 'B' }, { from: 'B', to: 'C', label: 'yes' }, { from: 'B', to: 'D', label: 'no' }],
      },
    })
  })

  test('flowchart TD; shapes for each kind; pipe labels; chains; a bare id; a later shape names an earlier bare id', async () => {
    const src = ['flowchart TD', 'start --> s1[[Run tests]] -->|green| n1(New panel)', 'n1 --- d1((Ship?)) ==> x', 'x[report.md]', 'd1 -.-> y([Retry])'].join('\n')
    const p = parseMermaid(src)
    if (!p.ok) throw new Error(p.error)
    const kinds = Object.fromEntries(p.diagram.nodes.map(n => [n.id, `${n.kind}:${n.label}`]))
    expect(kinds).toEqual({ start: 'file:start', s1: 'step:Run tests', n1: 'new:New panel', d1: 'decision:Ship?', x: 'file:report.md', y: 'new:Retry' })
    expect(p.diagram.edges).toEqual([
      { from: 'start', to: 's1' },
      { from: 's1', to: 'n1', label: 'green' },
      { from: 'n1', to: 'd1' },
      { from: 'd1', to: 'x' },
      { from: 'd1', to: 'y' },
    ])
  })

  test('semicolons, comments, quoted labels, <br>, styling lines and subgraphs are handled', async () => {
    const src = ['graph LR;', '%% a comment', 'subgraph core', 'a["Load <br/> config"] --> b{{"Valid?"}};', 'end', 'style a fill:#f9f', 'classDef hot fill:red', 'b == ok ==> c'].join('\n')
    const p = parseMermaid(src)
    if (!p.ok) throw new Error(p.error)
    expect(p.diagram.nodes.map(n => n.label)).toEqual(['Load config', 'Valid?', 'c'])
    expect(p.diagram.edges).toEqual([{ from: 'a', to: 'b' }, { from: 'b', to: 'c', label: 'ok' }])
  })

  test('unsupported: other diagram types, a bad header, an unreadable line, over 24 nodes', async () => {
    expect(parseMermaid('sequenceDiagram\n  Alice->>Bob: hi')).toEqual({ ok: false, kind: 'sequenceDiagram', error: 'sequenceDiagram is not a flowchart' })
    expect(parseMermaid('graph sideways\nA-->B').ok).toBe(false)
    expect(parseMermaid('graph LR\nA & B --> C')).toEqual({ ok: false, kind: 'graph', error: 'line 2: expected an edge' })
    expect(parseMermaid('graph LR\nA[unclosed --> B').ok).toBe(false)
    const many = ['graph LR', ...Array.from({ length: 25 }, (_, i) => `n${i} --> n${i + 1}`)].join('\n')
    expect(parseMermaid(many)).toEqual({ ok: false, kind: 'graph', error: '26 nodes; at most 24' })
    expect(parseMermaid('').ok).toBe(false)
  })

  test('the blocks of a reply: ```mermaid and ~~~mermaid fences, other fences ignored', async () => {
    const text = ['```mermaid\ngraph LR\nA-->B\n```', '```ts\nconst a = 1\n```', '~~~mermaid\nsequenceDiagram\nA->>B: x\n~~~'].join('\n')
    expect(mermaidBlocks(text)).toEqual(['graph LR\nA-->B', 'sequenceDiagram\nA->>B: x'])
    expect(mermaidBlocks('no fences here')).toEqual([])
  })

  test('pins: a parsed block is a diagram, an unsupported one keeps its source, a block already pinned is skipped', async () => {
    const seq = 'sequenceDiagram\nA->>B: x'
    const pins = pinsFrom(reply(PROBE, seq), 5, [])
    expect(pins.map(p => [p.origin, p.title, p.diagram === null])).toEqual([
      ['pinned', 'Pinned: Parse request', false],
      ['pinned', 'Pinned mermaid (sequenceDiagram)', true],
    ])
    expect(pins[1]?.source).toBe(seq)
    const again = pinsFrom(reply(PROBE), 6, pins.map((p, i) => ({ ...p, id: i + 1 })))
    expect(again).toEqual([])
    const six = pinsFrom(reply(...Array.from({ length: 6 }, (_, i) => `graph LR\nA${i}-->B`)), 7, [])
    expect(six.length).toBe(5)
  })
})

describe('FR-DG-04: pinned from the reply when the turn ends', () => {
  test('a reply with a mermaid block is pinned before the turn returns, headless too, and listed under Pinned diagrams', { options: { dumpFile: DUMP } }, async ($, on) => {
    const w = world(on, { surfaces: [] })
    await $.session.start(START)
    await turn($, { answer: reply(PROBE) })
    const d = w.dump()! // written before turn.complete returned: no drain
    expect(d.entries.map(e => [e.origin, e.title])).toEqual([['pinned', 'Pinned: Parse request']])
    expect(w.seen.opened.map(o => o.id)).toEqual(['bws-diagram'])
    const status = await run($, 'diagram', 'status')
    expect(status).toContain('Pinned diagrams:\n> 1. Pinned: Parse request (4 nodes, 3 edges)')
    expect(w.seen.classify.length).toBe(0)
  })

  test('an unsupported block is pinned as its source text and drawn as text', async ($, on) => {
    const w = world(on)
    await $.session.start(START)
    await turn($, { answer: reply('pie title Pets\n"Dogs" : 3') })
    expect(await run($, 'diagram', 'status')).toContain('1. Pinned mermaid (pie) (source text, not drawable)')
    void w
  })

  test('not pinned: a subagent\'s report, an aborted turn, a reply without mermaid; the same block twice pins once', async ($, on) => {
    const w = world(on, { rows: [] })
    await $.session.start(START)
    await turn($, { answer: reply(PROBE), agentId: 'agent-1' })
    await turn($, { answer: reply(PROBE), reason: 'aborted', isAborted: true })
    await turn($, { answer: 'no diagrams here' })
    expect(w.seen.opened.length).toBe(0)
    await turn($, { answer: reply(PROBE) })
    await turn($, { answer: reply(PROBE) })
    await drain(w.clock)
    expect(await run($, 'diagram', 'status')).toContain('0 drawn, 1 pinned')
  })
})
