// bws-skillgate's logic, pure (no `$`): parse the engine's skill listing, ask which skills fit a prompt, cut the
// listing to those, and say what the cut saved. register.tsx does the I/O. See runs/2026-10-13-mods-m3-skillgate/
// DECISIONS.md for why the listing is cut once per conversation and later prompts only add.

import { makeSummary } from './kit/summary'
import type { ModSummary } from './kit/summary'
import { buttons, card, makeTab, text } from './kit/tab'
import type { ModTab } from './kit/tab'

export const PLUGIN = 'bws-skillgate'
export const TIMEOUT_MS = 4000
export const DEFAULT_TOP_K = 5
export const MAX_TOP_K = 20
// What the classifier is shown of each description, and of the prompt.
const DESCRIPTION_CHARS = 240
const PROMPT_CHARS = 4000
// How many conversations' cuts $.store keeps, so a re-asked listing gets the same bytes.
export const KEPT_GATES = 20

export type Mode = 'off' | 'on'

// One skill in the listing: its name and its whole entry, `- name: description` plus any continuation lines.
export type Entry = { name: string; text: string }

export type Listing = { head: string[]; entries: Entry[] }

// What a conversation's gate remembers: each listing row the engine sent (by hash) with the text it was answered with,
// every skill the rows carried, and the names the model has been shown so far.
export type GateRecord = {
  session: string
  rows: { hash: string; sent: string }[]
  entries: Entry[]
  shown: string[]
}

// The last gated prompt, for /skillgate explain and the summary atom.
export type LastPick = {
  step: 'listing' | 'added'
  picks: string[] // the classifier's answer, most relevant first
  named: string[] // skills the prompt named with /name
  added: string[] // what this prompt put in front of the model (the cut, or the added block)
  shown: number
  total: number
  savedTokens: number
  failed: string | null // why the full listing stayed, or null
}

export const parseMode = (v: unknown): Mode | null => {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : ''
  return s === 'off' || s === 'on' ? s : null
}

export const parseTopK = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim())
  return Number.isInteger(n) && n >= 1 ? Math.min(n, MAX_TOP_K) : DEFAULT_TOP_K
}

// `- name: description`; a plugin skill's name has a colon of its own (`plugin:skill`), so the name ends at the first
// colon followed by a space.
const ENTRY = /^- (\S+?):(?:\s|$)/

// The listing as the engine writes it: a head (the "The following skills ..." line and a blank line), then one entry
// per skill. A line that does not start an entry continues the one before it. Null when no entry is found.
export function parseListing(text: string): Listing | null {
  const head: string[] = []
  const entries: { name: string; lines: string[] }[] = []
  for (const line of text.split('\n')) {
    const m = ENTRY.exec(line)
    if (m?.[1]) entries.push({ name: m[1], lines: [line] })
    else if (entries.length > 0) entries[entries.length - 1]!.lines.push(line)
    else head.push(line)
  }
  if (entries.length === 0) return null
  return { head, entries: entries.map(x => ({ name: x.name, text: x.lines.join('\n') })) }
}

// The listing with only the kept skills, in the listing's own order, so the same set always gives the same bytes.
export function cutListing(l: Listing, keep: readonly string[]): string {
  const set = new Set(keep)
  return [...l.head, ...l.entries.filter(x => set.has(x.name)).map(x => x.text)].join('\n')
}

// Skills the prompt names as `/name`, in the order of `names`.
export function namedSkills(prompt: string, names: readonly string[]): string[] {
  const said = new Set<string>()
  for (const m of prompt.matchAll(/(?:^|[\s(`"'])\/([A-Za-z0-9][\w:.-]*)/g)) said.add((m[1] ?? '').replace(/[.:]+$/, ''))
  return names.filter(n => said.has(n))
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

export const CLASSIFY_SYSTEM =
  "You choose which of a coding assistant's skills fit the user's request. Answer with only a JSON array of skill " +
  'names copied exactly from the list, most relevant first. Answer [] when none fits. No other text.'

// The one small-model call's prompt: the skills (name and description), the limit, then the request as data.
export function classifyPrompt(prompt: string, entries: readonly Entry[], topK: number): string {
  const skills = entries.map(x => clip(x.text.replace(/\s+/g, ' ').trim(), DESCRIPTION_CHARS)).join('\n')
  return [
    `<skills>\n${skills}\n</skills>`,
    `Pick at most ${topK} skills from <skills> that the request below needs.`,
    `<request>\n${clip(prompt.trim(), PROMPT_CHARS)}\n</request>`,
  ].join('\n\n')
}

// The classifier's answer: the first JSON array of names in it, filtered to known skills (a leading / is dropped),
// de-duplicated, cut to topK. Null when there is no readable array: the caller then keeps the full listing.
export function parsePicks(text: string, names: readonly string[], topK: number): string[] | null {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start < 0 || end < start) return null
  let raw: unknown
  try {
    raw = JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
  if (!Array.isArray(raw)) return null
  const known = new Set(names)
  const out: string[] = []
  for (const v of raw) {
    if (typeof v !== 'string') continue
    const n = v.trim().replace(/^\//, '')
    if (known.has(n) && !out.includes(n)) out.push(n)
  }
  return out.slice(0, topK)
}

// The block a later prompt carries for skills the model has not been shown yet, in the listing's format.
export const ADDED_HEAD = 'More skills are available for use with the Skill tool:'
export const addedBlock = (entries: readonly Entry[]): string => [ADDED_HEAD, '', ...entries.map(x => x.text)].join('\n')

// A stable short hash (FNV-1a, 32 bits) of a listing row, to know a row the engine asks about again.
export function hashText(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

// The estimate the spec asks for: characters / 4.
export const tokens = (chars: number) => Math.max(0, Math.round(chars / 4))

// Characters of the listing the model was spared: every entry's text not shown, as the full listing would have had it.
export function savedChars(entries: readonly Entry[], shown: readonly string[]): number {
  const set = new Set(shown)
  return entries.filter(x => !set.has(x.name)).reduce((n, x) => n + x.text.length + 1, 0)
}

// Adds a listing row's skills to the record (a name already known keeps its first entry).
export function mergeEntries(old: readonly Entry[], more: readonly Entry[]): Entry[] {
  const names = new Set(old.map(x => x.name))
  return [...old, ...more.filter(x => !names.has(x.name))]
}

// The kept records, this one last, at most KEPT_GATES.
export function keepGate(all: readonly GateRecord[], rec: GateRecord): GateRecord[] {
  return [...all.filter(r => r.session !== rec.session), rec].slice(-KEPT_GATES)
}

// Reads $.store's value back; anything malformed is dropped rather than trusted.
export function parseGates(v: unknown): GateRecord[] {
  if (!Array.isArray(v)) return []
  const str = (x: unknown): x is string => typeof x === 'string'
  return v.filter((r): r is GateRecord => {
    if (typeof r !== 'object' || r === null) return false
    const o = r as Record<string, unknown>
    return (
      str(o.session) &&
      Array.isArray(o.rows) &&
      o.rows.every(x => typeof x === 'object' && x !== null && str((x as Record<string, unknown>).hash) && str((x as Record<string, unknown>).sent)) &&
      Array.isArray(o.entries) &&
      o.entries.every(x => typeof x === 'object' && x !== null && str((x as Record<string, unknown>).name) && str((x as Record<string, unknown>).text)) &&
      Array.isArray(o.shown) &&
      o.shown.every(str)
    )
  })
}

// The one debug line a failure writes (FR-ALL-03). It never carries the prompt.
export const failLine = (step: 'listing' | 'prompt', reason: string) =>
  `${PLUGIN}: ${step} gate failed (${reason}); ${step === 'listing' ? 'the full skill listing stays' : 'nothing was added'}`

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

export function statusText(mode: Mode, isSession: boolean, topK: number, model: string, last: LastPick | null): string {
  const lines = [
    `Skill gate: ${mode} (${isSession ? 'set for this session with /skillgate' : 'from the plugin option'}). Top ${topK}, model ${model}.`,
  ]
  if (last === null) lines.push(mode === 'on' ? 'No prompt gated yet in this conversation.' : 'The model sees the full skill listing.')
  else if (last.failed !== null) lines.push(`Last prompt: the full listing stayed (${last.failed}).`)
  else lines.push(`Listing: ${last.shown} of ${plural(last.total, 'skill')} shown, about ${last.savedTokens} tokens saved.`)
  if (mode === 'on') lines.push('The listing is cut on the first prompt of a conversation; later prompts can only add skills.')
  return lines.join('\n')
}

export function explainText(last: LastPick | null): string {
  if (last === null) return "No prompt gated yet in this conversation. While the gate is on, it cuts the listing on a conversation's first prompt."
  if (last.failed !== null) return `The last prompt kept the full skill listing: ${last.failed}.`
  const list = (xs: readonly string[]) => (xs.length ? xs.join(', ') : 'none')
  return [
    `Picks for the last prompt, most relevant first: ${list(last.picks)}.`,
    `Named with /name: ${list(last.named)}.`,
    last.step === 'listing' ? `The listing was cut to: ${list(last.added)}.` : `Added for this prompt: ${list(last.added)}.`,
    `Shown to the model: ${last.shown} of ${plural(last.total, 'skill')}. Tokens saved: about ${last.savedTokens} (characters / 4).`,
  ].join('\n')
}

// The dashboard tab (bws-kit/tab.ts): the status and the last picks, with the on/off switch for this session.
export function gateTab(mode: Mode, isSession: boolean, topK: number, model: string, last: LastPick | null): ModTab {
  const isWarn = mode === 'on' && last !== null && last.failed !== null
  return makeTab(
    'Skillgate',
    [
      ...statusText(mode, isSession, topK, model, last)
        .split('\n')
        .map((l, i) => text(l, i === 0 ? { isBold: true } : { isDim: true })),
      card('Last prompt', explainText(last).split('\n').map(l => text(l)), isWarn ? 'warn' : undefined),
      mode === 'on' ? buttons({ id: 'off', label: 'Turn off for this session' }) : buttons({ id: 'on', label: 'Turn on for this session', isPrimary: true }),
    ],
    { badge: mode, tone: mode === 'off' ? 'idle' : isWarn ? 'warn' : 'ok' },
  )
}

// The summary atom (FR-ALL-05): nothing when off; the share shown and the saving while on; warn after a fail-open.
export function gateSummary(mode: Mode, last: LastPick | null): ModSummary | null {
  if (mode === 'off') return null
  if (last === null) return makeSummary('ok', 'skills: gate on')
  if (last.failed !== null) return makeSummary('warn', 'skills: full list', last.failed)
  return makeSummary('ok', `skills ${last.shown}/${last.total} -${last.savedTokens} tok`, `picks: ${last.picks.join(', ') || 'none'}`)
}
