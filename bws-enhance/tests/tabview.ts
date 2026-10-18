// The Enhance tab as the tests read it: every tab the mod publishes is recorded, and a stand-in for the old pane mounts
// finds text and buttons in the latest one. A test cannot write bws-cockpit's tabEvent, so a press runs the command the
// button has (`/enhance --<id>`), which calls the same action; the press wiring itself is checked live.
import type { On } from 'claude-code'

type Node = { kind: 'text'; text: string } | { kind: 'buttons'; items: { id: string; label: string; hotkey?: string }[] } | { kind: 'card' | 'input' | 'raster' }
export type Tab = { title: string; badge: string; tone: string; raise: number; show?: number; body: Node[] }

let tabs: Tab[] = []

export function recordTabs(on: On) {
  tabs = []
  on('state.set', { plugin: 'bws-enhance', key: 'tab' }, ($, e, next) => {
    tabs.push(JSON.parse(JSON.stringify(e.value)) as Tab)
    return next(e)
  })
}

export const lastTab = () => tabs[tabs.length - 1]

type Dollar = { command: { run: (i: never) => Promise<unknown> } }

export async function mountTab($: Dollar) {
  const t = lastTab()
  const texts = (t?.body ?? []).flatMap(n => (n.kind === 'text' ? [n.text] : []))
  const buttons = (t?.body ?? []).flatMap(n => (n.kind === 'buttons' ? n.items : []))
  return {
    find: async (q: { type?: string; text?: RegExp; key?: string }) => {
      if (q.key !== undefined) return buttons.find(b => b.id === q.key)
      const hit = texts.find(x => (q.text ? q.text.test(x) : true))
      return hit === undefined ? undefined : { text: hit }
    },
    press: async (target: { key: string }) => {
      await $.command.run({ command: 'enhance', args: `--${target.key}` } as never)
    },
    unmount: async () => undefined,
  }
}
