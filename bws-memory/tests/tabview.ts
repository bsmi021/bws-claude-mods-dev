// The Memory tab as the tests read it: every tab the mod publishes is recorded, and a stand-in for the old pane mounts
// finds text in one card of the latest tab. A test cannot write bws-cockpit's tabEvent, so a press runs the command
// the button does (Apply: /dream apply; Dismiss and Close: /dream dismiss); the press wiring itself is checked live.
import type { On } from 'claude-code'

type Node =
  | { kind: 'text'; text: string }
  | { kind: 'buttons'; items: { id: string; label: string }[] }
  | { kind: 'card'; title: string; body: Node[] }
  | { kind: 'input' | 'raster' }
export type Tab = { title: string; badge: string; tone: string; raise: number; body: Node[] }

export function recordTabs(on: On) {
  const tabs: Tab[] = []
  on('command.list', () => ({ value: [{ name: 'dashboard' }] as never }))
  on('state.set', { plugin: 'bws-memory', key: 'tab' }, ($, e, next) => {
    tabs.push(JSON.parse(JSON.stringify(e.value)) as Tab)
    return next(e)
  })
  const last = () => tabs[tabs.length - 1]
  return { tabs, last, raised: () => last()?.raise ?? 0 }
}

type Run = (command: string, args: string) => Promise<unknown>

// One card of the latest tab ('Dream' or 'Last memory update'), with the old pane's find / press / unmount.
export function cardView(last: () => Tab | undefined, title: 'Dream' | 'Last memory update', run: Run) {
  const card = () => last()?.body.find((n): n is Extract<Node, { kind: 'card' }> => n.kind === 'card' && n.title === title)
  const texts = () => (card()?.body ?? []).flatMap(n => (n.kind === 'text' ? [n.text] : []))
  const ids = () => (card()?.body ?? []).flatMap(n => (n.kind === 'buttons' ? n.items.map(b => b.id) : []))
  const scope = title === 'Dream' ? 'dream' : 'memory'
  const idOf = (key: string) => (scope === 'dream' ? (key === 'close' ? 'dream-dismiss' : `dream-${key}`) : key === 'close' ? 'memory-ok' : `memory-${key}`)
  return {
    find: async (q: { type?: string; text?: RegExp; key?: string }) => {
      if (q.key !== undefined) return ids().includes(idOf(q.key)) ? { key: q.key } : undefined
      const hit = texts().find(t => (q.text ? q.text.test(t) : true))
      return hit === undefined ? undefined : { text: hit }
    },
    press: async (t: { key: string }) => {
      const id = idOf(t.key)
      if (id === 'dream-apply') await run('dream', 'apply')
      else if (id === 'dream-dismiss') await run('dream', 'dismiss')
    },
    unmount: async () => undefined,
  }
}
