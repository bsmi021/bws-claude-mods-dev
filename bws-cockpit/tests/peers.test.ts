import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { isRecordFile, latestPrompts, parseRecord, parseTasklist, peersText, promptLine, repoKey, sortOthers, sortPeers, toPeer, whereIn } from '../hooks/peers'
import type { PeerView } from '../types'

// The engine's session registry, shaped like the real <pid>.json files.
const T0 = Date.parse('2026-10-02T14:00:00')
const CONFIG = 'C:/Users/me/.claude'
const REPO = 'C:/repo'

type Rec = { pid: number; sessionId: string; cwd: string; name: string; status: string; kind?: string; startedAt?: number; statusAt?: number }

const recJson = (r: Rec) =>
  JSON.stringify({
    pid: r.pid,
    sessionId: r.sessionId,
    cwd: r.cwd.split('/').join(String.fromCharCode(92)),
    startedAt: r.startedAt ?? T0 - 2 * 3600_000,
    procStart: `ps${r.pid}`,
    version: '2.1.288',
    kind: r.kind ?? 'interactive',
    entrypoint: 'cli',
    name: r.name,
    status: r.status,
    updatedAt: r.statusAt ?? T0 - 60_000,
    statusUpdatedAt: r.statusAt ?? T0 - 60_000,
  })

const RECS: Rec[] = [
  { pid: 10, sessionId: 'self', cwd: REPO, name: 'me', status: 'busy' },
  { pid: 20, sessionId: 's-busy', cwd: REPO, name: 'refactor', status: 'busy', statusAt: T0 - 3 * 60_000 },
  { pid: 30, sessionId: 's-worker', cwd: `${REPO}/tools`, name: 'worker-7', status: 'busy', kind: 'sdk-cli' },
  { pid: 40, sessionId: 's-other', cwd: 'C:/other', name: 'elsewhere', status: 'idle' },
  { pid: 50, sessionId: 's-wt', cwd: 'C:/wt/feat', name: 'feature-wt', status: 'idle' },
  { pid: 60, sessionId: 's-dead', cwd: REPO, name: 'crashed', status: 'idle' },
]

// The engine's prompt history: one line per prompt, newest last.
const hist = (sessionId: string, display: string, at: number) => JSON.stringify({ display, pastedContents: {}, timestamp: at, project: 'C:\\repo', sessionId })
const HISTORY = [
  hist('s-busy', 'an older prompt', T0 - 600_000),
  hist('s-other', 'a prompt in another repo', T0 - 500_000),
  hist('s-wt', '\n  ship the   worktree fix\nsecond line', T0 - 400_000),
  hist('s-busy', 'fix the flaky test', T0 - 300_000),
  hist('self', 'my own prompt', T0 - 200_000),
  hist('s-busy', '/repo-sessions', T0 - 100_000), // bare slash command: skipped
  hist('s-worker', '/harness-loop build the M7 bundles', T0 - 90_000), // with arguments: kept
  'not json',
].join('\n') + '\n'

const norm = (p: unknown) => String(p).replace(/\\/g, '/')

type World = { surfaces?: string[]; tasklist?: 'fail'; bigHistory?: boolean; tails?: { argv: string[]; env?: Record<string, string> }[]; tasklistImage?: Record<number, string>; panes?: { id: string; isShown: boolean; isPlaced: boolean }[] }

function world(on: On, w: World = {}) {
  const clock = mock.clock(on, { now: T0 })
  const opened: string[] = []
  const closed: string[] = []
  const reads: string[] = []
  let panes = w.panes ?? []
  on('env.get', ($, e) => ({ value: e.name === 'USERPROFILE' ? 'C:\\Users\\me' : undefined }))
  on('session.id', () => ({ value: 'self' }))
  on('session.root', () => ({ value: REPO }))
  on('session.cwd', () => ({ value: REPO }))
  on('session.surfaces', () => ({ value: (w.surfaces ?? []) as never }))
  on('fs.list', ($, e) => {
    if (norm(e.path) !== `${CONFIG}/sessions`) throw new Error(`ENOENT ${e.path}`)
    const names = [...RECS.map(r => `${r.pid}.json`), '20.0d0c497f.key']
    return { value: names.map(name => ({ name, kind: 'file' as const, size: 1, mtimeMs: T0, isLink: false })) }
  })
  on('fs.stat', ($, e) => {
    const path = norm(e.path)
    if (path === `${CONFIG}/history.jsonl`) return { value: { kind: 'file', size: w.bigHistory ? 5_000_000 : HISTORY.length, mtimeMs: T0 - 1000, isLink: false } as never }
    if (path === `${REPO}/.git` || path === 'C:/other/.git') return { value: { kind: 'dir', size: 0, mtimeMs: 0, isLink: false } as never }
    if (path === 'C:/wt/feat/.git') return { value: { kind: 'file', size: 1, mtimeMs: 0, isLink: false } as never }
    throw new Error(`ENOENT ${path}`)
  })
  on('fs.read', ($, e) => {
    const path = norm(e.path)
    reads.push(path)
    if (path === 'C:/wt/feat/.git') return { value: 'gitdir: C:/repo/.git/worktrees/feat\n' as never }
    if (path === `${CONFIG}/history.jsonl`) return { value: HISTORY as never }
    const rec = RECS.find(r => path === `${CONFIG}/sessions/${r.pid}.json`)
    if (rec) return { value: recJson(rec) as never }
    throw new Error(`ENOENT ${path}`)
  })
  on('process.run', ($, e) => {
    if (String(e.argv[0]) === 'powershell' && w.bigHistory) {
      w.tails?.push({ argv: [...e.argv].map(String), env: e.init?.env })
      // the last 1 MiB of a big file starts mid-line
      return { value: { exitCode: 0, stdout: `t":"cut mid-line","sessionId":"s-busy"}\n${HISTORY}`, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    }
    if (String(e.argv[0]) === 'tasklist') {
      if (w.tasklist === 'fail') throw new Error('ENOENT tasklist')
      const images: Record<number, string> = { 10: 'claude.exe', 20: 'claude.exe', 30: 'claude.exe', 40: 'claude.exe', 50: 'claude.exe', ...w.tasklistImage }
      const lines = Object.entries(images).map(([pid, image]) => `"${image}","${pid}","Console","1","300,000 K"`)
      return { value: { exitCode: 0, stdout: `${lines.join('\r\n')}\r\n`, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    }
    throw new Error(`ENOENT ${String(e.argv[0])}`)
  })
  on('http.fetch', () => {
    throw new Error('ECONNREFUSED')
  })
  on('ui.panes', () => ({ value: panes as never }))
  on('ui.open', ($, e) => {
    opened.push(String(e.id))
    panes = [...panes.filter(p => p.id !== e.id), { id: String(e.id), isShown: true, isPlaced: true }]
    return { value: { isPlaced: true } }
  })
  on('ui.close', ($, e) => {
    closed.push(String(e.id))
    panes = panes.filter(p => p.id !== e.id)
    return { value: undefined }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('command.register', () => ({ value: undefined as never }))
  on('tool.register', () => ({ value: undefined as never }))
  on('session.start', ($, e) => e as never)
  return { clock, opened, closed, reads, closeAll: () => void (panes = []) }
}

const PANE = {
  plugin: 'bws-cockpit',
  component: 'Pane',
  requestId: 'repo-sessions',
  props: { title: 'Sessions here', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

// ---------- pure ----------

const peer = (name: string, kind: string, status: string, startedAt: number, repo = 'repo'): PeerView => ({
  sessionId: name, pid: 1, name, status, kind, repo, where: '', startedAt, statusSince: null, prompt: null, promptAt: null,
})

describe('repo sessions parsing', () => {
  test('registry records parse; junk and partial records do not', () => {
    const r = parseRecord(recJson(RECS[1] as Rec))
    expect(r?.pid).toBe(20)
    expect(r?.name).toBe('refactor')
    expect(r?.statusSince).toBe(T0 - 3 * 60_000)
    expect(parseRecord('{"pid":1}')).toBeUndefined()
    expect(parseRecord('not json')).toBeUndefined()
    expect(parseRecord('null')).toBeUndefined()
  })

  test('only <pid>.json files are records', () => {
    expect(isRecordFile('24896.json')).toBe(true)
    expect(isRecordFile('24896.0d0c497f.key')).toBe(false)
    expect(isRecordFile('notes.json')).toBe(false)
  })

  test('repo key: the .git folder, a worktree resolves to its main checkout', () => {
    expect(repoKey('C:/Repo')).toBe('c:/repo/.git')
    expect(repoKey('C:/wt/feat', 'gitdir: C:/Repo/.git/worktrees/feat\n')).toBe('c:/repo/.git')
    expect(repoKey('C:/wt/feat', 'gitdir: C:\\Repo\\.git\\worktrees\\feat\r\n')).toBe('c:/repo/.git')
    expect(repoKey('C:/Repo/.claude/worktrees/x', 'gitdir: ../../../.git/worktrees/x')).toBe('c:/repo/.git')
    expect(repoKey('C:/sub', 'gitdir: C:/Repo/.git/modules/sub')).toBe('c:/repo/.git/modules/sub')
  })

  test('where a session runs, relative to the repo root', () => {
    expect(whereIn('C:\\Repo', 'C:/repo')).toBe('')
    expect(whereIn('C:\\Repo\\tools\\x', 'C:/repo')).toBe('tools/x')
    expect(whereIn('D:/wt/feat', 'C:/repo')).toBe('D:/wt/feat')
  })

  test('tasklist CSV pids', () => {
    expect([...parseTasklist('"claude.exe","24896","Console","1","300,000 K"\r\n"System","4","Services","0","1 K"\r\n')]).toEqual([[24896, 'claude.exe'], [4, 'System']])
    expect(parseTasklist('INFO: No tasks are running').size).toBe(0)
  })

  test('interactive first, busy before idle, then newest', () => {
    const order = sortPeers([peer('w', 'sdk-cli', 'busy', 9), peer('a', 'interactive', 'idle', 5), peer('b', 'interactive', 'busy', 1), peer('c', 'interactive', 'idle', 8)])
    expect(order.map(p => p.name)).toEqual(['b', 'c', 'a', 'w'])
  })

  test('other repos: by repo name, then the same order inside each', () => {
    const order = sortOthers([peer('x', 'interactive', 'idle', 1, 'zeta'), peer('w', 'sdk-cli', 'busy', 9, 'Alpha'), peer('a', 'interactive', 'busy', 5, 'alpha')])
    expect(order.map(p => p.name)).toEqual(['a', 'w', 'x'])
  })

  test('latest prompt per wanted session, newest wins, first line only', () => {
    const got = latestPrompts(HISTORY, new Set(['s-busy', 's-wt', 's-never', 's-worker']))
    expect(got.get('s-worker')?.text).toBe('/harness-loop build the M7 bundles')
    expect(got.get('s-busy')).toEqual({ text: 'fix the flaky test', at: T0 - 300_000 })
    expect(got.get('s-wt')?.text).toBe('ship the worktree fix')
    expect(got.has('s-never')).toBe(false)
    expect(got.has('s-other')).toBe(false) // not wanted
    expect(latestPrompts('', new Set(['s-busy'])).size).toBe(0)
    expect(promptLine('\n\n  a   b \nc')).toBe('a b')
    expect(promptLine(42)).toBe('')
  })

  test('text summary', () => {
    const r = parseRecord(recJson(RECS[2] as Rec))
    expect(r).toBeDefined()
    const text = peersText([toPeer(r!, REPO, { text: 'run unit D3', at: null })], REPO, T0)
    expect(text).toContain('1 other session in repo:')
    expect(text).toContain('- worker-7: busy 1m (sdk-cli · in tools · started 2h ago)\n  › run unit D3')
    expect(peersText([], REPO, T0)).toBe('No other Claude Code sessions in repo.')
    const other = parseRecord(recJson(RECS[3] as Rec))
    expect(peersText([], REPO, T0, [toPeer(other!, 'C:/other')])).toBe(
      'No other Claude Code sessions in repo.\n\nOther repos (1):\nother:\n- elsewhere: idle 1m',
    )
  })
})

// ---------- hooks ----------

describe('repo sessions', () => {
  test('/repo-sessions with no surface lists the live sessions in this repo as text', async ($, on) => {
    const w = world(on)
    const r = await $.command.run({ command: 'repo-sessions', args: '' } as never)
    expect(r.text).toContain('3 other sessions in repo:')
    expect(r.text).toMatch(
      /- refactor: busy 3m \(started 2h ago\)\n {2}› fix the flaky test\n- feature-wt: idle 1m \(in C:\/wt\/feat · started 2h ago\)\n {2}› ship the worktree fix\n- worker-7: busy 1m \(sdk-cli · in tools · started 2h ago\)\n {2}› \/harness-loop build the M7 bundles\n\n/,
    )
    expect(r.text).toContain('\n\nOther repos (1):\nother:\n- elsewhere: idle 1m') // another repo, at the bottom, no prompt
    expect(r.text).not.toContain('a prompt in another repo')
    expect(r.text).not.toContain('crashed') // pid gone
    expect(r.text).not.toContain('- me:') // this session
    expect(w.reads.some(p => p.endsWith('.key'))).toBe(false)
  })

  test('a failed liveness check keeps every session', async ($, on) => {
    world(on, { tasklist: 'fail' })
    const r = await $.command.run({ command: 'repo-sessions', args: '' } as never)
    expect(r.text).toContain('crashed')
  })

  test('the pane shows each session with status, time and where', async ($, on) => {
    world(on, { surfaces: ['terminal'] })
    await $.command.run({ command: 'repo-sessions', args: '' } as never)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...PANE, surface })
      expect(await ui.find({ type: 'Text', text: /^repo$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /3 others/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^refactor$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /busy 3m/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /in C:\/wt\/feat/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /sdk-cli · in tools/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^ {2}› fix the flaky test$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^ {2}› ship the worktree fix$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^Other repos$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^other$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^elsewhere$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /idle 1m/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /crashed|a prompt in another repo|my own prompt/ })).toBeUndefined()
      expect(await ui.find({ key: 'peers-refresh' })).toBeDefined()
      await ui.unmount()
    }
  })

  test('/repo-sessions opens the pane, and a second one closes it', async ($, on) => {
    const w = world(on, { surfaces: ['terminal'] })
    expect((await $.command.run({ command: 'repo-sessions', args: '' } as never)).text).toBeUndefined()
    expect(w.opened).toEqual(['repo-sessions'])
    await $.command.run({ command: 'repo-sessions', args: '' } as never)
    expect(w.closed).toEqual(['repo-sessions'])
  })

  test('/repo-sessions brings a pane hidden behind another tab to the front instead of closing it', async ($, on) => {
    const w = world(on, { surfaces: ['terminal'], panes: [{ id: 'repo-sessions', isShown: false, isPlaced: true }] })
    await $.command.run({ command: 'repo-sessions', args: '' } as never)
    expect(w.opened).toEqual(['repo-sessions'])
    expect(w.closed).toEqual([])
  })

  test('in fullscreen a new interactive session opens the pane once; closing it keeps it closed', async ($, on) => {
    const w = world(on, { surfaces: ['terminal'] })
    // A drawing reports the layout: fullscreen, where the pane docks beside the transcript.
    const probe = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: { columns: 200, rows: 50, isFullscreen: true } })
    await probe.unmount()
    await $.session.start({ cwd: REPO, surface: 'terminal', isInteractive: true } as never)
    await w.clock.advance(5_000)
    expect(w.opened).toEqual(['repo-sessions'])
    w.closeAll() // the person closes it
    await w.clock.advance(15_000)
    expect(w.opened).toEqual(['repo-sessions'])
  })

  test('outside fullscreen nothing opens unasked', async ($, on) => {
    const w = world(on, { surfaces: ['terminal'] })
    const probe = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: { columns: 200, rows: 50, isFullscreen: false } })
    await probe.unmount()
    await $.session.start({ cwd: REPO, surface: 'terminal', isInteractive: true } as never)
    await w.clock.advance(10_000)
    expect(w.opened).toEqual([])
    expect(w.reads.some(p => p.endsWith('/sessions/20.json'))).toBe(true) // the poll ran
    expect(w.reads.some(p => p.endsWith('/history.jsonl'))).toBe(false) // but read no prompts with the pane closed
  })

  test('peersAutoOpen: false never opens unasked', { options: { peersAutoOpen: false } }, async ($, on) => {
    const w = world(on, { surfaces: ['terminal'] })
    const probe = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: { columns: 200, rows: 50, isFullscreen: true } })
    await probe.unmount()
    await $.session.start({ cwd: REPO, surface: 'terminal', isInteractive: true } as never)
    await w.clock.advance(10_000)
    expect(w.opened).toEqual([])
  })

  test('a pane opened and closed by /repo-sessions stays closed for the peers it already showed', async ($, on) => {
    const w = world(on, { surfaces: ['terminal'] })
    const probe = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: { columns: 200, rows: 50, isFullscreen: false } })
    await probe.unmount()
    await $.session.start({ cwd: REPO, surface: 'terminal', isInteractive: true } as never)
    await $.command.run({ command: 'repo-sessions', args: '' } as never)
    const open = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: { columns: 200, rows: 50, isFullscreen: true } })
    await open.unmount()
    await $.command.run({ command: 'repo-sessions', args: '' } as never)
    expect(w.closed).toEqual(['repo-sessions'])
    await w.clock.advance(15_000)
    expect(w.opened).toEqual(['repo-sessions'])
  })

  test('a reused pid that is not a claude process counts as gone', async ($, on) => {
    world(on, { tasklistImage: { 60: 'chrome.exe' } })
    const r = await $.command.run({ command: 'repo-sessions', args: '' } as never)
    expect(r.text).not.toContain('crashed')
  })

  test('history.jsonl is read once while it is unchanged', async ($, on) => {
    const w = world(on)
    await $.command.run({ command: 'repo-sessions', args: '' } as never)
    await $.command.run({ command: 'repo-sessions', args: '' } as never)
    expect(w.reads.filter(p => p.endsWith('/history.jsonl')).length).toBe(1)
  })

  test('a history.jsonl over 4 MiB is read from its tail, never whole', async ($, on) => {
    const tails: { argv: string[]; env?: Record<string, string> }[] = []
    const w = world(on, { bigHistory: true, tails })
    const r = await $.command.run({ command: 'repo-sessions', args: '' } as never)
    expect(r.text).toContain('  › fix the flaky test')
    expect(r.text).not.toContain('cut mid-line')
    expect(w.reads.some(p => p.endsWith('/history.jsonl'))).toBe(false)
    expect(tails.length).toBe(1)
    expect(norm(tails[0]?.env?.BWS_TAIL_PATH)).toBe(`${CONFIG}/history.jsonl`)
    expect(tails[0]?.env?.BWS_TAIL_BYTES).toBe('1048576')
  })
})
