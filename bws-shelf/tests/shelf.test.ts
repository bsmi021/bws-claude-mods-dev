import { test, expect, mock, describe } from 'claude-code/testing'
import type { On } from 'claude-code'
import { addIdea, age, contextLine, EMPTY, isAllScope, listText, openIdeas, parseShelf, serializeShelf, setStatus, shelfPath } from '../hooks/lib'

const HOME = 'C:/Users/me'
const FILE = `${HOME}/.claude/idea-shelf/shelf.json`
const ROOT = 'C:/Projects/game'
const OTHER = 'C:/Projects/site'
const NOW = 1_000_000_000

const norm = (p: unknown) => String(p).replace(/\\/g, '/')

type World = { surfaces?: string[]; root?: string; shelf?: string; box?: string; panes?: string[] }

// Stubs every outside call the mod makes; the shelf file lives in `files`, so writes show up in later reads.
function world(on: On, w: World = {}) {
  const clock = mock.clock(on, { now: NOW })
  const files: Record<string, string> = {}
  if (w.shelf !== undefined) files[FILE] = w.shelf
  const seen = { toasts: [] as string[], fills: [] as string[], opened: [] as { id: string; focus?: boolean; closeOnEscape?: boolean }[], closed: [] as string[] }
  let box = w.box ?? ''
  on('session.surfaces', () => ({ value: (w.surfaces ?? ['terminal']) as never }))
  on('session.root', () => ({ value: w.root ?? `${ROOT}\\` }))
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
  on('ui.toast', ($, e) => {
    seen.toasts.push(String((e as unknown as { text: string }).text ?? e))
    return { value: undefined as never }
  })
  on('ui.panes', () => ({ value: (w.panes ?? []).map(id => ({ id })) as never }))
  on('ui.open', ($, e) => {
    seen.opened.push({ id: e.id, focus: e.focus, closeOnEscape: e.closeOnEscape })
    return { value: { isPlaced: true } }
  })
  on('ui.close', ($, e) => {
    seen.closed.push(e.id)
    return { value: undefined } as never
  })
  on('prompt.read', () => ({ value: { text: box, cursor: box.length } }))
  on('prompt.fill', ($, e) => {
    box = e.text
    seen.fills.push(e.text)
    return { isFilled: true }
  })
  const shelf = () => parseShelf(files[FILE])
  // /shelf opens its pane just after the command returns, as the engine runs it.
  const openShelf = async ($: { command: { run: (input: never) => Promise<{ text?: string }> } }, args = '') => {
    const r = await $.command.run({ command: 'shelf', args } as never)
    await clock.advance(50)
    return r
  }
  return { seen, clock, files, shelf, openShelf }
}

const seeded = () => {
  let s = addIdea(EMPTY, { text: 'game idea one', by: 'user', project: ROOT, now: NOW - 3_600_000 }).shelf
  s = addIdea(s, { text: 'site idea', by: 'claude', project: OTHER, now: NOW - 60_000 }).shelf
  s = addIdea(s, { text: 'game idea two', detail: 'see src/ai.ts', by: 'claude', project: ROOT, now: NOW - 120_000 }).shelf
  return serializeShelf(s)
}

const PANE = {
  plugin: 'bws-shelf',
  component: 'Pane',
  requestId: 'bws-shelf',
  surface: 'terminal',
  props: { title: 'Idea shelf', isFocused: false, bodyColumns: 100, placement: 'inline', scroll: { offset: 0, bodyRows: 12 }, view: {} },
} as const

describe('lib', () => {
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
    expect(idea.detail).toBeUndefined()
    const done = setStatus(shelf, 1, 'done', 5)
    expect(done.idea?.closedAt).toBe(5)
    expect(openIdeas(done.shelf, '')).toEqual([])
    const back = setStatus(done.shelf, 1, 'open', 6)
    expect(back.idea?.closedAt).toBeUndefined()
    expect(setStatus(shelf, 99, 'done', 1).idea).toBeUndefined()
  })

  test('per project, case-insensitive, newest first; all projects with empty project', () => {
    const s = parseShelf(seeded())
    expect(openIdeas(s, 'c:\\projects\\GAME\\').map(i => i.id)).toEqual([3, 1])
    expect(openIdeas(s, '').map(i => i.id)).toEqual([3, 2, 1])
    expect(listText(openIdeas(s, ROOT), NOW, false, true)).toBe('#3 game idea two  (Claude, 2m)\n    see src/ai.ts\n#1 game idea one  (you, 1h)')
    expect(listText(openIdeas(s, ''), NOW, true, false)).toContain('#2 site idea  (Claude, 1m, site)')
  })

  test('age, scope words, context line', () => {
    expect(age(0, 3 * 3_600_000)).toBe('3h')
    expect(age(0, 3 * 86_400_000)).toBe('3d')
    expect(isAllScope(' all ')).toBe(true)
    expect(isAllScope('')).toBe(false)
    expect(contextLine(1, 'T')).toMatch(/^1 open idea on this project's idea shelf.*call T/)
    expect(contextLine(0, 'T')).toMatch(/^The idea shelf for this project is empty/)
  })
})

describe('mod', () => {
  test('/idea shelves for this project with a toast and no transcript reply', async ($, on) => {
    const { seen, shelf } = world(on)
    const r = await $.command.run({ command: 'idea', args: 'try a bloom pass on the lanterns' } as never)
    expect(r.text).toBeUndefined()
    expect(seen.toasts).toEqual(['Shelved #1'])
    const s = shelf()
    expect(s.ideas).toEqual([{ id: 1, text: 'try a bloom pass on the lanterns', by: 'user', project: ROOT, createdAt: NOW, status: 'open' }])
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
    expect(shelf().ideas.map(i => i.id)).toEqual([1, 2, 3, 4, 5, 6])
  })

  test('shelve_idea from Claude: saved as Claude, result says to carry on, user is told', async ($, on) => {
    const { seen, shelf } = world(on)
    const r = await $.tool.call({ tool: 'mcp__bws-shelf__shelve_idea', text: 'cache the nav mesh', detail: 'rebuild is 4 s' } as never)
    expect(String(r.result)).toBe("Shelved as #1. Don't pursue it now; continue the current task.")
    expect(shelf().ideas[0]).toMatchObject({ by: 'claude', detail: 'rebuild is 4 s', project: ROOT })
    expect(seen.toasts).toEqual(['Claude shelved #1: cache the nav mesh'])
    const bad = await $.tool.call({ tool: 'mcp__bws-shelf__shelve_idea', text: '  ' } as never)
    expect(bad.deny).toMatch(/needs text/)
  })

  test('list_ideas: this project by default, all on request', async ($, on) => {
    world(on, { shelf: seeded() })
    const mine = String((await $.tool.call({ tool: 'mcp__bws-shelf__list_ideas' } as never)).result)
    expect(mine).toContain('#3 game idea two')
    expect(mine).not.toContain('site idea')
    const all = String((await $.tool.call({ tool: 'mcp__bws-shelf__list_ideas', scope: 'all' } as never)).result)
    expect(all).toContain('#2 site idea  (Claude, 1m, site)')
  })

  test('close_idea marks done; unknown ids and bad statuses are refused', async ($, on) => {
    const { shelf } = world(on, { shelf: seeded() })
    const r = await $.tool.call({ tool: 'mcp__bws-shelf__close_idea', id: 3, status: 'done' } as never)
    expect(String(r.result)).toBe('#3 is done: game idea two')
    expect(shelf().ideas.find(i => i.id === 3)?.status).toBe('done')
    expect((await $.tool.call({ tool: 'mcp__bws-shelf__close_idea', id: 42, status: 'done' } as never)).deny).toMatch(/No idea #42/)
    expect((await $.tool.call({ tool: 'mcp__bws-shelf__close_idea', id: 1, status: 'later' } as never)).deny).toMatch(/status must be/)
  })

  test('other tools pass through untouched', async ($, on) => {
    world(on)
    on('tool.call', () => ({ result: 'engine' as never }))
    expect((await $.tool.call({ tool: 'Bash', command: 'ls' } as never)).result).toBe('engine')
  })

  test('prompt.context adds one shelf line in attended sessions only', async ($, on) => {
    world(on, { shelf: seeded() })
    on('prompt.context', ($, e) => ({ blocks: e.blocks }))
    const r = await $.prompt.context({ blocks: [{ name: 'currentDate', text: 'today' }] } as never)
    expect(r.blocks).toHaveLength(2)
    expect(r.blocks[1]?.name).toBe('ideaShelf')
    expect(r.blocks[1]?.text).toMatch(/^2 open ideas.*mcp__bws-shelf__shelve_idea/)
  })

  test('prompt.context: nothing headless', async ($, on) => {
    world(on, { surfaces: [], shelf: seeded() })
    on('prompt.context', ($, e) => ({ blocks: e.blocks }))
    expect((await $.prompt.context({ blocks: [] } as never)).blocks).toEqual([])
  })

  test('nudge off: no shelf line', { options: { nudge: false } }, async ($, on) => {
    world(on, { shelf: seeded() })
    on('prompt.context', ($, e) => ({ blocks: e.blocks }))
    expect((await $.prompt.context({ blocks: [] } as never)).blocks).toEqual([])
  })

  test('/shelf headless lists this project with details', async ($, on) => {
    world(on, { surfaces: [], shelf: seeded() })
    const r = await $.command.run({ command: 'shelf', args: '' } as never)
    expect(r.text).toBe('#3 game idea two  (Claude, 2m)\n    see src/ai.ts\n#1 game idea one  (you, 1h)')
  })

  test('/shelf pane: lists this project, Done closes, All shows other projects', async ($, on) => {
    const { seen, shelf, openShelf } = world(on, { shelf: seeded() })
    expect((await openShelf($)).text).toBeUndefined()
    expect(seen.opened).toEqual([{ id: 'bws-shelf', focus: true, closeOnEscape: true }])
    let ui = await $.ui.mount(PANE)
    expect(await ui.find({ type: 'Text', text: /2 open ideas · game/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /#3 game idea two/ }))?.props.wrap).toBe('wrap')
    expect(await ui.find({ type: 'Text', text: /site idea/ })).toBeUndefined()
    await ui.press({ key: 'done-3' })
    await ui.unmount()
    expect(shelf().ideas.find(i => i.id === 3)?.status).toBe('done')
    ui = await $.ui.mount(PANE)
    expect(await ui.find({ type: 'Text', text: /1 open idea · game/ })).toBeDefined()
    await ui.press({ key: 'scope' })
    await ui.unmount()
    ui = await $.ui.mount(PANE)
    expect(await ui.find({ type: 'Text', text: /2 open ideas · all projects/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /#2 site idea/ })).toBeDefined()
    await ui.unmount()
  })

  test('Resume fills an empty box and closes the pane; a busy box is left alone', async ($, on) => {
    const { seen, shelf, openShelf } = world(on, { shelf: seeded() })
    await openShelf($)
    const ui = await $.ui.mount(PANE)
    await ui.press({ key: 'resume-3' })
    await ui.unmount()
    expect(seen.fills).toEqual(['Pick up shelved idea #3: game idea two\n\nsee src/ai.ts'])
    expect(seen.closed).toEqual(['bws-shelf'])
    expect(shelf().ideas.find(i => i.id === 3)?.status).toBe('open')
  })

  test('Resume with text in the box: note, no fill', async ($, on) => {
    const { seen, openShelf } = world(on, { shelf: seeded(), box: 'half-typed' })
    await openShelf($)
    // Text in the box: no focus request, so the person's draft keeps the keys.
    expect(seen.opened).toEqual([{ id: 'bws-shelf', focus: undefined, closeOnEscape: undefined }])
    let ui = await $.ui.mount(PANE)
    await ui.press({ key: 'resume-1' })
    await ui.unmount()
    ui = await $.ui.mount(PANE)
    expect(await ui.find({ type: 'Text', text: /send or clear it first/ })).toBeDefined()
    await ui.unmount()
    expect(seen.fills).toEqual([])
  })

  test('an idea added while the pane is open redraws it', async ($, on) => {
    const { seen, openShelf } = world(on, { shelf: seeded(), panes: ['bws-shelf'] })
    await openShelf($)
    // Already open over an empty box: closed and opened again, so the focus request takes.
    expect(seen.closed).toEqual(['bws-shelf'])
    expect(seen.opened[0]?.focus).toBe(true)
    await $.command.run({ command: 'idea', args: 'fresh one' } as never)
    const ui = await $.ui.mount(PANE)
    expect(await ui.find({ type: 'Text', text: /#4 fresh one/ })).toBeDefined()
    await ui.unmount()
  })
})
