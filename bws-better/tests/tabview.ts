// The Better tab as the tests read it: every tab the mod publishes is recorded, and a stand-in for the old pane mounts
// finds text, buttons and inputs in the latest one (card bodies included). A test cannot write bws-cockpit's tabEvent,
// so a press or an input runs the command twin, `/better --<id> [text]`, which calls the same action; the press wiring
// itself is checked live.
import type { On } from 'claude-code'

type Button = { id: string; label: string }
type Node =
  | { kind: 'text'; text: string }
  | { kind: 'buttons'; items: Button[] }
  | { kind: 'input'; id: string; placeholder: string }
  | { kind: 'card'; title: string; body: Node[] }
  | { kind: 'raster' }
export type Tab = { title: string; badge: string; tone: string; raise: number; show?: number; body: Node[] }

let tabs: Tab[] = []

export function recordTabs(on: On) {
  tabs = []
  on('state.set', { plugin: 'bws-better', key: 'tab' }, ($, e, next) => {
    tabs.push(JSON.parse(JSON.stringify(e.value)) as Tab)
    return next(e)
  })
}

export const lastTab = () => tabs[tabs.length - 1]

const flat = (nodes: readonly Node[]): Node[] => nodes.flatMap(n => (n.kind === 'card' ? [{ kind: 'text', text: n.title } as Node, ...flat(n.body)] : [n]))

type Dollar = { command: { run: (i: never) => Promise<unknown> } }
const matches = (want: string | RegExp | undefined, got: string) => (want === undefined ? true : typeof want === 'string' ? want === got : want.test(got))

export async function mountTab($: Dollar) {
  const nodes = () => flat(lastTab()?.body ?? [])
  const run = (args: string) => $.command.run({ command: 'better', args } as never)
  return {
    find: async (q: { type?: string; text?: string | RegExp; key?: string }) => {
      const ns = nodes()
      if (q.key !== undefined) {
        const b = ns.flatMap(n => (n.kind === 'buttons' ? n.items : [])).find(x => x.id === q.key)
        const input = ns.find(n => n.kind === 'input' && n.id === q.key)
        return b ? { key: b.id, text: b.label } : input ? { key: q.key } : undefined
      }
      if (q.type === 'Button') {
        const b = ns.flatMap(n => (n.kind === 'buttons' ? n.items : [])).find(x => matches(q.text, x.label))
        return b ? { key: b.id, text: b.label } : undefined
      }
      const t = ns.find(n => n.kind === 'text' && matches(q.text, n.text))
      return t && t.kind === 'text' ? { text: t.text } : undefined
    },
    press: async (target: { key: string }) => {
      await run(`--${target.key}`)
    },
    input: async (target: { key: string; text: string }) => {
      await run(`--${target.key} ${target.text}`)
    },
    unmount: async () => undefined,
  }
}
