// The diagram pane's logic (FR-DG-03 to FR-DG-05): what a turn counts as, when it is looked at, what the classifier
// and the fork are asked, and the board (the list of diagrams) the pane shows. Pure: no `$`.
import type { Board, Diagram, Entry } from '../types'
import { makeSummary, type ModSummary } from './kit/summary'
import { MAX_PINS_PER_REPLY, mermaidBlocks, parseMermaid } from './mermaid'
import { MAX_NODES } from './spec'

export const PLUGIN = 'bws-diagram'
export const CLASSIFY_TIMEOUT_MS = 15_000
export const FORK_TIMEOUT_MS = 90_000
export const MAX_ENTRIES = 20

// ---------- the turn ----------

export type Row = { role: 'user' | 'assistant'; text: string; toolUses: { tool: string; input?: Record<string, unknown> }[]; hasToolResults?: boolean }
export type Counts = { toolCalls: number; files: string[]; seconds: number; words: number }

export const EDIT_TOOLS: readonly string[] = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']

const pathOf = (input: Record<string, unknown> | undefined): string => {
  const p = input?.file_path ?? input?.notebook_path ?? input?.path
  return typeof p === 'string' ? p : ''
}

/** The last turn's counts: tool calls and edited files since the last prompt the user typed, its length, the answer's words. */
export function turnCounts(rows: readonly Row[], durationMs: number, answer: string): Counts {
  let start = 0
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i]!
    if (r.role === 'user' && !r.hasToolResults && r.text.trim() !== '') {
      start = i + 1
      break
    }
  }
  let toolCalls = 0
  const files: string[] = []
  for (const r of rows.slice(start)) {
    for (const t of r.toolUses) {
      toolCalls++
      const p = pathOf(t.input)
      if (EDIT_TOOLS.includes(t.tool) && p && !files.includes(p)) files.push(p)
    }
  }
  const words = answer.trim() === '' ? 0 : answer.trim().split(/\s+/).length
  return { toolCalls, files, seconds: Math.round(durationMs / 1000), words }
}

export type SkipInput = { autoDiagram: boolean; isHeadless: boolean; agentId?: string; reason: string; isRunning: boolean; toolCalls: number }

/** Why a finished turn is not looked at, or null when the classifier should see it. A turn with no tool calls costs no call. */
export function skipReason(s: SkipInput): string | null {
  if (!s.autoDiagram) return 'autoDiagram is off'
  if (s.isHeadless) return 'headless'
  if (s.agentId) return 'a subagent turn'
  if (s.reason !== 'answer') return `the turn ended: ${s.reason}`
  if (s.isRunning) return 'a diagram is already being drawn'
  if (s.toolCalls === 0) return 'no tool calls'
  return null
}

export const CLASSIFY_QUESTION =
  'A coding assistant just finished a turn. The counts below describe it. Is it big enough that a diagram of what ' +
  'happened (the steps taken, the files touched, new components, decisions) would help the user follow it? Answer ' +
  'yes for multi-step work across several files or many tool calls; no for a small edit, a lookup, a question or chat.'

/** What the classifier is shown: the counts alone (no prompt or file contents). */
export const classifyMaterial = (c: Counts): string =>
  [`Tool calls: ${c.toolCalls}`, `Files edited: ${c.files.length}`, `Turn length: ${c.seconds} s`, `Answer words: ${c.words}`].join('\n')

/** The fork's prompt: the last turn, or the whole session (/diagram). */
export function forkPrompt(scope: 'turn' | 'session'): string {
  const what = scope === 'turn' ? 'what happened in the last turn (since my last message)' : 'what happened in this whole session so far'
  return [
    `Draw ${what} as a small diagram for a side pane. Do not use any tools. Reply with only one JSON object:`,
    '{"title": "...", "nodes": [{"id": "n1", "label": "...", "kind": "step"}], "edges": [{"from": "n1", "to": "n2", "label": "..."}], "now": "n2"}',
    `Kinds: "step" for an action taken, "file" for an existing file touched, "new" for a new component or file created, "decision" for a choice made. At most ${MAX_NODES} nodes (prefer 6 to 12).`,
    'Labels: at most 20 characters, plain ASCII (file names without folders). Edges run in the order things happened or depend; edge labels are optional and short. Title: at most 40 characters.',
    '"now" is the id of the node where things stand now (the last step taken); leave it out if there is none.',
  ].join('\n')
}

// ---------- the board ----------

export const EMPTY_BOARD: Board = { entries: [], shown: 0, phase: 'idle', note: '', nextId: 1 }

/** The board with `e` added last (the oldest dropped past 20) and shown. */
export function addEntry(b: Board, e: Omit<Entry, 'id'>): Board {
  const entries = [...b.entries, { ...e, id: b.nextId }].slice(-MAX_ENTRIES)
  return { ...b, entries, shown: entries.length - 1, nextId: b.nextId + 1 }
}

/** What makes two pins the same diagram: the nodes (label and kind, in order) and the edges between them, whatever the ids, header or spacing; source text, whitespace squeezed, when there is no diagram. */
export function pinKey(e: Pick<Entry, 'diagram' | 'source'>): string {
  const d = e.diagram
  if (d === null) return `source:${e.source.trim().replace(/\s+/g, ' ')}`
  const at = new Map(d.nodes.map((n, i) => [n.id, i]))
  return JSON.stringify([d.nodes.map(n => [n.label, n.kind]), d.edges.map(x => [at.get(x.from), at.get(x.to), x.label ?? ''])])
}

/** The board with the pin `e` added last and shown, replacing an earlier pin of the same diagram. */
export function addPin(b: Board, e: Omit<Entry, 'id'>): Board {
  const key = pinKey(e)
  const kept = b.entries.filter(x => x.origin !== 'pinned' || pinKey(x) !== key)
  return addEntry({ ...b, entries: kept }, e)
}

/** Previous (-1) or next (+1), clamped to the list. */
export function move(b: Board, delta: number): Board {
  if (b.entries.length === 0) return { ...b, shown: 0 }
  return { ...b, shown: Math.max(0, Math.min(b.entries.length - 1, b.shown + delta)) }
}

/** The entry the pane shows, or null with none. */
export const shownEntry = (b: Board): Entry | null => b.entries[Math.max(0, Math.min(b.entries.length - 1, b.shown))] ?? null

/** An entry for a drawn spec. */
export const diagramEntry = (origin: 'auto' | 'session', d: Diagram, at: number, turn?: number): Omit<Entry, 'id'> => ({ origin, at, title: d.title, diagram: d, source: '', ...(turn === undefined ? {} : { turn }) })

const count = (b: Board, pinned: boolean) => b.entries.filter(e => (e.origin === 'pinned') === pinned).length

/** The summary atom (FR-ALL-05): null with nothing to show; busy while a fork draws; warn after a failure. */
export function boardSummary(b: Board): ModSummary | null {
  if (b.phase === 'working') return makeSummary('busy', 'diagram drawing')
  if (b.phase === 'error') return makeSummary('warn', 'diagram failed', b.note)
  if (b.entries.length === 0) return null
  const pins = count(b, true), drawn = count(b, false)
  const parts = [drawn ? `${drawn} diagram${drawn === 1 ? '' : 's'}` : '', pins ? `${pins} pinned` : ''].filter(Boolean)
  return makeSummary('ok', parts.join(', '))
}

/** `/diagram status`: the option, the drawn diagrams, then the pinned ones; `>` marks the one the pane shows. */
export function statusText(b: Board, autoDiagram: boolean): string {
  const lines = [`Diagram: autoDiagram ${autoDiagram ? 'on' : 'off'}; ${count(b, false)} drawn, ${count(b, true)} pinned.`]
  if (b.phase === 'working') lines.push('A diagram is being drawn.')
  if (b.phase === 'error') lines.push(`Last attempt failed: ${b.note}`)
  const item = (e: Entry, i: number) => {
    const what = e.diagram ? `${e.diagram.nodes.length} nodes, ${e.diagram.edges.length} edges` : 'source text, not drawable'
    return `${i === b.shown ? '>' : ' '} ${i + 1}. ${e.origin === 'pinned' ? '' : `${e.origin}: `}${e.title} (${what})`
  }
  const drawn = b.entries.flatMap((e, i) => (e.origin === 'pinned' ? [] : [item(e, i)]))
  const pinned = b.entries.flatMap((e, i) => (e.origin === 'pinned' ? [item(e, i)] : []))
  if (drawn.length) lines.push('Diagrams:', ...drawn)
  if (pinned.length) lines.push('Pinned diagrams:', ...pinned)
  return lines.join('\n')
}

const MAX_SOURCE = 4000

/** The pins a reply adds: each fenced mermaid block (five at most) whose exact text is not already pinned, parsed or kept as source text. The board replaces an earlier pin of the same diagram (`addPin`). */
export function pinsFrom(answer: string, at: number, existing: readonly Entry[], turn?: number): Omit<Entry, 'id'>[] {
  const known = new Set(existing.filter(e => e.origin === 'pinned').map(e => e.source))
  const out: Omit<Entry, 'id'>[] = []
  for (const block of mermaidBlocks(answer).slice(0, MAX_PINS_PER_REPLY)) {
    const source = block.slice(0, MAX_SOURCE)
    if (known.has(source)) continue
    known.add(source)
    const p = parseMermaid(block)
    const t = turn === undefined ? {} : { turn }
    out.push(p.ok ? { origin: 'pinned', at, title: p.diagram.title, diagram: p.diagram, source, ...t } : { origin: 'pinned', at, title: `Pinned mermaid (${p.kind})`.slice(0, 40), diagram: null, source, ...t })
  }
  return out
}

/** The one debug line for a failure: the step and the reason, never the prompt or the model's text. */
export const failLine = (step: string, reason: string) => `${PLUGIN}: ${step} failed (${reason}); continuing unchanged`

// ---------- the pane ----------

/** How many messages the person has sent: the turn a diagram is drawn at. */
export const turnNumber = (rows: readonly Row[]): number => rows.filter(r => r.role === 'user' && !r.hasToolResults && r.text.trim() !== '').length

/** The footer under the drawing: where and when it was made. */
export function footerOf(e: Entry): string {
  const what = e.origin === 'pinned' ? 'pinned' : 'map drawn'
  return e.turn === undefined ? what : `${what} at turn ${e.turn}`
}

/** The pane's heading: the shown diagram's title, where it is in the list, and where it came from. */
export function heading(b: Board): string {
  const e = shownEntry(b)
  if (!e) return 'No diagrams yet'
  const from = e.origin === 'auto' ? 'last turn' : e.origin === 'session' ? 'session' : 'pinned'
  return `${e.title}  ${Math.min(b.shown, b.entries.length - 1) + 1}/${b.entries.length}  (${from})`
}

// ---------- kept per conversation ($.store) ----------

export const KEPT_SESSIONS = 10

type Kept = Record<string, { at: number; entries: Entry[]; shown: number; nextId: number }>

const keptOf = (v: unknown): Kept => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Kept) : {})

/** The store's value with this conversation's board saved (entries only; the newest 10 conversations kept). */
export function keepBoard(stored: unknown, session: string, b: Board, at: number): Kept {
  const all: Kept = { ...keptOf(stored), [session]: { at, entries: b.entries, shown: b.shown, nextId: b.nextId } }
  const newest = Object.entries(all).sort((x, y) => y[1].at - x[1].at).slice(0, KEPT_SESSIONS)
  return Object.fromEntries(newest)
}

/** The board a conversation left, or the empty board; anything malformed is the empty board. */
export function keptBoard(stored: unknown, session: string): Board {
  const k = keptOf(stored)[session]
  if (!k || !Array.isArray(k.entries)) return EMPTY_BOARD
  const entries = k.entries.filter(e => typeof e === 'object' && e !== null && typeof e.title === 'string').slice(-MAX_ENTRIES)
  const nextId = typeof k.nextId === 'number' ? k.nextId : entries.length + 1
  const shown = typeof k.shown === 'number' ? Math.max(0, Math.min(entries.length - 1, k.shown)) : entries.length - 1
  return { entries, shown: Math.max(0, shown), phase: 'idle', note: '', nextId }
}
