import { test, expect, mock, describe } from 'claude-code/testing'
import type { On } from 'claude-code'
import { memoryFile, type Entry } from '../hooks/memory'

declare const setTimeout: (fn: (...a: never[]) => void, ms: number) => unknown

const CWD = 'C:\\proj'
const DIR = 'C:/proj/.claude/bws-memory'
const LONG = 'from now on always use tabs and never spaces in this repository please'
const TURN = { answer: 'Understood, tabs it is.', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' }
const ROWS = [
  { role: 'user', text: LONG, toolUses: [] },
  { role: 'assistant', text: 'Understood, tabs it is.', toolUses: [] },
]
const TABS: Entry = { file: 'prefers-tabs.md', name: 'prefers-tabs', description: 'The user wants tabs, not spaces', type: 'feedback', body: 'Use tabs.\n\nWhy: house style.\nHow to apply: every file.' }
const reply = (...entries: object[]) => JSON.stringify({ entries })
const TABS_JSON = { file: 'prefers-tabs', name: 'prefers-tabs', description: 'The user wants tabs, not spaces', type: 'feedback', body: TABS.body }

type Fork = string | { isAnswered: false; reason: string } | 'throw' | 'defer'

type World = {
  surfaces?: string[]
  rows?: object[]
  classify?: 'yes' | 'no' | 'throw' | 'none'
  fork?: Fork
  complete?: string
  files?: Record<string, string>
  session?: string
}

const norm = (p: string) => p.replace(/\\/g, '/')

// Stubs every outside call the mod makes, with an in-memory folder, and records what reached the engine.
function world(on: On, w: World = {}) {
  const clock = mock.clock(on, { now: 1_700_000_000_000 })
  const files = new Map<string, string>(Object.entries(w.files ?? {}))
  const seen = {
    classify: [] as { text: string; labels: readonly string[]; options: unknown }[],
    fork: [] as string[],
    complete: [] as { model: string; prompt: string }[],
    writes: [] as string[],
    opened: [] as string[],
    closed: [] as string[],
    logs: [] as { text: string; to?: string }[],
    toasts: [] as string[],
  }
  const who = { session: w.session ?? 'session-aaaa-1111' }
  let release: (text: string) => void = () => undefined
  on('session.start', ($, e) => ({ cwd: CWD }) as never)
  on('session.id', () => ({ value: who.session }))
  on('session.cwd', () => ({ value: CWD }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('session.surfaces', () => ({ value: (w.surfaces ?? ['terminal']) as never }))
  on('session.messages', () => ({ value: (w.rows ?? ROWS) as never }))
  on('command.register', () => ({ value: undefined as never }))
  on('fs.read', ($, e) => {
    const t = files.get(norm(e.path))
    if (t === undefined) throw new Error(`ENOENT ${norm(e.path)}`)
    return { value: t as never }
  })
  on('fs.write', ($, e) => {
    files.set(norm(e.path), e.text)
    seen.writes.push(norm(e.path))
    return { value: undefined as never }
  })
  on('fs.list', ($, e) => {
    const dir = norm(e.path).replace(/\/$/, '')
    const names = [...files.keys()].filter(p => p.startsWith(`${dir}/`) && !p.slice(dir.length + 1).includes('/'))
    if (names.length === 0) throw new Error('ENOENT')
    return { value: names.map(p => ({ name: p.slice(dir.length + 1), kind: 'file', size: 1, mtimeMs: 0, isLink: false })) as never }
  })
  on('model.classify', ($, e) => {
    seen.classify.push({ text: e.text, labels: e.labels, options: e.options })
    if (w.classify === 'throw') throw new Error('classifier down')
    return { value: (w.classify === 'none' ? undefined : (w.classify ?? 'yes')) as never }
  })
  on('model.fork', ($, e) => {
    seen.fork.push(e.prompt)
    const f = w.fork ?? reply(TABS_JSON)
    if (f === 'throw') throw new Error('fork down')
    if (f === 'defer') return new Promise(resolve => (release = text => resolve({ value: { isAnswered: true, text, usage: {} } as never }))) as never
    return { value: (typeof f === 'string' ? { isAnswered: true, text: f, usage: {} } : f) as never }
  })
  on('model.complete', ($, e) => {
    seen.complete.push({ model: e.model, prompt: e.prompt })
    return { value: { isAnswered: true, text: w.complete ?? reply(TABS_JSON), usage: {} } as never }
  })
  on('ui.open', ($, e) => {
    seen.opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', ($, e) => {
    seen.closed.push(e.id)
    return { value: undefined as never }
  })
  on('ui.toast', ($, e) => {
    seen.toasts.push(e.text)
    return { value: undefined as never }
  })
  on('ui.log', ($, e) => {
    seen.logs.push({ text: e.text, to: e.to })
    return { value: undefined as never }
  })
  on('turn.complete', () => ({ text: '' }) as never)
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  return { seen, clock, files, who, release: (text: string) => release(text) }
}

const PANE = {
  plugin: 'bws-memory',
  component: 'Pane',
  requestId: 'bws-memory',
  props: { title: 'Memory', isFocused: false, bodyColumns: 80, placement: 'inline', scroll: { offset: 0, bodyRows: 8 }, view: {} },
} as const

// Lets the deferred work and the awaits behind it run.
async function drain(clock: { advance: (ms: number) => Promise<unknown> }) {
  await clock.advance(10)
  for (let i = 0; i < 40; i++) await new Promise(r => setTimeout(r, 0))
}

const turn = ($: { turn: { complete: (i: never) => Promise<unknown> } }, o: object = {}) => $.turn.complete({ ...TURN, ...o } as never)
const run = async ($: { command: { run: (i: never) => Promise<unknown> } }, command: string, args = '') => ((await $.command.run({ command, args } as never)) as { text: string }).text
const SESSION_END = (reason: string, sessionId = 'session-aaaa-1111') => ({ reason, sessionId, resume: {} }) as never

describe('FR-MEM-01: classify the last exchange after a turn', () => {
  test('remember: the turn returns at once, then one classify call, one fork and a file under memoryDir', async ($, on) => {
    const { seen, clock, files } = world(on)
    await $.session.start({ cwd: CWD } as never)
    const r = (await turn($)) as { text: string }
    expect(r.text).toBe('') // the turn is not held up: nothing has run yet
    expect(seen.classify.length).toBe(0)
    await drain(clock)
    expect(seen.classify.length).toBe(1)
    expect(seen.classify[0]?.labels).toEqual(['yes', 'no'])
    expect(seen.classify[0]?.options).toEqual({ model: 'haiku' })
    expect(seen.classify[0]?.text).toContain(`USER: ${LONG}`)
    expect(seen.classify[0]?.text).toContain('ASSISTANT: Understood, tabs it is.')
    expect(seen.fork.length).toBe(1)
    expect(files.get(`${DIR}/prefers-tabs.md`)).toBe(memoryFile(TABS))
  })

  test('none: a "no" from the classifier forks nothing and writes nothing', async ($, on) => {
    const { seen, clock, files } = world(on, { classify: 'no' })
    await turn($)
    await drain(clock)
    expect(seen.classify.length).toBe(1)
    expect(seen.fork.length).toBe(0)
    expect(files.size).toBe(0)
  })

  test('skips: a short turn with no tools makes no model call at all', async ($, on) => {
    const short = world(on, { rows: [{ role: 'user', text: 'yes please do that', toolUses: [] }, { role: 'assistant', text: 'ok', toolUses: [] }] })
    await turn($)
    await drain(short.clock)
    expect(short.seen.classify.length + short.seen.fork.length).toBe(0)
  })

  test('skips: headless runs', async ($, on) => {
    const w = world(on, { surfaces: [] })
    await turn($)
    await drain(w.clock)
    expect(w.seen.classify.length).toBe(0)
  })

  test('skips: a subagent turn and an interrupted turn', async ($, on) => {
    const w = world(on)
    await turn($, { agentId: 'sub-1' })
    await turn($, { reason: 'aborted', isAborted: true })
    await drain(w.clock)
    expect(w.seen.classify.length).toBe(0)
  })

  test('a short turn that used tools is classified', async ($, on) => {
    const w = world(on, { rows: [{ role: 'user', text: 'use tabs', toolUses: [] }, { role: 'assistant', text: 'ok', toolUses: [{ tool: 'Edit' }] }] })
    await turn($)
    await drain(w.clock)
    expect(w.seen.classify.length).toBe(1)
  })

  test('minWords is an option', { options: { minWords: 3 } }, async ($, on) => {
    const w = world(on, { rows: [{ role: 'user', text: 'use tabs please', toolUses: [] }, { role: 'assistant', text: 'ok', toolUses: [] }] })
    await turn($)
    await drain(w.clock)
    expect(w.seen.classify.length).toBe(1)
  })

  test('the model option picks the classifier', { options: { model: 'sonnet' } }, async ($, on) => {
    const w = world(on)
    await turn($)
    await drain(w.clock)
    expect(w.seen.classify[0]?.options).toEqual({ model: 'sonnet' })
  })

  test('skip while a previous memory fork is running; the next turn is looked at once it ends', async ($, on) => {
    const w = world(on, { fork: 'defer' })
    await turn($)
    await drain(w.clock)
    expect(w.seen.fork.length).toBe(1)
    await turn($)
    await drain(w.clock)
    expect(w.seen.classify.length).toBe(1) // the second turn made no call
    w.release(reply(TABS_JSON))
    await drain(w.clock)
    expect(w.files.has(`${DIR}/prefers-tabs.md`)).toBe(true)
    await turn($)
    await drain(w.clock)
    expect(w.seen.classify.length).toBe(2)
  })

  test('does not intercept unrelated events: a prompt passes through untouched, with no model call', async ($, on) => {
    const w = world(on)
    on('prompt.submit', ($, e) => ({ text: e.text, context: e.context }))
    await $.session.start({ cwd: CWD } as never)
    const r = (await $.prompt.submit({ text: LONG, origin: { kind: 'composer' }, wait: false } as never)) as { text: string; context?: unknown }
    expect(r).toEqual({ text: LONG, context: undefined })
    await drain(w.clock)
    expect(w.seen.classify.length + w.seen.fork.length + w.seen.complete.length).toBe(0)
  })
})

describe('FR-ALL-03: fails open', () => {
  test('a classifier error: nothing is written, one debug line, the next turn is still looked at', async ($, on) => {
    const w = world(on, { classify: 'throw' })
    await turn($)
    await drain(w.clock)
    expect(w.files.size).toBe(0)
    const lines = w.seen.logs.filter(l => l.text.startsWith('bws-memory:'))
    expect(lines).toEqual([{ text: 'bws-memory: classify failed (error); continuing unchanged', to: 'debug' }])
    expect(lines[0]?.text).not.toContain(LONG)
    await turn($)
    await drain(w.clock)
    expect(w.seen.classify.length).toBe(2)
  })

  test('a fork that throws: nothing is written, one debug line', async ($, on) => {
    const a = world(on, { fork: 'throw' })
    await turn($)
    await drain(a.clock)
    expect(a.files.size).toBe(0)
    expect(a.seen.logs.some(l => l.text.startsWith('bws-memory: fork failed'))).toBe(true)
  })

  test('a fork that answers with no JSON: nothing is written, the guard resets', async ($, on) => {
    const b = world(on, { fork: 'I could not decide.' })
    await turn($)
    await drain(b.clock)
    expect(b.files.size).toBe(0)
    expect(b.seen.logs.some(l => l.text === 'bws-memory: parse failed (unreadable reply); nothing written')).toBe(true)
    await turn($)
    await drain(b.clock)
    expect(b.seen.classify.length).toBe(2)
  })

  test('a fork that does not answer within 90 s: the guard releases and the late reply is ignored', async ($, on) => {
    const w = world(on, { fork: 'defer' })
    await turn($)
    await drain(w.clock)
    await w.clock.advance(90_000)
    for (let i = 0; i < 20; i++) await new Promise(r => setTimeout(r, 0))
    expect(w.seen.logs.some(l => l.text.includes('fork failed (timeout)'))).toBe(true)
    w.release(reply(TABS_JSON))
    await drain(w.clock)
    expect(w.files.size).toBe(0)
  })
})

describe('FR-MEM-02: files, MEMORY.md, update and duplicate', () => {
  test('a new file, one MEMORY.md line, a sources.json record', async ($, on) => {
    const { clock, files } = world(on)
    await turn($)
    await drain(clock)
    expect(files.get(`${DIR}/MEMORY.md`)).toBe('- [prefers-tabs](prefers-tabs.md) — The user wants tabs, not spaces\n')
    expect(JSON.parse(files.get(`${DIR}/sources.json`) ?? '{}')).toEqual({ writes: [{ file: 'prefers-tabs.md', session: 'session-aaaa-1111', at: 1_700_000_000_010, kind: 'new' }] })
  })

  test('the fork is told about the existing files; a same-name entry updates, never duplicates', async ($, on) => {
    const old = memoryFile(TABS)
    const w = world(on, {
      files: { [`${DIR}/prefers-tabs.md`]: old, [`${DIR}/MEMORY.md`]: '- [prefers-tabs](prefers-tabs.md) — The user wants tabs, not spaces\n' },
      fork: reply({ ...TABS_JSON, name: 'tabs-rule', file: 'tabs-rule', body: 'Use tabs.\n\nWhy: the linter enforces it.' }),
    })
    await turn($)
    await drain(w.clock)
    expect(w.seen.fork[0]).toContain('- prefers-tabs.md: prefers-tabs - The user wants tabs, not spaces')
    // a different name and file: it is a new file
    expect([...w.files.keys()].filter(k => k.endsWith('.md') && !k.endsWith('MEMORY.md')).sort()).toEqual([`${DIR}/prefers-tabs.md`, `${DIR}/tabs-rule.md`])
  })

  test('the same file name updates in place: one MEMORY.md line, one file', async ($, on) => {
    const old = memoryFile(TABS)
    const u = world(on, { files: { [`${DIR}/prefers-tabs.md`]: old, [`${DIR}/MEMORY.md`]: '- [prefers-tabs](prefers-tabs.md) — old\n' }, fork: reply({ ...TABS_JSON, body: 'Use tabs, always.' }) })
    await turn($)
    await drain(u.clock)
    expect(u.files.get(`${DIR}/prefers-tabs.md`)).toContain('Use tabs, always.')
    expect(u.files.get(`${DIR}/MEMORY.md`)).toBe('- [prefers-tabs](prefers-tabs.md) — The user wants tabs, not spaces\n') // replaced in place, one line
    expect([...u.files.keys()].filter(k => k.endsWith('.md') && !k.endsWith('MEMORY.md')).length).toBe(1)
  })

  test('the same entry again is refused as a duplicate: nothing is written', async ($, on) => {
    const w = world(on, { files: { [`${DIR}/prefers-tabs.md`]: memoryFile(TABS) } })
    await turn($)
    await drain(w.clock)
    expect(w.seen.writes).toEqual([])
    expect(w.seen.opened).toEqual([])
  })

  test('a name that matches an existing file under another file name updates that file', async ($, on) => {
    const w = world(on, { files: { [`${DIR}/tabs.md`]: memoryFile({ ...TABS, file: 'tabs.md' }) }, fork: reply({ ...TABS_JSON, file: 'something-else', body: 'Changed.' }) })
    await turn($)
    await drain(w.clock)
    expect(w.files.get(`${DIR}/tabs.md`)).toContain('Changed.')
    expect(w.files.has(`${DIR}/something-else.md`)).toBe(false)
  })

  test('memoryDir option: absolute, and relative to the project', { options: { memoryDir: 'D:\\notes\\mem' } }, async ($, on) => {
    const w = world(on)
    await turn($)
    await drain(w.clock)
    expect(w.files.has('D:/notes/mem/prefers-tabs.md')).toBe(true)
  })
})

describe('FR-MEM-03: redaction', () => {
  test('a secret in the fork reply is [redacted] in the file, the index and the sources', async ($, on) => {
    const w = world(on, { fork: reply({ ...TABS_JSON, description: 'deploys with sk-abcdefghijklmnopqrstuv', body: 'Deploy notes. Set API_KEY=abc12345xyz before running.\nMore ordinary words follow here.' }) })
    await turn($)
    await drain(w.clock)
    const all = [...w.files.values()].join('\n')
    expect(all).not.toContain('sk-abcdefghijklmnopqrstuv')
    expect(all).not.toContain('abc12345xyz')
    expect(w.files.get(`${DIR}/prefers-tabs.md`)).toContain('API_KEY=[redacted]')
    expect(w.files.get(`${DIR}/MEMORY.md`)).toContain('deploys with [redacted]')
  })

  test('a reply that is mostly secrets is dropped: nothing written, one debug line without the secret', async ($, on) => {
    const secret = 'sk-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH'
    const w = world(on, { fork: reply({ ...TABS_JSON, body: secret }) })
    await turn($)
    await drain(w.clock)
    expect(w.files.size).toBe(0)
    const line = w.seen.logs.find(l => l.text.startsWith('bws-memory: redact'))
    expect(line?.text).toBe('bws-memory: redact failed (the reply was mostly secrets; dropped); nothing written')
    expect(JSON.stringify(w.seen.logs)).not.toContain(secret)
  })
})

describe('FR-MEM-04: chip and pane', () => {
  test('working: the pane view says memory updating; done: a closable pane lists the file with + and -', async ($, on) => {
    const w = world(on, { fork: 'defer' })
    await turn($)
    await drain(w.clock)
    const working = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await working.find({ type: 'Text', text: /memory updating/ })).toBeDefined()
    await working.unmount()
    w.release(reply(TABS_JSON))
    await drain(w.clock)
    expect(w.seen.opened).toEqual(['bws-memory'])
    expect(w.seen.closed.length).toBeGreaterThanOrEqual(1) // closed before it was opened: never mounted twice
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /Memory updated: 1 file/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /new\s+prefers-tabs\.md \+9 -0/ })).toBeDefined()
    expect(await ui.find({ key: 'close' })).toBeDefined()
    await ui.press({ key: 'close' } as never)
    await ui.unmount()
    expect(w.seen.closed[w.seen.closed.length - 1]).toBe('bws-memory')
    const after = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await after.find({ type: 'Text', text: /No memory changes/ })).toBeDefined()
    await after.unmount()
  })

  test('a failed run shows a closable warning in the pane view', async ($, on) => {
    const w = world(on, { fork: 'nonsense' })
    await turn($)
    await drain(w.clock)
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    expect(await ui.find({ type: 'Text', text: /Memory not saved: parse: unreadable reply/ })).toBeDefined()
    await ui.unmount()
  })
})

describe('FR-MEM-05: /remember, /memories, /memory-undo', () => {
  test('/remember with no text prints the usage and makes no call', async ($, on) => {
    const w = world(on)
    expect(await run($, 'remember', '  ')).toBe('Usage: /remember <what to remember>')
    expect(w.seen.fork.length + w.seen.classify.length).toBe(0)
  })

  test('/remember <text>: no classifier; the fork gets the text; a file is written (interactive: behind the command)', async ($, on) => {
    const w = world(on)
    expect(await run($, 'remember', 'use tabs')).toBe('Remembering... the pane lists what changed.')
    expect(w.files.size).toBe(0)
    await drain(w.clock)
    expect(w.seen.classify.length).toBe(0)
    expect(w.seen.fork[0]).toContain('<remember>use tabs</remember>')
    expect(w.files.has(`${DIR}/prefers-tabs.md`)).toBe(true)
    expect(w.seen.opened).toEqual(['bws-memory'])
  })

  test('/remember headless: awaited inline; with nothing to fork it asks the model with the text alone', async ($, on) => {
    const w = world(on, { surfaces: [], fork: { isAnswered: false, reason: 'nothing-to-fork' } })
    const text = await run($, 'remember', 'that the build uses pnpm')
    expect(text).toBe('Memory updated: prefers-tabs.md (new) +9 -0.')
    expect(w.seen.complete.length).toBe(1)
    expect(w.seen.complete[0]?.model).toBe('claude-sonnet-5-5')
    expect(w.seen.complete[0]?.prompt).toContain('<remember>that the build uses pnpm</remember>')
    expect(w.files.has(`${DIR}/prefers-tabs.md`)).toBe(true)
  })

  test('/remember while a run is in flight is refused', async ($, on) => {
    const w = world(on, { fork: 'defer' })
    await turn($)
    await drain(w.clock)
    expect(await run($, 'remember', 'x')).toBe('A memory update is already running; try again in a moment.')
  })

  test('/memories lists the last 20 writes with their session; none yet says so', async ($, on) => {
    const w = world(on)
    expect(await run($, 'memories')).toBe('No memories written yet.')
    await turn($)
    await drain(w.clock)
    const text = await run($, 'memories')
    expect(text).toContain('The last 1 memory write, newest first:')
    expect(text).toContain('- prefers-tabs.md: new, session session-')
  })

  test('/memory-undo restores the previous version of an updated file, empties a new one, and is one deep', async ($, on) => {
    const old = memoryFile({ ...TABS, body: 'Old body.' })
    const w = world(on, {
      files: { [`${DIR}/prefers-tabs.md`]: old, [`${DIR}/MEMORY.md`]: '- [prefers-tabs](prefers-tabs.md) — old\n' },
      fork: reply(TABS_JSON, { file: 'second', name: 'second', description: 'another', type: 'user', body: 'The second one.' }),
    })
    expect(await run($, 'memory-undo')).toBe('Nothing to undo.')
    await turn($)
    await drain(w.clock)
    expect(w.files.get(`${DIR}/prefers-tabs.md`)).toBe(memoryFile(TABS))
    expect(w.files.get(`${DIR}/second.md`)).toContain('The second one.')
    const text = await run($, 'memory-undo')
    expect(text).toBe('Undid the last memory write: 1 file restored, 1 new file emptied (a mod cannot delete files; its index line is gone).')
    expect(w.files.get(`${DIR}/prefers-tabs.md`)).toBe(old)
    expect(w.files.get(`${DIR}/second.md`)).toBe('')
    expect(w.files.get(`${DIR}/MEMORY.md`)).toBe('- [prefers-tabs](prefers-tabs.md) — old\n')
    expect(JSON.parse(w.files.get(`${DIR}/sources.json`) ?? '{}')).toEqual({ writes: [] })
    expect(await run($, 'memory-undo')).toBe('Nothing to undo.')
  })
})

describe('FR-MEM-06: /clear, /resume, /branch', () => {
  test('/clear while a fork runs: the guard resets, the pane closes, the late reply writes nothing', async ($, on) => {
    const w = world(on, { fork: 'defer' })
    await turn($)
    await drain(w.clock)
    await $.session.end(SESSION_END('clear'))
    const closedBefore = w.seen.closed.length
    expect(closedBefore).toBeGreaterThanOrEqual(1)
    w.release(reply(TABS_JSON))
    await drain(w.clock)
    expect(w.files.size).toBe(0) // the reply belonged to the cleared conversation
    expect(w.seen.opened).toEqual([])
    await turn($) // the guard reset: the next turn is looked at again
    await drain(w.clock)
    expect(w.seen.classify.length).toBe(2)
  })

  test('/clear itself starts no work: no model call, no file', async ($, on) => {
    const w = world(on)
    await $.session.end(SESSION_END('clear'))
    await drain(w.clock)
    expect(w.seen.classify.length + w.seen.fork.length + w.seen.complete.length).toBe(0)
    expect(w.files.size).toBe(0)
  })

  test('/resume resets the guard too; a logout or exit does not touch the pane', async ($, on) => {
    const w = world(on, { fork: 'defer' })
    await turn($)
    await drain(w.clock)
    await $.session.end(SESSION_END('prompt_input_exit'))
    expect(w.seen.closed).toEqual([])
    await $.session.end(SESSION_END('resume'))
    expect(w.seen.closed.length).toBeGreaterThanOrEqual(1)
    await turn($)
    await drain(w.clock)
    expect(w.seen.classify.length).toBe(2)
  })

  test('/branch (a new session id, no event): the next turn resets the guard and drops the old fork', async ($, on) => {
    const w = world(on, { fork: 'defer' })
    await turn($)
    await drain(w.clock)
    w.who.session = 'session-bbbb-2222'
    await turn($)
    await drain(w.clock)
    expect(w.seen.classify.length).toBe(2) // not blocked by the old guard
    w.release(reply(TABS_JSON)) // resolves the newest fork
    await drain(w.clock)
    expect(w.files.has(`${DIR}/prefers-tabs.md`)).toBe(true)
    expect(JSON.parse(w.files.get(`${DIR}/sources.json`) ?? '{}').writes[0].session).toBe('session-bbbb-2222')
  })
})
