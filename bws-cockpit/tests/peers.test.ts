import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { applyNotice, isRecordFile, latestPrompts, normPipe, parseNotice, parseRecord, parseTasklist, peersText, promptLine, repoKey, sendLine, sortOthers, sortPeers, toPeer, whereIn } from '../hooks/peers'
import type { PeerSend, PeerView } from '../types'

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
    messagingSocketPath: pipeOf(r.pid),
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
  hist('s-worker', '/harness-loop build the next milestone', T0 - 90_000), // with arguments: kept
  'not json',
].join('\n') + '\n'

// The registry's messaging pipe, and the engine's delivery notices in their real wording.
const BS = String.fromCharCode(92)
const pipeOf = (pid: number) => `${BS}${BS}.${BS}pipe${BS}LOCAL${BS}cc-msg-p${pid}`
const NOTICE = '[Cross-session delivery notice]'
const heldOne = (pid: number, id: string) =>
  `${NOTICE} Your message to another session was held by that session (recipient: uds:${pipeOf(pid)}; msg_id: ${id}). NOT delivered: its Claude has not seen it. ` +
  'Do not report it as delivered, do not wait for a reply, and do not resend while held. The usual cause is that the two sessions run in different permission modes: ' +
  'a terminal session then asks its user to approve, but a Claude Desktop or non-interactive session cannot ask, so there the hold expires undelivered unless the modes come to match. ' +
  'A session can also be set to hold every message. Another notice follows on release, denial or expiry. Tell your user what is held and why, or choose another approach.'
const heldMany = (pid: number, ids: string[]) =>
  `${NOTICE} ${ids.length} of your messages to another session were held by that session (recipient: uds:${pipeOf(pid)}; msg_id: ${ids.join(', ')}). NOT delivered: its Claude has not seen them. ` +
  'Do not report them as delivered, do not wait for a reply, and do not resend while held. Another notice follows on release, denial or expiry.'
const released = (pid: number, id: string) =>
  `${NOTICE} Your message to another session was approved and released to that session (recipient: uds:${pipeOf(pid)}; msg_id: ${id}).`
const denied = (pid: number, id: string) =>
  `${NOTICE} Your message to another session was denied by the recipient user (recipient: uds:${pipeOf(pid)}; msg_id: ${id}). Not delivered to that session's Claude. Do not wait for a reply; continue, or choose another approach.`

const norm = (p: unknown) => String(p).replace(/\\/g, '/')

type World = { gate?: Promise<void>; onSend?: () => void; send?: 'ok' | 'refuse' | 'throw' | 'held-first'; sent?: { to: unknown; text: string }[]; surfaces?: string[]; tasklist?: 'fail'; bigHistory?: boolean; tails?: { argv: string[]; env?: Record<string, string> }[]; tasklistImage?: Record<number, string>; panes?: { id: string; isShown: boolean; isPlaced: boolean }[] }

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
    const names = [...RECS.map(r => `${r.pid}.json`), '20.abcdef01.key']
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
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('session.send', async ($, e) => {
    w.sent?.push({ to: e.to, text: e.text })
    if (w.send === 'throw') throw new Error('peer socket closed')
    w.onSend?.()
    if (w.send === 'held-first') await w.gate // still in flight when the notice lands
    if (w.send === 'refuse') return { isDelivered: false, reason: 'refactor is not running' }
    return { isDelivered: true }
  })
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
  sessionId: name, pid: 1, name, status, kind, repo, where: '', startedAt, statusSince: null, pipe: null, prompt: null, promptAt: null,
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
    expect(isRecordFile('12345.json')).toBe(true)
    expect(isRecordFile('12345.abcdef01.key')).toBe(false)
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
    expect([...parseTasklist('"claude.exe","12345","Console","1","300,000 K"\r\n"System","4","Services","0","1 K"\r\n')]).toEqual([[12345, 'claude.exe'], [4, 'System']])
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
    expect(got.get('s-worker')?.text).toBe('/harness-loop build the next milestone')
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
      /- refactor: busy 3m \(started 2h ago\)\n {2}› fix the flaky test\n- feature-wt: idle 1m \(in C:\/wt\/feat · started 2h ago\)\n {2}› ship the worktree fix\n- worker-7: busy 1m \(sdk-cli · in tools · started 2h ago\)\n {2}› \/harness-loop build the next milestone\n\n/,
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

  test('msg opens a message box under that row; Enter sends it with $.session.send and closes it', async ($, on) => {
    const sent: { to: unknown; text: string }[] = []
    world(on, { surfaces: ['terminal'], sent })
    await $.command.run({ command: 'repo-sessions', args: '' } as never)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...PANE, surface })
      expect(await ui.find({ key: 'msg-s-busy' })).toBeDefined()
      expect(await ui.find({ key: 'msg-s-worker' })).toBeDefined()
      expect(await ui.find({ key: 'msg-s-other' })).toBeUndefined() // another repo: no button
      expect(await ui.find({ key: 'send-s-busy' })).toBeUndefined()
      await ui.press({ key: 'msg-s-busy' })
      expect(await ui.find({ key: 'send-s-busy' })).toBeDefined()
      expect(await ui.find({ key: 'send-s-wt' })).toBeUndefined() // one at a time
      const typed = `rebase on main first, then "npm test" & report`
      await ui.input({ key: 'send-s-busy', text: typed })
      expect(sent.at(-1)?.text).toBe(typed)
      expect(await ui.find({ key: 'send-s-busy' })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /✓ sent · 0s ago/ })).toBeDefined()
      await ui.unmount()
    }
    expect(sent.length).toBe(2)
    expect(sent[0]?.to).toBe('s-busy') // the engine spells { sessionId } as the address before the hooks
  })

  test('msg again closes the box; an empty message sends nothing', async ($, on) => {
    const sent: { to: unknown; text: string }[] = []
    world(on, { surfaces: ['terminal'], sent })
    await $.command.run({ command: 'repo-sessions', args: '' } as never)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'msg-s-wt' })
    await ui.press({ key: 'msg-s-wt' })
    expect(await ui.find({ key: 'send-s-wt' })).toBeUndefined()
    await ui.press({ key: 'msg-s-wt' })
    await ui.input({ key: 'send-s-wt', text: '   ' })
    expect(await ui.find({ key: 'send-s-wt' })).toBeUndefined()
    expect(sent).toEqual([])
    await ui.unmount()
  })

  test('a refused send shows the reason and keeps the box open', async ($, on) => {
    world(on, { surfaces: ['terminal'], send: 'refuse', sent: [] })
    await $.command.run({ command: 'repo-sessions', args: '' } as never)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'msg-s-busy' })
    await ui.input({ key: 'send-s-busy', text: 'hello' })
    expect(await ui.find({ type: 'Text', text: /✗ refactor is not running/ })).toBeDefined()
    expect(await ui.find({ key: 'send-s-busy' })).toBeDefined()
    await ui.unmount()
  })

  test('a send that throws shows the error; the note clears after a minute', async ($, on) => {
    const w = world(on, { surfaces: ['terminal'], send: 'throw', sent: [] })
    await $.command.run({ command: 'repo-sessions', args: '' } as never)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'msg-s-busy' })
    await ui.input({ key: 'send-s-busy', text: 'hello' })
    expect(await ui.find({ type: 'Text', text: /^ {2}✗ .+ · 0s ago$/ })).toBeDefined()
    expect(await ui.find({ key: 'send-s-busy' })).toBeDefined()
    await ui.unmount()
    await w.clock.advance(61_000)
    const later = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await later.find({ type: 'Text', text: /✗/ })).toBeUndefined()
    await later.unmount()
  })

  test('a surface with no Input (mobile) draws no msg button', async ($, on) => {
    world(on, { surfaces: ['mobile'] })
    await $.command.run({ command: 'repo-sessions', args: '' } as never)
    const ui = await $.ui.mount({ ...PANE, surface: 'mobile' })
    expect(await ui.find({ type: 'Text', text: /^refactor$/ })).toBeDefined()
    expect(await ui.find({ key: 'msg-s-busy' })).toBeUndefined()
    await ui.unmount()
  })

  test('held, then approved: the row says so, held never fades, the final state does', async ($, on) => {
    const w = world(on, { surfaces: ['terminal'], sent: [] })
    await $.command.run({ command: 'repo-sessions', args: '' } as never)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'msg-s-busy' })
    await ui.input({ key: 'send-s-busy', text: 'rebase please' })
    expect(await ui.find({ type: 'Text', text: /✓ sent · 0s ago/ })).toBeDefined()
    const passed = await $.prompt.submit({ text: heldOne(20, 'm1') } as never)
    expect(passed.text).toBe(heldOne(20, 'm1')) // observed, passed on unchanged
    expect(await ui.find({ type: 'Text', text: /^ {2}◆ held: waiting for approval in refactor · 0s$/ })).toBeDefined()
    await ui.unmount()
    await w.clock.advance(5 * 60_000) // the live pane redraws on its 5 s poll; here, a fresh mount
    const later = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await later.find({ type: 'Text', text: /◆ held: waiting for approval in refactor · 5m/ })).toBeDefined()
    await $.prompt.submit({ text: released(20, 'm1') } as never)
    expect(await later.find({ type: 'Text', text: /^ {2}✓ approved and delivered · 0s ago$/ })).toBeDefined()
    await later.unmount()
    await w.clock.advance(61_000)
    const faded = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await faded.find({ type: 'Text', text: /approved and delivered|held|sent/ })).toBeUndefined()
    await faded.unmount()
  })

  test('held, then denied', async ($, on) => {
    world(on, { surfaces: ['terminal'], sent: [] })
    await $.command.run({ command: 'repo-sessions', args: '' } as never)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'msg-s-wt' })
    await ui.input({ key: 'send-s-wt', text: 'stop the build' })
    await $.prompt.submit({ text: heldOne(50, 'm2') } as never)
    await $.prompt.submit({ text: denied(50, 'm2') } as never)
    expect(await ui.find({ type: 'Text', text: /^ {2}✗ denied by the recipient · 0s ago$/ })).toBeDefined()
    await ui.unmount()
  })

  test('a held notice that lands before the send resolves stays held', async ($, on) => {
    let release = () => {}
    let inFlight = () => {}
    const gate = new Promise<void>(resolve => (release = resolve))
    const sending = new Promise<void>(resolve => (inFlight = resolve))
    world(on, { surfaces: ['terminal'], send: 'held-first', gate, onSend: () => inFlight(), sent: [] })
    await $.command.run({ command: 'repo-sessions', args: '' } as never)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'msg-s-busy' })
    const typing = ui.input({ key: 'send-s-busy', text: 'hello' })
    await sending // recorded and in flight
    await $.prompt.submit({ text: heldOne(20, 'm-early') } as never)
    release() // now it resolves, delivered
    await typing
    expect(await ui.find({ type: 'Text', text: /◆ held: waiting for approval in refactor/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /✓ sent/ })).toBeUndefined()
    await ui.unmount()
  })

  test('a notice for a message the pane did not send changes nothing', async ($, on) => {
    world(on, { surfaces: ['terminal'], sent: [] })
    await $.command.run({ command: 'repo-sessions', args: '' } as never)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'msg-s-busy' })
    await ui.input({ key: 'send-s-busy', text: 'hello' })
    await $.prompt.submit({ text: heldOne(50, 'm3') } as never) // another peer's pipe
    expect(await ui.find({ type: 'Text', text: /✓ sent · 0s ago/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /held/ })).toBeUndefined()
    await ui.unmount()
  })
})

describe('msg delivery notices', () => {
  const sendTo = (sessionId: string, pid: number, at: number, state: PeerSend['state'] = 'sent'): PeerSend => ({
    sessionId, name: sessionId, pipe: normPipe(pipeOf(pid)), msgId: null, state, text: '', at, stateAt: at,
  })

  test('the real wordings parse; only the first sentence decides', () => {
    const one = parseNotice(heldOne(20, 'm1'))
    expect(one?.state).toBe('held') // its tail mentions "release, denial or expiry"
    expect(one?.ids).toEqual(['m1'])
    expect(one?.pipe).toBe(normPipe(pipeOf(20)))
    expect(one?.pipe).toBe('/./pipe/local/cc-msg-p20')
    expect(parseNotice(heldMany(20, ['a1', 'b2']))?.ids).toEqual(['a1', 'b2'])
    expect(parseNotice(heldMany(20, ['a1', 'b2']))?.state).toBe('held')
    expect(parseNotice(released(20, 'm1'))?.state).toBe('released')
    expect(parseNotice(denied(20, 'm1'))?.state).toBe('denied')
    expect(parseNotice(`${NOTICE} Your message to another session expired before it was approved (recipient: uds:x; msg_id: m1).`)?.state).toBe('expired')
    const odd = parseNotice(`${NOTICE} Your message to another session was quarantined by policy (recipient: uds:x; msg_id: m1).`)
    expect(odd?.state).toBe('other')
    expect(odd?.summary).toBe('Your message to another session was quarantined by policy')
    expect(parseNotice('fix the flaky test')).toBeUndefined()
  })

  test('a batch binds in send order, later notices by id; other pipes are untouched', () => {
    const sends = [sendTo('a', 20, 1), sendTo('b', 20, 2), sendTo('c', 50, 3)]
    const held = applyNotice(sends, parseNotice(heldMany(20, ['id-a', 'id-b']))!, 10)
    expect(held.map(s => [s.state, s.msgId])).toEqual([['held', 'id-a'], ['held', 'id-b'], ['sent', null]])
    const done = applyNotice(held, parseNotice(released(20, 'id-b'))!, 20)
    expect(done.map(s => s.state)).toEqual(['held', 'released', 'sent'])
    expect(done[1]?.stateAt).toBe(20)
    expect(applyNotice(done, parseNotice(denied(99, 'id-z'))!, 30)).toEqual(done) // nobody's
  })

  test('a final notice with no open send is ignored', () => {
    const sends = [sendTo('a', 20, 1, 'released')]
    expect(applyNotice(sends, parseNotice(denied(20, 'm9'))!, 5)).toEqual(sends)
  })

  test('held never fades; final states fade after a minute', () => {
    const held = { ...sendTo('a', 20, 0, 'held'), name: 'refactor' }
    expect(sendLine(held, 10 * 60_000).isOver).toBe(false)
    expect(sendLine({ ...held, state: 'released' }, 59_000).isOver).toBe(false)
    expect(sendLine({ ...held, state: 'released' }, 61_000).isOver).toBe(true)
    expect(sendLine({ ...held, state: 'other', text: 'was quarantined' }, 0).text).toBe('• was quarantined · 0s ago')
  })
})
