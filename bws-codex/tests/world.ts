// A stubbed engine for bws-codex's hook tests: a repo at C:/src/app, git and the supervisor answered from memory,
// the job folder as an in-memory map, the store, the clock, and what reaches the bottom. Not a test file.
import { mock } from 'claude-code/testing'
import type { On } from 'claude-code'

export const TOP = 'C:/src/app'
export const COMMON = 'C:/src/app/.git'
export const HEAD = '0123456789abcdef0123456789abcdef01234567'
export const APPDATA = 'C:/Users/you/AppData/Roaming'
export const CODEX = `${APPDATA}/npm/node_modules/@openai/codex/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe`

// What core answers beneath the gate: the stub error of an allowed call, a rule's deny, and an ask nobody answered.
export const ALLOWED = { isError: true, result: undefined, text: 'bws-codex registered the tool mcp__bws-codex__codex_delegate but no tool.call hook answered this call: add on("tool.call" ...' }
export const DENIED = { deny: 'Permission to use mcp__bws-codex__codex_delegate has been denied by a rule.' }
export const NOT_GRANTED = { isError: true, result: undefined, text: "Claude requested permissions to use mcp__bws-codex__codex_delegate, but you haven't granted it yet." }

export const norm = (p: unknown) => String(p).replace(/\\/g, '/')

// The git output Claude's working tree gives the capsule.
export const STATUS = '## main...origin/main [ahead 1]\n M src/calc.py\n?? notes.md\n'
export const SHORTSTAT = ' 1 file changed, 2 insertions(+), 1 deletion(-)\n'
export const LOG = '0123456 add calc (2 hours ago)\n'

export type Fetch = { url: string; method: string; headers: Record<string, string>; body: Record<string, unknown> | undefined }
// Answers one $.http.fetch: status and body text (an object is sent as JSON). Throwing stands for a transport failure.
export type Api = (f: Fetch) => { status: number; body: unknown }

// `submitDrop`: every prompt is refused beneath with that reason (another hook's drop, a Stop that stands). `store`: what
// $.store holds at the start (a reload).
export type World = {
  bottom?: unknown
  now?: number
  isRemoveHeld?: boolean
  api?: Api
  messages?: { role: 'user' | 'assistant'; text: string }[]
  box?: string
  submitDrop?: string
  // Every prompt waits to go in until the test calls `held`'s functions (a plugin prompt waits for idle).
  isSubmitHeld?: boolean
  store?: Record<string, unknown>
}

// A tab as published (bws-kit/tab.ts ModTab), loosely typed for reading.
export type TabNode = { kind: string; text?: string; id?: string; title?: string; isFocused?: boolean; items?: { id: string; label: string; isFocused?: boolean }[]; body?: TabNode[] }
export type Tab = { title: string; badge: string; tone: string; raise: number; open?: number; isPinnedEnd?: boolean; body: TabNode[] }

// Every node of a tab, cards opened up.
export const flat = (ns: readonly TabNode[]): TabNode[] => ns.flatMap(n => (n.kind === 'card' ? [n, ...flat(n.body ?? [])] : [n]))
export const buttonIds = (t: Tab | undefined) => flat(t?.body ?? []).flatMap(n => (n.items ?? []).map(b => b.id))
export const texts = (t: Tab | undefined) => flat(t?.body ?? []).flatMap(n => [n.text ?? '', n.title ?? '']).filter(s => s !== '')

export function world(on: On, w: World = {}) {
  const clock = mock.clock(on, { now: w.now ?? 1_800_000_000_000 })
  // $.store in memory (mock.store's behaviour), with every write recorded in `stored`.
  const store = new Map<string, unknown>(Object.entries(w.store ?? {}))
  const stored: { key: string; value: unknown }[] = []
  on('store.get', ($, e) => ({ value: store.get(e.key) }))
  on('store.set', ($, e) => {
    const value = JSON.parse(JSON.stringify(e.value)) as unknown
    store.set(e.key, value)
    stored.push({ key: e.key, value })
    return { value: undefined }
  })
  on('store.delete', ($, e) => {
    store.delete(e.key)
    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...store.keys()] }))
  // The session's id; /clear gives it a new one.
  const session = { id: 'session-1' }
  mock.env(on, { APPDATA })
  const files = new Map<string, string>()
  const seen = {
    runs: [] as string[][],
    stdins: [] as string[],
    reached: [] as string[],
    submits: [] as string[],
    statuses: [] as (string | undefined)[],
    toasts: [] as string[],
    registered: [] as string[],
    commands: [] as string[],
    fetches: [] as Fetch[],
    fills: [] as { text: string; mode?: string }[],
    tabs: [] as Tab[],
    logs: [] as string[],
  }
  on('state.set', { plugin: 'bws-codex', key: 'tab' }, ($, e, next) => {
    seen.tabs.push(JSON.parse(JSON.stringify(e.value)) as Tab)
    return next(e)
  })
  on('command.register', ($, e) => {
    seen.commands.push(e.name)
    return { value: undefined as never }
  })
  on('session.surfaces', () => ({ value: ['terminal'] as never }))
  on('session.messages', () => ({ value: (w.messages ?? []).map(m => ({ ...m, toolUses: [] })) as never }))
  on('prompt.read', () => ({ value: { text: w.box ?? '', cursor: 0 } as never }))
  on('prompt.fill', ($, e) => {
    seen.fills.push({ text: e.text, ...(e.mode ? { mode: e.mode } : {}) })
    return { isFilled: true } as never
  })
  on('http.fetch', ($, e) => {
    const init = e.init ?? {}
    const f: Fetch = { url: e.url, method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body ? (JSON.parse(init.body) as Record<string, unknown>) : undefined }
    seen.fetches.push(f)
    const r = (w.api ?? (() => ({ status: 404, body: { error: { message: 'no api in this world' } } })))(f)
    const text = typeof r.body === 'string' ? r.body : JSON.stringify(r.body)
    return { value: { status: r.status, ok: r.status < 400, headers: {}, text } as never }
  })
  on('ui.log', ($, e) => {
    seen.logs.push(String(e.text))
    return { value: undefined as never }
  })
  on('session.start', () => ({ cwd: TOP }) as never)
  on('session.cwd', () => ({ value: TOP }))
  on('session.id', () => ({ value: session.id }))
  on('tool.register', ($, e) => {
    seen.registered.push(`${e.name}${e.isDeferred === false ? ' (pinned)' : ''}`)
    return { value: { tool: `mcp__bws-codex__${e.name}` } as never }
  })
  on('fs.exists', ($, e) => ({ value: norm(e.path) === CODEX || norm(e.path).includes('.codex-worktrees/') }))
  on('fs.read', ($, e) => {
    const t = files.get(norm(e.path))
    if (t === undefined) throw new Error(`ENOENT ${norm(e.path)}`)
    return { value: t as never }
  })
  on('process.run', ($, e) => {
    const argv = e.argv.map(norm)
    seen.runs.push(argv)
    if (e.init?.stdin) seen.stdins.push(e.init.stdin)
    const ok = (stdout = '') => ({ value: { exitCode: 0, stdout, stderr: '' } as never })
    if (argv.includes('rev-parse') && argv.includes('--show-toplevel')) return ok(`${TOP}\n${COMMON}\n${HEAD}\n`)
    if (argv[0] === 'git' && argv.includes('status') && argv.includes('--branch')) return ok(STATUS)
    if (argv[0] === 'git' && argv.includes('--shortstat') && !argv.includes('codex/')) return ok(SHORTSTAT)
    if (argv[0] === 'git' && argv.includes('log')) return ok(LOG)
    if (w.isRemoveHeld && argv.includes('remove')) return { value: { exitCode: 255, stdout: '', stderr: 'error: failed to delete: Permission denied' } as never }
    if (argv[1]?.endsWith('/bin/supervise.py') && argv[2] === 'launch') return ok('4242\n')
    if (argv[1]?.endsWith('/bin/supervise.py')) return ok(files.get(`${argv[3]}/status.json`) ?? '{}')
    return ok()
  })
  on('ui.status', ($, e) => {
    seen.statuses.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', ($, e) => {
    seen.toasts.push(e.text)
    return { value: undefined }
  })
  on('tool.call', ($, e) => {
    seen.reached.push(String(e.tool))
    return (w.bottom ?? ALLOWED) as never
  })
  const held: (() => void)[] = []
  on('prompt.submit', ($, e) => {
    seen.submits.push(e.text)
    const r = (w.submitDrop !== undefined ? { drop: w.submitDrop } : { text: e.text }) as never
    return w.isSubmitHeld ? new Promise<never>(resolve => held.push(() => resolve(r))) : r
  })
  on('turn.complete', () => ({ text: '' }) as never)
  return { clock, files, seen, stored, session, held }
}

// The job folder after a turn ended, as the supervisor leaves it.
export function finishTurn(files: Map<string, string>, dir: string, turn: number, now: number, message: string) {
  files.set(
    `${dir}/status.json`,
    JSON.stringify({
      turn,
      state: 'done',
      supervisorPid: 1,
      codexPid: 2,
      startedAt: now - 50_000,
      beatAt: now,
      endedAt: now,
      exitCode: 0,
      turnEnded: true,
      commit: 'fae165f00000000000000000000000000000000a',
      head: 'fae165f00000000000000000000000000000000a',
      stat: ' src/calc.py | 2 +-\n 1 file changed, 1 insertion(+), 1 deletion(-)',
      shortstat: ' 1 file changed, 1 insertion(+), 1 deletion(-)',
    }),
  )
  files.set(
    `${dir}/turn-${turn}.events.jsonl`,
    [
      JSON.stringify({ type: 'thread.started', thread_id: 'thread-1' }),
      JSON.stringify({ type: 'turn.started' }),
      JSON.stringify({ type: 'item.completed', item: { id: 'i', type: 'agent_message', text: message } }),
      JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1000, cached_input_tokens: 500, output_tokens: 10 } }),
    ].join('\n') + '\n',
  )
  files.set(`${dir}/turn-${turn}.last.txt`, message)
}
