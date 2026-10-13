import { test, expect, mock, describe } from 'claude-code/testing'
import type { On } from 'claude-code'
import { add, listText, markSent, setCorrection, setVerdict, summary, verdictPrompt } from '../hooks/assumptions'
import { addIdea, age, contextLine, EMPTY, isAllScope, listText as ideasText, openIdeas, parseShelf, serializeShelf, setStatus, shelfPath } from '../hooks/shelf'
import type { Assumption } from '../types'

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
  board?: { summary: { agents: number; openAsks: number; askedOfMe: number } | null; lines: string[] }
  commands?: string[]
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
  on('session.usage', () => ({ value: { startedAt: 5, context: { window: 200_000, percent: w.percent }, rateLimits: [] } as never }))
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
  on('process.run', () => {
    throw new Error('no processes here')
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
      return { value: { value: ref.key === 'summary' ? b.summary : b.lines, version: 1 } } as never
    })
  }
  const shelf = () => parseShelf(files[FILE])
  const setBox = (text: string) => {
    box = text
  }
  return { seen, clock, files, shelf, panes, setBox }
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

  test('age, scope words, context line', () => {
    expect(age(0, 3 * 3_600_000)).toBe('3h')
    expect(isAllScope(' all ')).toBe(true)
    expect(isAllScope('')).toBe(false)
    expect(contextLine(1, 'T')).toMatch(/^1 open idea on this project's idea shelf.*call T/)
  })
})

// ---------- Assumptions tab ----------

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
    expect(await ui.find({ type: 'Text', text: 'A1 Use wttr.in' })).toBeDefined()
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
    expect(await ui.find({ type: 'Text', text: /#2 site idea/ })).toBeDefined()
    expect((await ui.find({ key: 'tab-shelf' }))?.props?.label).toBe('Shelf 1') // still this project's count
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
    const chip = await band.find({ type: 'Text', text: '⚑ 2' })
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

  test('tab buttons open the dashboard on their tab; dash opens, then closes', async ($, on) => {
    const { seen, clock } = world(on, { shelf: seeded() })
    await withBar($)
    let band = await $.ui.mount(BAND)
    await band.press({ key: 'tab-shelf' })
    await clock.settle()
    await band.unmount()
    expect(seen.opened.map(o => o.id)).toEqual(['dashboard'])
    const ui = await $.ui.mount(PANE)
    expect((await ui.find({ key: 'tab-shelf' }))?.props?.variant).toBe('primary')
    await ui.unmount()
    band = await $.ui.mount(BAND)
    await band.press({ key: 'dash' })
    await clock.settle()
    await band.unmount()
    expect(seen.closed.at(-1)).toBe('dashboard')
    band = await $.ui.mount(BAND)
    await band.press({ key: 'dash' })
    await clock.settle()
    await band.unmount()
    expect(seen.opened.length).toBe(2)
  })
})
