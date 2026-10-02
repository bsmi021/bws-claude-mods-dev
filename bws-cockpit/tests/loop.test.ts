import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { judge, loopState, parseNeeds, parseProgress, parseState } from '../hooks/loop'

// A harness-loop shaped like the real Warden loop in bws.game.tms.
const CWD = 'C:/proj'
const T0 = Date.parse('2026-10-01T20:00:00')
const LIMITS = { driverStaleMs: 3 * 60_000, idleMs: 20 * 60_000, sessionAlert: 6 }

const loopJson = (name: string, harnessDir: string, port: number) =>
  JSON.stringify({ name, title: name === 'warden' ? 'TMS Warden kit' : 'M1 beats', harnessDir, board: { port } })

type UnitIn = { status: string; sessions?: number; cost?: number; folder?: string | null; hb?: string; tool?: string }

const stateJson = (driver: { status: string; updated: string; message?: string }, current: string | null, units: Record<string, UnitIn>) =>
  JSON.stringify({
    title: 'TMS Warden kit',
    driver: { status: driver.status, pid: null, message: driver.message ?? '', updated: driver.updated, desired: 'run' },
    current,
    order: Object.keys(units),
    units: Object.fromEntries(
      Object.entries(units).map(([id, u]) => [
        id,
        {
          name: `Unit ${id}`,
          status: u.status,
          folder: u.folder ?? null,
          sessions: u.sessions ?? 0,
          noProgress: 0,
          crashes: 0,
          verifyFails: 0,
          costUsd: u.cost ?? 0,
          heartbeat: u.hb ? { at: u.hb, tool: u.tool ?? 'Bash', hint: 'x' } : null,
          message: '',
        },
      ]),
    ),
  })

const RUNNING_STATE = stateJson({ status: 'RUNNING', updated: '2026-10-01T19:59:40' }, 'W2c', {
  W1: { status: 'DONE', sessions: 8, cost: 42.68, folder: 'runs/w1' },
  W2c: { status: 'RUNNING', sessions: 7, cost: 12.5, folder: 'runs/w2c', hb: '2026-10-01T19:20:00', tool: 'Bash' },
  W3: { status: 'PENDING' },
})

const PAUSED_STATE = stateJson({ status: 'PAUSED', updated: '2026-10-01T19:58:00', message: 'W2c: needs Brian: N1 pick the hammer clip' }, 'W2c', {
  W1: { status: 'DONE', sessions: 8, cost: 42.68, folder: 'runs/w1' },
  W2c: { status: 'PAUSED', sessions: 2, cost: 3, folder: 'runs/w2c' },
})

const TASKS_W2C = '# W2c\nStatus: IN_PROGRESS\n\n## Tasks\n- [x] T01 rig\n- [x] T02 import\n- [ ] T03 clip\n\n## Needs Brian\n- [ ] N1 pick the hammer clip: A or B\n- [x] N0 old answered\n'
const TASKS_W1 = '# W1\nStatus: DONE\n\n## Tasks\n- [x] T01 a\n- [x] T02 b\n'

type World = { state?: string; second?: boolean; stateMtime?: number }

let clockStart = 0
const norm = (p: unknown) => String(p).split(String.fromCharCode(92)).join('/')

function world(on: On, w: World) {
  clockStart += 1 // distinct start per test, so no cached value from another test looks fresh
  const clock = mock.clock(on, { now: T0 + clockStart })
  const runs: { argv: string[]; cwd?: string }[] = []
  const toasts: string[] = []
  on('session.cwd', () => ({ value: CWD }))
  on('session.surfaces', () => ({ value: [] as never }))
  on('ui.toast', ($, e) => {
    toasts.push(String((e as { text?: string }).text ?? ''))
    return { value: undefined }
  })
  const files: Record<string, string> = {
    [`${CWD}/Tools/WardenHarness/loop.json`]: loopJson('warden', 'runs/2026-09-30-warden-harness/state', 8772),
    [`${CWD}/runs/2026-09-30-warden-harness/state/state.json`]: w.state ?? RUNNING_STATE,
    [`${CWD}/runs/w2c/TASKS.md`]: TASKS_W2C,
    [`${CWD}/runs/w1/TASKS.md`]: TASKS_W1,
  }
  if (w.second) {
    files[`${CWD}/Tools/M1Harness/loop.json`] = loopJson('m1', 'runs/m1-harness', 8769)
    files[`${CWD}/runs/m1-harness/state.json`] = stateJson({ status: 'STOPPED', updated: '2026-09-28T10:00:00' }, null, { U1: { status: 'DONE' } })
  }
  const dirs: Record<string, { name: string; kind: 'dir' | 'file' }[]> = {
    [CWD]: [{ name: 'Tools', kind: 'dir' }, { name: 'runs', kind: 'dir' }, { name: 'README.md', kind: 'file' }],
    [`${CWD}/Tools`]: [{ name: 'WardenHarness', kind: 'dir' }, ...(w.second ? [{ name: 'M1Harness', kind: 'dir' as const }] : [])],
  }
  on('fs.list', ($, e) => {
    const hit = dirs[norm(e.path)]
    if (!hit) throw new Error(`ENOENT ${e.path}`)
    return { value: hit.map(d => ({ ...d, size: 1, mtimeMs: 0, isLink: false })) }
  })
  on('fs.read', ($, e) => {
    const hit = files[norm(e.path)]
    if (hit === undefined) throw new Error(`ENOENT ${e.path}`)
    return { value: hit as never }
  })
  on('fs.stat', ($, e) => {
    if (files[norm(e.path)] === undefined) throw new Error(`ENOENT ${e.path}`)
    const old = String(e.path).includes('m1-harness')
    return { value: { kind: 'file', size: 1, mtimeMs: old ? T0 - 5 * 86_400_000 : (w.stateMtime ?? T0 - 20_000), isLink: false } as never }
  })
  on('process.run', ($, e) => {
    runs.push({ argv: [...e.argv].map(String), cwd: e.init?.cwd })
    return { value: { exitCode: 0, stdout: 'driver stop requested', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('http.fetch', () => {
    throw new Error('ECONNREFUSED')
  })
  return { clock, runs, toasts }
}

const PANE = {
  plugin: 'bws-cockpit',
  component: 'Pane',
  requestId: 'loop-watch',
  props: { title: 'Loop', isFocused: false, bodyColumns: 110, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

// ---------- pure ----------

describe('loop parsing and judging', () => {
  test('state, progress and needs', () => {
    const v = parseState(RUNNING_STATE, { name: 'warden', board: { port: 8772 } }, 'Tools/WardenHarness/harness.py', T0)
    expect(v?.units.map(u => u.id)).toEqual(['W1', 'W2c', 'W3'])
    expect(v?.current).toBe('W2c')
    expect(v?.boardUrl).toBe('http://localhost:8772/')
    expect(v?.units[1]?.heartbeatTool).toBe('Bash')
    expect(parseProgress(TASKS_W2C)).toEqual({ done: 2, total: 3 })
    expect(parseNeeds(TASKS_W2C)).toEqual([{ id: 'N1', text: 'pick the hammer clip: A or B' }])
    expect(parseState('not json', {}, 'h.py', 0)).toBeNull()
  })

  test('alerts: idle worker, session count, dead driver, paused, complete', () => {
    const v = parseState(RUNNING_STATE, { name: 'warden' }, 'h.py', T0)!
    const live = judge({ ...v, needs: [] }, T0, LIMITS).map(a => a.text)
    expect(live.some(t => /W2c has had no tool activity for 40m \(last: Bash\)/.test(t))).toBe(true)
    expect(live.some(t => /W2c is on session 7/.test(t))).toBe(true)
    expect(live.some(t => /looks dead/.test(t))).toBe(false)
    const later = judge({ ...v, needs: [] }, T0 + 5 * 60_000, LIMITS).map(a => a.text)
    expect(later.some(t => /driver says RUNNING but has not updated for 5m/.test(t))).toBe(true)
    const p = parseState(PAUSED_STATE, { name: 'warden' }, 'h.py', T0)!
    const paused = judge({ ...p, needs: [] }, T0, LIMITS)
    expect(paused.map(a => a.text)).toEqual(['paused for you: W2c: needs Brian: N1 pick the hammer clip'])
    expect(loopState({ ...p, needs: [], alerts: paused }).word).toBe('needs you')
    const doneState = stateJson({ status: 'IDLE', updated: '2026-10-01T19:00:00' }, null, { A: { status: 'DONE' }, B: { status: 'DONE' } })
    const d = parseState(doneState, { name: 'x' }, 'h.py', T0)!
    expect(judge({ ...d, needs: [] }, T0, LIMITS).map(a => a.level)).toEqual(['info'])
  })

  test('a stopped loop raises no session alert', () => {
    const stopped = stateJson({ status: 'STOPPED', updated: '2026-10-01T19:00:00' }, 'W2', { W2: { status: 'STOPPED', sessions: 9 } })
    const v = parseState(stopped, { name: 'x' }, 'h.py', T0)!
    expect(judge({ ...v, needs: [] }, T0, LIMITS)).toEqual([])
    expect(loopState({ ...v, needs: [], alerts: [] }).state).toBe('off')
  })
})

// ---------- hooks ----------

describe('loop watch', () => {
  test('/loop-watch with no surface replies with the summary as text', async ($, on) => {
    world(on, { state: PAUSED_STATE })
    const r = await $.command.run({ command: 'loop-watch', args: '' } as never)
    expect(r.text).toContain('Loop warden (TMS Warden kit): PAUSED')
    expect(r.text).toContain('board http://localhost:8772/')
    expect(r.text).toContain('> W2c PAUSED - Unit W2c: 2 sessions, $3.00 2/3 tasks')
    expect(r.text).toContain('Needs you (W2c): N1 pick the hammer clip: A or B')
    expect(r.text).toContain('python Tools/WardenHarness/harness.py answer W2c N1 "<your answer>"')
  })

  test('/loop-watch in a folder with no loop says so', async ($, on) => {
    on('session.cwd', () => ({ value: 'C:/empty' }))
    on('session.surfaces', () => ({ value: [] as never }))
    mock.clock(on, { now: T0 })
    on('fs.list', () => ({ value: [] }))
    const r = await $.command.run({ command: 'loop-watch', args: '' } as never)
    expect(r.text).toMatch(/No harness loop here/)
  })

  test('the pane shows header, units, alerts and the current marker', async ($, on) => {
    world(on, {})
    await $.command.run({ command: 'loop-watch', args: '' } as never) // loads the loops
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...PANE, surface })
      expect(await ui.find({ type: 'Text', text: /^warden$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /● running/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^running$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^▸ $/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^W2c$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^s7$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^2\/3$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Bash 40m ago/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /no tool activity for 40m/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /3 units · 1 done · 15 sessions · \$55\.18/ })).toBeDefined()
      expect(await ui.find({ key: 'loop-stop' })).toBeDefined()
      await ui.unmount()
    }
  })

  test('a narrow docked pane puts the name first and the numbers on a second line', async ($, on) => {
    world(on, {})
    await $.command.run({ command: 'loop-watch', args: '' } as never)
    for (const cols of [46, 32]) {
      const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: { ...PANE.props, bodyColumns: cols } })
      expect(await ui.find({ type: 'Text', text: /^running$/ })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /^Unit W2c$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^\s+s7 · \$12\.50 · 2\/3/ })).toBeDefined()
      const texts = await ui.findAll({ type: 'Text' })
      for (const t of texts) expect(t.text.length <= cols - 1 || /no tool activity|session 7/.test(t.text)).toBe(true)
      await ui.unmount()
    }
  })

  test('stop runs only on a second press within 10 s', async ($, on) => {
    const w = world(on, {})
    await $.command.run({ command: 'loop-watch', args: '' } as never)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'loop-stop' })
    expect(w.runs.length).toBe(0)
    expect((await ui.find({ key: 'loop-stop' }))?.text).toMatch(/press s again to stop warden/)
    await w.clock.advance(11_000) // the arm expires
    await ui.press({ key: 'loop-stop' })
    expect(w.runs.length).toBe(0)
    await ui.press({ key: 'loop-stop' })
    expect(w.runs).toEqual([{ argv: ['python', 'Tools/WardenHarness/harness.py', 'stop'], cwd: CWD }])
    expect(await ui.find({ type: 'Text', text: /stop warden: exit 0: driver stop requested/ })).toBeDefined()
    await ui.unmount()
  })

  test('resume runs harness.py start --resume', async ($, on) => {
    const w = world(on, { state: PAUSED_STATE })
    await $.command.run({ command: 'loop-watch', args: '' } as never)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /N1 pick the hammer clip/ })).toBeDefined()
    await ui.press({ key: 'loop-resume' })
    expect(w.runs).toEqual([{ argv: ['python', 'Tools/WardenHarness/harness.py', 'start', '--resume'], cwd: CWD }])
    await ui.unmount()
  })

  test('each alert toasts once; an already-complete loop does not toast', async ($, on) => {
    const w = world(on, {})
    await $.command.run({ command: 'loop-watch', args: '' } as never)
    await $.command.run({ command: 'loop-watch', args: '' } as never)
    const idle = w.toasts.filter(t => /no tool activity/.test(t))
    expect(idle.length).toBe(1)
    expect(w.toasts.filter(t => /on session 7/.test(t)).length).toBe(1)
  })

  test('the band shows a loop chip and a 4: loop hotkey', async ($, on) => {
    world(on, { state: PAUSED_STATE })
    await $.command.run({ command: 'cockpit', args: '' } as never) // fills the band's view and the loops
    const band = await $.ui.mount({
      plugin: 'bws-cockpit',
      surface: 'terminal',
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 8, bodyColumns: 120, scroll: { offset: 0, bodyRows: 8 }, view: {} },
    })
    expect(await band.find({ type: 'Text', text: /^loop$/ })).toBeDefined()
    expect(await band.find({ type: 'Text', text: / warden W2c needs you$/ })).toBeDefined()
    expect(await band.find({ key: 'loop' })).toBeDefined()
    await band.unmount()
  })

  test('two loops: a Select switches between them, newest first', async ($, on) => {
    world(on, { second: true })
    await $.command.run({ command: 'loop-watch', args: '' } as never)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ key: 'loop-pick' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^warden$/ })).toBeDefined()
    await $.ui.select({ plugin: 'bws-cockpit', key: 'loop-pick', value: 'm1' })
    await ui.unmount()
    const again = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await again.find({ type: 'Text', text: /^m1$/ })).toBeDefined()
    await again.unmount()
  })
})
