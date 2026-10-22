// The pure parts directly, then the hooks on a stubbed engine with a scripted model; the tab is read as cockpit would
// see it, through a bottom state.set stub.
import { test, expect, describe } from 'claude-code/testing'
import { mock } from 'claude-code/testing'
import type { On } from 'claude-code'
import { findBase, markdownNodes, planSummary, sig, step, summaryTab, type Snapshot } from '../hooks/digest'

declare const setTimeout: (fn: (...a: never[]) => void, ms: number) => unknown

const msg = (role: 'user' | 'assistant', text: string) => ({ role, text, toolUses: [] as { tool: string; input: unknown }[] })
const snap = (id: number, tail: ReturnType<typeof msg>, text = `S${id}`): Snapshot => ({ id, turn: id, count: 2, tailSig: sig(tail), text, at: '10:00', isRolledBack: false })

describe('digest', () => {
  test('the base is the newest snapshot whose tail is still in the transcript', () => {
    const a = msg('assistant', 'done')
    const b = msg('assistant', 'added')
    const rows = [msg('user', 'go'), a, msg('user', 'rename'), msg('assistant', 'renamed')]
    const r = findBase([snap(1, a), snap(2, b)], rows)
    expect(r.base?.id).toBe(1)
    expect(r.from).toBe(2)
    expect(r.isNewest).toBe(false)
  })

  test('plan: skips a covered tail, flags a rollback, not after a compaction, full ignores the base', () => {
    const a = msg('assistant', 'done')
    const rows = [msg('user', 'go'), a]
    expect(planSummary([snap(1, a)], rows, { isFull: false, isCompacted: false })).toBeNull()
    expect(planSummary([], [], { isFull: false, isCompacted: false })).toBeNull()
    const gone = [msg('user', 'other'), msg('assistant', 'x')]
    expect(planSummary([snap(1, a)], gone, { isFull: false, isCompacted: false })?.isRolledBack).toBe(true)
    const c = planSummary([snap(1, a)], gone, { isFull: false, isCompacted: true })
    expect(c?.isRolledBack).toBe(false)
    expect(c?.prompt).toContain('S1')
    expect(planSummary([snap(1, a)], rows, { isFull: true, isCompacted: false })?.prompt).not.toContain('S1')
  })

  test('step moves through the history; the newest is -1', () => {
    const list = [snap(1, msg('user', 'a')), snap(2, msg('user', 'b')), snap(3, msg('user', 'c'))]
    expect(step({ list, viewing: -1 }, 'older')).toBe(1)
    expect(step({ list, viewing: 0 }, 'older')).toBe(0)
    expect(step({ list, viewing: 1 }, 'newer')).toBe(-1)
    expect(step({ list, viewing: 0 }, 'latest')).toBe(-1)
  })

  test('markdown: headings bold, bullets as •, bold markers dropped, blanks skipped', () => {
    const n = markdownNodes('## Goal\n- build **the** pane\n\n  * nested')
    expect(n).toEqual([
      { kind: 'text', text: 'Goal', isBold: true, color: 'accent' },
      { kind: 'text', text: '• build the pane' },
      { kind: 'text', text: '  • nested' },
    ])
  })

  test('an empty tab offers Refresh and says no summary yet', () => {
    const t = summaryTab({ list: [], viewing: -1, status: 'idle', error: '', show: 0 })
    expect(t.title).toBe('Summary')
    expect(t.badge).toBe('')
    expect(JSON.stringify(t.body)).toContain('No summary yet')
    expect(JSON.stringify(t.body)).toContain('"id":"refresh"')
    expect(JSON.stringify(t.body)).not.toContain('"id":"older"')
  })
})

type Tab = { badge: string; tone: string; body: { kind: string; text?: string; items?: { id: string }[] }[] }

function world(on: On, o: { surfaces?: string[]; fail?: boolean } = {}) {
  const clock = mock.clock(on, { now: 1_760_000_000_000 })
  const who = { rows: [msg('user', 'build a pane'), msg('assistant', 'done')] }
  const seen = { prompts: [] as string[], tabs: [] as Tab[], opens: 0, n: 0 }
  on('session.start', () => ({ cwd: 'C:/proj' }) as never)
  on('session.surfaces', () => ({ value: (o.surfaces ?? ['terminal']) as never }))
  on('session.messages', () => ({ value: who.rows as never }))
  on('session.turns', () => ({ value: who.rows.length / 2 }))
  on('command.register', () => ({ value: undefined as never }))
  on('command.list', () => ({ value: [{ name: 'dashboard' }] as never }))
  on('ui.open', () => {
    seen.opens++
    return { value: { isPlaced: true } as never }
  })
  on('ui.log', () => ({ value: undefined as never }))
  on('model.complete', ($, e) => {
    seen.prompts.push(String(e.prompt))
    if (o.fail) return { value: { isAnswered: false, reason: 'timeout' } as never }
    seen.n += 1
    return { value: { isAnswered: true, text: `## Goal\n- SUMMARY ${seen.n}`, usage: {} } as never }
  })
  on('state.set', { plugin: 'bws-summary', key: 'tab' }, ($, e, next) => {
    seen.tabs.push(JSON.parse(JSON.stringify(e.value)))
    return next(e)
  })
  on('turn.complete', () => ({ text: '' }) as never)
  on('session.compact', ($, e) => ({ messages: e.messages }) as never)
  on('session.end', ($, e) => ({ sessionId: e.sessionId }) as never)
  return { seen, clock, who }
}

async function drain(clock: { advance: (ms: number) => Promise<unknown> }) {
  for (let i = 0; i < 3; i++) {
    await clock.advance(10)
    for (let j = 0; j < 60; j++) await new Promise(r => setTimeout(r, 0))
  }
}

const TURN = { answer: '', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' }
const turn = ($: { turn: { complete: (i: never) => Promise<unknown> } }, o: object = {}) => $.turn.complete({ ...TURN, ...o } as never)
const run = async ($: { command: { run: (i: never) => Promise<unknown> } }, args = '') => ((await $.command.run({ command: 'summary', args } as never)) as { text?: string }).text ?? ''
const last = <T>(xs: T[]) => xs[xs.length - 1]
const texts = (t: Tab | undefined) => (t?.body ?? []).filter(n => n.kind === 'text').map(n => n.text ?? '')
const ids = (t: Tab | undefined) => (t?.body ?? []).flatMap(n => n.items?.map(i => i.id) ?? [])

describe('hooks', () => {
  test('summarizes each turn after it returns and keeps older summaries across a rollback', async ($, on) => {
    const w = world(on)
    await $.session.start({ cwd: 'C:/proj' } as never)
    await turn($)
    expect(w.seen.n).toBe(0)
    await drain(w.clock)
    w.who.rows = [...w.who.rows, msg('user', 'add history'), msg('assistant', 'added')]
    await turn($)
    await drain(w.clock)
    // Rollback to the first exchange, then a different second turn.
    w.who.rows = [w.who.rows[0]!, w.who.rows[1]!, msg('user', 'rename it'), msg('assistant', 'renamed')]
    await turn($)
    await drain(w.clock)
    expect(w.seen.n).toBe(3)
    expect(w.seen.prompts[1]).toContain('SUMMARY 1')
    expect(w.seen.prompts[2]).toContain('SUMMARY 1')
    expect(w.seen.prompts[2]).not.toContain('SUMMARY 2')
    const t = last(w.seen.tabs)
    expect(t?.badge).toBe('3')
    expect(texts(t)[0]).toContain('3/3')
    expect(texts(t)).toContain('↺ made after a rollback')
    expect(texts(t)).toContain('• SUMMARY 3')
    await run($, '--older')
    await drain(w.clock)
    expect(texts(last(w.seen.tabs))).toContain('Viewing an older summary')
    expect(texts(last(w.seen.tabs))).toContain('• SUMMARY 2')
    expect(ids(last(w.seen.tabs))).toEqual(['older', 'newer', 'latest', 'refresh'])
    await run($, 'latest')
    await drain(w.clock)
    expect(texts(last(w.seen.tabs))).toContain('• SUMMARY 3')
  })

  test('a compaction builds on the last summary and is not called a rollback', async ($, on) => {
    const w = world(on)
    await $.session.start({ cwd: 'C:/proj' } as never)
    await turn($)
    await drain(w.clock)
    w.who.rows = [msg('user', 'compacted summary of earlier work'), msg('user', 'next ask'), msg('assistant', 'ok')]
    await $.session.compact({ trigger: 'auto', messages: w.who.rows } as never)
    await turn($)
    await drain(w.clock)
    expect(w.seen.n).toBe(2)
    expect(w.seen.prompts[1]).toContain('SUMMARY 1')
    expect(w.seen.prompts[1]).toContain('compacted summary of earlier work')
    expect(texts(last(w.seen.tabs)).some(s => s.includes('rollback'))).toBe(false)
  })

  test('skipped: headless, a subagent turn, an error turn, an unchanged transcript', async ($, on) => {
    const w = world(on)
    await $.session.start({ cwd: 'C:/proj' } as never)
    await turn($, { agentId: 'a1' })
    await turn($, { reason: 'error' })
    await drain(w.clock)
    expect(w.seen.n).toBe(0)
    await turn($)
    await drain(w.clock)
    await turn($)
    await drain(w.clock)
    expect(w.seen.n).toBe(1)
  })

  test('headless sessions are never summarized automatically', async ($, on) => {
    const w = world(on, { surfaces: [] })
    await $.session.start({ cwd: 'C:/proj' } as never)
    await turn($)
    await drain(w.clock)
    expect(w.seen.n).toBe(0)
    expect(await run($)).toContain('No summary yet')
  })

  test('refresh rebuilds from the whole transcript; headless it is awaited and printed', async ($, on) => {
    const w = world(on, { surfaces: [] })
    await $.session.start({ cwd: 'C:/proj' } as never)
    const out = await run($, 'refresh')
    expect(out).toContain('Summary 1/1')
    expect(out).toContain('SUMMARY 1')
    await run($, 'refresh')
    expect(w.seen.n).toBe(2)
    expect(w.seen.prompts[1]).not.toContain('SUMMARY 1')
  })

  test('a failed model call shows the reason and keeps the last summary', async ($, on) => {
    const w = world(on, { fail: true })
    await $.session.start({ cwd: 'C:/proj' } as never)
    await turn($)
    await drain(w.clock)
    const t = last(w.seen.tabs)
    expect(t?.tone).toBe('bad')
    expect(texts(t)).toContain('Summary failed: timeout')
  })

  test('/summary opens the dashboard on the tab; /clear drops the history', async ($, on) => {
    const w = world(on)
    await $.session.start({ cwd: 'C:/proj' } as never)
    await turn($)
    await drain(w.clock)
    expect(await run($)).toBe('')
    expect(w.seen.opens).toBe(1)
    await $.session.end({ reason: 'clear', sessionId: 's1' } as never)
    expect(texts(last(w.seen.tabs))).toContain('No summary yet. One appears after Claude finishes a turn.')
    expect(await run($, 'nonsense')).toContain('Usage:')
  })
})
