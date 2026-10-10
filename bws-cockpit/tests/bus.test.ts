import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import {
  STALE_MS,
  addClaim,
  busKey,
  busPath,
  claimHolder,
  normFile,
  parseBus,
  redact,
  resolveTarget,
  taskFrom,
  unread,
  withEntry,
  withoutEntry,
} from '../hooks/bus'
import type { BusEntry, BusFile } from '../hooks/bus'

const CWD = 'C:/proj'
const CFG = 'C:/cfg'
const BUS = `${CFG}/bws-cockpit/bus/c-proj.json`
const LIM = { staleMs: STALE_MS, claimMs: 30 * 60_000 }
// Neutral ids: one per simulated session.
const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const B = 'bbbbbbbb-0000-4000-8000-000000000002'
const C = 'cccccccc-0000-4000-8000-000000000003'

const entry = (sessionId: string, over: Partial<BusEntry> = {}): BusEntry => ({
  sessionId,
  cwd: CWD,
  startedAt: 1000,
  seenAt: 1000,
  status: 'idle',
  task: '',
  run: null,
  lastFile: null,
  claims: [],
  outbox: [],
  ...over,
})
const bus = (...entries: BusEntry[]): BusFile => ({ version: 1, folder: CWD, sessions: Object.fromEntries(entries.map(e => [e.sessionId, e])) })

// ---------- pure helpers ----------

describe('bus helpers', () => {
  test('one bus file per folder, under the config dir', () => {
    expect(busKey('C:\\Projects\\My Repo')).toBe('c-projects-my-repo')
    expect(busPath('C:/Users/u/.claude', 'C:/proj')).toBe('C:/Users/u/.claude/bws-cockpit/bus/c-proj.json')
  })

  test('a broken or missing file reads as an empty bus; junk entries are dropped', () => {
    expect(parseBus(undefined, CWD).sessions).toEqual({})
    expect(parseBus('{not json', CWD).sessions).toEqual({})
    const f = parseBus(JSON.stringify({ sessions: { [A]: { seenAt: 5, claims: [{ path: 'c:/proj/x', at: 4 }, { at: 1 }] }, junk: 3 } }), CWD)
    expect(Object.keys(f.sessions)).toEqual([A])
    expect(f.sessions[A]?.claims).toEqual([{ path: 'c:/proj/x', since: 4, at: 4 }])
  })

  test('writing an entry drops stale ones; leaving removes only that session', () => {
    const now = 1000 + STALE_MS + 1
    const f = withEntry(bus(entry(A), entry(B, { seenAt: now - 10 })), entry(C, { seenAt: now }), now, STALE_MS)
    expect(Object.keys(f.sessions).sort()).toEqual([B, C])
    expect(Object.keys(withoutEntry(f, C, now, STALE_MS).sessions)).toEqual([B])
  })

  test('files compare absolute, slash-normalized and case-folded', () => {
    expect(normFile('src\\X.ts', 'C:\\Proj')).toBe('c:/proj/src/x.ts')
    expect(normFile('C:/Proj/a/../src/./x.ts', CWD)).toBe('c:/proj/src/x.ts')
  })

  test('a claim blocks other live sessions; a stale session or a lapsed claim does not', () => {
    const file = 'c:/proj/x.ts'
    const now = 10_000
    const held = bus(entry(A, { seenAt: now, claims: [{ path: file, since: now - 5, at: now - 5 }] }))
    expect(claimHolder(held, B, file, now, LIM)?.sessionId).toBe(A)
    expect(claimHolder(held, A, file, now, LIM)).toBeUndefined()
    expect(claimHolder(held, B, 'c:/proj/other.ts', now, LIM)).toBeUndefined()
    expect(claimHolder(held, B, file, now + STALE_MS, LIM)).toBeUndefined() // A stopped beating
    const lapsed = bus(entry(A, { seenAt: now, claims: [{ path: file, since: 0, at: now - LIM.claimMs }] }))
    expect(claimHolder(lapsed, B, file, now, LIM)).toBeUndefined()
  })

  test('two sessions that claimed one file at once: the earlier claim holds it, exactly one goes on', () => {
    const file = 'c:/proj/x.ts'
    const now = 10_000
    const a = { path: file, since: 100, at: 9_000 } // A first, edited since
    const b = { path: file, since: 200, at: 200 }
    const f = bus(entry(A, { seenAt: now, claims: [a] }), entry(B, { seenAt: now, claims: [b] }))
    expect(claimHolder(f, A, file, now, LIM, a)).toBeUndefined()
    expect(claimHolder(f, B, file, now, LIM, b)?.sessionId).toBe(A)
  })

  test('re-editing keeps the first-claim time and moves the last edit', () => {
    const c1 = addClaim([], 'c:/proj/x', 100, LIM.claimMs)
    expect(addClaim(c1, 'c:/proj/x', 500, LIM.claimMs)).toEqual([{ path: 'c:/proj/x', since: 100, at: 500 }])
  })

  test('the task is the first prompt line, redacted; slash commands say nothing', () => {
    expect(taskFrom('\n  Fix the parser bug\nmore')).toBe('Fix the parser bug')
    expect(taskFrom('/cockpit')).toBeUndefined()
    expect(taskFrom('set api_key=abc123 then deploy')).toBe('set api_key=[redacted] then deploy')
    expect(redact(`use ${'x'.repeat(40)} now`)).toBe('use [redacted] now')
  })

  test('unread: messages to this session or all, after it joined, each once', () => {
    const f = bus(
      entry(B, {
        outbox: [
          { seq: 1, to: A, text: 'old', at: 50 },
          { seq: 2, to: A, text: 'hi A', at: 150 },
          { seq: 3, to: C, text: 'not yours', at: 160 },
          { seq: 4, to: 'all', text: 'everyone', at: 170 },
        ],
      }),
    )
    const first = unread(f, A, 100, {})
    expect(first.messages.map(m => m.text)).toEqual(['hi A', 'everyone'])
    expect(unread(f, A, 100, first.cursors).messages).toEqual([])
  })

  test('send targets: all, a unique prefix, or a clear error', () => {
    const f = bus(entry(A, { seenAt: 1000 }), entry(B, { seenAt: 1000 }))
    expect(resolveTarget(f, A, 'bbbbbbbb', 1000, STALE_MS)).toEqual({ id: B })
    expect(resolveTarget(f, A, 'all', 1000, STALE_MS)).toEqual({ id: 'all' })
    expect('error' in resolveTarget(f, A, 'zzz', 1000, STALE_MS)).toBe(true)
    expect('error' in resolveTarget(bus(entry(A)), A, 'all', 1000, STALE_MS)).toBe(true)
  })
})

// ---------- two sessions in one folder ----------
// One plugin instance per test, so the second session is the same instance under another
// session id (as after a /clear): its own state starts fresh, and the bus file is shared.

function busWorld(on: On, opts: { writeFails?: boolean } = {}) {
  const files: Record<string, string> = {}
  const who = { id: A }
  const reached: string[] = []
  const toasts: string[] = []
  const clock = mock.clock(on, { now: 5_000_000 })
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('env.get', ($, e) => ({ value: (e.name === 'CLAUDE_CONFIG_DIR' ? CFG : undefined) as never }))
  on('session.id', () => ({ value: who.id }))
  on('session.cwd', () => ({ value: CWD }))
  on('session.repo', () => ({ value: { root: CWD, remote: null } as never }))
  on('session.root', () => ({ value: CWD }))
  on('session.surfaces', () => ({ value: [] as never }))
  on('session.usage', () => ({ value: { startedAt: 1 } as never }))
  on('tool.register', ($, e) => ({ value: { tool: e.name } }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.start', ($, e) => ({ cwd: CWD }) as never)
  on('fs.read', ($, e) => {
    const hit = files[String(e.path).replace(/\\/g, '/')]
    if (hit === undefined) throw new Error('ENOENT')
    return { value: hit as never }
  })
  on('fs.write', ($, e) => {
    if (opts.writeFails) throw new Error('EACCES')
    files[String(e.path).replace(/\\/g, '/')] = e.text
    return { value: undefined }
  })
  on('fs.list', () => {
    throw new Error('ENOENT')
  })
  on('tool.call', ($, e) => {
    reached.push(`${who.id.slice(0, 1)}:${String(e.tool)}:${String((e as { file_path?: string }).file_path ?? '')}`)
    return { result: 'ok' as never }
  })
  on('prompt.context', ($, e) => ({ blocks: e.blocks }))
  on('prompt.submit', ($, e) => ({ text: e.text, context: e.context }))
  on('turn.complete', () => ({}) as never)
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  const sessions = () => Object.keys(parseBus(files[BUS], CWD).sessions)
  return { files, who, reached, toasts, clock, sessions }
}

const busBlock = (r: { blocks: readonly { name: string; text: string }[] }) => r.blocks.find(b => b.name === 'bwsBus')?.text

describe('session bus', () => {
  test('two sessions: each sees the other, a claimed file is refused to the other, entries clear on exit', async ($, on) => {
    const w = busWorld(on)

    // Session A starts alone: registered on the bus, no bus block (nobody to tell about).
    await $.prompt.submit({ text: 'Fix the parser bug\ndetails', wait: false, origin: { kind: 'sdk' } } as never)
    const ctxA = await $.prompt.context({ blocks: [] } as never)
    expect(busBlock(ctxA)).toBeUndefined()
    expect(w.sessions()).toEqual([A])
    // A edits src/parser.ts: it passes and A claims it.
    const editA = await $.tool.call({ tool: 'Edit', file_path: 'C:/proj/src/parser.ts', old_string: 'a', new_string: 'b' } as never)
    expect(editA.deny).toBeUndefined()
    expect(w.reached).toEqual(['a:Edit:C:/proj/src/parser.ts'])
    expect(parseBus(w.files[BUS], CWD).sessions[A]?.claims.map(c => c.path)).toEqual(['c:/proj/src/parser.ts'])

    // Session B starts in the same folder: told about A, its task and its claim, and how to reach it.
    w.who.id = B
    await w.clock.advance(1000)
    await $.prompt.submit({ text: 'Add a lexer test', wait: false, origin: { kind: 'composer' } } as never)
    const intro = busBlock(await $.prompt.context({ blocks: [] } as never)) ?? ''
    expect(intro).toContain('1 other Claude Code session(s) are live in C:/proj')
    expect(intro).toContain(`aaaaaaaa (${A}) · busy · Fix the parser bug`)
    expect(intro).toContain('claims: src/parser.ts')
    expect(intro).toContain('mcp__bws-cockpit__bus_send')
    expect(w.sessions().sort()).toEqual([A, B])

    // B may not edit A's file (any spelling of it), and the edit never runs.
    const clip = await $.tool.call({ tool: 'Write', file_path: 'src\\Parser.ts', content: 'x' } as never)
    expect(clip.deny ?? '').toContain('src/parser.ts is claimed by another live session in this folder, aaaaaaaa (Fix the parser bug')
    expect(w.reached.filter(r => r.startsWith('b:'))).toEqual([])
    // Another file is fine, and B claims it.
    const own = await $.tool.call({ tool: 'Edit', file_path: 'C:/proj/test/lexer.test.ts', old_string: 'a', new_string: 'b' } as never)
    expect(own.deny).toBeUndefined()

    // B's status lists A; B asks A to release the file.
    const status = await $.tool.call({ tool: 'mcp__bws-cockpit__bus_status' } as never)
    expect(String(status.result)).toContain(`This session: bbbbbbbb (${B}) · Add a lexer test · claims test/lexer.test.ts`)
    expect(String(status.result)).toContain('aaaaaaaa')
    const sent = await $.tool.call({ tool: 'mcp__bws-cockpit__bus_send', to: 'aaaa', text: 'please release src/parser.ts when done' } as never)
    expect(String(sent.result)).toContain('Sent to aaaaaaaa')
    expect(parseBus(w.files[BUS], CWD).sessions[B]?.outbox[0]).toMatchObject({ to: A, text: 'please release src/parser.ts when done' })

    // B exits: its entry is gone at once; A's stays.
    await $.session.end({ reason: 'prompt_input_exit', sessionId: B, resume: {} } as never)
    expect(w.sessions()).toEqual([A])

    // A exits: the bus is empty.
    w.who.id = A
    await $.session.end({ reason: 'other', sessionId: A, resume: {} } as never)
    expect(w.sessions()).toEqual([])
  })

  test('a message from another session reaches the model after the next tool result, and is toasted', async ($, on) => {
    const w = busWorld(on)
    w.who.id = B
    await $.session.start({ cwd: CWD } as never)
    await w.clock.settle()
    expect(w.sessions()).toEqual([B])
    // Peer C (another process) is live here and writes B a message.
    const now = w.clock.now()
    const file = parseBus(w.files[BUS], CWD)
    w.files[BUS] = JSON.stringify(withEntry(file, entry(C, { startedAt: now, seenAt: now, task: 'refactor io', outbox: [{ seq: 1, to: B, text: 'I am on io.ts', at: now + 1 }] }), now, STALE_MS))
    await w.clock.advance(20_000) // one heartbeat
    expect(w.toasts.some(t => t.includes('bus · cccccccc') && t.includes('joined'))).toBe(true)
    const r = await $.tool.call({ tool: 'Bash', command: 'echo hi' } as never)
    const note = (r.context ?? []).join('\n')
    expect(note).toContain(`from cccccccc (${C}): I am on io.ts`)
    expect(note).toContain('joined the folder; its task line reads: "refactor io"')
    expect(note).toContain('not from the user')
    expect(note).toContain('claimed by you automatically')
    // Delivered once.
    const again = await $.tool.call({ tool: 'Bash', command: 'echo hi' } as never)
    expect(again.context ?? []).toEqual([])
  })

  test('a session that stops beating goes stale: its claims stop blocking and the next writer prunes it', async ($, on) => {
    const w = busWorld(on)
    const now = w.clock.now()
    w.files[BUS] = JSON.stringify(bus(entry(C, { seenAt: now - STALE_MS - 1, claims: [{ path: 'c:/proj/x.ts', since: now - 9e5, at: now - 9e5 }] })))
    const r = await $.tool.call({ tool: 'Edit', file_path: 'C:/proj/x.ts', old_string: 'a', new_string: 'b' } as never)
    expect(r.deny).toBeUndefined()
    expect(w.sessions()).toEqual([A])
  })

  test('a broken bus never blocks an edit', async ($, on) => {
    const w = busWorld(on, { writeFails: true })
    const r = await $.tool.call({ tool: 'Edit', file_path: 'C:/proj/x.ts', old_string: 'a', new_string: 'b' } as never)
    expect(r.deny).toBeUndefined()
    expect(w.reached).toEqual(['a:Edit:C:/proj/x.ts'])
    expect(w.toasts.filter(t => t.includes('session bus is unavailable')).length).toBe(1)
  })

  test('sessionBus off: no bus file, nothing refused', { options: { sessionBus: false } }, async ($, on) => {
    const w = busWorld(on)
    w.files[BUS] = JSON.stringify(bus(entry(C, { seenAt: w.clock.now(), claims: [{ path: 'c:/proj/x.ts', since: w.clock.now(), at: w.clock.now() }] })))
    const before = w.files[BUS]
    const r = await $.tool.call({ tool: 'Edit', file_path: 'C:/proj/x.ts', old_string: 'a', new_string: 'b' } as never)
    expect(r.deny).toBeUndefined()
    expect(w.files[BUS]).toBe(before)
  })
})
