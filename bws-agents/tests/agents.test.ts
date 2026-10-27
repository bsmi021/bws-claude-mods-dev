// The pure roster first, then the hooks on a stubbed engine; the tab is read as cockpit would see it, through a
// bottom state.set stub.
import { test, expect, describe } from 'claude-code/testing'
import { mock } from 'claude-code/testing'
import type { On } from 'claude-code'
import { agentsTab, agentsText, clearFinished, dur, isStalled, ordered, spawned, synced, tokens, toolCalled, toolLabel, turnDone, type Agent } from '../hooks/roster'

declare const setTimeout: (fn: (...a: never[]) => void, ms: number) => unknown

const T0 = 1_760_000_000_000
const base = { type: 'Explore', description: 'Find auth code', model: 'claude-sonnet-5-5', isBackground: false }
const one = (id = 'a1', now = T0) => spawned([], { ...base, id }, now)

describe('roster', () => {
  test('a spawn adds a running card; tool calls count and keep the last three', () => {
    let list = one()
    for (const f of ['a.ts', 'b.ts', 'c.ts', 'd.ts']) list = toolCalled(list, 'a1', `Read ${f}`, T0 + 1000)
    expect(list[0]?.status).toBe('running')
    expect(list[0]?.tools).toBe(4)
    expect(list[0]?.recent).toEqual(['Read b.ts', 'Read c.ts', 'Read d.ts'])
    expect(toolCalled(list, 'zz', 'x', T0)).toEqual(list)
  })

  test('a finished turn sets status, tokens and the answer first line', () => {
    const usage = { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 900, cache_creation_input_tokens: 0 }
    const done = turnDone(one(), 'a1', { answer: '## Found it\nmore', reason: 'answer', usage }, T0 + 65_000)
    expect(done[0]?.status).toBe('completed')
    expect(done[0]?.tokensIn).toBe(1000)
    expect(done[0]?.tokensOut).toBe(50)
    expect(done[0]?.answer).toBe('Found it')
    expect(turnDone(one(), 'a1', { answer: '', reason: 'error' }, T0)[0]?.status).toBe('failed')
    expect(turnDone(one(), 'a1', { answer: '', reason: 'aborted' }, T0)[0]?.status).toBe('killed')
  })

  test('the engine list wins on status and adds agents the roster missed', () => {
    const list = synced(one(), [
      { id: 'a1', type: 'Explore', description: 'Find auth code', status: 'completed' },
      { id: 'b2', type: 'Plan', description: 'Plan it', status: 'running', parentId: 'a1' },
    ], T0 + 5000)
    expect(list.map(a => [a.id, a.status])).toEqual([['a1', 'completed'], ['b2', 'running']])
    expect(list[0]?.endedAt).toBe(T0 + 5000)
    expect(clearFinished(list).map(a => a.id)).toEqual(['b2'])
  })

  test('stall flag, ordering, helpers', () => {
    const a = one('a1', T0)
    expect(isStalled(a[0]!, T0 + 119_000, 120_000)).toBe(false)
    expect(isStalled(a[0]!, T0 + 121_000, 120_000)).toBe(true)
    expect(isStalled(a[0]!, T0 + 121_000, 0)).toBe(false)
    const mixed = turnDone(spawned(one('a1', T0), { ...base, id: 'b2' }, T0 + 10), 'a1', { answer: 'ok', reason: 'answer' }, T0 + 20)
    expect(ordered(mixed).map(x => x.id)).toEqual(['b2', 'a1'])
    expect(dur(65_000)).toBe('1m 5s')
    expect(tokens(12_345)).toBe('12.3k')
    expect(toolLabel('Read', { file_path: 'C:\\Projects\\x\\hooks\\register.ts' })).toBe('Read hooks/register.ts')
    expect(toolLabel('mcp__bws-board__board_status', {})).toBe('bws-board:board_status')
  })

  test('the tab: summary card, one coloured card per agent with emoji, buttons', () => {
    const running = toolCalled(one('a1', T0), 'a1', 'Grep auth', T0 + 1000)
    const failed = turnDone(spawned(running, { ...base, id: 'b2', type: 'general-purpose', description: 'Fix it' }, T0), 'b2', { answer: 'Boom', reason: 'error' }, T0 + 2000)
    const t = agentsTab({ list: failed, now: T0 + 200_000, stallMs: 120_000, show: 0, raise: 0 })
    expect(t.title).toBe('Agents')
    expect(t.badge).toBe('🟢1')
    expect(t.tone).toBe('warn')
    const cards = t.body.filter(n => n.kind === 'card') as { title: string; color?: string }[]
    expect(cards[0]?.title).toContain('🤖 Subagents')
    expect(cards[1]?.title).toContain('🟢 Explore · Find auth code')
    expect(JSON.stringify(t.body)).toContain('🔎 running')
    expect(cards[1]?.color).toBe('warn')
    expect(cards[2]?.title).toContain('❌')
    expect(cards[2]?.color).toBe('bad')
    expect(JSON.stringify(t.body)).toContain('⚠️ no tool call for')
    expect(JSON.stringify(t.body)).toContain('"id":"clear"')
    expect(agentsTab({ list: [], now: T0, stallMs: 0, show: 0, raise: 0 }).badge).toBe('')
    expect(agentsText(failed, T0 + 3000, 120_000)).toContain('Subagents: 1 running, 0 done, 1 failed')
  })
})

type Node = { kind: string; title?: string; text?: string; body?: Node[] }
type Tab = { badge: string; tone: string; body: Node[] }

function world(on: On, o: { surfaces?: string[] } = {}) {
  const clock = mock.clock(on, { now: T0 })
  const seen = { tabs: [] as Tab[], opens: 0, infos: [] as { id: string; type: string; description: string; status: string }[] }
  on('session.start', () => ({ cwd: 'C:/proj' }) as never)
  on('session.surfaces', () => ({ value: (o.surfaces ?? ['terminal']) as never }))
  on('agent.list', () => ({ value: seen.infos as never }))
  on('command.register', () => ({ value: undefined as never }))
  on('command.list', () => ({ value: [{ name: 'dashboard' }] as never }))
  on('ui.open', () => {
    seen.opens++
    return { value: { isPlaced: true } as never }
  })
  on('ui.log', () => ({ value: undefined as never }))
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'sub-1' }) as never)
  on('tool.call', () => ({ result: 'ok' }) as never)
  on('turn.complete', () => ({ text: '' }) as never)
  on('session.end', ($, e) => ({ sessionId: e.sessionId }) as never)
  on('state.set', { plugin: 'bws-agents', key: 'tab' }, ($, e, next) => {
    seen.tabs.push(JSON.parse(JSON.stringify(e.value)))
    return next(e)
  })
  return { seen, clock }
}

async function drain(clock: { advance: (ms: number) => Promise<unknown> }, ms = 10) {
  await clock.advance(ms)
  for (let j = 0; j < 60; j++) await new Promise(r => setTimeout(r, 0))
}

const last = <T>(xs: T[]) => xs[xs.length - 1]
const cardTitles = (t: Tab | undefined) => (t?.body ?? []).filter(n => n.kind === 'card').map(n => n.title ?? '')
const run = async ($: { command: { run: (i: never) => Promise<unknown> } }, args = '') => ((await $.command.run({ command: 'subagents', args } as never)) as { text?: string }).text ?? ''

describe('hooks', () => {
  test('spawn, tool calls in the subagent and its answer fill one card; main-loop calls are ignored', async ($, on) => {
    const w = world(on)
    await $.session.start({ cwd: 'C:/proj' } as never)
    await $.agent.spawn({ prompt: 'look', description: 'Scan repo', subagentType: 'Explore', background: false, parentModel: 'opus' } as never)
    expect(cardTitles(last(w.seen.tabs))[1]).toContain('🟢 Explore · Scan repo')
    await $.tool.call({ tool: 'Read', file_path: 'C:/p/a.ts', agentId: 'sub-1' } as never)
    await $.tool.call({ tool: 'Read', file_path: 'C:/p/main.ts' } as never)
    const mid = JSON.stringify(last(w.seen.tabs))
    expect(mid).toContain('· 1 tool')
    expect(mid).toContain('Read p/a.ts')
    expect(mid).not.toContain('main.ts')
    await $.turn.complete({ answer: 'Found 3 files', durationMs: 5, isAborted: false, turnId: 't', reason: 'answer', agentId: 'sub-1', usage: { input_tokens: 2000, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'haiku' } } as never)
    const t = last(w.seen.tabs)
    expect(cardTitles(t)[1]).toContain('✅')
    expect(JSON.stringify(t)).toContain('💬 Found 3 files')
    expect(JSON.stringify(t)).toContain('🪙 2.0k in')
    expect(await run($, 'text')).toContain('Subagents: 0 running, 1 done')
  })

  test('/subagents opens the dashboard on the tab; clear drops finished cards; /clear empties it', async ($, on) => {
    const w = world(on)
    await $.session.start({ cwd: 'C:/proj' } as never)
    await $.agent.spawn({ prompt: 'x', description: 'One', subagentType: 'Plan', background: true, parentModel: 'opus' } as never)
    await $.turn.complete({ answer: 'done', durationMs: 5, isAborted: false, turnId: 't', reason: 'answer', agentId: 'sub-1' } as never)
    expect(await run($)).toBe('')
    expect(w.seen.opens).toBe(1)
    expect((last(w.seen.tabs) as unknown as { show?: number }).show).toBe(1)
    await run($, '--clear')
    expect(cardTitles(last(w.seen.tabs))).toHaveLength(1)
    await $.agent.spawn({ prompt: 'x', description: 'Two', subagentType: 'Plan', background: false, parentModel: 'opus' } as never)
    await $.session.end({ sessionId: 's', reason: 'clear' } as never)
    expect(cardTitles(last(w.seen.tabs))).toHaveLength(1)
    await drain(w.clock)
  })

  test('headless /subagents prints text and opens nothing', async ($, on) => {
    const w = world(on, { surfaces: [] })
    await $.session.start({ cwd: 'C:/proj' } as never)
    expect(await run($)).toBe('No subagents this session.')
    expect(w.seen.opens).toBe(0)
  })
})
