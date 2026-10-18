import { test, expect, describe } from 'claude-code/testing'
import { EMPTY_BOARD, addEntry, heading, keepBoard, keptBoard, KEPT_SESSIONS, move } from '../hooks/diagram'
import { diagramTab } from '../hooks/tab'
import { DUMP, drain, run, SESSION_END, SPEC, START, turn, world } from './world'

const block = (src: string) => 'Here:\n\n```mermaid\n' + src + '\n```\n'
const FLOW = 'graph LR\n  A[Parse request] --> B{Valid?}\n  B -- yes --> C[Write file]'
const SEQ = 'sequenceDiagram\n  Alice->>Bob: hi'

describe('FR-DG-05: the Diagram tab (bws-cockpit dashboard)', () => {
  test('heading, legend, the drawn boxes clipped at the edge, footer, pinned list, Prev and Draw', { options: { dumpFile: DUMP } }, async ($, on) => {
    const w = world(on)
    await $.session.start(START)
    await turn($, { answer: block(FLOW) })
    await drain(w.clock) // the big turn's fork adds a drawn diagram after the pin
    const lines = w.lines()
    expect(lines[0]).toMatch(/^Refactor {2}2\/2 {2}\(last turn\)$/)
    expect(lines).toContain('┌ file   ╭ component   ╔ step   ╱ decision   ▶ now')
    expect(lines.some(l => /║ Read config ║/.test(l))).toBe(true)
    expect(lines.some(l => /▼ extract/.test(l))).toBe(true)
    expect(lines.some(l => /▶ Loader/.test(l))).toBe(true) // the fork's `now` node
    expect(lines).toContain('map drawn at turn 1')
    expect(lines).toContain('Pinned diagrams:')
    expect(lines).toContain('  1. Pinned: Parse request')
    expect(lines.slice(-2)).toEqual(['[< Prev]', '[Draw the session]'])
    const rows = (w.last()?.body ?? []).filter(n => n.kind === 'text' && /║ Read config ║/.test(n.text))
    expect(rows.every(n => n.kind === 'text' && n.isClipped === true)).toBe(true)
    expect([w.last()?.title, w.last()?.badge, w.last()?.tone]).toEqual(['Diagram', '2', 'ok'])
    // Prev on the published board: the pin, with Next and no Prev.
    const prev = diagramTab(move(w.dump() as never, -1), { raise: 0, show: 0 })
    const texts = prev.body.flatMap(n => (n.kind === 'text' ? [n.text] : n.kind === 'buttons' ? n.items.map(b => b.id) : []))
    expect(texts[0]).toMatch(/^Pinned: Parse request {2}1\/2 {2}\(pinned\)$/)
    expect(texts.some(t => /▼ yes/.test(t))).toBe(true)
    expect(texts).toContain('pinned at turn 1')
    expect(texts).toContain('┌ file   ╭ component   ╔ step   ╱ decision') // no `now` in the legend
    expect(texts.slice(-2)).toEqual(['next', 'draw'])
  })

  test('an unsupported pin shows its source', async ($, on) => {
    const w = world(on, { surfaces: [] })
    await $.session.start(START)
    await turn($, { answer: block(SEQ) })
    expect(w.lines()).toContain('Not a flowchart this tab can draw; the source:')
    expect(w.lines()).toContain('  Alice->>Bob: hi')
  })

  test('a failure shows in the tab with Dismiss; the diagrams stay', async ($, on) => {
    const w = world(on, { fork: 'throw' })
    await $.session.start(START)
    await turn($)
    await drain(w.clock)
    expect(w.lines().some(l => l.startsWith('Last attempt failed: fork'))).toBe(true)
    expect(w.lines()).toContain('[Dismiss the failure]')
    expect([w.last()?.badge, w.last()?.tone]).toEqual(['!', 'warn'])
  })

  test('the empty tab at start, with Draw; heading of an empty board', async ($, on) => {
    const w = world(on)
    await $.session.start(START)
    expect(w.lines()).toEqual(['No diagrams yet. /diagram draws the session.', '[Draw the session]'])
    expect([w.last()?.badge, w.last()?.tone]).toEqual(['', 'idle'])
    expect(heading(EMPTY_BOARD)).toBe('No diagrams yet')
  })
})

describe('FR-DG-05: state across reload, /clear, /resume, /branch', () => {
  test('kept per conversation: the newest 10, malformed values are an empty board', async () => {
    const b = addEntry(EMPTY_BOARD, { origin: 'pinned', at: 1, title: 'p', diagram: null, source: 'x' })
    let kept: unknown = {}
    for (let i = 0; i < KEPT_SESSIONS + 2; i++) kept = keepBoard(kept, `s${i}`, b, i)
    expect(Object.keys(kept as object).length).toBe(KEPT_SESSIONS)
    expect(keptBoard(kept, 's0')).toEqual(EMPTY_BOARD) // the oldest went
    expect(keptBoard(kept, 's11').entries.length).toBe(1)
    expect(keptBoard('junk', 's1')).toEqual(EMPTY_BOARD)
    expect(keptBoard({ s1: { entries: 'no' } }, 's1')).toEqual(EMPTY_BOARD)
  })

  test('reload: session.start again keeps the board (the atom outlives a reload)', async ($, on) => {
    const w = world(on)
    await $.session.start(START)
    await turn($, { answer: block(FLOW) })
    await $.session.start(START)
    expect(await run($, 'diagram', 'status')).toContain('1 pinned')
    void w
  })

  test('a new process for a kept conversation (claude --resume) loads its board from the store', async ($, on) => {
    const kept = keepBoard({}, 'session-aaaa-1111', addEntry(EMPTY_BOARD, { origin: 'pinned', at: 1, title: 'Pinned: old', diagram: null, source: 'graph' }), 1)
    world(on, { store: { boards: kept } })
    await $.session.start(START)
    expect(await run($, 'diagram', 'status')).toContain('Pinned: old')
  })

  test('/clear: the diagrams go, a fork in flight is dropped; the cleared conversation stays kept', { options: { dumpFile: DUMP } }, async ($, on) => {
    const w = world(on, { fork: 'defer' })
    await $.session.start(START)
    await turn($, { answer: block(FLOW) })
    await drain(w.clock)
    expect(w.seen.fork.length).toBe(1)
    await $.session.end(SESSION_END('clear'))
    w.who.session = 'session-bbbb-2222'
    w.release(JSON.stringify(SPEC))
    await drain(w.clock)
    expect(await run($, 'diagram', 'status')).toContain('0 drawn, 0 pinned')
    expect(keptBoard(w.store.get('boards'), 'session-aaaa-1111').entries.length).toBe(1)
    expect(w.raised()).toBe(1) // the pin's raise only: the dropped fork raised nothing
    expect(w.dump()?.entries.length).toBe(0)
  })

  test('/resume: work stops; the resumed conversation\'s board comes back, and the first one\'s on return', async ($, on) => {
    const other = keepBoard({}, 'session-bbbb-2222', addEntry(EMPTY_BOARD, { origin: 'pinned', at: 1, title: 'Pinned: other', diagram: null, source: 'graph' }), 1)
    const w = world(on, { store: { boards: other } })
    await $.session.start(START)
    await turn($, { answer: block(FLOW) })
    await $.session.end(SESSION_END('resume'))
    w.who.session = 'session-bbbb-2222'
    const status = await run($, 'diagram', 'status')
    expect(status).toContain('Pinned: other')
    expect(status).not.toContain('Parse request')
    await $.session.end(SESSION_END('resume', 'session-bbbb-2222'))
    w.who.session = 'session-aaaa-1111'
    expect(await run($, 'diagram', 'status')).toContain('Pinned: Parse request')
  })

  test('/branch (a new session id with no end event): the board carries over, a fork in flight is dropped', async ($, on) => {
    const w = world(on, { fork: 'defer' })
    await $.session.start(START)
    await turn($, { answer: block(FLOW) })
    await drain(w.clock)
    w.who.session = 'session-cccc-3333'
    expect(await run($, 'diagram', 'status')).toContain('1 pinned')
    w.release(JSON.stringify(SPEC))
    await drain(w.clock)
    expect(await run($, 'diagram', 'status')).toContain('0 drawn, 1 pinned')
    expect(keptBoard(w.store.get('boards'), 'session-cccc-3333').entries.length).toBe(1)
  })
})
