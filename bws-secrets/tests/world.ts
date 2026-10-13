// A stubbed engine for bws-secrets' hook tests: an in-memory folder, the env, surfaces, panes, a sleeper that takes a
// couple of real milliseconds, and the tool calls that reach the bottom. Not a test file.
import { mock } from 'claude-code/testing'
import type { On } from 'claude-code'

declare const setTimeout: (fn: (...a: never[]) => void, ms: number) => unknown

export const CWD = 'C:\\proj\\app'
export const HOME = 'C:\\Users\\me'
export const DIR = 'C:/Users/me/.claude/bws-secrets'
export const FILE = `${DIR}/C--proj-app.env`

export type World = {
  surfaces?: string[]
  files?: Record<string, string>
  isPlaced?: boolean
  sleeper?: 'ok' | 'throw'
  bottom?: (e: { tool: string; command?: string }) => unknown
}

export const norm = (p: string) => p.replace(/\\/g, '/')
export const tick = () => new Promise<void>(r => setTimeout(r, 2))

let current = { sleeps: 0 }

export function world(on: On, w: World = {}) {
  const clock = mock.clock(on, { now: 1_700_000_000_000 })
  const files = new Map<string, string>(Object.entries(w.files ?? {}))
  const seen = {
    opened: [] as string[],
    closed: [] as string[],
    writes: [] as string[],
    sleeps: 0,
    reached: [] as { tool: string; command?: string }[],
    registered: [] as string[],
    logs: [] as { text: string; to?: string }[],
  }
  current = seen
  on('session.start', () => ({ cwd: CWD }) as never)
  on('session.cwd', () => ({ value: CWD }))
  on('session.surfaces', () => ({ value: (w.surfaces ?? ['terminal']) as never }))
  on('env.get', ($, e) => ({ value: ({ HOME, OS: 'Windows_NT' } as Record<string, string>)[e.name] as never }))
  on('tool.register', ($, e) => {
    seen.registered.push(e.name)
    return { value: { tool: `mcp__bws-secrets__${e.name}` } as never }
  })
  on('command.register', () => ({ value: undefined as never }))
  on('fs.read', ($, e) => {
    const t = files.get(norm(e.path))
    if (t === undefined) throw new Error(`ENOENT ${norm(e.path)}`)
    return { value: t as never }
  })
  on('fs.write', ($, e) => {
    files.set(norm(e.path), e.text)
    seen.writes.push(norm(e.path))
    return { value: undefined as never }
  })
  on('fs.exists', ($, e) => ({ value: files.has(norm(e.path)) as never }))
  on('process.run', async () => {
    seen.sleeps++
    if (w.sleeper === 'throw') throw new Error('ENOENT ping')
    await new Promise<void>(r => setTimeout(r, 20))
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } as never }
  })
  on('ui.open', ($, e) => {
    seen.opened.push(e.id)
    return { value: (w.isPlaced === false ? { isPlaced: false, reason: 'unasked under 144 columns (now 100)' } : { isPlaced: true }) as never }
  })
  on('ui.close', ($, e) => {
    seen.closed.push(e.id)
    return { value: undefined as never }
  })
  on('ui.log', ($, e) => {
    seen.logs.push({ text: e.text, to: e.to })
    return { value: undefined as never }
  })
  on('ui.toast', () => ({ value: undefined as never }))
  on('tool.call', ($, e) => {
    const r = { tool: String(e.tool), command: (e as { command?: string }).command }
    seen.reached.push(r)
    if (w.bottom) return w.bottom(r) as never
    return { result: { stdout: 'ran', stderr: '', interrupted: false } as never }
  })
  return { seen, clock, files }
}

export const PANE = {
  plugin: 'bws-secrets',
  component: 'Pane',
  requestId: 'bws-secrets',
  props: { title: 'Secret', isFocused: true, bodyColumns: 100, placement: 'inline', scroll: { offset: 0, bodyRows: 12 }, view: {} },
} as const

// Lets a waiting tool call reach its loop before the test acts: until `isReady`, or n ticks.
// By default: until the newest world's request is waiting (its sleeper has run).
export async function settle(isReady: () => boolean = () => current.sleeps > 0, n = 500) {
  for (let i = 0; i < n && !isReady(); i++) await tick()
}
