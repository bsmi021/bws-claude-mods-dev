// The Side chat tab as the tests read it: every tab the mod publishes is recorded, and stand-ins for the old pane
// mounts (the side chat's and the decision tree's) find text, buttons and the Ask box in the latest one. A test cannot
// write bws-cockpit's tabEvent, so a press or an input runs the command twin, `/side --<id> [text]`, which calls the
// same action; the press wiring itself is checked live. The tree's old keys older / newer / close are the tab's
// older-t / newer-t / tree-close.
import type { On } from 'claude-code'

type Button = { id: string; label: string }
type Node = { kind: 'text'; text: string } | { kind: 'buttons'; items: Button[] } | { kind: 'input'; id: string; placeholder: string; isFocused?: boolean } | { kind: 'card'; title: string; body: Node[] } | { kind: 'raster' } | { kind: 'markdown'; text: string } | { kind: 'image'; alt: string }
export type Tab = { title: string; badge: string; tone: string; raise: number; show?: number; open?: number; body: Node[] }
export type Found = { key?: string; text?: string; props?: { label?: string } }

let tabs: Tab[] = []

export function recordTabs(on: On) {
  tabs = []
  on('state.set', { plugin: 'bws-sidechat', key: 'tab' }, ($, e, next) => {
    tabs.push(JSON.parse(JSON.stringify(e.value)) as Tab)
    return next(e)
  })
}

export const lastTab = () => tabs[tabs.length - 1]
export const tabCount = () => tabs.length

type Dollar = { command: { run: (i: never) => Promise<unknown> } }
const TREE_KEYS: Record<string, string> = { older: 'older-t', newer: 'newer-t', close: 'tree-close' }
const matches = (want: string | RegExp | undefined, got: string) => (want === undefined ? true : typeof want === 'string' ? want === got : want.test(got))

function mount($: Dollar, isTree: boolean) {
  const idOf = (key: string) => (isTree ? (TREE_KEYS[key] ?? key) : key)
  // Cards opened up: their title and body in order, a markdown node read as text.
  const flat = (ns: Node[]): Node[] =>
    ns.flatMap((n): Node[] => (n.kind === 'card' ? [{ kind: 'text', text: n.title }, ...flat(n.body)] : n.kind === 'markdown' ? [{ kind: 'text', text: n.text }] : [n]))
  const body = () => flat(lastTab()?.body ?? [])
  const buttonsOf = () => body().flatMap(n => (n.kind === 'buttons' ? n.items : []))
  const asFound = (b: Button): Found => ({ key: b.id, text: b.label, props: { label: b.label } })
  const run = (args: string) => $.command.run({ command: 'side', args } as never)
  return {
    find: async (q: { type?: string; text?: string | RegExp; key?: string }): Promise<Found | undefined> => {
      if (q.type === 'Input') {
        const input = body().find(n => n.kind === 'input')
        return input && input.kind === 'input' ? { key: input.id } : undefined
      }
      if (q.key !== undefined) {
        const b = buttonsOf().find(x => x.id === idOf(q.key as string))
        if (b) return asFound(b)
        const input = body().find(n => n.kind === 'input' && n.id === q.key)
        return input ? { key: q.key } : undefined
      }
      if (q.type === 'Button') {
        const b = buttonsOf().find(x => matches(q.text, x.label))
        return b ? asFound(b) : undefined
      }
      const t = body().find(n => n.kind === 'text' && matches(q.text, n.text))
      return t && t.kind === 'text' ? { text: t.text } : undefined
    },
    findAll: async (q: { type: string }): Promise<Found[]> =>
      q.type === 'Button' ? buttonsOf().map(asFound) : body().flatMap(n => (n.kind === 'text' ? [{ text: n.text }] : [])),
    press: async (target: { key: string }) => {
      await run(`--${idOf(target.key)}`)
    },
    input: async (target: { key: string; text: string }) => {
      await run(`--${target.key} ${target.text}`)
    },
    drawn: async () => undefined,
    unmount: async () => undefined,
  }
}

export const mountChat = ($: Dollar) => Promise.resolve(mount($, false))
export const mountTree = ($: Dollar) => Promise.resolve(mount($, true))
