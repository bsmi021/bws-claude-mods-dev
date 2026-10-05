import { test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'
import { duration, encode, firstLine, isReport, needsInput, project, subagentDone, turnDone } from '../hooks/text.ts'

const CWD = 'C:/Projects/my-game'

const decode = (b64: string) => {
  const bin = atob(b64)
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))))
}

// The test's hooks stand for the engine: a clock, one terminal surface, and a process.run that records the toast launches.
function world(on: On, surfaces: string[] = ['terminal']) {
  const launches: string[][] = []
  const clock = mock.clock(on, { now: 5_000_000 })
  on('session.surfaces', () => ({ value: surfaces as never }))
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  on('classic.Notification', () => ({}))
  on('classic.Stop', () => ({}))
  on('classic.SubagentStop', () => ({}))
  on('classic.StopFailure', () => ({}))
  on('process.run', (_$, e) => {
    launches.push([...e.argv].map(String))
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  return { launches, clock }
}

const stop = (extra: Record<string, unknown> = {}) =>
  ({ stop_hook_active: false, cwd: CWD, last_assistant_message: '**Done.** The parser is in.\nMore detail.', background_tasks: [], session_crons: [], ...extra }) as never

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
  const [exe, flag1, flag2, vbs, payload] = w.launches[0]
  expect([exe, flag1, flag2]).toEqual(['wscript.exe', '//B', '//Nologo'])
  expect(vbs.replace(/\\/g, '/')).toMatch(/bin\/notify\.vbs$/)
  expect(decode(payload)).toEqual({ title: 'my-game · needs you', body: 'Claude needs your permission to use Edit' })
})

test('a finished turn names the duration and the reply, a short turn is skipped', async ($, on) => {
  const w = world(on)
  await $.prompt.submit({ text: 'do it' } as never)
  await w.clock.advance(60_000)
  await $.classic.Stop(stop())
  expect(decode(w.launches[0][4])).toEqual({ title: 'my-game · done (1m 0s)', body: 'Done. The parser is in.' })
  await $.prompt.submit({ text: 'again' } as never)
  await w.clock.advance(5_000)
  await $.classic.Stop(stop({ last_assistant_message: 'quick' }))
  expect(w.launches.length).toBe(1)
})

test('a stop with background work pending is not a finished turn', async ($, on) => {
  const w = world(on)
  await $.classic.Stop(stop({ background_tasks: [{ id: 'b1' }] }))
  expect(w.launches.length).toBe(0)
})

test('a subagent finish and an error each toast', async ($, on) => {
  const w = world(on)
  await $.classic.SubagentStop({ cwd: CWD, agent_type: 'Explore', last_assistant_message: 'Found 3 callers.' } as never)
  await $.classic.StopFailure({ cwd: CWD, error: 'rate_limit', error_details: 'Usage limit reached' } as never)
  expect(w.launches.map(l => decode(l[4]).title)).toEqual(['my-game · Explore finished', 'my-game · error: rate_limit'])
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
  await $.classic.Stop(stop())
  await $.classic.SubagentStop({ cwd: CWD, agent_type: 'Explore' } as never)
  await $.classic.StopFailure({ cwd: CWD, error: 'e' } as never)
  expect(w.launches.length).toBe(0)
})

test('prompt-suggestion forks are not subagent reports', async ($, on) => {
  expect(isReport('', '[{"label":"Do it","prompt":"x"}]')).toBe(false)
  expect(isReport(undefined, 'Found 3 callers.')).toBe(false)
  expect(isReport('Explore', '[{"label":"Do it","prompt":"x"}]')).toBe(false)
  expect(isReport('Explore', 'Found 3 callers.')).toBe(true)
  const w = world(on)
  await $.classic.SubagentStop({ cwd: CWD, agent_type: '', last_assistant_message: '[{"label":"Go","prompt":"go"}]' } as never)
  expect(w.launches.length).toBe(0)
})
