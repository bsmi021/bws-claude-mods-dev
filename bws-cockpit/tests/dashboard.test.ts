import { test, expect, mock, describe } from 'claude-code/testing'
import type { On } from 'claude-code'
import { add, listText, markSent, setCorrection, setVerdict, summary, verdictPrompt } from '../hooks/assumptions'
import { addIdea, age, contextLine, detailLine, EMPTY, groupByProject, isAllScope, listText as ideasText, openIdeas, parseShelf, serializeShelf, setStatus, shelfPath } from '../hooks/shelf'
import type { Assumption, BoardPane } from '../types'

const TOOL = 'mcp__bws-cockpit__record_assumption'
const HOME = 'C:/Users/me'
const FILE = `${HOME}/.claude/idea-shelf/shelf.json`
const ROOT = 'C:/Projects/game'
const OTHER = 'C:/Projects/site'
const NOW = 1_000_000_000

const norm = (p: unknown) => String(p).replace(/\\/g, '/')

type Pane = { id: string; title: string; isShown: boolean; isFocused: boolean; isPlaced: boolean }
type World = {
  surfaces?: string[]
  shelf?: string
  box?: string
  isPlaced?: boolean
  percent?: number
  startedAt?: number
  board?: { summary: { agents: number; openAsks: number; askedOfMe: number } | null; lines: string[]; pane?: BoardPane }
  commands?: string[]
  // other mods' atoms by plugin: their dashboard `tab` and `summary`
  mods?: Record<string, { tab?: unknown; summary?: unknown }>
  // answers $.process.run by argv (the switchboard's `claude plugin ...`); absent: no processes
  run?: (argv: readonly string[]) => { exitCode: number; stdout: string; stderr: string }
  store?: Record<string, unknown>
}

// Stubs every outside call the dashboard makes; the shelf file lives in `files`, panes in `panes`.
function world(on: On, w: World = {}) {
  const clock = mock.clock(on, { now: NOW })
  const files: Record<string, string> = {}
  if (w.shelf !== undefined) files[FILE] = w.shelf
  const panes: Pane[] = []
  const seen = {
    sent: [] as { text: string; asUser?: boolean }[],
    opened: [] as { id: string; focus?: boolean }[],
    closed: [] as string[],
    toasts: [] as string[],
    fills: [] as string[],
    commands: [] as { command: string; args: string }[],
  }
  let box = w.box ?? ''
  on('session.surfaces', () => ({ value: (w.surfaces ?? ['terminal']) as never }))
  on('session.root', () => ({ value: `${ROOT}\\` }))
  on('session.cwd', () => ({ value: ROOT }))
  // startedAt moves on a /clear: the test changes usage.startedAt to make one.
  const usage = { startedAt: w.startedAt ?? 5 }
  on('session.usage', () => ({ value: { startedAt: usage.startedAt, context: { window: 200_000, percent: w.percent }, rateLimits: [] } as never }))
  on('env.get', ($, e) => {
    const name = String((e as unknown as { name: string }).name)
    return { value: (name === 'USERPROFILE' ? 'C:\\Users\\me' : undefined) as never }
  })
  on('fs.exists', ($, e) => ({ value: files[norm(e.path)] !== undefined }))
  on('fs.read', ($, e) => {
    const hit = files[norm(e.path)]
    if (hit === undefined) throw new Error(`ENOENT ${norm(e.path)}`)
    return { value: hit as never }
  })
  on('fs.write', ($, e) => {
    files[norm(e.path)] = String(e.text)
    return { value: undefined }
  })
  on('fs.list', ($, e) => {
    throw new Error(`ENOENT ${norm(e.path)}`)
  })
  const runs: string[][] = []
  on('process.run', ($, e) => {
    runs.push([...e.argv])
    if (w.run === undefined) throw new Error('no processes here')
    return { value: w.run(e.argv) as never }
  })
  const store: Record<string, unknown> = { ...(w.store ?? {}) }
  on('store.get', ($, e) => ({ value: store[e.key] as never }))
  on('store.set', ($, e) => {
    store[e.key] = e.value
    return { value: undefined as never }
  })
  on('prompt.submit', ($, e) => {
    seen.sent.push({ text: e.text, asUser: (e.origin as { asUser?: boolean } | undefined)?.asUser })
    return { text: e.text } as never
  })
  on('turn.complete', () => ({ text: '' }) as never)
  on('session.start', () => ({ cwd: ROOT }) as never)
  on('tool.register', ($, e) => ({ value: { tool: e.name } }) as never)
  on('command.register', ($, e) => ({ value: { command: e.name } }) as never)
  on('command.list', () => ({ value: (w.commands ?? []).map(name => ({ name })) as never }))
  on('command.run', ($, e) => {
    seen.commands.push({ command: String(e.command), args: String(e.args) })
    return { text: '' } as never
  })
  on('ui.panes', () => ({ value: panes.map(p => ({ ...p })) as never }))
  on('ui.open', ($, e) => {
    seen.opened.push({ id: e.id, focus: e.focus })
    if (w.isPlaced === false) return { value: { isPlaced: false, reason: 'narrow' } }
    const old = panes.find(p => p.id === e.id)
    if (old) old.isShown = true
    else panes.push({ id: e.id, title: e.title ?? e.id, isShown: true, isFocused: e.focus === true, isPlaced: true })
    return { value: { isPlaced: true } }
  })
  on('ui.close', ($, e) => {
    seen.closed.push(e.id)
    const i = panes.findIndex(p => p.id === e.id)
    if (i >= 0) panes.splice(i, 1)
    return { value: undefined } as never
  })
  on('ui.toast', ($, e) => {
    seen.toasts.push(String((e as unknown as { text: string }).text))
    return { value: undefined } as never
  })
  on('ui.copy', () => ({ value: { isCopied: false } }) as never)
  on('prompt.read', () => ({ value: { text: box, cursor: box.length } }))
  on('prompt.fill', ($, e) => {
    box = e.text
    seen.fills.push(e.text)
    return { isFilled: true }
  })
  if (w.board) {
    const b = w.board
    on('state.get', ($, e, next) => {
      const ref = e as unknown as { plugin?: string; key?: string }
      if (ref.plugin !== 'bws-board') return next(e)
      return { value: { value: ref.key === 'summary' ? b.summary : ref.key === 'pane' ? (b.pane ?? null) : b.lines, version: 1 } } as never
    })
  }
  if (w.mods) {
    const m = w.mods
    on('state.get', ($, e, next) => {
      const ref = e as unknown as { plugin?: string; key?: string }
      const mod = ref.plugin === undefined ? undefined : m[ref.plugin]
      if (mod === undefined || (ref.key !== 'tab' && ref.key !== 'summary')) return next(e)
      return { value: { value: (ref.key === 'tab' ? mod.tab : mod.summary) ?? null, version: 1 } } as never
    })
  }
  const shelf = () => parseShelf(files[FILE])
  const setBox = (text: string) => {
    box = text
  }
  return { seen, clock, files, shelf, panes, setBox, usage, runs, store }
}

const seeded = () => {
  let s = addIdea(EMPTY, { text: 'game idea one', by: 'user', project: ROOT, now: NOW - 3_600_000 }).shelf
  s = addIdea(s, { text: 'site idea', by: 'claude', project: OTHER, now: NOW - 60_000 }).shelf
  s = addIdea(s, { text: 'game idea two', detail: 'see src/ai.ts', by: 'claude', project: ROOT, now: NOW - 120_000 }).shelf
  return serializeShelf(s)
}

const PANE = {
  plugin: 'bws-cockpit',
  component: 'Pane',
  requestId: 'dashboard',
  surface: 'terminal',
  props: { title: 'Dashboard', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

const BAND = {
  plugin: 'bws-cockpit',
  component: 'AbovePrompt',
  surface: 'terminal',
  props: { hasSurvey: false, isWorking: false, maxRows: 8, bodyColumns: 160, scroll: { offset: 0, bodyRows: 8 }, view: {} },
} as const

function three(): Assumption[] {
  let list: Assumption[] = []
  for (const t of ['Use wttr.in', 'City from argv', 'Name the file weather.py']) list = add(list, t, '').list
  return list
}

// The bar needs the cockpit view, which a /cockpit run fills.
async function withBar($: { command: { run: (input: never) => Promise<unknown> } }) {
  await $.command.run({ command: 'cockpit', args: '' } as never)
}

// ---------- pure helpers, moved with their modules ----------

describe('assumptions lib', () => {
  test('numbers in order, never reuses a number after a clear', () => {
    const list = three()
    expect(list.map(a => a.n)).toEqual([1, 2, 3])
    expect(add(list.filter(a => a.n === 3), 'x', '').item.n).toBe(4)
  })

  test('a verdict pressed again goes back to open; sent items are frozen', () => {
    let list = setVerdict(three(), 1, 'wrong')
    expect(list[0]?.verdict).toBe('wrong')
    expect(setVerdict(list, 1, 'wrong')[0]?.verdict).toBe('open')
    list = markSent(list, [1])
    expect(setVerdict(list, 1, 'right')[0]?.verdict).toBe('wrong')
  })

  test('verdict prompt: wrong first with the correction, missing correction asks, right kept', () => {
    let list = setVerdict(setVerdict(setVerdict(three(), 1, 'right'), 2, 'wrong'), 3, 'wrong')
    list = setCorrection(list, 2, 'read the city from an env var CITY')
    const text = verdictPrompt(list.filter(a => a.verdict !== 'open'))
    expect(text.startsWith('Assumption review (from the dashboard)')).toBe(true)
    expect(text).toContain('A2 is WRONG: "City from argv". Instead: read the city from an env var CITY')
    expect(text).toContain('A3 is WRONG: "Name the file weather.py". No correction given: ask me')
    expect(text).toContain('A1 is right: "Use wttr.in". Keep it.')
    expect(text.indexOf('A2')).toBeLessThan(text.indexOf('A1'))
    expect(text).toContain('Apply each correction now')
  })

  test('a typed but unsaved correction is used over the saved one', () => {
    const list = setVerdict(three(), 2, 'wrong')
    expect(verdictPrompt([list[1]!], new Map([[2, 'env var']]))).toContain('Instead: env var')
  })

  test('summary and text list', () => {
    const list = setVerdict(three(), 1, 'right')
    expect(summary(list)).toBe('⚑ 3 assumptions · 2 to review · 1 ready to send')
    expect(summary(markSent(list, [1, 2, 3]))).toBe('⚑ all reviewed · 3 sent')
    expect(summary([])).toBe('⚑ no assumptions yet')
    expect(listText([])).toBe('No assumptions recorded in this session.')
  })
})

describe('shelf lib', () => {
  test('shelf path: option, then CLAUDE_CONFIG_DIR, then home', () => {
    expect(shelfPath('D:\\x\\s.json', 'C:/cfg', HOME)).toBe('D:/x/s.json')
    expect(shelfPath('', 'C:\\cfg\\', HOME)).toBe('C:/cfg/idea-shelf/shelf.json')
    expect(shelfPath('', undefined, 'C:\\Users\\me')).toBe(FILE)
    expect(shelfPath('', '', '')).toBe('')
  })

  test('a missing or damaged file is an empty shelf; ids keep counting past the highest', () => {
    expect(parseShelf(undefined).ideas).toEqual([])
    expect(parseShelf('{not json').ideas).toEqual([])
    const s = parseShelf(JSON.stringify({ nextId: 2, ideas: [{ id: 7, text: 'x', project: ROOT, by: 'bogus', status: 'weird' }, { nope: 1 }] }))
    expect(s.ideas).toHaveLength(1)
    expect(s.ideas[0]?.by).toBe('user')
    expect(s.ideas[0]?.status).toBe('open')
    expect(s.nextId).toBe(8)
  })

  test('add trims and clips; close and reopen', () => {
    const { shelf, idea } = addIdea(EMPTY, { text: `  a\n  b ${'x'.repeat(400)}`, by: 'user', project: 'C:\\P\\', now: 1 })
    expect(idea.id).toBe(1)
    expect(idea.text.length).toBe(300)
    expect(idea.text.startsWith('a b x')).toBe(true)
    expect(idea.project).toBe('C:/P')
    const done = setStatus(shelf, 1, 'done', 5)
    expect(done.idea?.closedAt).toBe(5)
    expect(openIdeas(done.shelf, '')).toEqual([])
    expect(setStatus(done.shelf, 1, 'open', 6).idea?.closedAt).toBeUndefined()
    expect(setStatus(shelf, 99, 'done', 1).idea).toBeUndefined()
  })

  test('per project, case-insensitive, newest first; all projects with empty project', () => {
    const s = parseShelf(seeded())
    expect(openIdeas(s, 'c:\\projects\\GAME\\').map(i => i.id)).toEqual([3, 1])
    expect(openIdeas(s, '').map(i => i.id)).toEqual([3, 2, 1])
    expect(ideasText(openIdeas(s, ROOT), NOW, false, true)).toBe('#3 game idea two  (Claude, 2m)\n    see src/ai.ts\n#1 game idea one  (you, 1h)')
  })

  test('groupByProject: this project first, then newest idea; capped per project; same names get full paths', () => {
    let s = parseShelf(seeded())
    s = addIdea(s, { text: 'site idea two', by: 'user', project: OTHER, now: NOW }).shelf
    s = addIdea(s, { text: 'other game', by: 'user', project: 'D:/Work/game', now: NOW }).shelf
    const g = groupByProject(openIdeas(s, ''), 'c:\\projects\\GAME', 1)
    expect(g.map(x => [x.label, x.isHere, x.total, x.ideas.map(i => i.id)])).toEqual([
      ['C:/Projects/game', true, 2, [3]],
      ['D:/Work/game', false, 1, [5]],
      ['site', false, 2, [4]],
    ])
    expect(groupByProject([], ROOT, 4)).toEqual([])
    expect(detailLine({ ...s.ideas[0]!, detail: '\n  first\nsecond' })).toBe('first')
    expect(detailLine(s.ideas[0]!)).toBe('')
  })

  test('age, scope words, context line', () => {
    expect(age(0, 3 * 3_600_000)).toBe('3h')
    expect(isAllScope(' all ')).toBe(true)
    expect(isAllScope('')).toBe(false)
    expect(contextLine(1, 'T')).toMatch(/^1 open idea on this project's idea shelf.*call T/)
  })
})

// ---------- Assumptions tab ----------

describe('assumptions deck', () => {
  const DECK = 'assumption-deck'
  const edit = (on: On) => on('tool.call', { tool: 'Edit' }, () => ({ result: 'ok' }) as never)

  test('edits made while an assumption stands are its blast radius, named in the review', async ($, on) => {
    const { seen, clock } = world(on)
    edit(on)
    await $.tool.call({ tool: TOOL, assumption: 'Use wttr.in' } as never)
    await $.tool.call({ tool: 'Edit', file_path: 'C:\\Projects\\game\\src\\weather.py', old_string: 'a', new_string: 'b' } as never)
    await $.tool.call({ tool: TOOL, assumption: 'City from argv' } as never)
    await $.tool.call({ tool: 'Edit', file_path: 'C:/Projects/game/src/cli.py', old_string: 'a', new_string: 'b' } as never)
    const ui = await $.ui.mount(PANE)
    // A1 carries both edits, so it leads the deck.
    expect(await ui.find({ type: 'Text', text: 'Use wttr.in', in: DECK })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'src/weather.py  src/cli.py', in: DECK })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /built on it$/, in: DECK })).toBeDefined()
    // ← marks A1 wrong and opens the Instead line; typed keys fill it; Enter flies it off.
    await ui.key({ key: 'left', in: DECK })
    for (const k of ['e', 'n', 'v']) await ui.key({ key: k, in: DECK })
    expect(await ui.find({ type: 'Text', text: 'Instead: env▌', in: DECK })).toBeDefined()
    await ui.key({ key: 'return', in: DECK })
    await ui.advance(600)
    // A2 is up next; → marks it right.
    expect(await ui.find({ type: 'Text', text: 'City from argv', in: DECK })).toBeDefined()
    await ui.key({ key: 'right', in: DECK })
    await ui.advance(600)
    expect(await ui.find({ type: 'Text', text: /0 to judge · 2 judged/, in: DECK })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '✓ All judged: 1 right, 1 wrong', in: DECK })).toBeDefined()
    await ui.key({ key: 's', in: DECK })
    await ui.unmount()
    await clock.advance(50)
    expect(seen.sent.length).toBe(1)
    expect(seen.sent[0]?.text).toContain('A1 is WRONG: "Use wttr.in". Instead: env Built on it since: 2 edits in src/weather.py, src/cli.py.')
    expect(seen.sent[0]?.text).toContain('A2 is right')
  })

  test('a drag past the threshold judges; a short one does nothing', async ($, on) => {
    world(on)
    await $.tool.call({ tool: TOOL, assumption: 'Use wttr.in' } as never)
    const ui = await $.ui.mount(PANE)
    await ui.pointer({ type: 'down', x: 30, y: 2, button: 'left' })
    await ui.pointer({ type: 'move', x: 27, y: 2, button: 'left' })
    await ui.pointer({ type: 'up', x: 27, y: 2, button: 'left' })
    expect(await ui.find({ type: 'Text', text: /1 to judge/, in: DECK })).toBeDefined()
    await ui.pointer({ type: 'down', x: 30, y: 2, button: 'left' })
    await ui.pointer({ type: 'move', x: 40, y: 2, button: 'left' })
    expect(await ui.find({ type: 'Text', text: 'RIGHT →', in: DECK })).toBeDefined()
    await ui.pointer({ type: 'up', x: 40, y: 2, button: 'left' })
    await ui.advance(600)
    expect(await ui.find({ type: 'Text', text: /0 to judge · 1 judged/, in: DECK })).toBeDefined()
    // u takes it back.
    await ui.key({ key: 'u', in: DECK })
    expect(await ui.find({ type: 'Text', text: /1 to judge/, in: DECK })).toBeDefined()
    await ui.unmount()
  })

  test('an empty deck says so; mobile gets the list', async ($, on) => {
    world(on)
    const ui = await $.ui.mount(PANE)
    expect(await ui.find({ type: 'Text', text: /Nothing to judge/, in: DECK })).toBeDefined()
    await ui.unmount()
    await $.tool.call({ tool: TOOL, assumption: 'Use wttr.in' } as never)
    const phone = await $.ui.mount({ ...PANE, surface: 'mobile' })
    expect(await phone.find({ type: 'Text', text: 'A1 Use wttr.in' })).toBeDefined()
    await phone.unmount()
  })
})

describe('assumptions', () => {
  test('the tool records and numbers, and raises the dashboard on Assumptions', async ($, on) => {
    const { seen } = world(on)
    const r = await $.tool.call({ tool: TOOL, assumption: 'Use wttr.in', why: 'no API key' } as never)
    expect(String((r as { result?: unknown }).result)).toContain('Recorded as A1. Keep working')
    expect(String((r as { result?: unknown }).result)).toContain('from the dashboard')
    const r2 = await $.tool.call({ tool: TOOL, assumption: 'City from argv' } as never)
    expect(String((r2 as { result?: unknown }).result)).toContain('Recorded as A2')
    expect(seen.opened.map(o => o.id)).toEqual(['dashboard']) // opened once; already shown the second time
    const ui = await $.ui.mount(PANE)
    expect((await ui.find({ key: 'tab-assumptions' }))?.props?.label).toBe('Assumptions 2')
    expect((await ui.find({ key: 'tab-assumptions' }))?.props?.variant).toBe('primary')
    expect(await ui.find({ type: 'Text', text: 'Use wttr.in', in: 'assumption-deck' })).toBeDefined()
    await ui.press({ key: 'view-list' })
    expect(await ui.find({ type: 'Text', text: 'A1 Use wttr.in' })).toBeDefined()
    await ui.press({ key: 'view-deck' })
    await ui.unmount()
  })

  test('an empty assumption is refused', async ($, on) => {
    world(on)
    const r = await $.tool.call({ tool: TOOL, assumption: '  ' } as never)
    expect(String((r as { deny?: string }).deny)).toContain('needs `assumption`')
  })

  test('mark, correct and send hands the verdicts to Claude as the user', async ($, on) => {
    const { seen, clock } = world(on)
    await $.tool.call({ tool: TOOL, assumption: 'Use wttr.in' } as never)
    await $.tool.call({ tool: TOOL, assumption: 'City from argv' } as never)
    const desk = await $.ui.mount({ ...PANE, surface: 'desktop' })
    await desk.press({ key: 'view-list' })
    expect(await desk.find({ type: 'Text', text: /2 assumptions · 2 to review/ })).toBeDefined()
    expect(await desk.find({ key: 'fix-2' })).toBeUndefined()
    await desk.press({ key: 'right-1' })
    await desk.press({ key: 'wrong-2' })
    await desk.unmount()
    let ui = await $.ui.mount(PANE)
    expect(await ui.find({ key: 'fix-2' })).toBeDefined()
    await ui.input({ key: 'fix-2', text: 'read it from env var CITY' })
    await ui.press({ key: 'send' })
    await ui.unmount()
    await clock.advance(50)
    expect(seen.sent.length).toBe(1)
    expect(seen.sent[0]?.asUser).toBe(true)
    expect(seen.sent[0]?.text).toContain('A2 is WRONG: "City from argv". Instead: read it from env var CITY')
    expect(seen.sent[0]?.text).toContain('A1 is right')
    ui = await $.ui.mount(PANE)
    expect(await ui.find({ type: 'Text', text: /2 sent: A1 right, A2 wrong/ })).toBeDefined()
    expect(await ui.find({ key: 'right-1' })).toBeUndefined()
    expect((await ui.find({ key: 'tab-assumptions' }))?.props?.label).toBe('Assumptions')
    await ui.press({ key: 'clear' })
    await ui.unmount()
    ui = await $.ui.mount(PANE)
    expect(await ui.find({ type: 'Text', text: /sent:/ })).toBeUndefined()
    await ui.press({ key: 'view-deck' })
    await ui.unmount()
  })

  test('send with nothing marked submits nothing', async ($, on) => {
    const { seen, clock } = world(on)
    await $.tool.call({ tool: TOOL, assumption: 'Use wttr.in' } as never)
    const ui = await $.ui.mount(PANE)
    await ui.press({ key: 'send' })
    await ui.unmount()
    await clock.advance(50)
    expect(seen.sent).toEqual([])
    expect(seen.toasts.at(-1)).toContain('mark one Right or Wrong first')
  })

  test('the guide joins the system prompt only where the tool is offered', async ($, on) => {
    on('prompt.compose', () => ({ sections: [{ id: 'core', text: 'core', scope: 'shared' as const }] }))
    const withTool = await $.prompt.compose({ model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', surfaces: ['terminal'], outputStyle: null, traits: [], tools: ['Bash', TOOL] })
    expect(withTool.sections.map(s => s.id)).toEqual(['core', 'bws-cockpit:assumptions'])
    expect(withTool.sections.at(-1)?.text).toContain('mcp__bws-cockpit__record_assumption')
    const without = await $.prompt.compose({ model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', surfaces: ['terminal'], outputStyle: null, traits: [], tools: ['Bash'] })
    expect(without.sections.map(s => s.id)).toEqual(['core'])
  })

  test('headless /assumptions lists them as text', async ($, on) => {
    world(on, { surfaces: [] })
    await $.tool.call({ tool: TOOL, assumption: 'Use wttr.in', why: 'no key' } as never)
    const r = await $.command.run({ command: 'assumptions', args: '' } as never)
    expect(r.text).toContain('A1 [to review] Use wttr.in (no key)')
  })

  test('/assumptions opens the dashboard on Assumptions, with the keys over an empty box', async ($, on) => {
    const { seen, clock } = world(on)
    expect((await $.command.run({ command: 'assumptions', args: '' } as never)).text).toBeUndefined()
    await clock.advance(50)
    expect(seen.opened).toEqual([{ id: 'dashboard', focus: true }])
  })
})

// ---------- Shelf tab ----------

describe('shelf', () => {
  test('/idea shelves for this project with a toast and no transcript reply', async ($, on) => {
    const { seen, shelf } = world(on)
    const r = await $.command.run({ command: 'idea', args: 'try a bloom pass on the lanterns' } as never)
    expect(r.text).toBeUndefined()
    expect(seen.toasts).toEqual(['Shelved #1'])
    expect(shelf().ideas).toEqual([{ id: 1, text: 'try a bloom pass on the lanterns', by: 'user', project: ROOT, createdAt: NOW, status: 'open' }])
  })

  test('/idea headless prints the line; empty args print usage and save nothing', async ($, on) => {
    const { files } = world(on, { surfaces: [] })
    expect((await $.command.run({ command: 'idea', args: '  ' } as never)).text).toMatch(/^Usage: \/idea/)
    expect(files[FILE]).toBeUndefined()
    expect((await $.command.run({ command: 'idea', args: 'x' } as never)).text).toBe('Shelved #1: x')
  })

  test('a write keeps ideas another session added since', async ($, on) => {
    const { files, shelf } = world(on, { shelf: seeded() })
    await $.command.run({ command: 'idea', args: 'mine' } as never)
    files[FILE] = serializeShelf(addIdea(shelf(), { text: 'from another session', by: 'user', project: OTHER, now: NOW }).shelf)
    await $.command.run({ command: 'idea', args: 'mine again' } as never)
    expect(shelf().ideas.map(i => i.text)).toEqual(['game idea one', 'site idea', 'game idea two', 'mine', 'from another session', 'mine again'])
  })

  test('shelve_idea from Claude: saved as Claude, result says to carry on, user is told', async ($, on) => {
    const { seen, shelf } = world(on)
    const r = await $.tool.call({ tool: 'mcp__bws-cockpit__shelve_idea', text: 'cache the nav mesh', detail: 'rebuild is 4 s' } as never)
    expect(String(r.result)).toBe("Shelved as #1. Don't pursue it now; continue the current task.")
    expect(shelf().ideas[0]).toMatchObject({ by: 'claude', detail: 'rebuild is 4 s', project: ROOT })
    expect(seen.toasts).toEqual(['Claude shelved #1: cache the nav mesh'])
    expect((await $.tool.call({ tool: 'mcp__bws-cockpit__shelve_idea', text: '  ' } as never)).deny).toMatch(/needs text/)
  })

  test('list_ideas: this project by default, all on request', async ($, on) => {
    world(on, { shelf: seeded() })
    const mine = String((await $.tool.call({ tool: 'mcp__bws-cockpit__list_ideas' } as never)).result)
    expect(mine).toContain('#3 game idea two')
    expect(mine).not.toContain('site idea')
    const all = String((await $.tool.call({ tool: 'mcp__bws-cockpit__list_ideas', scope: 'all' } as never)).result)
    expect(all).toContain('#2 site idea  (Claude, 1m, site)')
  })

  test('close_idea marks done; unknown ids and bad statuses are refused', async ($, on) => {
    const { shelf } = world(on, { shelf: seeded() })
    const r = await $.tool.call({ tool: 'mcp__bws-cockpit__close_idea', id: 3, status: 'done' } as never)
    expect(String(r.result)).toBe('#3 is done: game idea two')
    expect(shelf().ideas.find(i => i.id === 3)?.status).toBe('done')
    expect((await $.tool.call({ tool: 'mcp__bws-cockpit__close_idea', id: 42, status: 'done' } as never)).deny).toMatch(/No idea #42/)
    expect((await $.tool.call({ tool: 'mcp__bws-cockpit__close_idea', id: 1, status: 'later' } as never)).deny).toMatch(/status must be/)
  })

  test('prompt.context adds one shelf line in attended sessions only', async ($, on) => {
    world(on, { shelf: seeded() })
    on('prompt.context', ($, e) => ({ blocks: e.blocks }))
    const r = await $.prompt.context({ blocks: [{ name: 'currentDate', text: 'today' }] } as never)
    const block = r.blocks.find(b => b.name === 'ideaShelf')
    expect(block?.text).toMatch(/^2 open ideas.*mcp__bws-cockpit__shelve_idea/)
  })

  test('prompt.context: no shelf line headless, or with shelfNudge off', { options: { shelfNudge: false } }, async ($, on) => {
    world(on, { shelf: seeded() })
    on('prompt.context', ($, e) => ({ blocks: e.blocks }))
    expect((await $.prompt.context({ blocks: [] } as never)).blocks.find(b => b.name === 'ideaShelf')).toBeUndefined()
  })

  test('/shelf headless lists this project with details', async ($, on) => {
    world(on, { surfaces: [], shelf: seeded() })
    const r = await $.command.run({ command: 'shelf', args: '' } as never)
    expect(r.text).toBe('#3 game idea two  (Claude, 2m)\n    see src/ai.ts\n#1 game idea one  (you, 1h)')
  })

  test('/shelf opens the Shelf tab: Done closes an idea, All shows other projects', async ($, on) => {
    const { seen, shelf, clock } = world(on, { shelf: seeded() })
    expect((await $.command.run({ command: 'shelf', args: '' } as never)).text).toBeUndefined()
    await clock.advance(50)
    expect(seen.opened).toEqual([{ id: 'dashboard', focus: true }])
    let ui = await $.ui.mount(PANE)
    expect((await ui.find({ key: 'tab-shelf' }))?.props?.variant).toBe('primary')
    expect(await ui.find({ type: 'Text', text: /2 open ideas · game/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /site idea/ })).toBeUndefined()
    await ui.press({ key: 'done-3' })
    await ui.unmount()
    expect(shelf().ideas.find(i => i.id === 3)?.status).toBe('done')
    ui = await $.ui.mount(PANE)
    expect(await ui.find({ type: 'Text', text: /1 open idea · game/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /#3 done/ })).toBeDefined()
    await ui.press({ key: 'scope' })
    await ui.unmount()
    ui = await $.ui.mount(PANE)
    expect(await ui.find({ type: 'Text', text: /2 open ideas · all projects/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /💡 site idea/ })).toBeDefined()
    expect(await ui.find({ key: 'proj-C:/Projects/game' })).toBeDefined()
    expect(await ui.find({ key: 'proj-C:/Projects/site' })).toBeDefined()
    expect((await ui.find({ key: 'tab-shelf' }))?.props?.label).toBe('Shelf 1') // still this project's count
    await ui.unmount()
  })

  test('each idea is a bordered card: author glyph and colour, text, first detail line', async ($, on) => {
    world(on, { shelf: seeded() })
    await $.command.run({ command: 'shelf', args: '' } as never)
    const ui = await $.ui.mount(PANE)
    expect((await ui.find({ key: 'idea-3' }))?.props?.borderStyle).toBe('round')
    expect((await ui.find({ key: 'idea-3' }))?.props?.borderColor).toBe('claude')
    expect((await ui.find({ key: 'idea-1' }))?.props?.borderColor).toBe('suggestion')
    expect(await ui.find({ type: 'Text', text: /^🤖 #3/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^🙋 #1/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '💡 game idea two' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '📝 see src/ai.ts' })).toBeDefined()
    expect(await ui.find({ key: 'proj-C:/Projects/game' })).toBeUndefined() // no project headers in this project's view
    await ui.unmount()
  })

  test('Resume fills an empty box; a busy box gets a note instead', async ($, on) => {
    const { seen, shelf, clock, setBox } = world(on, { shelf: seeded() })
    await $.command.run({ command: 'shelf', args: '' } as never)
    await clock.advance(50)
    let ui = await $.ui.mount(PANE)
    await ui.press({ key: 'resume-3' })
    await ui.unmount()
    expect(seen.fills).toEqual(['Pick up shelved idea #3: game idea two\n\nsee src/ai.ts'])
    expect(shelf().ideas.find(i => i.id === 3)?.status).toBe('open')
    setBox('half-typed')
    ui = await $.ui.mount(PANE)
    await ui.press({ key: 'resume-1' })
    await ui.unmount()
    ui = await $.ui.mount(PANE)
    expect(await ui.find({ type: 'Text', text: /send or clear it first/ })).toBeDefined()
    await ui.unmount()
    expect(seen.fills.length).toBe(1)
  })
})

// ---------- the dashboard: tabs, the person's choices, proactive triggers ----------

describe('dashboard', () => {
  test('tab strip: Assumptions, Shelf, Board with counts and 1-3 hotkeys; a press switches', async ($, on) => {
    world(on, { shelf: seeded(), board: { summary: { agents: 2, openAsks: 1, askedOfMe: 1 }, lines: ['api (you) · busy · fixing the bow', '  claims src/bow.ts'] } })
    await $.session.start({ cwd: ROOT } as never)
    await $.tool.call({ tool: TOOL, assumption: 'Use wttr.in' } as never)
    let ui = await $.ui.mount(PANE)
    const labels = await Promise.all(['assumptions', 'shelf', 'board', 'loop'].map(async t => (await ui.find({ key: `tab-${t}` }))?.props))
    expect(labels.map(p => p?.label)).toEqual(['Assumptions 1', 'Shelf 2', 'Board 1', undefined]) // no loop here
    expect(labels.map(p => p?.hotkey)).toEqual(['1', '2', '3', undefined])
    await ui.press({ key: 'tab-board' })
    await ui.unmount()
    ui = await $.ui.mount(PANE)
    expect((await ui.find({ key: 'tab-board' }))?.props?.variant).toBe('primary')
    expect((await ui.find({ key: 'tab-assumptions' }))?.props?.plain).toBe(true)
    expect(await ui.find({ type: 'Text', text: /^Board · 2 agents · 1 open ask · 1 for you$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /fixing the bow/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /claims src/ }))?.props?.dimColor).toBe(true)
    await ui.unmount()
  })

  test('Board tab draws a card per session and per ask from the pane view', async ($, on) => {
    const sess = { claims: [], claimsMore: 0, run: null, lease: null }
    const pane: BoardPane = {
      self: { ...sess, id: 'aaaaaaaa', who: 'api', status: 'busy', task: 'fixing the bow', seen: '0s ago', run: '2026-10-15-bow', lease: 'git commit 3s ago' },
      peers: [{ ...sess, id: 'bbbbbbbb', who: 'tests', status: 'idle', task: '', seen: '12s ago', claims: ['src/a.ts', 'src/b.ts'], claimsMore: 3 }],
      asks: [
        { id: 'aaaaaaaa-1', view: 'open', urgent: true, from: 'api (aaaaaaaa)', to: 'role tests', text: 'run the suite', actor: null, note: null },
        { id: 'aaaaaaaa-2', view: 'withdrawn', urgent: false, from: 'api (aaaaaaaa)', to: 'anyone', text: 'never mind', actor: null, note: null },
      ],
    }
    const { clock } = world(on, { board: { summary: { agents: 2, openAsks: 1, askedOfMe: 0 }, lines: ['old text line'], pane } })
    await $.session.start({ cwd: ROOT } as never)
    await $.command.run({ command: 'dashboard', args: 'board' } as never)
    await clock.advance(50)
    const ui = await $.ui.mount(PANE)
    const self = await ui.find({ key: 'board-s-aaaaaaaa' })
    expect(self?.props?.borderStyle).toBe('round')
    expect(self?.props?.borderColor).toBe('claude')
    expect((await ui.find({ key: 'board-s-bbbbbbbb' }))?.props?.borderColor).toBe('subtle')
    expect((await ui.find({ key: 'board-a-aaaaaaaa-1' }))?.props?.borderColor).toBe('error')
    expect(await ui.find({ type: 'Text', text: /^📝 fixing the bow$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^📂 2026-10-15-bow$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^🔑 holds the git lease: git commit 3s ago$/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^🔒 src\/a\.ts, src\/b\.ts \(\+3 more\)$/ }))?.props?.dimColor).toBe(true)
    expect(await ui.find({ type: 'Text', text: /^📝 no task recorded$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^🔥 aaaaaaaa-1 · open/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^api \(aaaaaaaa\) → role tests$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^🔙 aaaaaaaa-2 · withdrawn$/ })).toBeDefined()
    expect((await ui.find({ key: 'board-a-aaaaaaaa-2' }))?.props?.borderColor).toBe('subtle')
    expect(await ui.find({ type: 'Text', text: /old text line/ })).toBeUndefined()
    await ui.unmount()
  })

  test('mod tabs: one per loaded mod after the built-ins; a tab draws its nodes and sends presses and inputs back', async ($, on) => {
    const notifyTab = {
      title: 'Notify',
      badge: '2',
      tone: 'ok',
      raise: 0,
      body: [
        { kind: 'text', text: 'Toasts on', isBold: true },
        { kind: 'card', title: 'Last toasts', color: 'ok', body: [{ kind: 'text', text: 'turn done in game', isDim: true }] },
        { kind: 'buttons', items: [{ id: 'test', label: 'Send a test toast', isPrimary: true }] },
        { kind: 'input', id: 'note', placeholder: 'a note' },
      ],
    }
    const { clock } = world(on, {
      mods: { 'bws-notify': { tab: notifyTab }, 'bws-secrets': { summary: { state: 'ok', label: '3 secrets' } }, 'bws-diagram': { tab: { title: '' } } },
    })
    const events: unknown[] = []
    on('state.set', { plugin: 'bws-cockpit', key: 'tabEvent' }, ($, e, next) => {
      events.push(e.value)
      return next(e)
    })
    await $.session.start({ cwd: ROOT } as never)
    await $.command.run({ command: 'dashboard', args: 'notify' } as never)
    await clock.advance(50)
    const ui = await $.ui.mount(PANE)
    // Built-ins first, then loaded mods in the configured order; a malformed tab (diagram) draws nothing.
    expect((await ui.find({ key: 'tab-board' }))?.props?.hotkey).toBe('3')
    expect((await ui.find({ key: 'tab-bws-secrets' }))?.props?.label).toBe('Secrets ●')
    expect((await ui.find({ key: 'tab-bws-notify' }))?.props?.label).toBe('Notify 2')
    expect((await ui.find({ key: 'tab-bws-notify' }))?.props?.variant).toBe('primary')
    expect(await ui.find({ key: 'tab-bws-diagram' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^Notify · 2$/ })).toBeDefined()
    expect((await ui.find({ key: 'mod-bws-notify-1' }))?.props?.borderStyle).toBe('round')
    expect((await ui.find({ type: 'Text', text: /^turn done in game$/ }))?.props?.dimColor).toBe(true)
    await ui.press({ key: 'bws-notify-test' })
    await ui.unmount()
    const ui2 = await $.ui.mount(PANE)
    await ui2.input({ key: 'bws-notify-note', text: 'hello' })
    await ui2.unmount()
    expect(events).toEqual([
      { seq: 1, plugin: 'bws-notify', id: 'test' },
      { seq: 2, plugin: 'bws-notify', id: 'note', value: 'hello' },
    ])
  })

  test('/dashboard headless prints the mod tabs as text too', async ($, on) => {
    world(on, { surfaces: [], mods: { 'bws-skillgate': { summary: { state: 'idle', label: 'gate off', detail: 'Off by default.' } } } })
    const r = await $.command.run({ command: 'dashboard', args: '' } as never)
    expect(r.text).toContain('Skillgate\ngate off\nOff by default.')
  })

  test('Board tab without bws-board says so', async ($, on) => {
    const { clock } = world(on)
    await $.command.run({ command: 'dashboard', args: 'board' } as never)
    await clock.advance(50)
    const ui = await $.ui.mount(PANE)
    expect(await ui.find({ type: 'Text', text: /bws-board is not loaded here/ })).toBeDefined()
    await ui.unmount()
  })

  test('/dashboard: a bad tab prints usage; headless prints every tab as text', async ($, on) => {
    world(on, { surfaces: [], shelf: seeded() })
    expect((await $.command.run({ command: 'dashboard', args: 'nope' } as never)).text).toMatch(/^Usage: \/dashboard/)
    await $.tool.call({ tool: TOOL, assumption: 'Use wttr.in' } as never)
    const r = await $.command.run({ command: 'dashboard', args: '' } as never)
    expect(r.text).toContain('A1 [to review] Use wttr.in')
    expect(r.text).toContain('#3 game idea two')
    expect(r.text).toContain('bws-board is not loaded')
  })

  test('news while the person uses the pane: no tab switch, the count says it', async ($, on) => {
    const { seen, clock, panes } = world(on, { shelf: seeded() })
    await $.command.run({ command: 'shelf', args: '' } as never)
    await clock.advance(50)
    expect(panes[0]?.isFocused).toBe(true)
    await $.tool.call({ tool: TOOL, assumption: 'Use wttr.in' } as never)
    expect(seen.opened.length).toBe(1)
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, isFocused: true } })
    expect((await ui.find({ key: 'tab-shelf' }))?.props?.variant).toBe('primary')
    expect((await ui.find({ key: 'tab-assumptions' }))?.props?.label).toBe('Assumptions 1')
    await ui.unmount()
  })

  test('news with the pane open but not in use switches its tab', async ($, on) => {
    const { clock, panes } = world(on, { shelf: seeded(), box: 'draft' })
    await $.command.run({ command: 'shelf', args: '' } as never) // text in the box: opened without the keys
    await clock.advance(50)
    expect(panes[0]?.isFocused).toBe(false)
    await $.tool.call({ tool: TOOL, assumption: 'Use wttr.in' } as never)
    const ui = await $.ui.mount(PANE)
    expect((await ui.find({ key: 'tab-assumptions' }))?.props?.variant).toBe('primary')
    await ui.unmount()
  })

  test('closed from the bar: news only lights the bar; an asked open brings it back', async ($, on) => {
    const { seen, clock } = world(on)
    await withBar($)
    await $.tool.call({ tool: TOOL, assumption: 'Use wttr.in' } as never)
    expect(seen.opened.length).toBe(1)
    let band = await $.ui.mount(BAND)
    await band.press({ key: 'dash' }) // open: close it as the person
    await clock.settle()
    await band.unmount()
    expect(seen.closed).toEqual(['dashboard'])
    await $.tool.call({ tool: TOOL, assumption: 'City from argv' } as never)
    expect(seen.opened.length).toBe(1) // not reopened
    band = await $.ui.mount(BAND)
    const chip = await band.find({ type: 'Text', text: '2 to review' })
    expect(chip?.props?.color).toBe('warning')
    await band.unmount()
    await $.command.run({ command: 'assumptions', args: '' } as never)
    await clock.advance(50)
    expect(seen.opened.length).toBe(2)
    await $.tool.call({ tool: TOOL, assumption: 'Name the file weather.py' } as never)
    const ui = await $.ui.mount(PANE)
    expect((await ui.find({ key: 'tab-assumptions' }))?.props?.label).toBe('Assumptions 3')
    await ui.unmount()
  })

  test('session start opens the dashboard on the shelf when ideas wait; not with nothing waiting', async ($, on) => {
    const { seen } = world(on, { shelf: seeded() })
    await $.session.start({ cwd: ROOT } as never)
    expect(seen.opened).toEqual([{ id: 'dashboard', focus: undefined }])
    const ui = await $.ui.mount(PANE)
    expect((await ui.find({ key: 'tab-shelf' }))?.props?.variant).toBe('primary')
    await ui.unmount()
  })

  test('dashboardOnStart off: session start with nothing waiting opens nothing', { options: { dashboardOnStart: false } }, async ($, on) => {
    const { seen } = world(on)
    await $.session.start({ cwd: ROOT } as never)
    expect(seen.opened).toEqual([])
  })

  test('session start with nothing waiting still opens the dashboard, on Assumptions; headless opens nothing', async ($, on) => {
    const { seen } = world(on)
    await $.session.start({ cwd: ROOT } as never)
    expect(seen.opened).toEqual([{ id: 'dashboard', focus: undefined }])
    const ui = await $.ui.mount(PANE)
    expect((await ui.find({ key: 'tab-assumptions' }))?.props?.variant).toBe('primary')
    await ui.unmount()
  })

  test('session start headless opens no dashboard', async ($, on) => {
    const { seen } = world(on, { surfaces: [] })
    await $.session.start({ cwd: ROOT } as never)
    expect(seen.opened).toEqual([])
  })

  test('Desktop attaches after session start: the first attach opens the dashboard and fills the bar, a second opens nothing', async ($, on) => {
    const w: World = { surfaces: [] }
    const { seen } = world(on, w)
    on('session.attach', ($, e) => ({ clientId: e.clientId }) as never)
    on('ui.log', () => ({ value: undefined }) as never)
    await $.session.start({ cwd: ROOT } as never)
    expect(seen.opened).toEqual([])
    w.surfaces = ['desktop']
    await $.session.attach({ surface: 'desktop', clientId: 'desktop:default' } as never)
    expect(seen.opened).toEqual([{ id: 'dashboard', focus: undefined }])
    const bar = await $.ui.mount({
      plugin: 'bws-cockpit',
      surface: 'desktop',
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 8, bodyColumns: 80, scroll: { offset: 0, bodyRows: 8 }, view: {} },
    } as never)
    expect(await bar.find({ key: 'hide' })).toBeTruthy()
    await bar.unmount()
    await $.session.attach({ surface: 'mobile', clientId: 'mobile:1' } as never)
    expect(seen.opened.length).toBe(1)
  })

  test('an unasked start-up open left undrawn (Desktop under 144 columns) is placed at the first prompt, once; a start trace is kept', async ($, on) => {
    const w: World = { surfaces: ['desktop'], isPlaced: false }
    const { seen, files } = world(on, w)
    await $.session.start({ cwd: ROOT } as never)
    expect(seen.opened.length).toBe(1)
    w.isPlaced = true
    await $.prompt.submit({ text: 'hello' } as never)
    expect(seen.opened).toEqual([
      { id: 'dashboard', focus: undefined },
      { id: 'dashboard', focus: undefined },
    ])
    await $.prompt.submit({ text: 'again' } as never)
    expect(seen.opened.length).toBe(2)
    const log = Object.entries(files).find(([k]) => k.endsWith('bws-cockpit-start.log'))?.[1] ?? ''
    expect(log).toContain('raise: dashboard waits undrawn: narrow')
    expect(log).toContain('first prompt: dashboard placed')
  })

  test('first prompt: a dashboard the person closed stays closed', async ($, on) => {
    const { seen } = world(on, { surfaces: ['desktop'] })
    await $.session.start({ cwd: ROOT } as never)
    // The bar's dash button closes it as the person's close.
    const bar = await $.ui.mount({
      plugin: 'bws-cockpit',
      surface: 'desktop',
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 8, bodyColumns: 80, scroll: { offset: 0, bodyRows: 8 }, view: {} },
    } as never)
    await bar.press({ key: 'dash' })
    await bar.unmount()
    expect(seen.closed).toEqual(['dashboard'])
    await $.prompt.submit({ text: 'hello' } as never)
    expect(seen.opened.length).toBe(1)
  })

  test('handoff nudge: once per session past the threshold, Handoff highlighted', async ($, on) => {
    const { seen, clock } = world(on, { percent: 72 })
    await withBar($)
    let band = await $.ui.mount(BAND)
    expect((await band.find({ key: 'handoff' }))?.props?.plain).toBe(true)
    await band.unmount()
    await $.turn.complete({ answer: 'ok', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answered' } as never)
    await clock.settle()
    await $.turn.complete({ answer: 'ok', durationMs: 1000, isAborted: false, turnId: 't2', reason: 'answered' } as never)
    await clock.settle()
    expect(seen.toasts.filter(t => /context at 72%/.test(t)).length).toBe(1)
    band = await $.ui.mount(BAND)
    expect((await band.find({ key: 'handoff' }))?.props?.variant).toBe('primary')
    await band.unmount()
  })

  test('handoff nudge stays quiet under the threshold, and when switched off', { options: { handoffNudgePercent: 0 } }, async ($, on) => {
    const { seen, clock } = world(on, { percent: 95 })
    await $.turn.complete({ answer: 'ok', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answered' } as never)
    await clock.settle()
    expect(seen.toasts.filter(t => /context at/.test(t))).toEqual([])
  })
})

// ---------- the cache clock chip ----------

describe('cache clock: bar chip', () => {
  const MIN = 60_000
  const TURN = { answer: 'ok', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answered' } as never

  test('hidden before the first turn; then it counts down a minute at a time, warns under 5 minutes, and goes cold', async ($, on) => {
    const { clock } = world(on, {})
    await $.session.start({ cwd: ROOT } as never)
    await withBar($)
    let ui = await $.ui.mount(BAND)
    expect(await ui.find({ key: 'chip-cache' })).toBeUndefined()
    await ui.unmount()

    await $.turn.complete(TURN)
    await clock.settle()
    ui = await $.ui.mount(BAND)
    expect((await ui.find({ type: 'Text', text: /^cache 60m$/ }))?.props?.color).toBeUndefined()
    await ui.unmount()

    await clock.advance(55 * MIN) // 5 minutes left: fresh, not under the threshold
    await clock.settle()
    ui = await $.ui.mount(BAND)
    expect((await ui.find({ type: 'Text', text: /^cache 5m$/ }))?.props?.color).toBeUndefined()
    await ui.unmount()

    await clock.advance(MIN) // 4 minutes left: low
    await clock.settle()
    ui = await $.ui.mount(BAND)
    expect((await ui.find({ type: 'Text', text: /^cache 4m$/ }))?.props?.color).toBe('warning')
    await ui.unmount()

    await clock.advance(4 * MIN) // the hour is up
    await clock.settle()
    ui = await $.ui.mount(BAND)
    expect((await ui.find({ type: 'Text', text: /^cache cold$/ }))?.props?.color).toBe('warning')
    await ui.unmount()
  })

  test('a /clear starts the window over: the chip hides within a minute, and the next turn starts it again', async ($, on) => {
    const { clock, usage } = world(on, {})
    await $.session.start({ cwd: ROOT } as never)
    await $.turn.complete(TURN)
    await clock.settle()
    usage.startedAt = 99 // a new session window
    await clock.advance(MIN)
    await clock.settle()
    let ui = await $.ui.mount(BAND)
    expect(await ui.find({ key: 'chip-cache' })).toBeUndefined()
    await ui.unmount()

    await $.turn.complete(TURN)
    await clock.settle()
    ui = await $.ui.mount(BAND)
    expect(await ui.find({ type: 'Text', text: /^cache 60m$/ })).toBeDefined()
    await ui.unmount()
  })

  test('drawn on the desktop surface as well', async ($, on) => {
    world(on, {})
    await $.turn.complete(TURN)
    await withBar($)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    expect(await ui.find({ key: 'chip-cache' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^cache 60m$/ })).toBeDefined()
    await ui.unmount()
  })
})

// ---------- the cache clock's auto handoff ----------

describe('cache clock: auto handoff', () => {
  const MIN = 60_000
  const TURN = { answer: 'ok', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answered' } as never
  const HANDOFF = '# Handoff: test\n\n## Next step\nnone'
  const USAGE = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

  test('fires once when the cache drops under the threshold while idle, after a turn', async ($, on) => {
    const { seen, clock } = world(on, {})
    const forks: string[] = []
    on('model.fork', ($, e) => {
      forks.push(String((e as { prompt?: string }).prompt))
      return { value: { isAnswered: true, text: HANDOFF, usage: USAGE } as never }
    })
    await $.session.start({ cwd: ROOT } as never)
    await $.turn.complete(TURN)
    await clock.settle()
    await clock.advance(55 * MIN) // 5 minutes left: fresh
    await clock.settle()
    expect(forks.length).toBe(0)
    await clock.advance(MIN) // 4 minutes left: low
    await clock.settle()
    expect(forks.length).toBe(1)
    expect(seen.toasts.some(t => /cache clock: Handoff written/.test(t))).toBe(true)
    await clock.advance(4 * MIN) // still low, but no turn since the handoff
    await clock.settle()
    expect(forks.length).toBe(1)
  })

  test('not while a turn is running', async ($, on) => {
    const { clock } = world(on, {})
    const forks: string[] = []
    on('model.fork', ($, e) => {
      forks.push(String((e as { prompt?: string }).prompt))
      return { value: { isAnswered: true, text: HANDOFF, usage: USAGE } as never }
    })
    await $.session.start({ cwd: ROOT } as never)
    await $.turn.complete(TURN)
    await clock.settle()
    await clock.advance(50 * MIN)
    await $.prompt.submit({ text: 'next' } as never) // a turn starts; it has not ended
    await clock.advance(6 * MIN) // low, and a turn has happened, but one is running
    await clock.settle()
    expect(forks.length).toBe(0)
    await $.turn.complete(TURN) // it ends: the clock restarts, so it is fresh again
    await clock.settle()
    expect(forks.length).toBe(0)
  })

  test('a manual /handoff is the window\'s handoff: no auto one after it', async ($, on) => {
    const { clock } = world(on, {})
    const forks: string[] = []
    on('model.fork', ($, e) => {
      forks.push(String((e as { prompt?: string }).prompt))
      return { value: { isAnswered: true, text: HANDOFF, usage: USAGE } as never }
    })
    await $.session.start({ cwd: ROOT } as never)
    await $.turn.complete(TURN)
    await clock.settle()
    await clock.advance(50 * MIN)
    await $.command.run({ command: 'handoff', args: '' } as never)
    await clock.advance(6 * MIN) // low, with no turn since the manual handoff
    await clock.settle()
    expect(forks.length).toBe(1)
  })

  test('a failed attempt is not retried every minute, and leaves one debug line', async ($, on) => {
    const { clock } = world(on, {})
    const forks: string[] = []
    const debug: string[] = []
    on('model.fork', ($, e) => {
      forks.push(String((e as { prompt?: string }).prompt))
      return { value: { isAnswered: false, reason: 'error', usage: USAGE } as never }
    })
    on('ui.log', ($, e) => {
      if (e.to === 'debug') debug.push(e.text)
      return { value: undefined } as never
    })
    await $.session.start({ cwd: ROOT } as never)
    await $.turn.complete(TURN)
    await clock.settle()
    await clock.advance(56 * MIN)
    await clock.settle()
    await clock.advance(3 * MIN)
    await clock.settle()
    expect(forks.length).toBe(1)
    expect(debug.length).toBe(1)
    expect(debug[0]).toMatch(/^cache clock: No handoff written: the model call failed/)
  })

  test('a new turn after a handoff starts a new window, and its low point gets one more', async ($, on) => {
    const { clock } = world(on, {})
    const forks: string[] = []
    on('model.fork', ($, e) => {
      forks.push(String((e as { prompt?: string }).prompt))
      return { value: { isAnswered: true, text: HANDOFF, usage: USAGE } as never }
    })
    await $.session.start({ cwd: ROOT } as never)
    await $.turn.complete(TURN)
    await clock.settle()
    await clock.advance(56 * MIN)
    await clock.settle()
    expect(forks.length).toBe(1)
    await $.turn.complete(TURN) // the window restarts at 56 min
    await clock.settle()
    await clock.advance(56 * MIN) // low again at 112 min
    await clock.settle()
    expect(forks.length).toBe(2)
  })

  test('off when autoHandoff is switched off', { options: { autoHandoff: false } }, async ($, on) => {
    const { clock } = world(on, {})
    const forks: string[] = []
    on('model.fork', ($, e) => {
      forks.push(String((e as { prompt?: string }).prompt))
      return { value: { isAnswered: true, text: HANDOFF, usage: USAGE } as never }
    })
    await $.session.start({ cwd: ROOT } as never)
    await $.turn.complete(TURN)
    await clock.settle()
    await clock.advance(58 * MIN)
    await clock.settle()
    expect(forks.length).toBe(0)
  })
})

// ---------- /cacheclock ----------

describe('cache clock: /cacheclock', () => {
  const MIN = 60_000
  const TURN = { answer: 'ok', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answered' } as never

  test('says there is no request yet before the first turn', async ($, on) => {
    world(on, {})
    const r = await $.command.run({ command: 'cacheclock', args: '' } as never)
    expect(r.text).toContain('no request yet in this session')
    expect(r.text).toContain('Auto handoff: none this session.')
  })

  test('prints the time left, the state and the TTL; headless too', async ($, on) => {
    world(on, { surfaces: [] })
    await $.turn.complete(TURN)
    const r = await $.command.run({ command: 'cacheclock', args: 'status' } as never)
    expect(r.text).toContain('60m left of 60m (fresh)')
  })

  test('shows when the last auto handoff was written', async ($, on) => {
    const { clock } = world(on, {})
    on('model.fork', () => ({ value: { isAnswered: true, text: '# Handoff: test', usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } as never }))
    await $.session.start({ cwd: ROOT } as never)
    await $.turn.complete(TURN)
    await clock.settle()
    await clock.advance(56 * MIN)
    await clock.settle()
    const r = await $.command.run({ command: 'cacheclock', args: '' } as never)
    expect(r.text).toContain('4m left of 60m (low, under 5m)')
    expect(r.text).toMatch(/Auto handoff: last written \d\d:\d\d\./)
  })

  // bin/ttl.py's output for a transcript whose newest replies wrote a 5m cache
  const FIVE = '{"ephemeral_1h_input_tokens": 0, "ephemeral_5m_input_tokens": 1422}\n'
  const STOP = { stop_hook_active: false, transcript_path: 'C:/t/s1.jsonl', last_assistant_message: 'ok', background_tasks: [], session_crons: [] } as never

  test('a Stop reads the TTL from the transcript: 5m drives the clock, the low mark and the auto handoff', async ($, on) => {
    const { clock } = world(on, { run: argv => ({ exitCode: 0, stdout: argv[0] === 'python' ? FIVE : '', stderr: '' }) })
    on('classic.Stop', () => ({}))
    const forks: string[] = []
    on('model.fork', () => {
      forks.push('fork')
      return { value: { isAnswered: true, text: '# Handoff: test', usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } as never }
    })
    await $.session.start({ cwd: ROOT } as never)
    await $.turn.complete(TURN)
    await $.classic.Stop(STOP)
    await clock.settle()
    let r = await $.command.run({ command: 'cacheclock', args: '' } as never)
    expect(r.text).toContain('5m left of 5m (fresh)')
    expect(r.text).toContain("TTL: 5m, as Anthropic's last reply wrote the cache.")
    expect(r.text).toContain('Auto handoff: waits while the cache lasts under 15m')
    await clock.advance(4.5 * MIN) // under the 1m low mark (a fifth of 5m), not yet cold
    await clock.settle()
    r = await $.command.run({ command: 'cacheclock', args: '' } as never)
    expect(r.text).toContain('<1m left of 5m (low, under 1m)')
    expect(forks.length).toBe(0)
  })

  test('the script gets the transcript the Stop names; without python the option stays', async ($, on) => {
    const runs: string[][] = []
    world(on, {
      run: argv => {
        runs.push([...argv])
        throw new Error('not found')
      },
    })
    on('classic.Stop', () => ({}))
    await $.turn.complete(TURN)
    await $.classic.Stop(STOP)
    const r = await $.command.run({ command: 'cacheclock', args: '' } as never)
    const py = runs.filter(a => norm(a[1]).endsWith('/bin/ttl.py'))
    expect(py.map(a => a[0])).toEqual(['python', 'python3'])
    expect(py[0]?.[2]).toBe('C:/t/s1.jsonl')
    expect(r.text).toContain('60m left of 60m (fresh)')
    expect(r.text).toContain('TTL: 60m from the cacheTtlMinutes option')
  })

  test('a reply not yet in the transcript at Stop is read on a retry', async ($, on) => {
    let calls = 0
    const { clock } = world(on, {
      run: argv => {
        if (!norm(argv[1]).endsWith('/bin/ttl.py')) throw new Error('not here')
        calls += 1
        return { exitCode: 0, stdout: calls >= 2 ? FIVE : '', stderr: '' }
      },
    })
    on('classic.Stop', () => ({}))
    await $.turn.complete(TURN)
    await $.classic.Stop(STOP)
    await clock.settle()
    expect((await $.command.run({ command: 'cacheclock', args: '' } as never)).text).toContain('TTL: 60m from the cacheTtlMinutes option')
    await clock.advance(3_000)
    await clock.settle()
    expect(calls).toBe(2)
    expect((await $.command.run({ command: 'cacheclock', args: '' } as never)).text).toContain("TTL: 5m, as Anthropic's last reply wrote the cache.")
  })
})

// ---------- the action bar's buttons ----------

describe('bar buttons', () => {
  test('idea shelves the draft and clears the box; an empty box only toasts', async ($, on) => {
    const { seen, shelf, clock, setBox } = world(on)
    await withBar($)
    let band = await $.ui.mount(BAND)
    await band.press({ key: 'idea' })
    await clock.settle()
    await band.unmount()
    expect(seen.toasts.at(-1)).toBe('Idea: type the idea in the prompt box first')
    setBox('cache the nav mesh')
    band = await $.ui.mount(BAND)
    await band.press({ key: 'idea' })
    await clock.settle()
    await band.unmount()
    expect(shelf().ideas.map(i => i.text)).toEqual(['cache the nav mesh'])
    expect(seen.fills.at(-1)).toBe('')
    expect(seen.toasts.at(-1)).toBe('Shelved #1')
    band = await $.ui.mount(BAND)
    expect(await band.find({ type: 'Text', text: '💡 1' })).toBeDefined()
    await band.unmount()
  })

  test('enhance runs bws-enhance on the draft; without bws-enhance it says so', async ($, on) => {
    const { seen, clock, setBox } = world(on, { commands: ['enhance'] })
    await withBar($)
    setBox('fix the bow')
    const band = await $.ui.mount(BAND)
    await band.press({ key: 'enhance' })
    await clock.settle()
    await band.unmount()
    expect(seen.commands.filter(c => c.command === 'enhance')).toEqual([{ command: 'enhance', args: 'fix the bow' }])
  })

  test('enhance without bws-enhance loaded only toasts', async ($, on) => {
    const { seen, clock, setBox } = world(on)
    await withBar($)
    setBox('fix the bow')
    const band = await $.ui.mount(BAND)
    await band.press({ key: 'enhance' })
    await clock.settle()
    await band.unmount()
    expect(seen.commands.filter(c => c.command === 'enhance')).toEqual([])
    expect(seen.toasts.at(-1)).toBe('Enhance: bws-enhance is not loaded')
  })

  test('the badge opens, then closes the dashboard; a signal opens it on its tab', async ($, on) => {
    const { seen, clock } = world(on, { shelf: seeded() })
    await withBar($)
    let band = await $.ui.mount(BAND)
    await band.press({ key: 'dash' })
    await clock.settle()
    await band.unmount()
    expect(seen.opened.map(o => o.id)).toEqual(['dashboard'])
    band = await $.ui.mount(BAND)
    await band.press({ key: 'dash' })
    await clock.settle()
    await band.unmount()
    expect(seen.closed.at(-1)).toBe('dashboard')
    band = await $.ui.mount(BAND)
    await band.press({ key: 'tab-shelf' }) // the ideas signal
    await clock.settle()
    await band.unmount()
    expect(seen.opened.length).toBe(2)
    const ui = await $.ui.mount(PANE)
    expect((await ui.find({ key: 'tab-shelf' }))?.props?.variant).toBe('primary')
    await ui.unmount()
  })
})

const FOOTER = (surface: 'terminal' | 'desktop' | 'mobile' = 'terminal', modes: string[] = ['plan']) =>
  ({ plugin: 'bws-cockpit', component: 'SessionMode', surface, props: { modes } }) as const

describe('footer cockpit button', () => {
  test('draws beside the engine mode labels on terminal and desktop', async ($, on) => {
    world(on)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount(FOOTER(surface))
      expect(String((await ui.find({ key: 'cockpit' }))?.props?.label)).toContain('cockpit')
      expect(await ui.find({ type: 'Text', text: 'plan' })).toBeDefined()
      await ui.unmount()
    }
  })

  test('keeps another mod footer and draws the labels once', async ($, on) => {
    world(on)
    on('ui.render', () => ({ type: 'Text', props: {}, children: ['side footer'] }) as never)
    const ui = await $.ui.mount(FOOTER())
    expect(await ui.find({ type: 'Text', text: 'side footer' })).toBeDefined()
    expect(await ui.find({ key: 'cockpit' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'plan' })).toBeUndefined()
    await ui.unmount()
  })

  test('leaves other surfaces alone', async ($, on) => {
    world(on)
    on('ui.render', () => ({ type: 'Text', props: {}, children: ['engine footer'] }) as never)
    const ui = await $.ui.mount(FOOTER('mobile'))
    expect(await ui.find({ key: 'cockpit' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'engine footer' })).toBeDefined()
    await ui.unmount()
  })

  test('press opens the dashboard, again closes it; a hidden bar comes back', async ($, on) => {
    const { seen, clock } = world(on, { shelf: seeded() })
    on('ui.render', () => ({ type: 'Text', props: {}, children: ['engine'] }) as never) // the hidden bar passes to it
    await withBar($)
    await $.command.run({ command: 'cockpit', args: 'hide' } as never)
    let band = await $.ui.mount(BAND)
    expect(await band.find({ key: 'dash' })).toBeUndefined()
    await band.unmount()
    let ui = await $.ui.mount(FOOTER())
    await ui.press({ key: 'cockpit' })
    await clock.settle()
    await ui.unmount()
    expect(seen.opened.map(o => o.id)).toEqual(['dashboard'])
    band = await $.ui.mount(BAND)
    expect(await band.find({ key: 'dash' })).toBeDefined()
    await band.unmount()
    ui = await $.ui.mount(FOOTER())
    await ui.press({ key: 'cockpit' })
    await clock.settle()
    await ui.unmount()
    expect(seen.closed.at(-1)).toBe('dashboard')
  })
})

describe('switchboard', () => {
  const LIST = JSON.stringify([
    { id: 'bws-agents@bws-mods', version: '0.1.0', enabled: true },
    { id: 'bws-notify@bws-mods', version: '0.3.0', enabled: false },
    { id: 'bws-cockpit@bws-mods', version: '0.28.0', enabled: true },
    { id: 'other@elsewhere', version: '1', enabled: true },
  ])
  const agentsTabValue = { title: 'Agents', badge: '🟢1', tone: 'busy', raise: 0, body: [{ kind: 'card', title: '🟢 Explore · Scan', color: 'accent', body: [{ kind: 'text', text: '🔎 running 5s' }] }] }
  const plugins = (argv: readonly string[]) =>
    argv[2] === 'list' ? { exitCode: 0, stdout: LIST, stderr: '' } : { exitCode: 0, stdout: `${argv[2]}d ${argv[3]}`, stderr: '' }

  test('the Agents tab draws as cards; the Mods tab lists every mod with its state and switches', async ($, on) => {
    const { clock, runs } = world(on, { run: plugins, mods: { 'bws-agents': { tab: agentsTabValue } } })
    await $.session.start({ cwd: ROOT } as never)
    await $.command.run({ command: 'dashboard', args: 'agents' } as never)
    await clock.advance(50)
    let ui = await $.ui.mount(PANE)
    expect((await ui.find({ key: 'tab-bws-agents' }))?.props?.label).toBe('Agents 🟢1')
    expect((await ui.find({ key: 'mod-bws-agents-0' }))?.props?.borderColor).toBe('claude')
    expect(await ui.find({ type: 'Text', text: /🟢 Explore · Scan/ })).toBeDefined()
    await ui.unmount()
    await $.command.run({ command: 'switchboard', args: '' } as never)
    await clock.advance(50)
    ui = await $.ui.mount(PANE)
    expect(runs.some(r => r.join(' ') === 'claude plugin list --json')).toBe(true)
    expect((await ui.find({ key: 'tab-mods' }))?.props?.variant).toBe('primary')
    expect((await ui.find({ key: 'sw-bws-agents' }))?.props?.borderColor).toBe('success')
    expect((await ui.find({ key: 'sw-bws-notify' }))?.props?.borderColor).toBe('error')
    expect((await ui.find({ key: 'sw-bws-memory' }))?.props?.borderColor).toBe('subtle')
    expect(await ui.find({ key: 'sw-dis-bws-cockpit' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^✅ 0\.1\.0|✅ on · v0\.1\.0 · loaded · tab shown$/ })).toBeDefined()
    await ui.press({ key: 'sw-dis-bws-agents' })
    await clock.advance(50)
    expect(runs.some(r => r.join(' ') === 'claude plugin disable bws-agents@bws-mods')).toBe(true)
    await ui.unmount()
    ui = await $.ui.mount(PANE)
    expect((await ui.find({ key: 'sw-bws-agents' }))?.props?.borderColor).toBe('warning')
    expect(await ui.find({ type: 'Text', text: /run \/reload-plugins to apply/ })).toBeDefined()
    await ui.unmount()
  })

  test('hide keeps a tab out of the dashboard across sessions; show brings it back', async ($, on) => {
    const { clock, store } = world(on, { run: plugins, mods: { 'bws-agents': { tab: agentsTabValue } } })
    await $.session.start({ cwd: ROOT } as never)
    expect((await $.command.run({ command: 'switchboard', args: '--hide agents' } as never)).text).toContain('bws-agents: tab hidden')
    expect(store['switchboard.hidden']).toEqual(['bws-agents'])
    await $.command.run({ command: 'dashboard', args: '' } as never)
    await clock.advance(50)
    let ui = await $.ui.mount(PANE)
    expect(await ui.find({ key: 'tab-bws-agents' })).toBeUndefined()
    await ui.unmount()
    await $.command.run({ command: 'switchboard', args: '--show bws-agents' } as never)
    ui = await $.ui.mount(PANE)
    expect(await ui.find({ key: 'tab-bws-agents' })).toBeDefined()
    await ui.unmount()
  })

  test('headless /switchboard prints the board; bad args print usage; cockpit cannot switch itself off', async ($, on) => {
    world(on, { surfaces: [], run: plugins, commands: [] })
    await $.session.start({ cwd: ROOT } as never)
    const r = await $.command.run({ command: 'switchboard', args: 'text' } as never)
    expect(r.text).toContain('Mods: ')
    expect(r.text).toContain('🤖 Agents (bws-agents): on · v0.1.0')
    expect(r.text).toContain('🔔 Notify (bws-notify): off · v0.3.0')
    expect((await $.command.run({ command: 'switchboard', args: '--disable' } as never)).text).toMatch(/^Usage/)
    expect((await $.command.run({ command: 'switchboard', args: '--disable cockpit' } as never)).text).toContain('cannot switch cockpit')
  })
})

