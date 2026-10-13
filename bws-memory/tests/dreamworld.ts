// A stubbed engine for the DreamPath tests, with an in-memory folder (files and sub-folders). Not a test file.
import { mock } from 'claude-code/testing'
import type { On } from 'claude-code'
import { memoryFile, type Entry } from '../hooks/memory'

declare const setTimeout: (fn: (...a: never[]) => void, ms: number) => unknown

export const CWD = 'C:\\proj'
export const DIR = 'C:/proj/.claude/bws-memory'
export const NOW = 1_700_000_000_000
export const LONG = 'from now on always use tabs and never spaces in this repository please'
export const TURN = { answer: 'Understood, tabs it is.', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' }
export const ROWS = [
  { role: 'user', text: LONG, toolUses: [] },
  { role: 'assistant', text: 'Understood, tabs it is.', toolUses: [] },
]

const entry = (file: string, name: string, description: string, body: string, type: Entry['type'] = 'feedback'): Entry => ({ file, name, description, type, body })
export const TABS_A = entry('tabs-a.md', 'tabs-a', 'The user wants tabs, not spaces', 'Use tabs.\n\nWhy: house style.')
export const TABS_B = entry('tabs-b.md', 'tabs-b', 'Tabs not spaces in this repo', 'Always indent with tabs.\n\nHow to apply: every file.')
export const PNPM = entry('uses-pnpm.md', 'uses-pnpm', 'The build uses pnpm', 'Run pnpm install, never npm.', 'project')
export const OLD = entry('old-port.md', 'old-port', 'The dev server port is 3000', 'The dev server listens on 3000.', 'project')
export const NEW = entry('new-port.md', 'new-port', 'The dev server port is 4000', 'The dev server listens on 4000 now.', 'project')

export const folder = (...entries: Entry[]): Record<string, string> => Object.fromEntries(entries.map(e => [`${DIR}/${e.file}`, memoryFile(e)]))

export const action = (a: object) => a
export const plan = (...actions: object[]) => JSON.stringify({ actions })
export const MERGE_AB = { action: 'merge', files: ['tabs-a.md', 'tabs-b.md'], into: 'tabs-a.md', name: 'tabs-a', description: 'Indent with tabs, never spaces', type: 'feedback', body: 'Use tabs, always, in every file.\n\nWhy: house style.', reason: 'near-duplicates' }

export type Fork = string | { isAnswered: false; reason: string } | 'throw' | 'defer'

export type World = {
  surfaces?: string[]
  rows?: object[]
  fork?: Fork
  complete?: string
  files?: Record<string, string>
  session?: string
  classify?: 'yes' | 'no' | 'throw'
}

export const norm = (p: string) => p.replace(/\\/g, '/')

export function world(on: On, w: World = {}) {
  const clock = mock.clock(on, { now: NOW })
  const files = new Map<string, string>(Object.entries(w.files ?? {}))
  const seen = {
    classify: [] as { text: string }[],
    fork: [] as string[],
    complete: [] as { model: string; prompt: string }[],
    writes: [] as string[],
    opened: [] as string[],
    closed: [] as string[],
    logs: [] as { text: string; to?: string }[],
    toasts: [] as string[],
  }
  const who = { session: w.session ?? 'session-aaaa-1111' }
  let release: (text: string) => void = () => undefined
  on('session.start', () => ({ cwd: CWD }) as never)
  on('session.id', () => ({ value: who.session }))
  on('session.cwd', () => ({ value: CWD }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('session.surfaces', () => ({ value: (w.surfaces ?? ['terminal']) as never }))
  on('session.messages', () => ({ value: (w.rows ?? ROWS) as never }))
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
  on('fs.list', ($, e) => {
    const dir = norm(e.path).replace(/\/$/, '')
    const out = new Map<string, 'file' | 'dir'>()
    for (const p of files.keys()) {
      if (!p.startsWith(`${dir}/`)) continue
      const rest = p.slice(dir.length + 1)
      const slash = rest.indexOf('/')
      if (slash < 0) out.set(rest, 'file')
      else out.set(rest.slice(0, slash), 'dir')
    }
    if (out.size === 0) throw new Error('ENOENT')
    return { value: [...out].map(([name, kind]) => ({ name, kind, size: 1, mtimeMs: 0, isLink: false })) as never }
  })
  on('model.classify', ($, e) => {
    seen.classify.push({ text: e.text })
    if (w.classify === 'throw') throw new Error('classifier down')
    return { value: (w.classify ?? 'no') as never }
  })
  on('model.fork', ($, e) => {
    seen.fork.push(e.prompt)
    const f = w.fork ?? plan(MERGE_AB)
    if (f === 'throw') throw new Error('fork down')
    if (f === 'defer') return new Promise(resolve => (release = text => resolve({ value: { isAnswered: true, text, usage: {} } as never }))) as never
    return { value: (typeof f === 'string' ? { isAnswered: true, text: f, usage: {} } : f) as never }
  })
  on('model.complete', ($, e) => {
    seen.complete.push({ model: e.model, prompt: e.prompt })
    return { value: { isAnswered: true, text: w.complete ?? plan(MERGE_AB), usage: {} } as never }
  })
  on('ui.open', ($, e) => {
    seen.opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', ($, e) => {
    seen.closed.push(e.id)
    return { value: undefined as never }
  })
  on('ui.toast', ($, e) => {
    seen.toasts.push(e.text)
    return { value: undefined as never }
  })
  on('ui.log', ($, e) => {
    seen.logs.push({ text: e.text, to: e.to })
    return { value: undefined as never }
  })
  on('turn.complete', () => ({ text: '' }) as never)
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('session.compact', ($, e) => ({ messages: e.messages }) as never)
  return { seen, clock, files, who, release: (text: string) => release(text) }
}

export const PANE = {
  plugin: 'bws-memory',
  component: 'Pane',
  requestId: 'bws-dream',
  props: { title: 'Dream', isFocused: false, bodyColumns: 80, placement: 'inline', scroll: { offset: 0, bodyRows: 8 }, view: {} },
} as const

// Lets the deferred work and the awaits behind it run.
export async function drain(clock: { advance: (ms: number) => Promise<unknown> }) {
  await clock.advance(10)
  for (let i = 0; i < 40; i++) await new Promise(r => setTimeout(r, 0))
}

export const turn = ($: { turn: { complete: (i: never) => Promise<unknown> } }, o: object = {}) => $.turn.complete({ ...TURN, ...o } as never)
export const run = async ($: { command: { run: (i: never) => Promise<unknown> } }, command: string, args = '') => ((await $.command.run({ command, args } as never)) as { text: string }).text
export const SESSION_END = (reason: string, sessionId = 'session-aaaa-1111') => ({ reason, sessionId, resume: {} }) as never
