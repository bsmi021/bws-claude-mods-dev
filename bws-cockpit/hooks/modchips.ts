// The action bar's chips for the video-derived mods (bws-memory, bws-diagram, bws-skillgate, bws-secrets): each
// publishes a `summary` atom; a loaded, non-idle mod gets one chip. Pure: no `$`, so tests call it directly.

import { isShown, parseSummary } from './kit/summary'
import type { SummaryState } from './kit/summary'

// Atoms are typed per plugin, so the list the option can name is closed: these four.
export const KNOWN_MODS = ['bws-memory', 'bws-diagram', 'bws-skillgate', 'bws-secrets'] as const
export type KnownMod = (typeof KNOWN_MODS)[number]

export const DEFAULT_MODS = KNOWN_MODS.join(',')

// `modSummaries` option: names separated by , or ;. Unknown names and repeats are dropped.
export const parseMods = (text: string): KnownMod[] => {
  const out: KnownMod[] = []
  for (const raw of text.split(/[,;]/)) {
    const n = raw.trim().toLowerCase() as KnownMod
    if (KNOWN_MODS.includes(n) && !out.includes(n)) out.push(n)
  }
  return out
}

export type ModChip = { name: KnownMod; label: string; detail: string; color: 'success' | 'warning' | 'error' | undefined; isDim: boolean }

const COLOR: Record<SummaryState, ModChip['color']> = { idle: undefined, busy: undefined, ok: 'success', warn: 'warning', bad: 'error' }

// One chip per configured mod whose summary is present and not idle, in the configured order. An absent atom (the
// plugin is not loaded) or a malformed one draws nothing.
export const modChips = (names: readonly KnownMod[], raw: Partial<Record<KnownMod, unknown>>): ModChip[] => {
  const chips: ModChip[] = []
  for (const name of names) {
    const s = parseSummary(raw[name])
    if (!isShown(s)) continue
    chips.push({ name, label: s.label, detail: s.detail ?? '', color: COLOR[s.state], isDim: s.state === 'busy' })
  }
  return chips
}
