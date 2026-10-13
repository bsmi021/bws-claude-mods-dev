// A stubbed engine for the decision tree tests: the main conversation, the pane, and Explore children answered from
// a queue (one script per spawn, in order). Not a test file.
import { mock } from 'claude-code/testing'
import type { On } from 'claude-code'

import { NUMBERED_BOLD } from './replies'

const NL = String.fromCharCode(10)
export const DUMP = 'C:/tmp/tree.json'

// One Explore child: the reply it gives, or an error result, an exit code, or holding until it is killed.
export type Child = { reply?: string; isError?: boolean; exit?: number; hold?: boolean; stderr?: string }

export type TreeWorld = {
  surfaces?: string[]
  rows?: { role: 'user' | 'assistant'; text: string }[]
  children?: Child[]
}

const line = (o: unknown) => JSON.stringify(o) + NL

export const ROWS = [
  { role: 'user' as const, text: 'Where should the cache live?', toolUses: [] },
  { role: 'assistant' as const, text: NUMBERED_BOLD, toolUses: [] },
]

export function treeWorld(on: On, w: TreeWorld = {}) {
  const clock = mock.clock(on, { now: Date.parse('2026-10-13T10:00:00') })
  const seen = {
    commands: [] as string[],
    opened: [] as { id: string; focus?: boolean }[],
    closed: [] as string[],
    toasts: [] as string[],
    spawns: [] as { argv: readonly string[]; env?: Record<string, string> }[],
    kills: [] as (readonly string[])[],
    focused: [] as { requestId?: string; key?: string }[],
    logs: [] as { text: string; to?: string }[],
    sent: [] as { text: string; asUser?: boolean }[],
    files: new Map<string, string>(),
  }
  const queue = [...(w.children ?? [])]
  const held: { sideId: string; release: () => void }[] = []
  on('session.start', () => ({ cwd: 'C:/proj' }) as never)
  on('session.id', () => ({ value: 'main-session-id' }))
  on('session.surfaces', () => ({ value: (w.surfaces ?? ['terminal']) as never }))
  on('session.messages', () => ({ value: (w.rows ?? ROWS) as never }))
  on('command.register', ($, e) => {
    seen.commands.push(e.name)
    return { value: undefined as never }
  })
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
  on('env.get', () => ({ value: 'Windows_NT' as never }))
  on('fs.write', ($, e) => {
    seen.files.set(e.path.replace(/\\/g, '/'), e.text)
    return { value: undefined as never }
  })
  on('ui.open', ($, e) => {
    seen.opened.push({ id: e.id, focus: e.focus })
    return { value: { isPlaced: true } }
  })
  // a pane opened with focus holds the keys from then on
  on('ui.panes', () => ({ value: [...new Set(seen.opened.map(o => o.id))].map(id => ({ id, title: id, isShown: true, isFocused: seen.opened.some(o => o.id === id && o.focus === true), isPlaced: true })) as never }))
  on('ui.focus', ($, e) => {
    seen.focused.push({ requestId: e.requestId, key: e.element })
    return {}
  })
  on('ui.close', ($, e) => {
    seen.closed.push(e.id)
    return { value: undefined } as never
  })
  on('ui.toast', ($, e) => {
    seen.toasts.push(String((e as unknown as { text: string }).text))
    return { value: undefined } as never
  })
  on('ui.log', ($, e) => {
    seen.logs.push({ text: e.text, to: e.to })
    return { value: undefined as never }
  })
  on('prompt.submit', ($, e) => {
    seen.sent.push({ text: e.text, asUser: (e.origin as { asUser?: boolean } | undefined)?.asUser })
    return { text: e.text } as never
  })
  // the kill finds the child by its session id, which is in its argv
  on('process.run', ($, e) => {
    seen.kills.push(e.argv)
    const cmd = e.argv.join(' ')
    for (const h of held.filter(x => cmd.includes(x.sideId))) h.release()
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } as never }
  })
  on('process.spawn', async function* ($, e) {
    seen.spawns.push({ argv: e.argv, env: e.env })
    const c = queue.shift() ?? {}
    const sideId = /--session-id (\S+)/.exec(e.argv.join(' '))?.[1] ?? ''
    yield { stream: 'stdout' as const, text: line({ type: 'system', subtype: 'init', session_id: sideId }) }
    if (c.hold === true) {
      await new Promise<void>(resolve => held.push({ sideId, release: resolve }))
      return { value: { code: 1, signal: null } }
    }
    if (c.stderr !== undefined) yield { stream: 'stderr' as const, text: c.stderr }
    if (c.reply !== undefined) yield { stream: 'stdout' as const, text: line({ type: 'assistant', message: { content: [{ type: 'text', text: c.reply }] } }) }
    if (c.isError === true) yield { stream: 'stdout' as const, text: line({ type: 'result', is_error: true, result: 'API Error: overloaded' }) }
    else if (c.reply !== undefined) yield { stream: 'stdout' as const, text: line({ type: 'result', is_error: false, result: c.reply }) }
    return { value: { code: c.exit ?? 0, signal: null } }
  })
  const releaseAll = () => {
    for (const h of held.splice(0)) h.release()
  }
  return { seen, clock, releaseAll }
}

export const TREE_PANE = (bodyRows = 30, surface: 'terminal' | 'desktop' = 'terminal') =>
  ({
    plugin: 'bws-sidechat',
    component: 'Pane',
    requestId: 'decisiontree',
    surface,
    props: { title: 'Decision tree', isFocused: false, bodyColumns: 140, placement: 'dock', scroll: { offset: 0, bodyRows }, view: {} },
  }) as const

export const run = ($: { command: { run: (i: never) => Promise<{ text?: string }> } }, command: string, args = '') => $.command.run({ command, args } as never)

// Lets the queued children's lines be read: each await gives the loop one more step.
export async function settle(clock: { advance: (ms: number) => Promise<void> }, rounds = 20) {
  for (let i = 0; i < rounds; i++) await clock.advance(1)
}

export const sideIdOf = (argv: readonly string[]) => /--session-id (\S+)/.exec(argv.join(' '))?.[1]
export const resumeOf = (argv: readonly string[]) => /--resume (\S+)/.exec(argv.join(' '))?.[1]
