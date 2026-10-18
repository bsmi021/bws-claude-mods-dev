// The stubbed engine the hook tests run on: every outside call the mod makes, with an in-memory folder and store,
// and a record of what reached the engine.
import { mock } from 'claude-code/testing'
import type { On } from 'claude-code'

declare const setTimeout: (fn: (...a: never[]) => void, ms: number) => unknown

export const START = { cwd: 'C:/proj' } as never
export const DUMP = 'C:/tmp/diagram-dump.json'
export const SPEC = { title: 'Refactor', nodes: [{ id: 'a', label: 'Read config', kind: 'step' }, { id: 'b', label: 'config.ts', kind: 'file' }, { id: 'c', label: 'Loader', kind: 'new' }], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c', label: 'extract' }], now: 'c' }
export const SPEC_JSON = JSON.stringify(SPEC)

export const BIG_ROWS = [
  { role: 'user', text: 'please refactor the config loading into its own module', toolUses: [] },
  {
    role: 'assistant',
    text: '',
    toolUses: [
      { tool: 'Read', input: { file_path: 'C:/p/config.ts' } },
      { tool: 'Edit', input: { file_path: 'C:/p/config.ts' } },
      { tool: 'Write', input: { file_path: 'C:/p/loader.ts' } },
    ],
  },
  { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 'x', text: 'ok', isError: false }] },
  { role: 'assistant', text: 'Done: the loader is its own module now.', toolUses: [] },
]
export const CHAT_ROWS = [
  { role: 'user', text: 'what does this repo do', toolUses: [] },
  { role: 'assistant', text: 'It holds mods.', toolUses: [] },
]

// The Diagram tab as published (bws-kit/tab.ts ModTab), as much of it as the tests read.
type TabNode =
  | { kind: 'text'; text: string; isClipped?: boolean; isBold?: boolean; isDim?: boolean; color?: string }
  | { kind: 'buttons'; items: { id: string; label: string }[] }
  | { kind: 'card' | 'input' | 'raster' }
export type Tab = { title: string; badge: string; tone: string; raise: number; show?: number; body: TabNode[] }

export type Fork = string | { isAnswered: false; reason: string } | 'throw' | 'defer'

export type World = {
  surfaces?: string[]
  rows?: object[]
  classify?: 'yes' | 'no' | 'throw' | 'none'
  fork?: Fork
  session?: string
  store?: Record<string, unknown>
  placed?: boolean
  // bws-cockpit loaded (its /dashboard command listed): the Diagram tab shows diagrams. Default true.
  cockpit?: boolean
}

const norm = (p: string) => p.replace(/\\/g, '/')

export function world(on: On, w: World = {}) {
  const clock = mock.clock(on, { now: 1_700_000_000_000 })
  const files = new Map<string, string>()
  const store = new Map<string, unknown>(Object.entries(w.store ?? {}))
  const seen = {
    classify: [] as { text: string; labels: readonly string[]; options: unknown }[],
    fork: [] as string[],
    complete: [] as { model: string; prompt: string }[],
    opened: [] as { id: string; columns?: number; focus?: boolean }[],
    closed: [] as string[],
    logs: [] as { text: string; to?: string }[],
    toasts: [] as string[],
    commands: [] as string[],
    tabs: [] as Tab[],
  }
  const who = { session: w.session ?? 'session-aaaa-1111', rows: w.rows ?? BIG_ROWS }
  let release: (text: string) => void = () => undefined
  on('session.start', () => ({ cwd: 'C:/proj' }) as never)
  on('session.id', () => ({ value: who.session }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('session.surfaces', () => ({ value: (w.surfaces ?? ['terminal']) as never }))
  on('session.messages', () => ({ value: who.rows as never }))
  on('command.register', ($, e) => {
    seen.commands.push(e.name)
    return { value: undefined as never }
  })
  on('fs.write', ($, e) => {
    files.set(norm(e.path), e.text)
    return { value: undefined as never }
  })
  on('store.get', ($, e) => ({ value: store.get(e.key) as never }))
  on('store.set', ($, e) => {
    store.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined as never }
  })
  on('model.classify', ($, e) => {
    seen.classify.push({ text: e.text, labels: e.labels, options: e.options })
    if (w.classify === 'throw') throw new Error('classifier down')
    return { value: (w.classify === 'none' ? undefined : (w.classify ?? 'yes')) as never }
  })
  on('model.fork', ($, e) => {
    seen.fork.push(e.prompt)
    const f = w.fork ?? SPEC_JSON
    if (f === 'throw') throw new Error('fork down')
    if (f === 'defer') return new Promise(resolve => (release = text => resolve({ value: { isAnswered: true, text, usage: {} } as never }))) as never
    return { value: (typeof f === 'string' ? { isAnswered: true, text: f, usage: {} } : f) as never }
  })
  on('model.complete', ($, e) => {
    seen.complete.push({ model: e.model, prompt: e.prompt })
    return { value: { isAnswered: true, text: SPEC_JSON, usage: {} } as never }
  })
  on('ui.open', ($, e) => {
    seen.opened.push({ id: e.id, columns: e.columns, focus: e.focus })
    return { value: w.placed === false ? { isPlaced: false, reason: 'too narrow' } : { isPlaced: true } } as never
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
  on('command.list', () => ({ value: (w.cockpit === false ? [] : [{ name: 'dashboard' }]) as never }))
  on('state.set', { plugin: 'bws-diagram', key: 'tab' }, ($, e, next) => {
    seen.tabs.push(JSON.parse(JSON.stringify(e.value)) as Tab)
    return next(e)
  })
  on('turn.complete', () => ({ text: '' }) as never)
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  const dump = () => {
    const t = files.get(DUMP)
    return t === undefined ? null : (JSON.parse(t) as { entries: { origin: string; title: string; diagram: unknown; source: string }[]; shown: number; phase: string; note: string })
  }
  // The tab as last published, its raise count and its lines of text.
  const last = () => seen.tabs[seen.tabs.length - 1]
  const raised = () => last()?.raise ?? 0
  const lines = (): string[] => (last()?.body ?? []).flatMap(n => (n.kind === 'text' ? [n.text] : n.kind === 'buttons' ? n.items.map(b => `[${b.label}]`) : []))
  return { seen, clock, files, store, who, dump, last, raised, lines, release: (text: string) => release(text) }
}

export const TURN = { answer: 'Done: the loader is its own module now.', durationMs: 95_000, isAborted: false, turnId: 't1', reason: 'answer' }

export const PANE = {
  plugin: 'bws-diagram',
  component: 'Pane',
  requestId: 'bws-diagram',
  props: { title: 'Diagram', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

// Lets the deferred work and the awaits behind it run.
export async function drain(clock: { advance: (ms: number) => Promise<unknown> }) {
  await clock.advance(10)
  for (let i = 0; i < 40; i++) await new Promise(r => setTimeout(r, 0))
}

export const turn = ($: { turn: { complete: (i: never) => Promise<unknown> } }, o: object = {}) => $.turn.complete({ ...TURN, ...o } as never)
export const run = async ($: { command: { run: (i: never) => Promise<unknown> } }, command: string, args = '') => ((await $.command.run({ command, args } as never)) as { text: string }).text
export const SESSION_END = (reason: string, sessionId = 'session-aaaa-1111') => ({ reason, sessionId, resume: {} }) as never
