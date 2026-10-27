// The pure inventory first, then the hooks on a stubbed engine; the tab is read as cockpit would see it, through a
// bottom state.set stub.
import { test, expect, describe } from 'claude-code/testing'
import { mock } from 'claude-code/testing'
import type { On } from 'claude-code'
import { EMPTY, desktopPlan, inventoryTab, inventoryText, mcpParts, serverLabel, shortPath, skillUsed, toolSeen, type Inventory } from '../hooks/inventory'

declare const setTimeout: (fn: (...a: never[]) => void, ms: number) => unknown

const T0 = 1_760_000_000_000
const ok = { isError: false }
const seen = (inv: Inventory, tool: string, input: Record<string, unknown> = {}, r: { isError: boolean; taskId?: string } = ok) => toolSeen(inv, tool, input, r, T0)

describe('inventory', () => {
  test('connectors count calls, distinct tools and errors per server', () => {
    let inv = seen(EMPTY, 'mcp__bws-board__board_status')
    inv = seen(inv, 'mcp__bws-board__board_status')
    inv = seen(inv, 'mcp__bws-board__board_send', {}, { isError: true })
    inv = seen(inv, 'Bash', { command: 'ls' })
    expect(inv.connectors).toEqual([{ name: 'bws-board', calls: 3, errors: 1, lastTool: 'board_send', lastAt: T0, tools: 2 }])
    expect(mcpParts('Read')).toBe(null)
    expect(serverLabel('1a59c906-04da-521d-bda7-7f71b9f9e01c')).toBe('connector 1a59c906')
  })

  test('files: reads, edits and writes, one row per path whatever its slashes', () => {
    let inv = seen(EMPTY, 'Read', { file_path: 'C:\\p\\src\\a.ts' })
    inv = seen(inv, 'Edit', { file_path: 'c:/p/src/a.ts' })
    inv = seen(inv, 'Write', { file_path: 'C:/p/src/b.ts' })
    inv = seen(inv, 'Read', { file_path: 'C:/p/src/c.ts' }, { isError: true })
    expect(inv.files.map(f => [f.reads, f.edits, f.writes])).toEqual([[1, 1, 0], [0, 0, 1]])
    expect(shortPath('C:\\Projects\\x\\hooks\\register.ts')).toBe('x/hooks/register.ts')
  })

  test('todos from TodoWrite, the Task tools and the Desktop plan', () => {
    let inv = seen(EMPTY, 'TodoWrite', { todos: [{ content: 'A', status: 'completed', activeForm: 'a' }, { content: 'B', status: 'in_progress', activeForm: 'b' }] })
    inv = seen(inv, 'TaskCreate', { subject: 'T1', description: 'x' }, { isError: false, taskId: '7' })
    inv = seen(inv, 'TaskUpdate', { taskId: '7', status: 'completed' })
    expect(inv.todos.map(t => [t.text, t.status])).toEqual([['A', 'completed'], ['B', 'in_progress'], ['T1', 'completed']])
    inv = seen(inv, 'TaskUpdate', { taskId: '7', status: 'deleted' })
    inv = seen(inv, 'TodoWrite', { todos: [{ content: 'C', status: 'pending', activeForm: 'c' }] })
    expect(inv.todos.map(t => t.text)).toEqual(['C'])
    let plan = desktopPlan(EMPTY, { items: [{ content: 'one', status: 'in_progress' }, { content: 'two', status: 'pending' }, { content: 'three', status: 'pending' }] })
    plan = desktopPlan(plan, { advance: true })
    expect(plan.todos.map(t => t.status)).toEqual(['completed', 'in_progress', 'pending'])
    plan = desktopPlan(plan, { done: [2], start: 3 })
    expect(plan.todos.map(t => t.status)).toEqual(['completed', 'completed', 'in_progress'])
    expect(seen(EMPTY, 'mcp__ccd_turn__update_plan', { items: [{ content: 'x', status: 'pending' }] }).todos).toHaveLength(1)
  })

  test('the tab: summary card, one coloured card per kind with emoji, a clear button', () => {
    let inv = seen(EMPTY, 'TodoWrite', { todos: [{ content: 'Ship it', status: 'in_progress', activeForm: 's' }] })
    inv = seen(inv, 'mcp__github__get_pr', {}, { isError: true })
    inv = seen(inv, 'Edit', { file_path: 'C:/p/a.ts' })
    inv = skillUsed(skillUsed(inv, 'commit', T0), 'commit', T0)
    const t = inventoryTab({ inv, show: 0 })
    expect(t.title).toBe('Inventory')
    expect(t.badge).toBe('📝1')
    expect(t.tone).toBe('warn')
    const cards = t.body.filter(n => n.kind === 'card') as { title: string; color?: string }[]
    expect(cards.map(c => c.title.split(' ')[0])).toEqual(['🧾', '📝', '🔌', '📁', '🧠'])
    expect(cards[2]?.color).toBe('warn')
    const all = JSON.stringify(t.body)
    expect(all).toContain('🔄 Ship it')
    expect(all).toContain('⚠️ github · 1 call · 1 tool · 1 error · last get_pr')
    expect(all).toContain('✏️ C:/p/a.ts · edited 1×')
    expect(all).toContain('✨ commit · 2×')
    expect(all).toContain('"id":"clear"')
    expect(inventoryTab({ inv: EMPTY, show: 0 }).badge).toBe('')
    expect(inventoryText(inv)).toContain('Inventory: 0/1 todos done, 1 connectors (1 calls, 1 errors)')
  })
})

type Node = { kind: string; title?: string; text?: string; body?: Node[] }
type Tab = { badge: string; tone: string; body: Node[]; show?: number }

function world(on: On, o: { surfaces?: string[] } = {}) {
  const clock = mock.clock(on, { now: T0 })
  const got = { tabs: [] as Tab[], opens: 0 }
  on('session.start', () => ({ cwd: 'C:/proj' }) as never)
  on('session.surfaces', () => ({ value: (o.surfaces ?? ['terminal']) as never }))
  on('command.register', () => ({ value: undefined as never }))
  on('command.list', () => ({ value: [{ name: 'dashboard' }] as never }))
  on('ui.open', () => {
    got.opens++
    return { value: { isPlaced: true } as never }
  })
  on('ui.log', () => ({ value: undefined as never }))
  on('tool.call', ($, e) => ((e.tool as string) === 'TaskCreate' ? { result: { task: { id: '3', subject: 'x' } } } : (e.tool as string) === 'mcp__x__boom' ? { result: 'no', isError: true } : { result: 'ok' }) as never)
  on('skill.prompt', ($, e) => ({ text: e.text }) as never)
  on('session.end', ($, e) => ({ sessionId: e.sessionId }) as never)
  on('state.set', { plugin: 'bws-inventory', key: 'tab' }, ($, e, next) => {
    got.tabs.push(JSON.parse(JSON.stringify(e.value)))
    return next(e)
  })
  return { got, clock }
}

async function drain(clock: { advance: (ms: number) => Promise<unknown> }, ms = 300) {
  await clock.advance(ms)
  for (let j = 0; j < 60; j++) await new Promise(r => setTimeout(r, 0))
}

const last = <T>(xs: T[]) => xs[xs.length - 1]
const run = async ($: { command: { run: (i: never) => Promise<unknown> } }, args = '') => ((await $.command.run({ command: 'inventory', args } as never)) as { text?: string }).text ?? ''

describe('hooks', () => {
  test('tool calls and skills fill the tab after one queued publish', async ($, on) => {
    const w = world(on)
    await $.session.start({ cwd: 'C:/proj' } as never)
    await $.tool.call({ tool: 'Read', file_path: 'C:/p/a.ts' } as never)
    await $.tool.call({ tool: 'mcp__x__boom' } as never)
    await $.tool.call({ tool: 'TaskCreate', subject: 'Write tests', description: 'd' } as never)
    await $.skill.prompt({ skill: 'commit', text: 'go', frontmatter: {}, source: 'userSettings' } as never)
    await drain(w.clock)
    const all = JSON.stringify(last(w.got.tabs))
    expect(all).toContain('👁️ C:/p/a.ts · read 1×')
    expect(all).toContain('⚠️ x · 1 call')
    expect(all).toContain('⬜ Write tests')
    expect(all).toContain('✨ commit · 1×')
    expect(await run($, 'text')).toContain('0/1 todos done')
  })

  test('/inventory opens the dashboard on the tab; clear and /clear empty it', async ($, on) => {
    const w = world(on)
    await $.session.start({ cwd: 'C:/proj' } as never)
    await $.tool.call({ tool: 'Read', file_path: 'C:/p/a.ts' } as never)
    expect(await run($)).toBe('')
    expect(w.got.opens).toBe(1)
    expect(last(w.got.tabs)?.show).toBe(1)
    await run($, '--clear')
    expect(JSON.stringify(last(w.got.tabs))).toContain('Nothing used yet')
    await $.tool.call({ tool: 'Read', file_path: 'C:/p/b.ts' } as never)
    await drain(w.clock)
    await $.session.end({ sessionId: 's', reason: 'clear' } as never)
    expect(JSON.stringify(last(w.got.tabs))).toContain('Nothing used yet')
  })

  test('headless /inventory prints text and opens nothing', async ($, on) => {
    const w = world(on, { surfaces: [] })
    await $.session.start({ cwd: 'C:/proj' } as never)
    expect(await run($)).toBe('Nothing used yet this conversation.')
    expect(w.got.opens).toBe(0)
  })
})
