// The hooks on a stubbed engine: a project folder with docs/GDD.md and a run plan, a scripted model, an in-memory store.
import { test, expect, describe } from 'claude-code/testing'
import { mock } from 'claude-code/testing'
import type { On } from 'claude-code'

declare const setTimeout: (fn: (...a: never[]) => void, ms: number) => unknown

const CWD = 'C:/proj'
const GDD = '# Design\n\n## Combat\nStamina drives every swing. Parry window 200 ms.\n\n## Exploration\nLanterns mark safe rooms.\n'
const PLAN = '# Parry\n\n## Finish line\n- [ ] parry window per GDD Combat\n'
const ROWS = [
  { role: 'user', text: 'Build the parry window per the GDD', toolUses: [] },
  { role: 'assistant', text: '', toolUses: [{ tool: 'Write', input: { file_path: `${CWD}/runs/2026-10-20-parry/PLAN.md` } }, { tool: 'Edit', input: { file_path: `${CWD}/Source/Parry.cpp` } }] },
  { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 'x', text: 'ok' }] },
  { role: 'assistant', text: 'Parry window added.', toolUses: [] },
]
const CHAT = [
  { role: 'user', text: 'what is this repo', toolUses: [] },
  { role: 'assistant', text: 'A game.', toolUses: [] },
]
const DRIFT = '{"verdict":"drifting","score":48,"reason":"Added photo mode, not in the plan.","anchor":"runs/2026-10-20-parry/PLAN.md","cause":"agent","suggestion":"Revert and park it."}'
const OK = '{"verdict":"aligned","score":93,"reason":"Parry window as the GDD says.","anchor":"docs/GDD.md § Combat","cause":"none","suggestion":""}'

type W = { surfaces?: string[]; rows?: object[]; answer?: string | 'throw'; store?: Record<string, unknown>; session?: string; noDocs?: boolean }

function world(on: On, w: W = {}) {
  const clock = mock.clock(on, { now: 1_760_000_000_000 })
  const store = new Map<string, unknown>(Object.entries(w.store ?? {}))
  const files: Record<string, string> = w.noDocs ? {} : { [`${CWD}/docs/GDD.md`]: GDD, [`${CWD}/docs/specs/ui.md`]: '# UI\nMenus.\n' }
  files[`${CWD}/runs/2026-10-20-parry/PLAN.md`] = PLAN
  const dirs: Record<string, { name: string; kind: 'file' | 'dir' }[]> = w.noDocs
    ? {}
    : { [`${CWD}/docs`]: [{ name: 'GDD.md', kind: 'file' }, { name: 'specs', kind: 'dir' }], [`${CWD}/docs/specs`]: [{ name: 'ui.md', kind: 'file' }] }
  const seen = { complete: [] as { model: string; prompt: string; system: string }[], toasts: [] as string[], tabs: [] as { badge: string; tone: string; raise: number }[], submitted: [] as string[], logs: [] as string[], git: 0 }
  const who = { session: w.session ?? 's1', rows: w.rows ?? ROWS, answer: w.answer ?? DRIFT }
  on('session.start', () => ({ cwd: CWD }) as never)
  on('session.id', () => ({ value: who.session }))
  on('session.cwd', () => ({ value: CWD }))
  on('session.surfaces', () => ({ value: (w.surfaces ?? ['terminal']) as never }))
  on('session.messages', () => ({ value: who.rows as never }))
  on('command.register', () => ({ value: undefined as never }))
  on('command.list', () => ({ value: [{ name: 'dashboard' }] as never }))
  on('fs.read', ($, e) => {
    const hit = files[String(e.path).replace(/\\/g, '/')]
    if (hit === undefined) throw new Error('ENOENT')
    return { value: hit as never }
  })
  on('fs.list', ($, e) => {
    const hit = dirs[String(e.path).replace(/\\/g, '/')]
    if (!hit) throw new Error('ENOENT')
    return { value: hit.map(d => ({ ...d, size: 100, mtimeMs: 1, isLink: false })) as never }
  })
  on('process.run', () => {
    seen.git++
    return { value: { exitCode: 0, stdout: 'abc123 2026-10-19 parry window\n 2 files changed', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } as never }
  })
  on('store.get', ($, e) => ({ value: store.get(e.key) as never }))
  on('store.set', ($, e) => {
    store.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined as never }
  })
  on('model.complete', ($, e) => {
    seen.complete.push({ model: e.model, prompt: String(e.prompt), system: String(e.system ?? '') })
    if (who.answer === 'throw') throw new Error('api down')
    return { value: { isAnswered: true, text: who.answer, usage: {} } as never }
  })
  on('ui.toast', ($, e) => {
    seen.toasts.push(e.text)
    return { value: undefined as never }
  })
  on('ui.log', ($, e) => {
    seen.logs.push(e.text)
    return { value: undefined as never }
  })
  on('ui.invalidate', () => ({ value: undefined as never }))
  on('ui.open', () => ({ value: { isPlaced: true } as never }))
  on('prompt.submit', ($, e) => {
    seen.submitted.push(e.text)
    return { text: '' } as never
  })
  on('prompt.context', ($, e) => ({ blocks: e.blocks }))
  on('state.set', { plugin: 'bws-direction', key: 'tab' }, ($, e, next) => {
    seen.tabs.push(JSON.parse(JSON.stringify(e.value)))
    return next(e)
  })
  on('turn.complete', () => ({ text: '' }) as never)
  on('session.end', ($, e) => ({ sessionId: e.sessionId }) as never)
  return { seen, clock, store, who }
}

async function drain(clock: { advance: (ms: number) => Promise<unknown> }) {
  for (let i = 0; i < 3; i++) {
    await clock.advance(10)
    for (let j = 0; j < 60; j++) await new Promise(r => setTimeout(r, 0))
  }
}

const TURN = { answer: 'Parry window added.', durationMs: 30_000, isAborted: false, turnId: 't1', reason: 'answer' }
const turn = ($: { turn: { complete: (i: never) => Promise<unknown> } }, o: object = {}) => $.turn.complete({ ...TURN, ...o } as never)
const run = async ($: { command: { run: (i: never) => Promise<unknown> } }, args = '') => ((await $.command.run({ command: 'direction', args } as never)) as { text: string }).text
const block = (r: unknown) => (r as { blocks: { name: string; text: string }[] }).blocks.find(b => b.name === 'bwsDirection')?.text
const last = <T>(xs: T[]) => xs[xs.length - 1]

describe('the automatic turn check', () => {
  test('a working turn: the turn returns at once, then one model call with the task, plan, GDD and turn; drift is recorded, toasted and raised', async ($, on) => {
    const w = world(on)
    await $.session.start({ cwd: CWD } as never)
    expect(((await turn($)) as { text: string }).text).toBe('')
    expect(w.seen.complete.length).toBe(0)
    await drain(w.clock)
    expect(w.seen.complete.length).toBe(1)
    const c = w.seen.complete[0]!
    expect(c.model).toBe('haiku')
    expect(c.prompt).toContain('<task>\nBuild the parry window per the GDD\n</task>')
    expect(c.prompt).toContain('<plan path="runs/2026-10-20-parry/PLAN.md">')
    expect(c.prompt).toContain('Anchor documents (the authority on what the project is): docs/GDD.md')
    expect(c.prompt).toContain('--- docs/GDD.md § Combat')
    expect(c.prompt).toContain('Files edited: C:/proj/runs/2026-10-20-parry/PLAN.md, C:/proj/Source/Parry.cpp')
    expect(c.system).toContain('drift')
    expect(w.seen.toasts[0]).toContain('Direction: drifting (48)')
    expect(last(w.seen.tabs)?.raise).toBe(1)
    expect(last(w.seen.tabs)?.badge).toBe('~ 48')
    const stored = w.store.get('project:c:/proj') as { verdict: string; session: string; files: string[] }[]
    expect(stored.map(s => s.verdict)).toEqual(['drifting'])
    expect(stored[0]?.files).toEqual(['C:/proj/runs/2026-10-20-parry/PLAN.md', 'C:/proj/Source/Parry.cpp'])
  })

  test('nudge: the drift verdict rides in the context until an aligned check replaces it', async ($, on) => {
    const w = world(on)
    await $.session.start({ cwd: CWD } as never)
    expect(block(await $.prompt.context({ blocks: [] } as never))).toBeUndefined()
    await turn($)
    await drain(w.clock)
    expect(block(await $.prompt.context({ blocks: [] } as never))).toContain('Direction check (bws-direction) on turn 1: drifting, score 48')
    w.who.answer = OK
    await turn($)
    await drain(w.clock)
    expect(block(await $.prompt.context({ blocks: [] } as never))).toBeUndefined()
    expect(w.seen.toasts.length).toBe(1)
  })

  test('nudge off: no context block', { options: { nudge: false } }, async ($, on) => {
    const w = world(on)
    await $.session.start({ cwd: CWD } as never)
    await turn($)
    await drain(w.clock)
    expect(w.seen.complete.length).toBe(1)
    expect(block(await $.prompt.context({ blocks: [] } as never))).toBeUndefined()
  })

  test('skipped: a chat turn, a subagent turn, an aborted turn, headless, autoCheck off', async ($, on) => {
    const w = world(on, { rows: CHAT })
    await $.session.start({ cwd: CWD } as never)
    await turn($)
    await drain(w.clock)
    w.who.rows = ROWS
    await turn($, { agentId: 'a1' })
    await turn($, { reason: 'aborted' })
    await drain(w.clock)
    expect(w.seen.complete.length).toBe(0)
  })

  test('headless sessions are not checked automatically', async ($, on) => {
    const w = world(on, { surfaces: [] })
    await $.session.start({ cwd: CWD } as never)
    await turn($)
    await drain(w.clock)
    expect(w.seen.complete.length).toBe(0)
  })

  test('autoCheck off and every=2', { options: { every: 2 } }, async ($, on) => {
    const w = world(on)
    await $.session.start({ cwd: CWD } as never)
    await turn($)
    await drain(w.clock)
    expect(w.seen.complete.length).toBe(0)
    await turn($)
    await drain(w.clock)
    expect(w.seen.complete.length).toBe(1)
  })

  test('a failed model call fails open: nothing recorded, one debug line without the prompt, a note in the tab', async ($, on) => {
    const w = world(on, { answer: 'throw' })
    await $.session.start({ cwd: CWD } as never)
    await turn($)
    await drain(w.clock)
    expect(w.store.get('project:c:/proj')).toBeUndefined()
    expect(w.seen.logs.some(l => l.startsWith('bws-direction: turn failed'))).toBe(true)
    expect(w.seen.logs.some(l => l.includes('parry'))).toBe(false)
    expect(w.seen.toasts.length).toBe(0)
  })

  test('an unreadable answer is not recorded', async ($, on) => {
    const w = world(on, { answer: 'looks fine' })
    await $.session.start({ cwd: CWD } as never)
    await turn($)
    await drain(w.clock)
    expect(w.store.get('project:c:/proj')).toBeUndefined()
    expect(w.seen.logs.some(l => l.includes('unreadable answer'))).toBe(true)
  })
})

describe('/direction', () => {
  test('headless: check awaits and prints the verdict; overall reads git log and earlier checks on the overall model', async ($, on) => {
    const w = world(on, { surfaces: [], answer: OK })
    await $.session.start({ cwd: CWD } as never)
    const out = await run($, 'check')
    expect(out).toContain('Aligned (93)')
    expect(out).toContain('Anchors: docs/GDD.md · 2 docs · plan runs/2026-10-20-parry/PLAN.md')
    const all = await run($, 'overall')
    expect(w.seen.git).toBe(1)
    expect(last(w.seen.complete)?.model).toBe('sonnet')
    expect(last(w.seen.complete)?.prompt).toContain('abc123 2026-10-19 parry window')
    expect(last(w.seen.complete)?.prompt).toContain('turn aligned 93')
    expect(all).toContain('Whole project')
  })

  test('status with no checks names the anchors; no docs folder still works', async ($, on) => {
    const w = world(on, { noDocs: true })
    await $.session.start({ cwd: CWD } as never)
    const s = await run($)
    expect(s).toContain('no docs/ folder')
    expect(s).toContain('No check in this session yet.')
    expect(w.seen.complete.length).toBe(0)
  })

  test('interactive check runs deferred; tell sends the drift verdict as a prompt, deferred', async ($, on) => {
    const w = world(on)
    await $.session.start({ cwd: CWD } as never)
    expect(await run($, '--check')).toContain('Checking the last turn')
    await drain(w.clock)
    expect(w.seen.complete.length).toBe(1)
    expect(await run($, 'tell')).toBe('Sending the verdict to Claude.')
    expect(w.seen.submitted.length).toBe(0)
    await drain(w.clock)
    expect(w.seen.submitted[0]).toContain('drifting, score 48')
  })

  test('pause stops automatic checks for the session; resume restarts them', async ($, on) => {
    const w = world(on)
    await $.session.start({ cwd: CWD } as never)
    expect(await run($, 'pause')).toContain('paused')
    await turn($)
    await drain(w.clock)
    expect(w.seen.complete.length).toBe(0)
    await run($, 'resume')
    await turn($)
    await drain(w.clock)
    expect(w.seen.complete.length).toBe(1)
  })

  test('the record is per project and survives a new process; another session adds to it', async ($, on) => {
    const prior = [{ verdict: 'aligned', score: 88, reason: 'ok', anchor: '', cause: 'none', suggestion: '', at: 1_759_990_000_000, session: 's0', scope: 'turn', turn: 2, files: [] }]
    const w = world(on, { store: { 'project:c:/proj': prior } })
    await $.session.start({ cwd: CWD } as never)
    await turn($)
    await drain(w.clock)
    const s = await run($)
    expect(s).toContain('This session: ~  1 check, average 48')
    expect(s).toContain('Project: 2 checks over 2 sessions, 50% aligned')
  })

  test('a check with no work in the session calls no model and records nothing', async ($, on) => {
    const w = world(on, { surfaces: [], rows: [] })
    await $.session.start({ cwd: CWD } as never)
    expect(await run($, 'check')).toBe('Nothing to check: this session has no turn with work yet.')
    expect(w.seen.complete.length).toBe(0)
    expect(w.store.get('project:c:/proj')).toBeUndefined()
  })

  test('unknown words print the usage', async ($, on) => {
    world(on)
    await $.session.start({ cwd: CWD } as never)
    expect(await run($, 'nonsense')).toContain('Usage:')
  })
})
