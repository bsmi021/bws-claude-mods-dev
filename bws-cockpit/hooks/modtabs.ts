// The dashboard's mod tabs: every loaded mod gets one, after Assumptions, Shelf, Board and Loop. A mod that publishes
// a `tab` (bws-kit/tab.ts) gets that; one that only publishes a `summary` (bws-kit/summary.ts) gets a small tab built
// from it. These replace the bar's per-mod chips. Pure: no `$`, so tests call it directly.

import { parseSummary } from './kit/summary'
import type { SummaryState } from './kit/summary'
import { makeTab, parseTab, text } from './kit/tab'
import type { ModTab, TabNode } from './kit/tab'

// Atoms are typed per plugin, so the list the option can name is closed.
export const KNOWN_MODS = [
  'bws-memory',
  'bws-diagram',
  'bws-enhance',
  'bws-better',
  'bws-sidechat',
  'bws-secrets',
  'bws-skillgate',
  'bws-notify',
  'bws-shell-lint',
  'bws-interview',
  'bws-direction',
  'bws-summary',
  'bws-agents',
  'bws-inventory',
  'bws-mask',
] as const
export type KnownMod = (typeof KNOWN_MODS)[number]

export const DEFAULT_MODS = KNOWN_MODS.join(',')

// Shown until the mod publishes its own tab.
export const MOD_TITLE: Record<KnownMod, string> = {
  'bws-memory': 'Memory',
  'bws-diagram': 'Diagram',
  'bws-enhance': 'Enhance',
  'bws-better': 'Better',
  'bws-sidechat': 'Side chat',
  'bws-secrets': 'Secrets',
  'bws-skillgate': 'Skillgate',
  'bws-notify': 'Notify',
  'bws-shell-lint': 'Shell lint',
  'bws-interview': 'Interview',
  'bws-direction': 'Direction',
  'bws-summary': 'Summary',
  'bws-agents': 'Agents',
  'bws-inventory': 'Inventory',
  'bws-mask': 'Mask',
}

// `modSummaries` option (the mods that get a tab): names separated by , or ;. Unknown names and repeats are dropped.
export const parseMods = (text: string): KnownMod[] => {
  const out: KnownMod[] = []
  for (const raw of text.split(/[,;]/)) {
    const n = raw.trim().toLowerCase() as KnownMod
    if (KNOWN_MODS.includes(n) && !out.includes(n)) out.push(n)
  }
  return out
}

export type ModTabView = { name: KnownMod; key: string; tab: ModTab }

// The dashboard's tab key for a mod: `mod:bws-diagram`.
export const modKey = (name: KnownMod) => `mod:${name}`
export const modOfKey = (key: string | null): KnownMod | null => {
  const n = key?.startsWith('mod:') ? key.slice(4) : ''
  return KNOWN_MODS.includes(n as KnownMod) ? (n as KnownMod) : null
}

const SUMMARY_TONE: Record<SummaryState, ModTab['tone']> = { idle: 'idle', busy: 'busy', ok: 'ok', warn: 'warn', bad: 'bad' }

// A tab from a summary alone: its label, then its detail.
const summaryTab = (name: KnownMod, raw: unknown): ModTab | null => {
  const s = parseSummary(raw)
  if (s === null) return null
  const body = [text(s.label, { isBold: true }), ...(s.detail ? [text(s.detail, { isDim: true })] : [])]
  return makeTab(MOD_TITLE[name], body, { badge: s.state === 'idle' ? '' : '●', tone: SUMMARY_TONE[s.state] })
}

// One tab per configured mod that is loaded (it published a tab or a summary), in the configured order. An absent or
// malformed atom draws nothing.
export const modTabs = (names: readonly KnownMod[], tabs: Partial<Record<KnownMod, unknown>>, summaries: Partial<Record<KnownMod, unknown>>): ModTabView[] => {
  const out: ModTabView[] = []
  for (const name of names) {
    const tab = parseTab(tabs[name]) ?? summaryTab(name, summaries[name])
    if (tab !== null) out.push({ name, key: modKey(name), tab })
  }
  return out
}

// The strip's label: the title, then the badge.
export const tabLabel = (t: ModTab) => (t.badge ? `${t.title} ${t.badge}` : t.title)

// News from a mod: its `raise` counted up since the last one seen. The first value seen is the baseline, not news.
export const isRaised = (before: number | undefined, after: number) => before !== undefined && after > before

// The key cockpit draws a tab's focused element under (`<plugin>-<id>`: the first input or button marked isFocused,
// cards included), or null. When a mod replaces the element that held the ring (a chat's Ask box re-keyed after each
// question, a working tab's Cancel giving way to Send), the old element and the ring with it are gone; cockpit, which
// draws the dashboard, moves the ring to the new key.
export function focusKeyOf(name: KnownMod, tab: ModTab | null): string | null {
  const find = (nodes: readonly TabNode[]): string | null => {
    for (const n of nodes) {
      if (n.kind === 'input' && n.isFocused === true) return `${name}-${n.id}`
      if (n.kind === 'buttons') {
        const b = n.items.find(x => x.isFocused === true)
        if (b !== undefined) return `${name}-${b.id}`
      }
      if (n.kind === 'card') {
        const inner = find(n.body)
        if (inner !== null) return inner
      }
    }
    return null
  }
  return tab === null ? null : find(tab.body)
}

