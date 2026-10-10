import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { STALE_MS, cardText, newCard, parseCard } from '../hooks/board'
import type { Card } from '../hooks/board'
import { parseHistory } from '../hooks/history'

const CWD = 'C:/proj'
const CFG = 'C:/cfg'
const DIR = `${CFG}/bws-board/c-proj`
// Neutral ids: one per simulated session.
const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const B = 'bbbbbbbb-0000-4000-8000-000000000002'
const C = 'cccccccc-0000-4000-8000-000000000003'

const cardOf = (files: Record<string, string>, id: string) => parseCard(files[`${DIR}/${id}.json`], id)
const kindsOf = (files: Record<string, string>, id: string) => parseHistory(files[`${DIR}/history/${id}.json`], id)?.events.map(e => e.kind)

// One plugin instance per test, so a second session is the same instance under another session id:
// its own state starts fresh, and the board folder is shared. Roles come from BWS_AGENT_ROLE per id.
// `git`: what the stubbed git answers (paths relative to the repo top); `notRepo`: rev-parse fails.
// `head`: changed vs HEAD (default: staged and modified); `clean`: what git clean -n would remove.
type GitWorld = { staged?: string[]; modified?: string[]; untracked?: string[]; head?: string[]; clean?: string[]; notRepo?: boolean }
function world(on: On, opts: { writeFails?: boolean; failPath?: RegExp; roles?: Record<string, string>; git?: GitWorld } = {}) {
  const files: Record<string, string> = {}
  const mtimes: Record<string, number> = {}
  const who = { id: A }
  const reached: string[] = []
  const toasts: string[] = []
  const sends: { to: unknown; text: string }[] = []
  const runs: string[][] = []
  const clock = mock.clock(on, { now: 5_000_000 })
  const norm = (p: unknown) => String(p).replace(/\\/g, '/')
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('env.get', ($, e) => ({ value: (e.name === 'CLAUDE_CONFIG_DIR' ? CFG : e.name === 'BWS_AGENT_ROLE' ? opts.roles?.[who.id] : undefined) as never }))
  on('session.id', () => ({ value: who.id }))
  on('session.cwd', () => ({ value: CWD }))
  on('session.repo', () => ({ value: { root: CWD, remote: null } as never }))
  on('session.root', () => ({ value: CWD }))
  on('session.send', ($, e) => {
    sends.push({ to: e.to, text: e.text })
    return { isDelivered: true } as never
  })
  const git: GitWorld = opts.git ?? {}
  on('process.run', ($, e) => {
    runs.push([...e.argv])
    const a = e.argv.join(' ')
    const z = (l?: string[]) => (l ?? []).join(String.fromCharCode(0))
    if (a.includes('rev-parse')) return { value: (git.notRepo ? { exitCode: 128, stdout: '', stderr: 'not a git repository' } : { exitCode: 0, stdout: `${CWD}\n${CWD}/.git\n`, stderr: '' }) as never }
    if (a.includes(' clean -n')) return { value: { exitCode: 0, stdout: (git.clean ?? []).map(n => `Would remove ${n}\n`).join(''), stderr: '' } as never }
    const out = a.includes('diff HEAD')
      ? z(git.head ?? [...(git.staged ?? []), ...(git.modified ?? [])])
      : a.includes('diff --cached')
        ? z(git.staged)
        : a.includes('diff --name-only')
          ? z(git.modified)
          : a.includes('ls-files')
            ? z(git.untracked)
            : ''
    return { value: { exitCode: 0, stdout: out, stderr: '' } as never }
  })
  on('tool.register', ($, e) => ({ value: { tool: e.name } }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.start', ($, e) => ({ cwd: CWD }) as never)
  on('fs.read', ($, e) => {
    const hit = files[norm(e.path)]
    if (hit === undefined) throw new Error('ENOENT')
    return { value: hit as never }
  })
  on('fs.write', ($, e) => {
    if (opts.writeFails || opts.failPath?.test(norm(e.path))) throw new Error('EACCES')
    files[norm(e.path)] = e.text
    mtimes[norm(e.path)] = clock.now()
    return { value: undefined }
  })
  on('fs.list', ($, e) => {
    const dir = norm(e.path)
    const names = Object.keys(files).filter(p => p.startsWith(`${dir}/`) && !p.slice(dir.length + 1).includes('/'))
    if (names.length === 0) throw new Error('ENOENT')
    return { value: names.map(p => ({ name: p.slice(dir.length + 1), kind: 'file', size: 1, mtimeMs: mtimes[p] ?? 0, isLink: false })) as never }
  })
  on('tool.call', ($, e) => {
    reached.push(`${who.id.slice(0, 1)}:${String(e.tool)}:${String((e as { file_path?: string }).file_path ?? '')}`)
    return { result: 'ok' as never }
  })
  on('prompt.context', ($, e) => ({ blocks: e.blocks }))
  on('prompt.submit', ($, e) => ({ text: e.text, context: e.context }))
  on('turn.complete', () => ({ text: '' }) as never)
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  // A card written as another process would: straight into the folder.
  const put = (c: Card) => {
    files[`${DIR}/${c.sessionId}.json`] = cardText(c)
    mtimes[`${DIR}/${c.sessionId}.json`] = clock.now()
  }
  const live = () =>
    Object.keys(files)
      .filter(p => p.startsWith(`${DIR}/`) && !p.slice(DIR.length + 1).includes('/'))
      .map(p => parseCard(files[p], p.slice(DIR.length + 1, -5)))
      .filter((c): c is Card => c !== undefined && c.gone !== true)
      .map(c => c.sessionId)
      .sort()
  return { files, mtimes, who, reached, toasts, sends, runs, clock, put, live, git }
}

const block = (r: { blocks: readonly { name: string; text: string }[] }) => r.blocks.find(b => b.name === 'bwsBoard')?.text
const text = (r: { result?: unknown }) => String(r.result)
const ctxOf = (r: { context?: readonly string[] }) => (r.context ?? []).join('\n')

describe('board: two sessions', () => {
  test('ask → seen → take → done → seen, and /board in both lists the same ask', { options: {} }, async ($, on) => {
    const w = world(on, { roles: { [A]: 'api', [B]: 'tests' } })

    // A (api) starts alone: no board block, its card is written.
    await $.session.start({ cwd: CWD } as never)
    await $.prompt.submit({ text: 'Build the login endpoint', wait: false, origin: { kind: 'sdk' } } as never)
    expect(block(await $.prompt.context({ blocks: [] } as never))).toBeUndefined()
    expect(w.live()).toEqual([A])
    expect(cardOf(w.files, A)?.role).toBe('api')

    // B (tests) joins: told about A.
    w.who.id = B
    await w.clock.advance(1000)
    await $.prompt.submit({ text: 'Write the auth tests', wait: false, origin: { kind: 'composer' } } as never)
    const intro = block(await $.prompt.context({ blocks: [] } as never)) ?? ''
    expect(intro).toContain('1 other Claude Code session(s) are live in C:/proj. This session is tests (bbbbbbbb).')
    expect(intro).toContain('- api (aaaaaaaa) · busy · Build the login endpoint')
    expect(intro).toContain('mcp__bws-board__board_ask')

    // A asks the tests role.
    w.who.id = A
    const asked = await $.tool.call({ tool: 'mcp__bws-board__board_ask', to: 'tests', text: 'Run the auth suite against /login' } as never)
    expect(text(asked)).toContain('Posted ask aaaaaaaa-1 to tests.')
    expect(w.sends).toEqual([])

    // B hears about it on its next tool result, once.
    w.who.id = B
    await w.clock.advance(20_000)
    const r1 = await $.tool.call({ tool: 'Bash', command: 'echo hi' } as never)
    expect(ctxOf(r1)).toContain('- ask aaaaaaaa-1 from api (aaaaaaaa) to tests: Run the auth suite against /login')
    expect(ctxOf(r1)).toContain('not from the user')
    expect(ctxOf(await $.tool.call({ tool: 'Bash', command: 'echo hi' } as never))).toBe('')
    expect(w.toasts.some(t => t.includes('board: ask aaaaaaaa-1'))).toBe(true)

    // B takes it and finishes it.
    expect(text(await $.tool.call({ tool: 'mcp__bws-board__board_take', id: 'aaaaaaaa-1' } as never))).toContain('Took ask aaaaaaaa-1.')
    expect(text(await $.tool.call({ tool: 'mcp__bws-board__board_done', id: 'aaaaaaaa-1', note: '12 passed' } as never))).toContain('Marked ask aaaaaaaa-1 done.')

    // B exits before A has looked: the done survives in B's tombstone.
    await $.session.end({ reason: 'other', sessionId: B, resume: {} } as never)
    expect(cardOf(w.files, B)?.acts.map(a => a.kind)).toEqual(['done'])

    // A hears it is done on its next tool result, and records the outcome in its own card.
    w.who.id = A
    await w.clock.advance(20_000)
    const r2 = await $.tool.call({ tool: 'Bash', command: 'echo hi' } as never)
    expect(ctxOf(r2)).toContain('- your ask aaaaaaaa-1 is done by tests (bbbbbbbb): 12 passed')
    expect(cardOf(w.files, A)?.asks[0]).toMatchObject({ id: 'aaaaaaaa-1', state: 'done', by: B, note: '12 passed' })

    // /board shows the ask done, by the session that left.
    expect(w.live()).toEqual([A])
    const boardA = (await $.command.run({ command: 'board', args: '' } as never)) as { text?: string }
    expect(boardA.text).toContain('- aaaaaaaa-1 · done by tests (bbbbbbbb) · api (aaaaaaaa) → tests: Run the auth suite against /login (note: 12 passed)')
  })

  test('a claimed file is refused to the other session, by Edit and by shell; release frees it', async ($, on) => {
    const w = world(on)
    await $.tool.call({ tool: 'Edit', file_path: 'C:/proj/src/parser.ts', old_string: 'a', new_string: 'b' } as never)
    expect(cardOf(w.files, A)?.claims.map(c => c.path)).toEqual(['c:/proj/src/parser.ts'])
    w.who.id = B
    const clip = await $.tool.call({ tool: 'Write', file_path: 'src\\Parser.ts', content: 'x' } as never)
    expect(clip.deny ?? '').toContain('bws-board: src/parser.ts is claimed by another live session on this board, aaaaaaaa')
    const sed = await $.tool.call({ tool: 'Bash', command: "sed -i 's/a/b/' src/parser.ts" } as never)
    expect(sed.deny ?? '').toContain('This command writes it: src/parser.ts.')
    expect(w.reached.filter(r => r.startsWith('b:'))).toEqual([])
    // A shell write inside the folder claims; one in /tmp does not.
    expect((await $.tool.call({ tool: 'Bash', command: 'cp src/parser.ts src/lexer.ts && echo x > /tmp/log.txt' } as never)).deny).toBeUndefined()
    expect(cardOf(w.files, B)?.claims.map(c => c.path)).toEqual(['c:/proj/src/lexer.ts'])
    w.who.id = A
    expect(text(await $.tool.call({ tool: 'mcp__bws-board__board_release', paths: ['src/parser.ts'] } as never))).toBe('Released src/parser.ts. Still claimed: nothing.')
    w.who.id = B
    expect((await $.tool.call({ tool: 'Edit', file_path: 'C:/proj/src/parser.ts', old_string: 'a', new_string: 'b' } as never)).deny).toBeUndefined()
  })

  test('the run folder a session writes into goes on its card', async ($, on) => {
    const w = world(on)
    await $.tool.call({ tool: 'Write', file_path: 'C:/proj/runs/2026-10-10-login/PLAN.md', content: 'x' } as never)
    expect(cardOf(w.files, A)?.run).toBe('2026-10-10-login')
  })

  test('a peer that stops beating goes stale: its claims and its take stop counting', async ($, on) => {
    const w = world(on)
    const now = w.clock.now()
    w.put({ ...newCard(C, CWD, now - 9e5, null), seenAt: now - STALE_MS - 1, claims: [{ path: 'c:/proj/x.ts', since: now - 9e5, at: now - 9e5 }] })
    expect((await $.tool.call({ tool: 'Edit', file_path: 'C:/proj/x.ts', old_string: 'a', new_string: 'b' } as never)).deny).toBeUndefined()
  })

  test('a torn card file keeps the last good copy: its claim still blocks', async ($, on) => {
    const w = world(on)
    const now = w.clock.now()
    const c = { ...newCard(C, CWD, now, null), seenAt: now, claims: [{ path: 'c:/proj/x.ts', since: now, at: now }] }
    w.put(c)
    await $.tool.call({ tool: 'Edit', file_path: 'C:/proj/y.ts', old_string: 'a', new_string: 'b' } as never) // reads the good copy
    w.files[`${DIR}/${C}.json`] = cardText(c).slice(0, 30)
    expect((await $.tool.call({ tool: 'Edit', file_path: 'C:/proj/x.ts', old_string: 'a', new_string: 'b' } as never)).deny ?? '').toContain('cccccccc')
  })

  test('after exit, a heartbeat still running never writes the card back', async ($, on) => {
    const w = world(on)
    await $.session.start({ cwd: CWD } as never)
    await w.clock.settle()
    expect(w.live()).toEqual([A])
    await $.session.end({ reason: 'prompt_input_exit', sessionId: A, resume: {} } as never)
    await w.clock.advance(60_000)
    expect(w.live()).toEqual([])
    expect(w.toasts.filter(t => t.includes('board is unavailable'))).toEqual([])
  })

  test('urgent ask wakes the named live session once per window; anyone wakes nobody', async ($, on) => {
    const w = world(on, { roles: { [A]: 'api', [B]: 'tests' } })
    w.who.id = B
    await $.session.start({ cwd: CWD } as never)
    await w.clock.settle()
    w.who.id = A
    const r1 = await $.tool.call({ tool: 'mcp__bws-board__board_ask', to: 'tests', text: 'CI is red on main, need a look', urgent: true } as never)
    expect(text(r1)).toContain('Woke bbbbbbbb.')
    expect(w.sends).toHaveLength(1)
    expect(w.sends[0]?.to).toBe(B)
    expect(w.sends[0]?.text).toContain('Urgent ask aaaaaaaa-1 from api (aaaaaaaa): CI is red on main')
    expect(w.sends[0]?.text).toContain('not from the user')
    const r2 = await $.tool.call({ tool: 'mcp__bws-board__board_ask', to: 'tests', text: 'still red', urgent: true } as never)
    expect(text(r2)).toContain('Not woken again')
    expect(w.sends).toHaveLength(1)
    const r3 = await $.tool.call({ tool: 'mcp__bws-board__board_ask', to: 'anyone', text: 'anyone free?', urgent: true } as never)
    expect(text(r3)).toContain('An ask to anyone wakes nobody.')
    await w.clock.advance(5 * 60_000)
    // One test process beats as whichever session is current: B shows it is still live.
    w.who.id = B
    await $.tool.call({ tool: 'mcp__bws-board__board_status' } as never)
    w.who.id = A
    await $.tool.call({ tool: 'mcp__bws-board__board_ask', to: 'tests', text: 'third time', urgent: true } as never)
    expect(w.sends).toHaveLength(2)
  })

  test('urgentWake off: the ask is posted, nobody is woken', { options: { urgentWake: false } }, async ($, on) => {
    const w = world(on, { roles: { [B]: 'tests' } })
    w.who.id = B
    await $.session.start({ cwd: CWD } as never)
    await w.clock.settle()
    w.who.id = A
    const r = await $.tool.call({ tool: 'mcp__bws-board__board_ask', to: 'tests', text: 'x', urgent: true } as never)
    expect(text(r)).toContain('Urgent wake is off')
    expect(w.sends).toEqual([])
  })

  test('acting on asks: not your own, not one another session took; only the asker withdraws', async ($, on) => {
    const w = world(on)
    await $.session.start({ cwd: CWD } as never) // the heartbeat
    await $.tool.call({ tool: 'mcp__bws-board__board_ask', to: 'anyone', text: 'review my diff' } as never)
    expect(text(await $.tool.call({ tool: 'mcp__bws-board__board_take', id: 'aaaaaaaa-1' } as never))).toContain("this session's own")
    w.who.id = B
    expect(text(await $.tool.call({ tool: 'mcp__bws-board__board_take', id: 'aaaaaaaa-1' } as never))).toContain('Took')
    w.who.id = C
    expect(text(await $.tool.call({ tool: 'mcp__bws-board__board_take', id: 'aaaaaaaa-1' } as never))).toContain('taken by bbbbbbbb')
    expect(text(await $.tool.call({ tool: 'mcp__bws-board__board_withdraw', id: 'aaaaaaaa-1' } as never))).toContain('only its asker')
    expect(text(await $.tool.call({ tool: 'mcp__bws-board__board_take', id: 'nope-9' } as never))).toContain('No ask "nope-9"')
    w.who.id = A
    expect(text(await $.tool.call({ tool: 'mcp__bws-board__board_withdraw', id: 'aaaaaaaa-1' } as never))).toBe('Withdrew ask aaaaaaaa-1.')
    // B, who took it, hears it was withdrawn.
    w.who.id = B
    await w.clock.advance(20_000)
    expect(ctxOf(await $.tool.call({ tool: 'Bash', command: 'echo hi' } as never))).toContain('- ask aaaaaaaa-1 you took was withdrawn by aaaaaaaa')
  })

  test('/board role sets the role on the card; a bad name is refused', async ($, on) => {
    const w = world(on)
    expect(((await $.command.run({ command: 'board', args: 'role Two Words' } as never)) as { text: string }).text).toContain('not a role name')
    expect(((await $.command.run({ command: 'board', args: 'role docs' } as never)) as { text: string }).text).toContain('now "docs"')
    expect(cardOf(w.files, A)?.role).toBe('docs')
    expect(((await $.command.run({ command: 'board', args: 'role' } as never)) as { text: string }).text).toContain("This session's role: docs.")
  })

  test('/board pane opens the dashboard Board tab just after the command; without the dashboard it prints the board', async ($, on) => {
    const w = world(on)
    on('session.surfaces', () => ({ value: ['terminal'] as never }))
    const listed = { names: ['board', 'dashboard'] }
    on('command.list', () => ({ value: listed.names.map(name => ({ name })) as never }))
    const ran: { command: string; args: string }[] = []
    on('command.run', ($, e) => {
      ran.push({ command: String(e.command), args: String(e.args) })
      return { text: '' } as never
    })
    const r = (await $.command.run({ command: 'board', args: 'pane' } as never)) as { text?: string }
    expect(r.text).toBeUndefined()
    await w.clock.advance(50)
    expect(ran).toEqual([{ command: 'dashboard', args: 'board' }])
    listed.names = ['board']
    const r2 = (await $.command.run({ command: 'board', args: 'pane' } as never)) as { text?: string }
    expect(r2.text).toContain('Board for')
    await w.clock.advance(50)
    expect(ran.length).toBe(1)
  })

  test('board_send reaches a role; the message arrives once after a tool result', async ($, on) => {
    const w = world(on, { roles: { [B]: 'tests' } })
    w.who.id = B
    await $.session.start({ cwd: CWD } as never)
    await w.clock.settle()
    w.who.id = A
    expect(text(await $.tool.call({ tool: 'mcp__bws-board__board_send', to: 'tests', text: 'I am done with auth.ts' } as never))).toContain('Sent to tests (bbbbbbbb)')
    w.who.id = B
    await w.clock.advance(20_000)
    const r = await $.tool.call({ tool: 'Bash', command: 'echo hi' } as never)
    expect(ctxOf(r)).toContain('- from aaaaaaaa: I am done with auth.ts')
  })

  test('the sweep deletes card files untouched for a day, never this session', async ($, on) => {
    const w = world(on)
    const old = { ...newCard(C, CWD, 0, null), seenAt: 0 }
    w.put(old)
    w.mtimes[`${DIR}/${C}.json`] = w.clock.now() - 25 * 60 * 60 * 1000
    await $.session.start({ cwd: CWD } as never)
    await w.clock.settle()
    expect(w.runs).toEqual([['cmd', '/d', '/c', 'del', '/q', `C:\\cfg\\bws-board\\c-proj\\${C}.json`]])
  })

  test('a broken board never blocks an edit, and says so once', async ($, on) => {
    const w = world(on, { writeFails: true })
    const r = await $.tool.call({ tool: 'Edit', file_path: 'C:/proj/x.ts', old_string: 'a', new_string: 'b' } as never)
    expect(r.deny).toBeUndefined()
    expect(w.reached).toEqual(['a:Edit:C:/proj/x.ts'])
    await $.tool.call({ tool: 'Edit', file_path: 'C:/proj/y.ts', old_string: 'a', new_string: 'b' } as never)
    expect(w.toasts.filter(t => t.includes('board is unavailable')).length).toBe(1)
  })

  test('board off: nothing written, nothing refused', { options: { board: false } }, async ($, on) => {
    const w = world(on)
    const now = w.clock.now()
    w.put({ ...newCard(C, CWD, now, null), seenAt: now, claims: [{ path: 'c:/proj/x.ts', since: now, at: now }] })
    const r = await $.tool.call({ tool: 'Edit', file_path: 'C:/proj/x.ts', old_string: 'a', new_string: 'b' } as never)
    expect(r.deny).toBeUndefined()
    expect(Object.keys(w.files)).toEqual([`${DIR}/${C}.json`])
  })
})

describe('board: history and digest', () => {
  test('a team run is logged per session, and /board digest draws it', async ($, on) => {
    const w = world(on, { roles: { [A]: 'api', [B]: 'tests' } })
    await $.session.start({ cwd: CWD } as never)
    await $.prompt.submit({ text: 'Build the login endpoint', wait: false, origin: { kind: 'composer' } } as never)
    await $.tool.call({ tool: 'Write', file_path: 'C:/proj/notes.txt', content: 'from A' } as never)
    await w.clock.advance(1000)
    await $.tool.call({ tool: 'Edit', file_path: 'C:/proj/notes.txt', old_string: 'A', new_string: 'A2' } as never)

    w.who.id = B
    await $.session.start({ cwd: CWD } as never)
    await $.prompt.submit({ text: 'Write the auth tests', wait: false, origin: { kind: 'composer' } } as never)
    expect((await $.tool.call({ tool: 'Edit', file_path: 'C:/proj/notes.txt', old_string: 'A', new_string: 'B' } as never)).deny).toBeDefined()

    w.who.id = A
    await $.tool.call({ tool: 'mcp__bws-board__board_ask', to: 'tests', text: 'Run the auth suite, token=abc123', urgent: true } as never)
    await $.tool.call({ tool: 'mcp__bws-board__board_ask', to: 'tests', text: 'still red', urgent: true } as never)
    await $.tool.call({ tool: 'mcp__bws-board__board_send', to: 'tests', text: 'a private message' } as never)
    await $.turn.complete({ answer: 'ok', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answered' } as never)

    w.who.id = B
    await w.clock.advance(60_000)
    await $.tool.call({ tool: 'mcp__bws-board__board_take', id: 'aaaaaaaa-1' } as never)
    await $.tool.call({ tool: 'mcp__bws-board__board_done', id: 'aaaaaaaa-1', note: '12 passed' } as never)
    await $.session.end({ reason: 'other', sessionId: B, resume: {} } as never)

    w.who.id = A
    const r = (await $.command.run({ command: 'board', args: 'digest' } as never)) as { text: string }
    expect(r.text).toContain('Board digest for C:/proj, last 1 day(s): 2 agent(s)')
    expect(r.text).toContain('1/2 ask(s) done, 1 refused edit(s), 0 git wait(s), 1 wake(s).')
    expect(r.text).toContain(`${DIR}/digest.html`)

    expect(kindsOf(w.files, A)).toEqual(['start', 'busy', 'claim', 'edit', 'ask', 'wake', 'ask', 'wakeHeld', 'send', 'idle'])
    expect(kindsOf(w.files, B)).toEqual(['start', 'busy', 'deny', 'take', 'done', 'end'])
    const raw = `${w.files[`${DIR}/history/${A}.json`]}${w.files[`${DIR}/history/${B}.json`]}`
    expect(raw).toContain('token=[redacted]')
    expect(raw.includes('abc123')).toBe(false)
    expect(raw.includes('a private message')).toBe(false)

    const html = w.files[`${DIR}/digest.html`] ?? ''
    expect(html).toContain('<code>notes.txt</code> <span class="tag">contested</span>')
    expect(html).toContain('<span class="o-done">done</span>')
    // The history folder is not a card: the board still reads two sessions, B gone.
    expect(w.live()).toEqual([A])
  })

  test('a history write that fails never blocks or warns', async ($, on) => {
    const w = world(on, { failPath: /\/history\// })
    await $.session.start({ cwd: CWD } as never)
    const r = await $.tool.call({ tool: 'Edit', file_path: 'C:/proj/x.ts', old_string: 'a', new_string: 'b' } as never)
    expect(r.deny).toBeUndefined()
    expect(w.reached).toEqual(['a:Edit:C:/proj/x.ts'])
    expect(text(await $.tool.call({ tool: 'mcp__bws-board__board_ask', to: 'anyone', text: 'review' } as never))).toContain('Posted ask')
    expect(((await $.command.run({ command: 'board', args: 'digest' } as never)) as { text: string }).text).toContain('No board history')
    expect(w.toasts.filter(t => t.includes('board is unavailable'))).toEqual([])
    expect(cardOf(w.files, A)?.claims.length).toBe(1)
  })

  test('historyDays 0: no history written; the digest says it is off', { options: { historyDays: 0 } }, async ($, on) => {
    const w = world(on)
    await $.session.start({ cwd: CWD } as never)
    await $.tool.call({ tool: 'Edit', file_path: 'C:/proj/x.ts', old_string: 'a', new_string: 'b' } as never)
    const r = (await $.command.run({ command: 'board', args: 'digest' } as never)) as { text: string }
    expect(r.text).toContain('history is off')
    expect(Object.keys(w.files).filter(p => p.includes('/history/'))).toEqual([])
  })

  test('/board digest refuses a bad day count', async ($, on) => {
    world(on)
    expect(((await $.command.run({ command: 'board', args: 'digest lots' } as never)) as { text: string }).text).toContain('is not a number of days')
  })

  test('history older than historyDays is swept; a day-old one is kept', async ($, on) => {
    const w = world(on)
    const day = 24 * 60 * 60 * 1000
    w.files[`${DIR}/history/${C}.json`] = '{}'
    w.mtimes[`${DIR}/history/${C}.json`] = w.clock.now() - 15 * day
    w.files[`${DIR}/history/${B}.json`] = '{}'
    w.mtimes[`${DIR}/history/${B}.json`] = w.clock.now() - day - 1
    await $.session.start({ cwd: CWD } as never)
    await w.clock.settle()
    expect(w.runs).toEqual([['cmd', '/d', '/c', 'del', '/q', `C:\\cfg\\bws-board\\c-proj\\history\\${C}.json`]])
  })
})

const bash = (command: string) => ({ tool: 'Bash', command }) as never
const turnEnd = { answer: 'ok', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answered' } as never

describe('board: the git lease', () => {
  test('one session at a time runs git in the tree; the holder\'s turn end frees it', { options: {} }, async ($, on) => {
    const w = world(on, { roles: { [A]: 'api', [B]: 'tests' } })
    await $.session.start({ cwd: CWD } as never)
    await $.prompt.submit({ text: 'Build the login endpoint', wait: false, origin: { kind: 'sdk' } } as never)
    expect((await $.tool.call(bash('git add src/login.ts'))).deny).toBeUndefined()
    expect(cardOf(w.files, A)?.git).toMatchObject({ verb: 'add', tree: 'c:/proj' })

    w.who.id = B
    await w.clock.advance(1000)
    await $.session.start({ cwd: CWD } as never)
    await $.prompt.submit({ text: 'Write the auth tests', wait: false, origin: { kind: 'sdk' } } as never)
    const refused = await $.tool.call(bash('git add tests/auth.ts && git commit -m "tests"'))
    expect(refused.deny ?? '').toContain('git add refused. Another live session on this board holds the git lease for this working tree: api (aaaaaaaa) (Build the login endpoint), which ran git add 1s ago.')
    expect(w.reached.filter(r => r.startsWith('b:Bash'))).toEqual([])
    expect(w.toasts).toContain('board: refused git: another session holds the git lease')
    // Read-only git and other commands go on.
    expect((await $.tool.call(bash('git status && git diff --cached && git log -3'))).deny).toBeUndefined()
    expect(text(await $.tool.call({ tool: 'mcp__bws-board__board_status' } as never))).toContain('  holds the git lease (git add 1s ago)')

    // A's turn ends: the lease is free, and B takes it.
    w.who.id = A
    await $.turn.complete(turnEnd)
    expect(cardOf(w.files, A)?.git).toBeUndefined()
    w.who.id = B
    expect((await $.tool.call(bash('git add tests/auth.ts && git commit -m "tests"'))).deny).toBeUndefined()
    expect(cardOf(w.files, B)?.git).toMatchObject({ verb: 'commit' })
    expect(text(await $.tool.call({ tool: 'mcp__bws-board__board_status' } as never))).toContain('holds the git lease (git commit')

    // Now A waits for B.
    w.who.id = A
    expect((await $.tool.call(bash('git push'))).deny ?? '').toContain('git push refused')
    await w.clock.settle()
    expect(kindsOf(w.files, A)).toEqual(['start', 'busy', 'gitHold', 'idle', 'gitWait'])
    expect(kindsOf(w.files, B)).toEqual(['start', 'busy', 'gitWait', 'gitHold'])
    const wait = parseHistory(w.files[`${DIR}/history/${B}.json`], B)?.events.find(e => e.kind === 'gitWait')
    expect(wait).toMatchObject({ verb: 'add', holder: A, holderRole: 'api' })
    // The history holds the verb, never the command line.
    expect(w.files[`${DIR}/history/${B}.json`]).not.toContain('tests/auth.ts')
  })

  test('the lease lapses gitLeaseMinutes after the last git command; board_release frees it at once', { options: { gitLeaseMinutes: 1 } }, async ($, on) => {
    const w = world(on)
    await $.session.start({ cwd: CWD } as never)
    await $.tool.call(bash('git add a.txt'))
    w.who.id = B
    await $.session.start({ cwd: CWD } as never)
    expect((await $.tool.call(bash('git commit -m x'))).deny).toBeDefined()
    await w.clock.advance(61_000)
    expect((await $.tool.call(bash('git commit -m x'))).deny).toBeUndefined()
    // B releases everything: A may go on at once.
    expect(text(await $.tool.call({ tool: 'mcp__bws-board__board_release' } as never))).toContain('every claim and the git lease')
    w.who.id = A
    expect((await $.tool.call(bash('git push'))).deny).toBeUndefined()
  })

  test("a commit that would take in a peer's claimed file is refused, with the fix", { options: {} }, async ($, on) => {
    const w = world(on, { roles: { [A]: 'api', [B]: 'tests' }, git: {} })
    await $.session.start({ cwd: CWD } as never)
    await $.tool.call({ tool: 'Edit', file_path: 'C:/proj/src/login.ts', old_string: 'a', new_string: 'b' } as never)
    await $.turn.complete(turnEnd)

    w.who.id = B
    await $.session.start({ cwd: CWD } as never)
    await $.tool.call({ tool: 'Edit', file_path: 'C:/proj/tests/auth.ts', old_string: 'a', new_string: 'b' } as never)
    // git add -A runs after the check: every modified and untracked file counts.
    w.git.modified = ['src/login.ts', 'tests/auth.ts']
    const all = await $.tool.call(bash('git add -A && git commit -m "tests"'))
    expect(all.deny ?? '').toContain('git commit refused. It would commit a file another live session claims: src/login.ts (held by api (aaaaaaaa))')
    expect(all.deny ?? '').toContain('git restore --staged -- src/login.ts')
    expect(all.deny ?? '').not.toContain('tests/auth.ts')
    expect(w.toasts).toContain('board: refused git: a commit of files another session claimed')
    // Already staged, or named in the add: the same.
    w.git.staged = ['src/login.ts', 'tests/auth.ts']
    expect((await $.tool.call(bash('git commit -m "tests"'))).deny ?? '').toContain('src/login.ts')
    w.git.staged = []
    expect((await $.tool.call(bash('git add src && git commit -m "tests"'))).deny ?? '').toContain('src/login.ts')
    expect((await $.tool.call(bash('git commit -am "tests"'))).deny ?? '').toContain('src/login.ts')
    // The fix in one command (seen live): the restore runs before the commit, so a.txt is out.
    w.git.staged = ['src/login.ts']
    expect((await $.tool.call(bash('git restore --staged -- src/login.ts && git add -- tests/auth.ts && git commit -m "tests"'))).deny).toBeUndefined()
    // Only its own file: it goes on.
    w.git.staged = ['tests/auth.ts']
    expect((await $.tool.call(bash('git add tests/auth.ts && git commit -m "tests"'))).deny).toBeUndefined()
    await w.clock.settle()
    const denies = parseHistory(w.files[`${DIR}/history/${B}.json`], B)?.events.filter(e => e.kind === 'deny')
    expect(denies?.[0]).toMatchObject({ file: 'c:/proj/src/login.ts', holder: A })
  })

  test('alone, another repo, or gitLease off: nothing refused and no staged check run', { options: {} }, async ($, on) => {
    const w = world(on, { git: { staged: ['src/login.ts'] } })
    await $.session.start({ cwd: CWD } as never)
    expect((await $.tool.call(bash('git add -A && git commit -m x && git push'))).deny).toBeUndefined()
    expect(w.runs.filter(r => r.includes('diff'))).toEqual([])
    // A peer with no claims in the tree: still no diff.
    w.who.id = B
    await $.session.start({ cwd: CWD } as never)
    w.who.id = A
    await $.turn.complete(turnEnd)
    w.who.id = B
    expect((await $.tool.call(bash('git commit -m x'))).deny).toBeUndefined()
    expect(w.runs.filter(r => r.includes('diff'))).toEqual([])
    // Not this board's repository: ignored.
    w.git.notRepo = true
    w.who.id = A
    expect((await $.tool.call(bash('git -C C:/elsewhere commit -m x'))).deny).toBeUndefined()
  })

  test('gitLease off: git is never checked', { options: { gitLease: false } }, async ($, on) => {
    const w = world(on)
    await $.session.start({ cwd: CWD } as never)
    await $.tool.call(bash('git add a.txt'))
    w.who.id = B
    await $.session.start({ cwd: CWD } as never)
    expect((await $.tool.call(bash('git commit -m x'))).deny).toBeUndefined()
    expect(w.runs.filter(r => r[0] === 'git')).toEqual([])
    expect(cardOf(w.files, A)?.git).toBeUndefined()
  })
})

describe("board: git can't overwrite a peer's changed files", () => {
  // A (api) changed src/login.ts and created notes/new.md, and its turn ended: no lease anywhere.
  const setup = async ($: Parameters<NonNullable<Parameters<typeof test>[2]>>[0], on: On, git: GitWorld) => {
    const w = world(on, { roles: { [A]: 'api', [B]: 'tests' }, git })
    await $.session.start({ cwd: CWD } as never)
    await $.tool.call({ tool: 'Edit', file_path: 'C:/proj/src/login.ts', old_string: 'a', new_string: 'b' } as never)
    await $.tool.call({ tool: 'Write', file_path: 'C:/proj/notes/new.md', content: 'x' } as never)
    await $.turn.complete(turnEnd)
    w.who.id = B
    await $.session.start({ cwd: CWD } as never)
    await $.tool.call({ tool: 'Edit', file_path: 'C:/proj/tests/auth.ts', old_string: 'a', new_string: 'b' } as never)
    return w
  }
  const denied = async ($: Parameters<NonNullable<Parameters<typeof test>[2]>>[0], command: string) => (await $.tool.call(bash(command))).deny

  test('stash, hard reset, checkout ., restore, clean -f, rm and switch -f are refused', { options: {} }, async ($, on) => {
    const w = await setup($, on, { modified: ['src/login.ts', 'tests/auth.ts'], untracked: ['notes/new.md'], clean: ['notes/'] })
    const stash = (await denied($, 'git stash')) ?? ''
    expect(stash).toContain('git stash refused. It would overwrite or delete a file another live session claims and has changed: src/login.ts (held by api (aaaaaaaa))')
    expect(stash).toContain('git stash push -- <your files>')
    expect(w.toasts).toContain('board: refused git: it would overwrite files another session changed')
    expect((await denied($, 'git stash -u')) ?? '').toContain('2 files another live session claims and has changed: src/login.ts, notes/new.md')
    expect((await denied($, 'git reset --hard HEAD')) ?? '').toContain('git reset refused')
    expect((await denied($, 'git checkout .')) ?? '').toContain('src/login.ts')
    expect((await denied($, 'cd src && git checkout .')) ?? '').toContain('src/login.ts')
    expect((await denied($, 'git restore src/login.ts')) ?? '').toContain('git restore refused')
    expect((await denied($, 'git checkout -f main')) ?? '').toContain('git checkout refused')
    expect((await denied($, 'git switch --discard-changes main')) ?? '').toContain('git switch refused')
    expect((await denied($, 'git clean -fd')) ?? '').toContain('git clean refused. It would overwrite or delete a file another live session claims and has changed: notes/new.md')
    expect(w.runs.some(r => r.join(' ') === 'git -c core.quotepath=off clean -n -d')).toBe(true)
    expect((await denied($, 'git rm src/login.ts')) ?? '').toContain('git rm refused')
    await w.clock.settle()
    const denies = parseHistory(w.files[`${DIR}/history/${B}.json`], B)?.events.filter(e => e.kind === 'deny').map(e => e.file)
    expect(denies).toContain('c:/proj/notes/new.md')
  })

  test('commands that leave the peer\'s files alone go on', { options: {} }, async ($, on) => {
    const w = await setup($, on, { modified: ['src/login.ts', 'tests/auth.ts'], untracked: ['notes/new.md'], clean: ['tmp/'] })
    expect(await denied($, 'git restore tests/auth.ts')).toBeUndefined()
    expect(await denied($, 'git checkout -- tests/auth.ts')).toBeUndefined()
    expect(await denied($, 'git stash push -m wip -- tests/auth.ts')).toBeUndefined()
    expect(await denied($, 'cd tests && git checkout .')).toBeUndefined()
    expect(await denied($, 'git restore --staged src/login.ts')).toBeUndefined()
    expect(await denied($, 'git rm --cached src/login.ts')).toBeUndefined()
    expect(await denied($, 'git switch main && git stash list && git stash pop')).toBeUndefined()
    expect(await denied($, 'git clean -fd')).toBeUndefined()
    expect(await denied($, 'git clean -n')).toBeUndefined()
    // After a cd it cannot follow, the command may run in another worktree: not judged.
    expect(await denied($, 'cd "$WT" && git checkout main -- src && git reset --hard')).toBeUndefined()
    expect(w.reached.filter(r => r.startsWith('b:Bash')).length).toBe(10)
  })

  test("a claim on a file the holder already committed never blocks; a delete or a restore from a commit does", { options: {} }, async ($, on) => {
    await setup($, on, { head: [], modified: [] })
    expect(await denied($, 'git reset --hard')).toBeUndefined()
    expect(await denied($, 'git checkout .')).toBeUndefined()
    expect((await denied($, 'git rm src/login.ts')) ?? '').toContain('src/login.ts')
    // A delete of a variable path counts only changed files.
    expect(await denied($, 'git rm -q $R/old.txt')).toBeUndefined()
    expect((await denied($, 'git checkout HEAD~1 -- src')) ?? '').toContain('src/login.ts')
    expect((await denied($, 'git restore --source=main src/login.ts')) ?? '').toContain('src/login.ts')
  })

  test('git clean is checked but never takes the lease; alone, no git runs', { options: {} }, async ($, on) => {
    const w = world(on, { git: { clean: ['notes/'] } })
    await $.session.start({ cwd: CWD } as never)
    expect(await denied($, 'git clean -fdx')).toBeUndefined()
    expect(await denied($, 'git stash && git reset --hard')).toBeUndefined()
    expect(w.runs.filter(r => r.includes('diff') || r.includes('clean'))).toEqual([])
    // clean alone took no lease; the stash did.
    w.runs.length = 0
    await $.turn.complete(turnEnd)
    expect(await denied($, 'git clean -fd')).toBeUndefined()
    expect(cardOf(w.files, A)?.git).toBeUndefined()
    await w.clock.settle()
    expect(kindsOf(w.files, A)?.filter(k => k === 'gitHold').length).toBe(1)
  })
})
