import { test, expect, describe } from 'claude-code/testing'
import { mock } from 'claude-code/testing'
import type { On } from 'claude-code'
import { addRound, digest, parseRound, parseScope, pick, projectKey, qaTab, recordText, type QaRound } from '../hooks/qa'

declare const setTimeout: (fn: (...a: never[]) => void, ms: number) => unknown

const Q1 = 'Which store keeps the record?'
const Q2 = 'Which features?'
const INPUT = {
  questions: [
    { question: Q1, header: 'Storage', multiSelect: false, options: [{ label: 'Plugin store', description: 'x' }, { label: 'Files', description: 'y' }] },
    { question: Q2, header: 'Features', multiSelect: true, options: [{ label: 'Tab', description: '' }, { label: 'Send', description: '' }] },
  ],
  metadata: { source: 'interview:qa-mod' },
}
const RESULT = { questions: INPUT.questions, answers: { [Q1]: 'Plugin store', [Q2]: 'Tab, Send' }, annotations: { [Q1]: { notes: 'keep it small' } } }
const META = { id: 'tu1', at: new Date(2026, 9, 18, 14, 5).getTime(), session: 's1' }

const round = (id: string, session: string, answer: string): QaRound => parseRound({ questions: [{ question: `Q ${id}?`, header: 'H', multiSelect: false, options: [] }] }, { answers: { [`Q ${id}?`]: answer } }, { id, at: META.at, session })!

describe('a round, parsed', () => {
  test('questions, options, answers, notes and the interview tag', async () => {
    const r = parseRound(INPUT, RESULT, META)!
    expect(r.source).toBe('interview:qa-mod')
    expect(r.questions).toEqual([
      { header: 'Storage', question: Q1, options: ['Plugin store', 'Files'], isMulti: false, answer: 'Plugin store', notes: 'keep it small' },
      { header: 'Features', question: Q2, options: ['Tab', 'Send'], isMulti: true, answer: 'Tab, Send', notes: '' },
    ])
    expect(r.isAfk).toBe(false)
  })

  test('nothing answered and no free text: not kept; free text alone is kept; AFK is flagged', async () => {
    expect(parseRound(INPUT, { answers: {} }, META)).toBe(null)
    expect(parseRound(INPUT, { answers: {}, response: 'Use files instead' }, META)?.response).toBe('Use files instead')
    expect(parseRound(INPUT, { ...RESULT, afkTimeoutMs: 60000 }, META)?.isAfk).toBe(true)
    expect(parseRound({ questions: 'x' }, RESULT, META)).toBe(null)
  })

  test('the record keeps the newest rounds and replaces a repeated id', async () => {
    let log: QaRound[] = []
    for (let i = 0; i < 5; i++) log = addRound(log, round(`t${i}`, 's1', 'a'), 3)
    expect(log.map(r => r.id)).toEqual(['t2', 't3', 't4'])
    log = addRound(log, round('t3', 's1', 'changed'), 3)
    expect(log.map(r => r.id)).toEqual(['t2', 't4', 't3'])
  })

  test('project key folds case and slashes', async () => {
    expect(projectKey('C:\\Projects\\Foo\\')).toBe(projectKey('c:/projects/foo'))
  })
})

describe('the digest Claude reads', () => {
  test('each question with its answer and note, oldest first, under a header', async () => {
    const d = digest([{ round: parseRound(INPUT, RESULT, META)!, n: 1 }])
    expect(d).toContain('Treat these answers as decided')
    expect(d).toContain('Round 1 · 2026-10-18 14:05 · interview qa-mod')
    expect(d).toContain(`- [Storage] ${Q1} → Plugin store (note: keep it small)`)
    expect(d).toContain(`- [Features] ${Q2} → Tab, Send`)
  })

  test('over the limit the oldest rounds go and the header says so', async () => {
    const rounds = Array.from({ length: 30 }, (_, i) => ({ round: round(`t${i}`, 's1', 'x'.repeat(200)), n: i + 1 }))
    const d = digest(rounds, 1000)
    expect(d).toContain('older left out')
    expect(d).toContain('Round 30')
    expect(d.includes('Round 1 ')).toBe(false)
  })

  test('scopes: session, all, last N; bad words are refused', async () => {
    const log = [round('a', 's1', 'x'), round('b', 's2', 'y'), round('c', 's2', 'z')]
    expect(pick(log, { kind: 'session' }, 's2').map(x => x.n)).toEqual([2, 3])
    expect(pick(log, { kind: 'all' }, 's2').length).toBe(3)
    expect(pick(log, { kind: 'last', n: 1 }, 's1').map(x => x.round.id)).toEqual(['c'])
    expect(parseScope('')).toEqual({ kind: 'session' })
    expect(parseScope('all')).toEqual({ kind: 'all' })
    expect(parseScope('5')).toEqual({ kind: 'last', n: 5 })
    expect(parseScope('lots')).toBe(null)
  })
})

describe('the tab and /qa text', () => {
  test('empty record: a hint; otherwise the shown round as cards with paging and send buttons', async () => {
    expect(qaTab([], 0, 's1').body[0]).toEqual({ kind: 'text', text: 'No question rounds recorded in this project yet.', isDim: true })
    const log = [round('a', 's1', 'first'), parseRound(INPUT, RESULT, { ...META, session: 's1' })!]
    const t = qaTab(log, 0, 's1')
    expect(t.badge).toBe('2')
    expect(t.body[0]).toEqual({ kind: 'text', text: 'Round 2 of 2 · 2026-10-18 14:05 · interview qa-mod · this session', isBold: true })
    expect(JSON.stringify(t.body)).toContain('→ Plugin store')
    expect(t.body.filter(n => n.kind === 'card').length).toBe(2)
    const older = qaTab(log, 1, 's1')
    expect((older.body[0] as { text: string }).text.startsWith('Round 1 of 2')).toBe(true)
    expect(qaTab(log, 9, 's1').body[0]).toEqual(older.body[0]) // clamped
  })

  test('/qa lists the newest rounds with their numbers', async () => {
    const log = [round('a', 's1', 'one'), round('b', 's1', 'two')]
    const t = recordText(log, 1)
    expect(t).toContain('2 rounds recorded in this project, newest 1 shown')
    expect(t).toContain('Round 2')
    expect(t.includes('→ one')).toBe(false)
  })
})

// ---------- the hooks ----------

type Tab = { title: string; badge: string; body: { kind: string; text?: string }[] }

function world(on: On, cwd = 'C:/proj') {
  const clock = mock.clock(on, { now: META.at })
  const store = new Map<string, unknown>()
  const seen = { submits: [] as string[], tabs: [] as Tab[], opened: [] as string[], tools: [] as string[] }
  const who = { session: 's1', answer: RESULT as unknown, deny: false }
  on('session.start', () => ({ cwd }) as never)
  on('session.id', () => ({ value: who.session }))
  on('session.cwd', () => ({ value: cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }) as never)
  on('tool.register', ($, e) => {
    seen.tools.push(e.name)
    return { value: { tool: e.name } } as never
  })
  on('command.list', () => ({ value: [{ name: 'dashboard' }] as never }))
  on('ui.open', ($, e) => {
    seen.opened.push(e.id)
    return { value: { isPlaced: true } } as never
  })
  on('ui.log', () => ({ value: undefined as never }))
  on('store.get', ($, e) => ({ value: store.get(e.key) as never }))
  on('store.set', ($, e) => {
    store.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined as never }
  })
  on('state.set', { plugin: 'bws-interview', key: 'tab' }, ($, e, next) => {
    seen.tabs.push(JSON.parse(JSON.stringify(e.value)) as Tab)
    return next(e)
  })
  on('tool.call', () => (who.deny ? { deny: 'no' } : { result: who.answer }) as never)
  on('prompt.context', ($, e) => ({ blocks: e.blocks }))
  on('prompt.submit', ($, e) => {
    seen.submits.push(e.text)
    return { text: e.text } as never
  })
  const last = () => seen.tabs[seen.tabs.length - 1]
  return { clock, store, seen, who, last }
}

async function drain(clock: { advance: (ms: number) => Promise<unknown> }) {
  await clock.advance(20)
  for (let i = 0; i < 20; i++) await new Promise(r => setTimeout(r, 0))
}

const run = async ($: { command: { run: (i: never) => Promise<unknown> } }, args: string) => ((await $.command.run({ command: 'qa', args } as never)) as { text: string }).text
const ask = ($: { tool: { call: (i: never) => Promise<unknown> } }, id = 'tu1') => $.tool.call({ tool: 'AskUserQuestion', tool_use_id: id, ...INPUT } as never)

describe('hooks: record, page, send', () => {
  test('an answered round is kept in the store, shown in the tab, and the dialog result passes through', async ($, on) => {
    const w = world(on)
    await $.session.start({ cwd: 'C:/proj' } as never)
    expect(w.seen.tools).toEqual(['qa_history'])
    expect(w.last()?.title).toBe('Interview')
    const r = (await ask($)) as { result: unknown }
    expect(r.result).toEqual(RESULT)
    expect((w.store.get(projectKey('C:/proj')) as unknown[]).length).toBe(1)
    expect(w.last()?.badge).toBe('1')
    expect(await run($, '')).toContain(`→ Plugin store (note: keep it small)`)
  })

  test('a denied or unanswered round is not kept', async ($, on) => {
    const w = world(on)
    await $.session.start({ cwd: 'C:/proj' } as never)
    w.who.deny = true
    await ask($, 'd1')
    w.who.deny = false
    w.who.answer = { answers: {} }
    await ask($, 'd2')
    expect(w.store.get(projectKey('C:/proj'))).toBeUndefined()
  })

  test('/qa send submits this session\'s digest after the command returns; send all includes other sessions', async ($, on) => {
    const w = world(on)
    await $.session.start({ cwd: 'C:/proj' } as never)
    await ask($, 'a')
    w.who.session = 's2'
    expect(await run($, 'send')).toContain('No question rounds in this session')
    expect(await run($, 'send all')).toBe('Sending 1 round of Q&A to Claude.')
    expect(w.seen.submits.length).toBe(0) // deferred, never inside the command
    await drain(w.clock)
    expect(w.seen.submits[0]).toContain('Treat these answers as decided')
    expect(w.seen.submits[0]).toContain('→ Plugin store')
    expect(await run($, 'send lots')).toContain('Usage')
  })

  test('paging: older and newer move through rounds; send-round sends the shown one; show opens the dashboard', async ($, on) => {
    const w = world(on)
    await $.session.start({ cwd: 'C:/proj' } as never)
    await ask($, 'a')
    await ask($, 'b')
    expect(w.last()?.body[0]?.text?.startsWith('Round 2 of 2')).toBe(true)
    await run($, 'older')
    expect(w.last()?.body[0]?.text?.startsWith('Round 1 of 2')).toBe(true)
    expect(await run($, 'send-round')).toBe('Round 1 sent to Claude.')
    await drain(w.clock)
    expect(w.seen.submits[0]).toContain('Round 1 ·')
    await run($, 'newer')
    expect(w.last()?.body[0]?.text?.startsWith('Round 2 of 2')).toBe(true)
    expect(await run($, 'show')).toBe('')
    expect(w.seen.opened).toEqual(['dashboard'])
  })

  test('qa_history gives the digest to Claude, for the project or this session', async ($, on) => {
    const w = world(on)
    await $.session.start({ cwd: 'C:/proj' } as never)
    await ask($, 'a')
    const h = (await $.tool.call({ tool: 'mcp__bws-interview__qa_history', scope: 'all' } as never)) as { result: string }
    expect(h.result).toContain('→ Plugin store')
    const none = (await $.tool.call({ tool: 'mcp__bws-interview__qa_history', last: 0, scope: 'session' } as never)) as { result: string }
    expect(none.result).toContain('→ Plugin store')
  })

  test('pinDigest off: nothing added to the context', async ($, on) => {
    world(on)
    await $.session.start({ cwd: 'C:/proj' } as never)
    await ask($, 'a')
    const r = (await $.prompt.context({ blocks: [] } as never)) as unknown as { blocks: { name: string }[] }
    expect(r.blocks.length).toBe(0)
  })

  test('pinDigest on: this session\'s answers ride in the context', { options: { pinDigest: true } }, async ($, on) => {
    world(on)
    await $.session.start({ cwd: 'C:/proj' } as never)
    await ask($, 'a')
    const r = (await $.prompt.context({ blocks: [] } as never)) as unknown as { blocks: { name: string; text: string }[] }
    expect(r.blocks[0]?.name).toBe('bwsInterview')
    expect(r.blocks[0]?.text).toContain('→ Plugin store')
  })
})
