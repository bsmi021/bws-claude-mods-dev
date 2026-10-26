import { test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'
import { duration, encode, firstLine, isReport, needsInput, notifyTab, project, subagentDone, turnDone } from '../hooks/text'

const CWD = 'C:/Projects/my-game'

const decode = (b64: string) => {
  const bin = atob(b64)
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))))
}

// The test's hooks stand for the engine: a clock, one terminal surface, and a process.run that records the toast launches.
function world(on: On, surfaces: string[] = ['terminal'], agents: { id: string; type: string; status: string; teammateId?: string }[] = []) {
  const launches: string[][] = []
  const clock = mock.clock(on, { now: 5_000_000 })
  on('session.surfaces', () => ({ value: surfaces as never }))
  on('session.cwd', () => ({ value: CWD }))
  on('agent.list', () => ({ value: agents as never }))
  on('classic.Notification', () => ({}))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('process.run', (_$, e) => {
    launches.push([...e.argv].map(String))
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  return { launches, clock }
}

const end = (extra: Record<string, unknown> = {}) =>
  ({ answer: '**Done.** The parser is in.\nMore detail.', durationMs: 60_000, isAborted: false, turnId: 't1', reason: 'answer', ...extra }) as never

test('firstLine strips markup, takes the first non-empty line and cuts it', () => {
  expect(firstLine('\n\n**Done.** See [the log](http://x/y).\nsecond', 80)).toBe('Done. See the log.')
  expect(firstLine('- item one\n- two', 80)).toBe('item one')
  expect(firstLine('a'.repeat(50), 10)).toBe(`${'a'.repeat(9)}…`)
  expect(firstLine(undefined, 10)).toBe('')
})

test('project and duration wordings', () => {
  expect(project('C:\\Projects\\my-game\\')).toBe('my-game')
  expect(duration(9_000)).toBe('9s')
  expect(duration(130_000)).toBe('2m 10s')
  expect(duration(3_900_000)).toBe('1h 5m')
})

test('toast wordings carry project and conversation text', () => {
  expect(needsInput(CWD, 'Claude needs your permission to use Bash', 'permission_prompt', 100)).toEqual({
    title: 'my-game · needs you',
    body: 'Claude needs your permission to use Bash',
  })
  expect(needsInput(CWD, '', 'idle_prompt', 100).title).toBe('my-game · waiting for you')
  expect(turnDone(CWD, 'All 12 tests pass.', 95_000, 100).title).toBe('my-game · done (1m 35s)')
  expect(subagentDone(CWD, 'Explore', 'Found 3 callers.', 100)).toEqual({ title: 'my-game · Explore finished', body: 'Found 3 callers.' })
})

test('encode round-trips unicode', () => {
  const t = { title: 'p · done', body: 'café — “ok” ✓' }
  expect(decode(encode(t))).toEqual(t)
})

test('a permission ask launches a hidden toast with the project and the ask', async ($, on) => {
  const w = world(on)
  await $.classic.Notification({ cwd: CWD, message: 'Claude needs your permission to use Edit', notification_type: 'permission_prompt' } as never)
  expect(w.launches.length).toBe(1)
  const [exe, flag1, flag2, vbs = '', payload = ''] = w.launches[0] ?? []
  expect([exe, flag1, flag2]).toEqual(['wscript.exe', '//B', '//Nologo'])
  expect(vbs.replace(/\\/g, '/')).toMatch(/bin\/notify\.vbs$/)
  expect(decode(payload)).toEqual({ title: 'my-game · needs you', body: 'Claude needs your permission to use Edit' })
})

test('a finished turn names the duration and the reply, a short turn is skipped', async ($, on) => {
  const w = world(on)
  await $.turn.complete(end())
  expect(decode(w.launches[0]?.[4] ?? '')).toEqual({ title: 'my-game · done (1m 0s)', body: 'Done. The parser is in.' })
  await $.turn.complete(end({ answer: 'quick', durationMs: 5_000 }))
  expect(w.launches.length).toBe(1)
})

test('an interrupted turn and a turn with background agents at work are not finished turns', async ($, on) => {
  const w = world(on, ['terminal'], [{ id: 'a1', type: 'Explore', status: 'running' }])
  await $.turn.complete(end())
  await $.turn.complete(end({ reason: 'aborted', isAborted: true }))
  expect(w.launches.length).toBe(0)
})

test('a subagent finish, an API error and a refusal each toast', async ($, on) => {
  const w = world(on, ['terminal'], [{ id: 'a1', type: 'Explore', status: 'completed' }, { id: 'a2', type: 'teammate', status: 'idle', teammateId: 'scout@crew' }])
  await $.turn.complete(end({ agentId: 'a1', answer: 'Found 3 callers.' }))
  await $.turn.complete(end({ agentId: 'a2', answer: 'Scouted.' }))
  await $.turn.complete(end({ reason: 'error', answer: 'API Error: Usage limit reached' }))
  await $.turn.complete(end({ reason: 'refusal', answer: '', refusal: { category: 'cyber', explanation: null } }))
  expect(w.launches.map(l => decode(l[4] ?? ''))).toEqual([
    { title: 'my-game · Explore finished', body: 'Found 3 callers.' },
    { title: 'my-game · scout finished', body: 'Scouted.' },
    { title: 'my-game · error: API', body: 'API Error: Usage limit reached' },
    { title: 'my-game · error: refused', body: 'cyber' },
  ])
})

test('the same toast twice within a few seconds is sent once', async ($, on) => {
  const w = world(on)
  const n = { cwd: CWD, message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt' } as never
  await $.classic.Notification(n)
  await $.classic.Notification(n)
  expect(w.launches.length).toBe(1)
  await w.clock.advance(9_000)
  await $.classic.Notification(n)
  expect(w.launches.length).toBe(2)
})

test('no surface (headless) sends nothing', async ($, on) => {
  const w = world(on, [])
  await $.classic.Notification({ cwd: CWD, message: 'x', notification_type: 'permission_prompt' } as never)
  expect(w.launches.length).toBe(0)
})

test('switches turn the events off', { options: { needsInput: false, turnDone: false, subagentDone: false, errors: false } }, async ($, on) => {
  const w = world(on)
  await $.classic.Notification({ cwd: CWD, message: 'x', notification_type: 'permission_prompt' } as never)
  await $.turn.complete(end())
  await $.turn.complete(end({ agentId: 'a1' }))
  await $.turn.complete(end({ reason: 'error' }))
  expect(w.launches.length).toBe(0)
})

test('prompt-suggestion forks are not subagent reports', async ($, on) => {
  expect(isReport('', '[{"label":"Do it","prompt":"x"}]')).toBe(false)
  expect(isReport(undefined, 'Found 3 callers.')).toBe(false)
  expect(isReport('Explore', '[{"label":"Do it","prompt":"x"}]')).toBe(false)
  expect(isReport('Explore', 'Found 3 callers.')).toBe(true)
  const w = world(on, ['terminal'], [{ id: 'a1', type: 'Explore', status: 'completed' }])
  await $.turn.complete(end({ agentId: 'fork', answer: 'Found 3 callers.' }))
  await $.turn.complete(end({ agentId: 'a1', answer: '[{"label":"Go","prompt":"go"}]' }))
  expect(w.launches.length).toBe(0)
})

test('the dashboard tab: which events toast, then the last toasts, newest first', () => {
  const all = { needsInput: true, turnDone: true, subagentDone: false, errors: true }
  const t = notifyTab(all, 20, [], 0)
  expect([t.title, t.badge, t.tone]).toEqual(['Notify', '', 'idle'])
  expect(t.body[0]).toEqual({ kind: 'text', text: 'Windows toasts for when Claude needs you, finished turns, errors.', isBold: true })
  expect(t.body[2]).toEqual({ kind: 'card', title: 'Last toasts', body: [{ kind: 'text', text: 'None yet in this session.', isDim: true }] })
  const at = new Date(2026, 9, 18, 9, 5).getTime()
  const two = notifyTab(all, 20, [{ at, title: 'game · done', body: 'first' }, { at: at + 60_000, title: 'game · needs you', body: 'second' }], 7)
  expect([two.badge, two.tone]).toEqual(['7', 'ok'])
  expect(two.body[2]).toEqual({ kind: 'card', title: 'Last toasts', body: [{ kind: 'text', text: '09:06  game · needs you: second' }, { kind: 'text', text: '09:05  game · done: first' }] })
  expect(notifyTab({ needsInput: false, turnDone: false, subagentDone: false, errors: false }, 20, [], 0).body[0]).toEqual({ kind: 'text', text: 'Every toast is switched off in the plugin options.', isBold: true })
})

test('each toast sent updates the tab', async ($, on) => {
  world(on)
  const tabs: { badge?: string }[] = []
  on('state.set', { plugin: 'bws-notify', key: 'tab' }, ($, e, next) => {
    tabs.push(e.value as { badge?: string })
    return next(e)
  })
  await $.classic.Notification({ cwd: CWD, message: 'Claude needs your permission to use Edit', notification_type: 'permission_prompt' } as never)
  expect(tabs.map(t => t.badge)).toEqual(['1'])
})

