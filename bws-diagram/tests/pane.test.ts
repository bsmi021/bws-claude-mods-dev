import { test, expect, describe } from 'claude-code/testing'
import { EMPTY_BOARD, addEntry, heading, keepBoard, keptBoard, KEPT_SESSIONS } from '../hooks/diagram'
import { DUMP, drain, PANE, run, SESSION_END, SPEC, START, turn, world } from './world'

const block = (src: string) => 'Here:\n\n```mermaid\n' + src + '\n```\n'
const FLOW = 'graph LR\n  A[Parse request] --> B{Valid?}\n  B -- yes --> C[Write file]'
const SEQ = 'sequenceDiagram\n  Alice->>Bob: hi'
const mount = ($: { ui: { mount: (i: never) => Promise<unknown> } }, surface: string, bodyColumns = 80) =>
  $.ui.mount({ ...PANE, surface, props: { ...PANE.props, bodyColumns } } as never) as Promise<{
    find: (q: object) => Promise<{ text?: string; props?: Record<string, unknown> } | undefined>
    findAll: (q: object) => Promise<unknown[]>
    press: (t: object) => Promise<unknown>
    unmount: () => Promise<void>
  }>

describe('FR-DG-05: the pane', () => {
  test('heading, legend, the Raster on the terminal, labelled edges, pinned list, Prev / Next / Close', async ($, on) => {
    const w = world(on)
    await $.session.start(START)
    await turn($, { answer: block(FLOW) })
    await drain(w.clock) // the big turn's fork adds a drawn diagram after the pin
    const ui = await mount($, 'terminal')
    expect((await ui.find({ type: 'Text', text: /^Refactor {2}2\/2 {2}\(last turn\)$/ }))).toBeDefined()
    for (const t of ['[] file', '() new component', '[[]] step', '<> decision']) expect(await ui.find({ type: 'Text', text: new RegExp(t.replace(/[[\]()]/g, '\\$&')) })).toBeDefined()
    expect(await ui.find({ key: 'diagram' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'config.ts -> Loader: extract' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Pinned diagrams:' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /1\. Pinned: Parse request/ })).toBeDefined()
    await ui.press({ key: 'prev' })
    expect(await ui.find({ type: 'Text', text: /^Pinned: Parse request {2}1\/2 {2}\(pinned\)$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Valid? -> Write file: yes' })).toBeDefined()
    await ui.press({ key: 'prev' }) // already first: stays
    expect(await ui.find({ type: 'Text', text: /1\/2/ })).toBeDefined()
    await ui.press({ key: 'next' })
    expect(await ui.find({ type: 'Text', text: /2\/2/ })).toBeDefined()
    const closes = w.seen.closed.length
    await ui.press({ key: 'close' })
    expect(w.seen.closed.length).toBe(closes + 1)
    await ui.unmount()
  })

  test('resize-safe: drawn from the body width each time; too narrow shows the outline with a note', async ($, on) => {
    const w = world(on, { surfaces: [] })
    await $.session.start(START)
    await turn($, { answer: block(FLOW) })
    const wide = await mount($, 'terminal', 80)
    expect(await wide.find({ key: 'diagram' })).toBeDefined()
    await wide.unmount()
    const narrow = await mount($, 'terminal', 30)
    expect(await narrow.find({ key: 'diagram' })).toBe(undefined)
    expect(await narrow.find({ type: 'Text', text: /Too narrow to draw/ })).toBeDefined()
    expect(await narrow.find({ type: 'Text', text: '1: [Parse request]' })).toBeDefined()
    await narrow.unmount()
    void w
  })

  test('Desktop draws the Svg with the outline as alt; an unsupported pin shows its source', async ($, on) => {
    const w = world(on, { surfaces: [] })
    await $.session.start(START)
    await turn($, { answer: block(FLOW) })
    const desk = await mount($, 'desktop')
    const svg = await desk.find({ type: 'Svg' })
    expect(svg).toBeDefined()
    expect(String(svg?.props?.alt)).toContain('[Parse request]')
    await desk.unmount()
    await turn($, { answer: block(SEQ) })
    const ui = await mount($, 'terminal')
    expect(await ui.find({ type: 'Text', text: /Not a flowchart this pane can draw/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '  Alice->>Bob: hi' })).toBeDefined()
    await ui.unmount()
    void w
  })

  test('closed by the person: the diagrams stay; a failure note is acknowledged', async ($, on) => {
    const w = world(on, { fork: 'throw' })
    await $.session.start(START)
    await turn($)
    await drain(w.clock)
    expect(await run($, 'diagram', 'status')).toContain('Last attempt failed')
    await turn($, { answer: block(FLOW) })
    const ui = await mount($, 'terminal')
    await ui.press({ key: 'close' })
    await ui.unmount()
    const status = await run($, 'diagram', 'status')
    expect(status).not.toContain('Last attempt failed')
    expect(status).toContain('1 pinned')
  })

  test('heading and the empty pane', async ($, on) => {
    world(on)
    await $.session.start(START)
    const ui = await mount($, 'terminal')
    expect(await ui.find({ type: 'Text', text: /No diagrams yet/ })).toBeDefined()
    await ui.unmount()
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

  test('/clear: the diagrams go, the pane closes, a fork in flight is dropped; the cleared conversation stays kept', { options: { dumpFile: DUMP } }, async ($, on) => {
    const w = world(on, { fork: 'defer' })
    await $.session.start(START)
    await turn($, { answer: block(FLOW) })
    await drain(w.clock)
    expect(w.seen.fork.length).toBe(1)
    await $.session.end(SESSION_END('clear'))
    expect(w.seen.closed[w.seen.closed.length - 1]).toBe('bws-diagram')
    w.who.session = 'session-bbbb-2222'
    w.release(JSON.stringify(SPEC))
    await drain(w.clock)
    expect(await run($, 'diagram', 'status')).toContain('0 drawn, 0 pinned')
    expect(keptBoard(w.store.get('boards'), 'session-aaaa-1111').entries.length).toBe(1)
    expect(w.seen.opened.length).toBe(1) // the pin's open only: the dropped fork opened nothing
    expect(w.dump()?.entries.length).toBe(0)
  })

  test('/resume: work stops, the pane closes; the resumed conversation\'s board comes back, and the first one\'s on return', async ($, on) => {
    const other = keepBoard({}, 'session-bbbb-2222', addEntry(EMPTY_BOARD, { origin: 'pinned', at: 1, title: 'Pinned: other', diagram: null, source: 'graph' }), 1)
    const w = world(on, { store: { boards: other } })
    await $.session.start(START)
    await turn($, { answer: block(FLOW) })
    await $.session.end(SESSION_END('resume'))
    expect(w.seen.closed[w.seen.closed.length - 1]).toBe('bws-diagram')
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
