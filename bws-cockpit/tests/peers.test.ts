import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { isRecordFile, parseRecord, parseTasklist, peersText, repoKey, sortPeers, toPeer, whereIn } from '../hooks/peers'
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

const norm = (p: unknown) => String(p).replace(/\\/g, '/')

type World = { surfaces?: string[]; tasklist?: 'fail'; panes?: { id: string; isShown: boolean; isPlaced: boolean }[] }

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
    if (path === `${REPO}/.git` || path === 'C:/other/.git') return { value: { kind: 'dir', size: 0, mtimeMs: 0, isLink: false } as never }
    if (path === 'C:/wt/feat/.git') return { value: { kind: 'file', size: 1, mtimeMs: 0, isLink: false } as never }
    throw new Error(`ENOENT ${path}`)
  })
  on('fs.read', ($, e) => {
    const path = norm(e.path)
    reads.push(path)
    if (path === 'C:/wt/feat/.git') return { value: 'gitdir: C:/repo/.git/worktrees/feat\n' as never }
    const rec = RECS.find(r => path === `${CONFIG}/sessions/${r.pid}.json`)
    if (rec) return { value: recJson(rec) as never }
    throw new Error(`ENOENT ${path}`)
  })
  on('process.run', ($, e) => {
    if (String(e.argv[0]) === 'tasklist') {
      if (w.tasklist === 'fail') throw new Error('ENOENT tasklist')
      const lines = [10, 20, 30, 40, 50].map(pid => `"claude.exe","${pid}","Console","1","300,000 K"`)
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
    expect([...parseTasklist('"claude.exe","24896","Console","1","300,000 K"\r\n"System","4","Services","0","1 K"\r\n')]).toEqual([24896, 4])
    expect(parseTasklist('INFO: No tasks are running').size).toBe(0)
  })

  test('interactive first, busy before idle, then newest', () => {
    const peer = (name: string, kind: string, status: string, startedAt: number): PeerView => ({
      sessionId: name, pid: 1, name, status, kind, where: '', startedAt, statusSince: null,
    })
    const order = sortPeers([peer('w', 'sdk-cli', 'busy', 9), peer('a', 'interactive', 'idle', 5), peer('b', 'interactive', 'busy', 1), peer('c', 'interactive', 'idle', 8)])
    expect(order.map(p => p.name)).toEqual(['b', 'c', 'a', 'w'])
  })

  test('text summary', () => {
    const r = parseRecord(recJson(RECS[2] as Rec))
    expect(r).toBeDefined()
    const text = peersText([toPeer(r!, REPO)], REPO, T0)
    expect(text).toContain('1 other session in repo:')
    expect(text).toContain('- worker-7: busy 1m (sdk-cli · in tools · started 2h ago)')
    expect(peersText([], REPO, T0)).toBe('No other Claude Code sessions in repo.')
  })
})

// ---------- hooks ----------

describe('repo sessions', () => {
  test('/repo-sessions with no surface lists the live sessions in this repo as text', async ($, on) => {
    const w = world(on)
    const r = await $.command.run({ command: 'repo-sessions', args: '' } as never)
    expect(r.text).toContain('3 other sessions in repo:')
    expect(r.text).toMatch(/- refactor: busy 3m \(started 2h ago\)\n- feature-wt: idle 1m \(in C:\/wt\/feat · started 2h ago\)\n- worker-7: busy 1m \(sdk-cli · in tools/)
    expect(r.text).not.toContain('elsewhere') // another repo
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
      expect(await ui.find({ type: 'Text', text: /crashed|elsewhere/ })).toBeUndefined()
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
  })

  test('peersAutoOpen: false never opens unasked', { options: { peersAutoOpen: false } }, async ($, on) => {
    const w = world(on, { surfaces: ['terminal'] })
    const probe = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: { columns: 200, rows: 50, isFullscreen: true } })
    await probe.unmount()
    await $.session.start({ cwd: REPO, surface: 'terminal', isInteractive: true } as never)
    await w.clock.advance(10_000)
    expect(w.opened).toEqual([])
  })
})
