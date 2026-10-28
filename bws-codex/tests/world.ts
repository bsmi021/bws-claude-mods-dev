// A stubbed engine for bws-codex's hook tests: a repo at C:/src/app, git and the supervisor answered from memory,
// the job folder as an in-memory map, the store, the clock, and what reaches the bottom. Not a test file.
import { mock } from 'claude-code/testing'
import type { On } from 'claude-code'

export const TOP = 'C:/src/app'
export const COMMON = 'C:/src/app/.git'
export const HEAD = '0123456789abcdef0123456789abcdef01234567'
export const APPDATA = 'C:/Users/me/AppData/Roaming'
export const CODEX = `${APPDATA}/npm/node_modules/@openai/codex/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe`

// What core answers beneath the gate: the stub error of an allowed call, a rule's deny, and an ask nobody answered.
export const ALLOWED = { isError: true, result: undefined, text: 'bws-codex registered the tool mcp__bws-codex__codex_delegate but no tool.call hook answered this call: add on("tool.call" ...' }
export const DENIED = { deny: 'Permission to use mcp__bws-codex__codex_delegate has been denied by a rule.' }
export const NOT_GRANTED = { isError: true, result: undefined, text: "Claude requested permissions to use mcp__bws-codex__codex_delegate, but you haven't granted it yet." }

export const norm = (p: unknown) => String(p).replace(/\\/g, '/')

export type World = { bottom?: unknown; now?: number }

export function world(on: On, w: World = {}) {
  const clock = mock.clock(on, { now: w.now ?? 1_800_000_000_000 })
  mock.store(on)
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
  }
  on('session.start', () => ({ cwd: TOP }) as never)
  on('session.cwd', () => ({ value: TOP }))
  on('session.id', () => ({ value: 'session-1' }))
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
  on('prompt.submit', ($, e) => {
    seen.submits.push(e.text)
    return { text: e.text } as never
  })
  on('turn.complete', () => ({ text: '' }) as never)
  return { clock, files, seen }
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
