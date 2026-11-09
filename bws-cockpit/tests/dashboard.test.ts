import { test, expect, mock, describe } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { BoardPane } from '../types'

const ROOT = 'C:/Projects/game'
const NOW = 1_000_000_000

const norm = (p: unknown) => String(p).replace(/\\/g, '/')

type Pane = { id: string; title: string; isShown: boolean; isFocused: boolean; isPlaced: boolean }
type World = {
  surfaces?: string[]
  box?: string
  isPlaced?: boolean
  percent?: number
  startedAt?: number
  board?: { summary: { agents: number; openAsks: number; askedOfMe: number } | null; lines: string[]; pane?: BoardPane }
  commands?: string[]
  // other mods' atoms by plugin: their dashboard `tab` and `summary`
  mods?: Record<string, { tab?: unknown; summary?: unknown }>
  // answers $.process.run by argv (the switchboard's `claude plugin ...`); absent: no processes
  run?: (argv: readonly string[]) => { exitCode: number; stdout: string; stderr: string }
  store?: Record<string, unknown>
}

// Stubs every outside call the dashboard makes; files in `files`, panes in `panes`.
function world(on: On, w: World = {}) {
  const clock = mock.clock(on, { now: NOW })
  const files: Record<string, string> = {}
  const panes: Pane[] = []
  const seen = {
    sent: [] as { text: string; asUser?: boolean }[],
    opened: [] as { id: string; focus?: boolean }[],
    closed: [] as string[],
    toasts: [] as string[],
    fills: [] as string[],
    commands: [] as { command: string; args: string }[],
  }
  let box = w.box ?? ''
  on('session.surfaces', () => ({ value: (w.surfaces ?? ['terminal']) as never }))
  on('session.root', () => ({ value: `${ROOT}\\` }))
  on('session.cwd', () => ({ value: ROOT }))
  // startedAt moves on a /clear: the test changes usage.startedAt to make one.
  const usage = { startedAt: w.startedAt ?? 5 }
  on('session.usage', () => ({ value: { startedAt: usage.startedAt, context: { window: 200_000, percent: w.percent }, rateLimits: [] } as never }))
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
  on('fs.list', ($, e) => {
    throw new Error(`ENOENT ${norm(e.path)}`)
  })
  const runs: string[][] = []
  on('process.run', ($, e) => {
    runs.push([...e.argv])
    if (w.run === undefined) throw new Error('no processes here')
    return { value: w.run(e.argv) as never }
  })
  const store: Record<string, unknown> = { ...(w.store ?? {}) }
  on('store.get', ($, e) => ({ value: store[e.key] as never }))
  on('store.set', ($, e) => {
    store[e.key] = e.value
    return { value: undefined as never }
  })
  on('prompt.submit', ($, e) => {
    seen.sent.push({ text: e.text, asUser: (e.origin as { asUser?: boolean } | undefined)?.asUser })
    return { text: e.text } as never
  })
  on('turn.complete', () => ({ text: '' }) as never)
  on('session.start', () => ({ cwd: ROOT }) as never)
  on('tool.register', ($, e) => ({ value: { tool: e.name } }) as never)
  on('command.register', ($, e) => ({ value: { command: e.name } }) as never)
  on('command.list', () => ({ value: (w.commands ?? []).map(name => ({ name })) as never }))
  on('command.run', ($, e) => {
    seen.commands.push({ command: String(e.command), args: String(e.args) })
    return { text: '' } as never
  })
  on('ui.panes', () => ({ value: panes.map(p => ({ ...p })) as never }))
  on('ui.open', ($, e) => {
    seen.opened.push({ id: e.id, focus: e.focus })
    if (w.isPlaced === false) return { value: { isPlaced: false, reason: 'narrow' } }
    const old = panes.find(p => p.id === e.id)
    if (old) old.isShown = true
    else panes.push({ id: e.id, title: e.title ?? e.id, isShown: true, isFocused: e.focus === true, isPlaced: true })
    return { value: { isPlaced: true } }
  })
  on('ui.close', ($, e) => {
    seen.closed.push(e.id)
    const i = panes.findIndex(p => p.id === e.id)
    if (i >= 0) panes.splice(i, 1)
    return { value: undefined } as never
  })
  on('ui.toast', ($, e) => {
    seen.toasts.push(String((e as unknown as { text: string }).text))
    return { value: undefined } as never
  })
  on('ui.copy', () => ({ value: { isCopied: false } }) as never)
  on('prompt.read', () => ({ value: { text: box, cursor: box.length } }))
  on('prompt.fill', ($, e) => {
    box = e.text
    seen.fills.push(e.text)
    return { isFilled: true }
  })
  if (w.board) {
    const b = w.board
    on('state.get', ($, e, next) => {
      const ref = e as unknown as { plugin?: string; key?: string }
      if (ref.plugin !== 'bws-board') return next(e)
      return { value: { value: ref.key === 'summary' ? b.summary : ref.key === 'pane' ? (b.pane ?? null) : b.lines, version: 1 } } as never
    })
  }
  if (w.mods) {
    const m = w.mods
    on('state.get', ($, e, next) => {
      const ref = e as unknown as { plugin?: string; key?: string }
      const mod = ref.plugin === undefined ? undefined : m[ref.plugin]
      if (mod === undefined || (ref.key !== 'tab' && ref.key !== 'summary')) return next(e)
      return { value: { value: (ref.key === 'tab' ? mod.tab : mod.summary) ?? null, version: 1 } } as never
    })
  }
  const setBox = (text: string) => {
    box = text
  }
  return { seen, clock, files, panes, setBox, usage, runs, store }
}

const PANE = {
  plugin: 'bws-cockpit',
  component: 'Pane',
  requestId: 'dashboard',
  surface: 'terminal',
  props: { title: 'Dashboard', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

const BAND = {
  plugin: 'bws-cockpit',
  component: 'AbovePrompt',
  surface: 'terminal',
  props: { hasSurvey: false, isWorking: false, maxRows: 8, bodyColumns: 160, scroll: { offset: 0, bodyRows: 8 }, view: {} },
} as const

// The bar needs the cockpit view, which a /cockpit run fills.
async function withBar($: { command: { run: (input: never) => Promise<unknown> } }) {
  await $.command.run({ command: 'cockpit', args: '' } as never)
}

// ---------- the dashboard: tabs, the person's choices, proactive triggers ----------

describe('dashboard', () => {
  test('tab strip: Board with its count and hotkey 1, then Mods; no Loop here; a press switches', async ($, on) => {
    world(on, {
      run: () => ({ exitCode: 0, stdout: '[]', stderr: '' }),
      board: { summary: { agents: 2, openAsks: 1, askedOfMe: 1 }, lines: ['api (you) · busy · fixing the bow', '  claims src/bow.ts'] },
    })
    await $.session.start({ cwd: ROOT } as never)
    let ui = await $.ui.mount(PANE)
    const labels = await Promise.all(['board', 'loop', 'mods'].map(async t => (await ui.find({ key: `tab-${t}` }))?.props))
    expect(labels.map(p => p?.label)).toEqual(['Board 1', undefined, 'Mods']) // no loop here
    expect(labels.map(p => p?.hotkey)).toEqual(['1', undefined, '2'])
    expect((await ui.find({ key: 'tab-board' }))?.props?.variant).toBe('primary')
    await ui.press({ key: 'tab-mods' })
    await ui.unmount()
    ui = await $.ui.mount(PANE)
    expect((await ui.find({ key: 'tab-mods' }))?.props?.variant).toBe('primary')
    expect((await ui.find({ key: 'tab-board' }))?.props?.plain).toBe(true)
    expect(await ui.find({ type: 'Text', text: /fixing the bow/ })).toBeUndefined()
    await ui.press({ key: 'tab-board' })
    await ui.unmount()
    ui = await $.ui.mount(PANE)
    expect((await ui.find({ key: 'tab-board' }))?.props?.variant).toBe('primary')
    expect((await ui.find({ key: 'tab-mods' }))?.props?.plain).toBe(true)
    expect(await ui.find({ type: 'Text', text: /^Board · 2 agents · 1 open ask · 1 for you$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /fixing the bow/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /claims src/ }))?.props?.dimColor).toBe(true)
    await ui.unmount()
  })

  test('Board tab draws a card per session and per ask from the pane view', async ($, on) => {
    const sess = { claims: [], claimsMore: 0, run: null, lease: null }
    const pane: BoardPane = {
      self: { ...sess, id: 'aaaaaaaa', who: 'api', status: 'busy', task: 'fixing the bow', seen: '0s ago', run: '2026-10-15-bow', lease: 'git commit 3s ago' },
      peers: [{ ...sess, id: 'bbbbbbbb', who: 'tests', status: 'idle', task: '', seen: '12s ago', claims: ['src/a.ts', 'src/b.ts'], claimsMore: 3 }],
      asks: [
        { id: 'aaaaaaaa-1', view: 'open', urgent: true, from: 'api (aaaaaaaa)', to: 'role tests', text: 'run the suite', actor: null, note: null },
        { id: 'aaaaaaaa-2', view: 'withdrawn', urgent: false, from: 'api (aaaaaaaa)', to: 'anyone', text: 'never mind', actor: null, note: null },
      ],
    }
    const { clock } = world(on, { board: { summary: { agents: 2, openAsks: 1, askedOfMe: 0 }, lines: ['old text line'], pane } })
    await $.session.start({ cwd: ROOT } as never)
    await $.command.run({ command: 'dashboard', args: 'board' } as never)
    await clock.advance(50)
    const ui = await $.ui.mount(PANE)
    const self = await ui.find({ key: 'board-s-aaaaaaaa' })
    expect(self?.props?.borderStyle).toBe('round')
    expect(self?.props?.borderColor).toBe('claude')
    expect((await ui.find({ key: 'board-s-bbbbbbbb' }))?.props?.borderColor).toBe('subtle')
    expect((await ui.find({ key: 'board-a-aaaaaaaa-1' }))?.props?.borderColor).toBe('error')
    expect(await ui.find({ type: 'Text', text: /^📝 fixing the bow$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^📂 2026-10-15-bow$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^🔑 holds the git lease: git commit 3s ago$/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^🔒 src\/a\.ts, src\/b\.ts \(\+3 more\)$/ }))?.props?.dimColor).toBe(true)
    expect(await ui.find({ type: 'Text', text: /^📝 no task recorded$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^🔥 aaaaaaaa-1 · open/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^api \(aaaaaaaa\) → role tests$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^🔙 aaaaaaaa-2 · withdrawn$/ })).toBeDefined()
    expect((await ui.find({ key: 'board-a-aaaaaaaa-2' }))?.props?.borderColor).toBe('subtle')
    expect(await ui.find({ type: 'Text', text: /old text line/ })).toBeUndefined()
    await ui.unmount()
  })

  test('mod tabs: one per loaded mod after the built-ins; a tab draws its nodes and sends presses and inputs back', async ($, on) => {
    const notifyTab = {
      title: 'Notify',
      badge: '2',
      tone: 'ok',
      raise: 0,
      body: [
        { kind: 'text', text: 'Toasts on', isBold: true },
        { kind: 'card', title: 'Last toasts', color: 'ok', body: [{ kind: 'text', text: 'turn done in game', isDim: true }] },
        { kind: 'buttons', items: [{ id: 'test', label: 'Send a test toast', isPrimary: true }] },
        { kind: 'input', id: 'note', placeholder: 'a note' },
      ],
    }
    const { clock } = world(on, {
      mods: { 'bws-notify': { tab: notifyTab }, 'bws-secrets': { summary: { state: 'ok', label: '3 secrets' } }, 'bws-diagram': { tab: { title: '' } } },
    })
    const events: unknown[] = []
    on('state.set', { plugin: 'bws-cockpit', key: 'tabEvent' }, ($, e, next) => {
      events.push(e.value)
      return next(e)
    })
    await $.session.start({ cwd: ROOT } as never)
    await $.command.run({ command: 'dashboard', args: 'notify' } as never)
    await clock.advance(50)
    const ui = await $.ui.mount(PANE)
    // Built-ins first, then loaded mods in the configured order; a malformed tab (diagram) draws nothing.
    expect((await ui.find({ key: 'tab-board' }))?.props?.hotkey).toBe('1')
    expect((await ui.find({ key: 'tab-bws-secrets' }))?.props?.label).toBe('Secrets ●')
    expect((await ui.find({ key: 'tab-bws-notify' }))?.props?.label).toBe('Notify 2')
    expect((await ui.find({ key: 'tab-bws-notify' }))?.props?.variant).toBe('primary')
    expect(await ui.find({ key: 'tab-bws-diagram' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^Notify · 2$/ })).toBeDefined()
    expect((await ui.find({ key: 'mod-bws-notify-1' }))?.props?.borderStyle).toBe('round')
    expect((await ui.find({ type: 'Text', text: /^turn done in game$/ }))?.props?.dimColor).toBe(true)
    await ui.press({ key: 'bws-notify-test' })
    await ui.unmount()
    const ui2 = await $.ui.mount(PANE)
    await ui2.input({ key: 'bws-notify-note', text: 'hello' })
    await ui2.unmount()
    expect(events).toEqual([
      { seq: 1, plugin: 'bws-notify', id: 'test' },
      { seq: 2, plugin: 'bws-notify', id: 'note', value: 'hello' },
    ])
  })

  test('/dashboard headless prints the mod tabs as text too', async ($, on) => {
    world(on, { surfaces: [], mods: { 'bws-skillgate': { summary: { state: 'idle', label: 'gate off', detail: 'Off by default.' } } } })
    const r = await $.command.run({ command: 'dashboard', args: '' } as never)
    expect(r.text).toContain('Skillgate\ngate off\nOff by default.')
  })

  test('Board tab without bws-board says so', async ($, on) => {
    const { clock } = world(on)
    await $.command.run({ command: 'dashboard', args: 'board' } as never)
    await clock.advance(50)
    const ui = await $.ui.mount(PANE)
    expect(await ui.find({ type: 'Text', text: /bws-board is not loaded here/ })).toBeDefined()
    await ui.unmount()
  })

  test('/dashboard: a bad tab prints usage; headless prints the board as text', async ($, on) => {
    world(on, { surfaces: [] })
    expect((await $.command.run({ command: 'dashboard', args: 'nope' } as never)).text).toBe('Usage: /dashboard [board|loop|<a loaded mod, e.g. notify>]')
    const r = await $.command.run({ command: 'dashboard', args: '' } as never)
    expect(r.text).toContain('bws-board is not loaded')
  })

  test('news while the person uses the pane: no tab switch, the count says it', async ($, on) => {
    const { seen, panes } = world(on, { board: { summary: { agents: 2, openAsks: 1, askedOfMe: 1 }, lines: [] } })
    await $.command.run({ command: 'dashboard', args: 'mods' } as never)
    expect(panes[0]?.isFocused).toBe(true)
    await $.session.start({ cwd: ROOT } as never) // raises the Board tab, unless the pane is in use
    expect(seen.opened.length).toBe(1)
    const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, isFocused: true } })
    expect((await ui.find({ key: 'tab-mods' }))?.props?.variant).toBe('primary')
    expect((await ui.find({ key: 'tab-board' }))?.props?.label).toBe('Board 1')
    await ui.unmount()
  })

  test('news with the pane open but not in use switches its tab', async ($, on) => {
    const { panes } = world(on, { board: { summary: { agents: 2, openAsks: 1, askedOfMe: 1 }, lines: [] } })
    await $.command.run({ command: 'dashboard', args: 'mods' } as never)
    panes[0]!.isFocused = false // opened, but the person is typing in the prompt box
    await $.session.start({ cwd: ROOT } as never) // raises the Board tab
    const ui = await $.ui.mount(PANE)
    expect((await ui.find({ key: 'tab-board' }))?.props?.variant).toBe('primary')
    expect((await ui.find({ key: 'tab-mods' }))?.props?.plain).toBe(true)
    await ui.unmount()
  })

  test('a dashboard command opens it inside its own hook, with the keys (an open after it answers is unasked)', async ($, on) => {
    const { seen } = world(on)
    await $.command.run({ command: 'dashboard', args: 'board' } as never)
    expect(seen.opened).toEqual([{ id: 'dashboard', focus: true }])
  })

  test('the dash press over an undrawn dashboard opens it instead of closing what cannot be seen', async ($, on) => {
    const { seen, panes } = world(on)
    await withBar($)
    panes.push({ id: 'dashboard', title: 'Dashboard', isShown: false, isFocused: false, isPlaced: false } as never)
    const band = await $.ui.mount(BAND)
    await band.press({ key: 'dash' })
    await band.unmount()
    expect(seen.opened.at(-1)).toEqual({ id: 'dashboard', focus: true })
    expect(panes[0]?.isPlaced).toBe(true)
  })

  test('closed from the bar: news only lights the bar; an asked open brings it back', async ($, on) => {
    const { seen, clock } = world(on, { board: { summary: { agents: 2, openAsks: 1, askedOfMe: 1 }, lines: [] } })
    await withBar($)
    await $.session.start({ cwd: ROOT } as never) // raises the Board tab
    expect(seen.opened.length).toBe(1)
    let band = await $.ui.mount(BAND)
    await band.press({ key: 'dash' }) // open: close it as the person
    await clock.settle()
    await band.unmount()
    expect(seen.closed).toEqual(['dashboard'])
    await $.prompt.submit({ text: 'hello' } as never) // the first prompt does not reopen it
    expect(seen.opened.length).toBe(1) // not reopened
    band = await $.ui.mount(BAND)
    const chip = await band.find({ type: 'Text', text: '2 live · 1 open · 1 for you' })
    expect(chip?.props?.color).toBe('warning')
    await band.unmount()
    await $.command.run({ command: 'dashboard', args: 'board' } as never)
    await clock.advance(50)
    expect(seen.opened.length).toBe(2)
    const ui = await $.ui.mount(PANE)
    expect((await ui.find({ key: 'tab-board' }))?.props?.label).toBe('Board 1')
    await ui.unmount()
  })

  test('dashboardOnStart off: session start with nothing waiting opens nothing', { options: { dashboardOnStart: false } }, async ($, on) => {
    const { seen, clock } = world(on)
    await $.session.start({ cwd: ROOT } as never)
    await clock.settle() // the bar's first data is fetched in the background; let it land before the test ends
    expect(seen.opened).toEqual([])
  })

  test('session start with nothing waiting still opens the dashboard, on Board; headless opens nothing', async ($, on) => {
    const { seen } = world(on)
    await $.session.start({ cwd: ROOT } as never)
    expect(seen.opened).toEqual([{ id: 'dashboard', focus: undefined }])
    const ui = await $.ui.mount(PANE)
    expect((await ui.find({ key: 'tab-board' }))?.props?.variant).toBe('primary')
    await ui.unmount()
  })

  test('session start headless opens no dashboard', async ($, on) => {
    const { seen } = world(on, { surfaces: [] })
    await $.session.start({ cwd: ROOT } as never)
    expect(seen.opened).toEqual([])
  })

  test('Desktop attaches after session start: the first attach opens the dashboard and fills the bar, a second opens nothing', async ($, on) => {
    const w: World = { surfaces: [] }
    const { seen } = world(on, w)
    on('session.attach', ($, e) => ({ clientId: e.clientId }) as never)
    on('ui.log', () => ({ value: undefined }) as never)
    await $.session.start({ cwd: ROOT } as never)
    expect(seen.opened).toEqual([])
    w.surfaces = ['desktop']
    await $.session.attach({ surface: 'desktop', clientId: 'desktop:default' } as never)
    expect(seen.opened).toEqual([{ id: 'dashboard', focus: undefined }])
    const bar = await $.ui.mount({
      plugin: 'bws-cockpit',
      surface: 'desktop',
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 8, bodyColumns: 80, scroll: { offset: 0, bodyRows: 8 }, view: {} },
    } as never)
    expect(await bar.find({ key: 'hide' })).toBeTruthy()
    await bar.unmount()
    await $.session.attach({ surface: 'mobile', clientId: 'mobile:1' } as never)
    expect(seen.opened.length).toBe(1)
  })

  test('an unasked start-up open left undrawn (Desktop under 144 columns) is placed at the first prompt, once; a start trace is kept', async ($, on) => {
    const w: World = { surfaces: ['desktop'], isPlaced: false }
    const { seen, files } = world(on, w)
    await $.session.start({ cwd: ROOT } as never)
    expect(seen.opened.length).toBe(1)
    w.isPlaced = true
    await $.prompt.submit({ text: 'hello' } as never)
    expect(seen.opened).toEqual([
      { id: 'dashboard', focus: undefined },
      { id: 'dashboard', focus: undefined },
    ])
    await $.prompt.submit({ text: 'again' } as never)
    expect(seen.opened.length).toBe(2)
    const log = Object.entries(files).find(([k]) => k.endsWith('bws-cockpit-start.log'))?.[1] ?? ''
    expect(log).toContain('raise: dashboard waits undrawn: narrow')
    expect(log).toContain('first prompt: dashboard placed')
  })

  test('first prompt: a dashboard the person closed stays closed', async ($, on) => {
    const { seen } = world(on, { surfaces: ['desktop'] })
    await $.session.start({ cwd: ROOT } as never)
    // The bar's dash button closes it as the person's close.
    const bar = await $.ui.mount({
      plugin: 'bws-cockpit',
      surface: 'desktop',
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 8, bodyColumns: 80, scroll: { offset: 0, bodyRows: 8 }, view: {} },
    } as never)
    await bar.press({ key: 'dash' })
    await bar.unmount()
    expect(seen.closed).toEqual(['dashboard'])
    await $.prompt.submit({ text: 'hello' } as never)
    expect(seen.opened.length).toBe(1)
  })

  test('handoff nudge: once per session past the threshold, Handoff highlighted', async ($, on) => {
    const { seen, clock } = world(on, { percent: 72 })
    await withBar($)
    let band = await $.ui.mount(BAND)
    expect((await band.find({ key: 'handoff' }))?.props?.plain).toBe(true)
    await band.unmount()
    await $.turn.complete({ answer: 'ok', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answered' } as never)
    await clock.settle()
    await $.turn.complete({ answer: 'ok', durationMs: 1000, isAborted: false, turnId: 't2', reason: 'answered' } as never)
    await clock.settle()
    expect(seen.toasts.filter(t => /context at 72%/.test(t)).length).toBe(1)
    band = await $.ui.mount(BAND)
    expect((await band.find({ key: 'handoff' }))?.props?.variant).toBe('primary')
    await band.unmount()
  })

  test('handoff nudge stays quiet under the threshold, and when switched off', { options: { handoffNudgePercent: 0 } }, async ($, on) => {
    const { seen, clock } = world(on, { percent: 95 })
    await $.turn.complete({ answer: 'ok', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answered' } as never)
    await clock.settle()
    expect(seen.toasts.filter(t => /context at/.test(t))).toEqual([])
  })
})

// ---------- the cache clock chip ----------

describe('cache clock: bar chip', () => {
  const MIN = 60_000
  const TURN = { answer: 'ok', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answered' } as never

  test('hidden before the first turn; then it counts down a minute at a time, warns under 5 minutes, and goes cold', async ($, on) => {
    const { clock } = world(on, {})
    await $.session.start({ cwd: ROOT } as never)
    await withBar($)
    let ui = await $.ui.mount(BAND)
    expect(await ui.find({ key: 'chip-cache' })).toBeUndefined()
    await ui.unmount()

    await $.turn.complete(TURN)
    await clock.settle()
    ui = await $.ui.mount(BAND)
    expect((await ui.find({ type: 'Text', text: /^cache 60m$/ }))?.props?.color).toBeUndefined()
    await ui.unmount()

    await clock.advance(55 * MIN) // 5 minutes left: fresh, not under the threshold
    await clock.settle()
    ui = await $.ui.mount(BAND)
    expect((await ui.find({ type: 'Text', text: /^cache 5m$/ }))?.props?.color).toBeUndefined()
    await ui.unmount()

    await clock.advance(MIN) // 4 minutes left: low
    await clock.settle()
    ui = await $.ui.mount(BAND)
    expect((await ui.find({ type: 'Text', text: /^cache 4m$/ }))?.props?.color).toBe('warning')
    await ui.unmount()

    await clock.advance(4 * MIN) // the hour is up
    await clock.settle()
    ui = await $.ui.mount(BAND)
    expect((await ui.find({ type: 'Text', text: /^cache cold$/ }))?.props?.color).toBe('warning')
    await ui.unmount()
  })

  test('a /clear starts the window over: the chip hides within a minute, and the next turn starts it again', async ($, on) => {
    const { clock, usage } = world(on, {})
    await $.session.start({ cwd: ROOT } as never)
    await $.turn.complete(TURN)
    await clock.settle()
    usage.startedAt = 99 // a new session window
    await clock.advance(MIN)
    await clock.settle()
    let ui = await $.ui.mount(BAND)
    expect(await ui.find({ key: 'chip-cache' })).toBeUndefined()
    await ui.unmount()

    await $.turn.complete(TURN)
    await clock.settle()
    ui = await $.ui.mount(BAND)
    expect(await ui.find({ type: 'Text', text: /^cache 60m$/ })).toBeDefined()
    await ui.unmount()
  })

  test('drawn on the desktop surface as well', async ($, on) => {
    world(on, {})
    await $.turn.complete(TURN)
    await withBar($)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    expect(await ui.find({ key: 'chip-cache' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^cache 60m$/ })).toBeDefined()
    await ui.unmount()
  })
})

// ---------- the cache clock's auto handoff ----------

describe('cache clock: auto handoff', () => {
  const MIN = 60_000
  const TURN = { answer: 'ok', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answered' } as never
  const HANDOFF = '# Handoff: test\n\n## Next step\nnone'
  const USAGE = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

  test('fires once when the cache drops under the threshold while idle, after a turn', async ($, on) => {
    const { seen, clock } = world(on, {})
    const forks: string[] = []
    on('model.fork', ($, e) => {
      forks.push(String((e as { prompt?: string }).prompt))
      return { value: { isAnswered: true, text: HANDOFF, usage: USAGE } as never }
    })
    await $.session.start({ cwd: ROOT } as never)
    await $.turn.complete(TURN)
    await clock.settle()
    await clock.advance(55 * MIN) // 5 minutes left: fresh
    await clock.settle()
    expect(forks.length).toBe(0)
    await clock.advance(MIN) // 4 minutes left: low
    await clock.settle()
    expect(forks.length).toBe(1)
    expect(seen.toasts.some(t => /cache clock: Handoff written/.test(t))).toBe(true)
    await clock.advance(4 * MIN) // still low, but no turn since the handoff
    await clock.settle()
    expect(forks.length).toBe(1)
  })

  test('not while a turn is running', async ($, on) => {
    const { clock } = world(on, {})
    const forks: string[] = []
    on('model.fork', ($, e) => {
      forks.push(String((e as { prompt?: string }).prompt))
      return { value: { isAnswered: true, text: HANDOFF, usage: USAGE } as never }
    })
    await $.session.start({ cwd: ROOT } as never)
    await $.turn.complete(TURN)
    await clock.settle()
    await clock.advance(50 * MIN)
    await $.prompt.submit({ text: 'next' } as never) // a turn starts; it has not ended
    await clock.advance(6 * MIN) // low, and a turn has happened, but one is running
    await clock.settle()
    expect(forks.length).toBe(0)
    await $.turn.complete(TURN) // it ends: the clock restarts, so it is fresh again
    await clock.settle()
    expect(forks.length).toBe(0)
  })

  test('a manual /handoff is the window\'s handoff: no auto one after it', async ($, on) => {
    const { clock } = world(on, {})
    const forks: string[] = []
    on('model.fork', ($, e) => {
      forks.push(String((e as { prompt?: string }).prompt))
      return { value: { isAnswered: true, text: HANDOFF, usage: USAGE } as never }
    })
    await $.session.start({ cwd: ROOT } as never)
    await $.turn.complete(TURN)
    await clock.settle()
    await clock.advance(50 * MIN)
    await $.command.run({ command: 'handoff', args: '' } as never)
    await clock.advance(6 * MIN) // low, with no turn since the manual handoff
    await clock.settle()
    expect(forks.length).toBe(1)
  })

  test('a failed attempt is not retried every minute, and leaves one debug line', async ($, on) => {
    const { clock } = world(on, {})
    const forks: string[] = []
    const debug: string[] = []
    on('model.fork', ($, e) => {
      forks.push(String((e as { prompt?: string }).prompt))
      return { value: { isAnswered: false, reason: 'error', usage: USAGE } as never }
    })
    on('ui.log', ($, e) => {
      if (e.to === 'debug') debug.push(e.text)
      return { value: undefined } as never
    })
    await $.session.start({ cwd: ROOT } as never)
    await $.turn.complete(TURN)
    await clock.settle()
    await clock.advance(56 * MIN)
    await clock.settle()
    await clock.advance(3 * MIN)
    await clock.settle()
    expect(forks.length).toBe(1)
    expect(debug.length).toBe(1)
    expect(debug[0]).toMatch(/^cache clock: No handoff written: the model call failed/)
  })

  test('a new turn after a handoff starts a new window, and its low point gets one more', async ($, on) => {
    const { clock } = world(on, {})
    const forks: string[] = []
    on('model.fork', ($, e) => {
      forks.push(String((e as { prompt?: string }).prompt))
      return { value: { isAnswered: true, text: HANDOFF, usage: USAGE } as never }
    })
    await $.session.start({ cwd: ROOT } as never)
    await $.turn.complete(TURN)
    await clock.settle()
    await clock.advance(56 * MIN)
    await clock.settle()
    expect(forks.length).toBe(1)
    await $.turn.complete(TURN) // the window restarts at 56 min
    await clock.settle()
    await clock.advance(56 * MIN) // low again at 112 min
    await clock.settle()
    expect(forks.length).toBe(2)
  })

  test('off when autoHandoff is switched off', { options: { autoHandoff: false } }, async ($, on) => {
    const { clock } = world(on, {})
    const forks: string[] = []
    on('model.fork', ($, e) => {
      forks.push(String((e as { prompt?: string }).prompt))
      return { value: { isAnswered: true, text: HANDOFF, usage: USAGE } as never }
    })
    await $.session.start({ cwd: ROOT } as never)
    await $.turn.complete(TURN)
    await clock.settle()
    await clock.advance(58 * MIN)
    await clock.settle()
    expect(forks.length).toBe(0)
  })
})

// ---------- /cacheclock ----------

describe('cache clock: /cacheclock', () => {
  const MIN = 60_000
  const TURN = { answer: 'ok', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answered' } as never

  test('says there is no request yet before the first turn', async ($, on) => {
    world(on, {})
    const r = await $.command.run({ command: 'cacheclock', args: '' } as never)
    expect(r.text).toContain('no request yet in this session')
    expect(r.text).toContain('Auto handoff: none this session.')
  })

  test('prints the time left, the state and the TTL; headless too', async ($, on) => {
    world(on, { surfaces: [] })
    await $.turn.complete(TURN)
    const r = await $.command.run({ command: 'cacheclock', args: 'status' } as never)
    expect(r.text).toContain('60m left of 60m (fresh)')
  })

  test('shows when the last auto handoff was written', async ($, on) => {
    const { clock } = world(on, {})
    on('model.fork', () => ({ value: { isAnswered: true, text: '# Handoff: test', usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } as never }))
    await $.session.start({ cwd: ROOT } as never)
    await $.turn.complete(TURN)
    await clock.settle()
    await clock.advance(56 * MIN)
    await clock.settle()
    const r = await $.command.run({ command: 'cacheclock', args: '' } as never)
    expect(r.text).toContain('4m left of 60m (low, under 5m)')
    expect(r.text).toMatch(/Auto handoff: last written \d\d:\d\d\./)
  })

  // bin/ttl.py's output for a transcript whose newest replies wrote a 5m cache
  const FIVE = '{"ephemeral_1h_input_tokens": 0, "ephemeral_5m_input_tokens": 1422}\n'
  const STOP = { stop_hook_active: false, transcript_path: 'C:/t/s1.jsonl', last_assistant_message: 'ok', background_tasks: [], session_crons: [] } as never

  test('a Stop reads the TTL from the transcript: 5m drives the clock, the low mark and the auto handoff', async ($, on) => {
    const { clock } = world(on, { run: argv => ({ exitCode: 0, stdout: argv[0] === 'python' ? FIVE : '', stderr: '' }) })
    on('classic.Stop', () => ({}))
    const forks: string[] = []
    on('model.fork', () => {
      forks.push('fork')
      return { value: { isAnswered: true, text: '# Handoff: test', usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } as never }
    })
    await $.session.start({ cwd: ROOT } as never)
    await $.turn.complete(TURN)
    await $.classic.Stop(STOP)
    await clock.settle()
    let r = await $.command.run({ command: 'cacheclock', args: '' } as never)
    expect(r.text).toContain('5m left of 5m (fresh)')
    expect(r.text).toContain("TTL: 5m, as Anthropic's last reply wrote the cache.")
    expect(r.text).toContain('Auto handoff: waits while the cache lasts under 15m')
    await clock.advance(4.5 * MIN) // under the 1m low mark (a fifth of 5m), not yet cold
    await clock.settle()
    r = await $.command.run({ command: 'cacheclock', args: '' } as never)
    expect(r.text).toContain('<1m left of 5m (low, under 1m)')
    expect(forks.length).toBe(0)
  })

  test('the script gets the transcript the Stop names; without python the option stays', async ($, on) => {
    const runs: string[][] = []
    world(on, {
      run: argv => {
        runs.push([...argv])
        throw new Error('not found')
      },
    })
    on('classic.Stop', () => ({}))
    await $.turn.complete(TURN)
    await $.classic.Stop(STOP)
    const r = await $.command.run({ command: 'cacheclock', args: '' } as never)
    const py = runs.filter(a => norm(a[1]).endsWith('/bin/ttl.py'))
    expect(py.map(a => a[0])).toEqual(['python', 'python3'])
    expect(py[0]?.[2]).toBe('C:/t/s1.jsonl')
    expect(r.text).toContain('60m left of 60m (fresh)')
    expect(r.text).toContain('TTL: 60m from the cacheTtlMinutes option')
  })

  test('a reply not yet in the transcript at Stop is read on a retry', async ($, on) => {
    let calls = 0
    const { clock } = world(on, {
      run: argv => {
        if (!norm(argv[1]).endsWith('/bin/ttl.py')) throw new Error('not here')
        calls += 1
        return { exitCode: 0, stdout: calls >= 2 ? FIVE : '', stderr: '' }
      },
    })
    on('classic.Stop', () => ({}))
    await $.turn.complete(TURN)
    await $.classic.Stop(STOP)
    await clock.settle()
    expect((await $.command.run({ command: 'cacheclock', args: '' } as never)).text).toContain('TTL: 60m from the cacheTtlMinutes option')
    await clock.advance(3_000)
    await clock.settle()
    expect(calls).toBe(2)
    expect((await $.command.run({ command: 'cacheclock', args: '' } as never)).text).toContain("TTL: 5m, as Anthropic's last reply wrote the cache.")
  })
})

// ---------- the action bar's buttons ----------

describe('bar buttons', () => {
  test('enhance runs bws-enhance on the draft; without bws-enhance it says so', async ($, on) => {
    const { seen, clock, setBox } = world(on, { commands: ['enhance'] })
    await withBar($)
    setBox('fix the bow')
    const band = await $.ui.mount(BAND)
    await band.press({ key: 'enhance' })
    await clock.settle()
    await band.unmount()
    expect(seen.commands.filter(c => c.command === 'enhance')).toEqual([{ command: 'enhance', args: 'fix the bow' }])
  })

  test('enhance without bws-enhance loaded only toasts', async ($, on) => {
    const { seen, clock, setBox } = world(on)
    await withBar($)
    setBox('fix the bow')
    const band = await $.ui.mount(BAND)
    await band.press({ key: 'enhance' })
    await clock.settle()
    await band.unmount()
    expect(seen.commands.filter(c => c.command === 'enhance')).toEqual([])
    expect(seen.toasts.at(-1)).toBe('Enhance: bws-enhance is not loaded')
  })

  test('the badge opens, then closes the dashboard; a signal opens it on its tab', async ($, on) => {
    const { seen, clock } = world(on, { board: { summary: { agents: 2, openAsks: 1, askedOfMe: 0 }, lines: [] } })
    await withBar($)
    let band = await $.ui.mount(BAND)
    await band.press({ key: 'dash' })
    await clock.settle()
    await band.unmount()
    expect(seen.opened.map(o => o.id)).toEqual(['dashboard'])
    band = await $.ui.mount(BAND)
    await band.press({ key: 'dash' })
    await clock.settle()
    await band.unmount()
    expect(seen.closed.at(-1)).toBe('dashboard')
    band = await $.ui.mount(BAND)
    await band.press({ key: 'tab-board' }) // the board signal
    await clock.settle()
    await band.unmount()
    expect(seen.opened.length).toBe(2)
    const ui = await $.ui.mount(PANE)
    expect((await ui.find({ key: 'tab-board' }))?.props?.variant).toBe('primary')
    await ui.unmount()
  })
})

const FOOTER = (surface: 'terminal' | 'desktop' | 'mobile' = 'terminal', modes: string[] = ['plan']) =>
  ({ plugin: 'bws-cockpit', component: 'SessionMode', surface, props: { modes } }) as const

describe('footer cockpit button', () => {
  test('draws beside the engine mode labels on terminal and desktop', async ($, on) => {
    world(on)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount(FOOTER(surface))
      expect(String((await ui.find({ key: 'cockpit' }))?.props?.label)).toContain('cockpit')
      expect(await ui.find({ type: 'Text', text: 'plan' })).toBeDefined()
      await ui.unmount()
    }
  })

  test('keeps another mod footer and draws the labels once', async ($, on) => {
    world(on)
    on('ui.render', () => ({ type: 'Text', props: {}, children: ['side footer'] }) as never)
    const ui = await $.ui.mount(FOOTER())
    expect(await ui.find({ type: 'Text', text: 'side footer' })).toBeDefined()
    expect(await ui.find({ key: 'cockpit' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'plan' })).toBeUndefined()
    await ui.unmount()
  })

  test('leaves other surfaces alone', async ($, on) => {
    world(on)
    on('ui.render', () => ({ type: 'Text', props: {}, children: ['engine footer'] }) as never)
    const ui = await $.ui.mount(FOOTER('mobile'))
    expect(await ui.find({ key: 'cockpit' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'engine footer' })).toBeDefined()
    await ui.unmount()
  })

  test('press opens the dashboard, again closes it; a hidden bar comes back', async ($, on) => {
    const { seen, clock } = world(on)
    on('ui.render', () => ({ type: 'Text', props: {}, children: ['engine'] }) as never) // the hidden bar passes to it
    await withBar($)
    await $.command.run({ command: 'cockpit', args: 'hide' } as never)
    let band = await $.ui.mount(BAND)
    expect(await band.find({ key: 'dash' })).toBeUndefined()
    await band.unmount()
    let ui = await $.ui.mount(FOOTER())
    await ui.press({ key: 'cockpit' })
    await clock.settle()
    await ui.unmount()
    expect(seen.opened.map(o => o.id)).toEqual(['dashboard'])
    band = await $.ui.mount(BAND)
    expect(await band.find({ key: 'dash' })).toBeDefined()
    await band.unmount()
    ui = await $.ui.mount(FOOTER())
    await ui.press({ key: 'cockpit' })
    await clock.settle()
    await ui.unmount()
    expect(seen.closed.at(-1)).toBe('dashboard')
  })
})

describe('switchboard', () => {
  const LIST = JSON.stringify([
    { id: 'bws-agents@bws-mods', version: '0.1.0', enabled: true },
    { id: 'bws-notify@bws-mods', version: '0.3.0', enabled: false },
    { id: 'bws-cockpit@bws-mods', version: '0.28.0', enabled: true },
    { id: 'other@elsewhere', version: '1', enabled: true },
  ])
  const agentsTabValue = { title: 'Agents', badge: '🟢1', tone: 'busy', raise: 0, body: [{ kind: 'card', title: '🟢 Explore · Scan', color: 'accent', body: [{ kind: 'text', text: '🔎 running 5s' }] }] }
  const plugins = (argv: readonly string[]) =>
    argv[2] === 'list' ? { exitCode: 0, stdout: LIST, stderr: '' } : { exitCode: 0, stdout: `${argv[2]}d ${argv[3]}`, stderr: '' }

  test('the Agents tab draws as cards; the Mods tab lists every mod with its state and switches', async ($, on) => {
    const { clock, runs } = world(on, { run: plugins, mods: { 'bws-agents': { tab: agentsTabValue } } })
    await $.session.start({ cwd: ROOT } as never)
    await $.command.run({ command: 'dashboard', args: 'agents' } as never)
    await clock.advance(50)
    let ui = await $.ui.mount(PANE)
    expect((await ui.find({ key: 'tab-bws-agents' }))?.props?.label).toBe('Agents 🟢1')
    expect((await ui.find({ key: 'mod-bws-agents-0' }))?.props?.borderColor).toBe('claude')
    expect(await ui.find({ type: 'Text', text: /🟢 Explore · Scan/ })).toBeDefined()
    await ui.unmount()
    await $.command.run({ command: 'switchboard', args: '' } as never)
    await clock.advance(50)
    ui = await $.ui.mount(PANE)
    expect(runs.some(r => r.join(' ') === 'claude plugin list --json')).toBe(true)
    expect((await ui.find({ key: 'tab-mods' }))?.props?.variant).toBe('primary')
    expect((await ui.find({ key: 'sw-bws-agents' }))?.props?.borderColor).toBe('success')
    expect((await ui.find({ key: 'sw-bws-notify' }))?.props?.borderColor).toBe('error')
    expect((await ui.find({ key: 'sw-bws-memory' }))?.props?.borderColor).toBe('subtle')
    expect(await ui.find({ key: 'sw-dis-bws-cockpit' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^✅ 0\.1\.0|✅ on · v0\.1\.0 · loaded · tab shown$/ })).toBeDefined()
    await ui.press({ key: 'sw-dis-bws-agents' })
    await clock.advance(50)
    expect(runs.some(r => r.join(' ') === 'claude plugin disable bws-agents@bws-mods')).toBe(true)
    await ui.unmount()
    ui = await $.ui.mount(PANE)
    expect((await ui.find({ key: 'sw-bws-agents' }))?.props?.borderColor).toBe('warning')
    expect(await ui.find({ type: 'Text', text: /run \/reload-plugins to apply/ })).toBeDefined()
    await ui.unmount()
  })

  test('hide keeps a tab out of the dashboard across sessions; show brings it back', async ($, on) => {
    const { clock, store } = world(on, { run: plugins, mods: { 'bws-agents': { tab: agentsTabValue } } })
    await $.session.start({ cwd: ROOT } as never)
    expect((await $.command.run({ command: 'switchboard', args: '--hide agents' } as never)).text).toContain('bws-agents: tab hidden')
    expect(store['switchboard.hidden']).toEqual(['bws-agents'])
    await $.command.run({ command: 'dashboard', args: '' } as never)
    await clock.advance(50)
    let ui = await $.ui.mount(PANE)
    expect(await ui.find({ key: 'tab-bws-agents' })).toBeUndefined()
    await ui.unmount()
    await $.command.run({ command: 'switchboard', args: '--show bws-agents' } as never)
    ui = await $.ui.mount(PANE)
    expect(await ui.find({ key: 'tab-bws-agents' })).toBeDefined()
    await ui.unmount()
  })

  test('headless /switchboard prints the board; bad args print usage; cockpit cannot switch itself off', async ($, on) => {
    world(on, { surfaces: [], run: plugins, commands: [] })
    await $.session.start({ cwd: ROOT } as never)
    const r = await $.command.run({ command: 'switchboard', args: 'text' } as never)
    expect(r.text).toContain('Mods: ')
    expect(r.text).toContain('🤖 Agents (bws-agents): on · v0.1.0')
    expect(r.text).toContain('🔔 Notify (bws-notify): off · v0.3.0')
    expect((await $.command.run({ command: 'switchboard', args: '--disable' } as never)).text).toMatch(/^Usage/)
    expect((await $.command.run({ command: 'switchboard', args: '--disable cockpit' } as never)).text).toContain('cannot switch cockpit')
  })
})

