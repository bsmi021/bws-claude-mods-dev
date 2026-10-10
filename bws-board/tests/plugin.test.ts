import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { STALE_MS, cardText, newCard, parseCard } from '../hooks/board'
import type { Card } from '../hooks/board'

const CWD = 'C:/proj'
const CFG = 'C:/cfg'
const DIR = `${CFG}/bws-board/c-proj`
// Neutral ids: one per simulated session.
const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const B = 'bbbbbbbb-0000-4000-8000-000000000002'
const C = 'cccccccc-0000-4000-8000-000000000003'

const cardOf = (files: Record<string, string>, id: string) => parseCard(files[`${DIR}/${id}.json`], id)

// One plugin instance per test, so a second session is the same instance under another session id:
// its own state starts fresh, and the board folder is shared. Roles come from BWS_AGENT_ROLE per id.
function world(on: On, opts: { writeFails?: boolean; roles?: Record<string, string> } = {}) {
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
  on('process.run', ($, e) => {
    runs.push([...e.argv])
    return { value: { exitCode: 0, stdout: '', stderr: '' } as never }
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
    if (opts.writeFails) throw new Error('EACCES')
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
  on('turn.complete', () => ({}) as never)
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  // A card written as another process would: straight into the folder.
  const put = (c: Card) => {
    files[`${DIR}/${c.sessionId}.json`] = cardText(c)
    mtimes[`${DIR}/${c.sessionId}.json`] = clock.now()
  }
  const live = () =>
    Object.keys(files)
      .filter(p => p.startsWith(`${DIR}/`))
      .map(p => parseCard(files[p], p.slice(DIR.length + 1, -5)))
      .filter((c): c is Card => c !== undefined && c.gone !== true)
      .map(c => c.sessionId)
      .sort()
  return { files, mtimes, who, reached, toasts, sends, runs, clock, put, live }
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
