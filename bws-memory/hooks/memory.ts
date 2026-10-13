// bws-memory's logic, pure (no `$`): what is worth classifying, the prompts, reading the fork's JSON, redaction,
// the de-duplicating write plan, the one-deep undo record, `sources.json`, and the texts the commands print.
// register.tsx does the I/O. A tool-less fork cannot write files, so the mod writes them (FR-MEM-02).

import { makeSummary } from './kit/summary'
import type { ModSummary } from './kit/summary'
import type { View, Written } from '../types'
import { words } from './kit/transcript'
import type { TranscriptRow } from './kit/transcript'

export const PLUGIN = 'bws-memory'
export const CLASSIFY_TIMEOUT_MS = 15_000
export const FORK_TIMEOUT_MS = 90_000
export const DEFAULT_MIN_WORDS = 8
export const INDEX_FILE = 'MEMORY.md'
export const SOURCES_FILE = 'sources.json'
export const UNDO_FILE = '.undo/last.json'
export const LISTED_WRITES = 20
const KEPT_SOURCES = 200
const MAX_ENTRIES = 5
const MAX_BODY = 4000
const MAX_DESCRIPTION = 200
const MAX_EXISTING = 60
const EXISTING_TEXT = 1500
const EXCHANGE_CHARS = 6000

export const MEM_TYPES = ['user', 'feedback', 'project', 'reference'] as const
export type MemType = (typeof MEM_TYPES)[number]

// One memory the fork proposed, after validation.
export type Entry = { file: string; name: string; description: string; type: MemType; body: string }
// A file already in the memory folder.
export type Existing = { file: string; name: string; description: string; text: string }

export type ChangeKind = 'new' | 'update' | 'duplicate'
export type Change = { file: string; kind: ChangeKind; before: string | null; after: string; added: number; removed: number; name: string }

export const IDLE_VIEW: View = { phase: 'idle', written: [], note: '' }

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 3)}...` : s)
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()

export const parseMinWords = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number.parseInt(String(v ?? ''), 10)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_MIN_WORDS
}

// ---------- when to look at a turn (FR-MEM-01) ----------

export type Exchange = { user: string; userWords: number; tools: number; material: string }

// The turn that just ended: the last typed user message, the tool calls after it and the assistant's final answer.
export function exchangeOf(rows: readonly TranscriptRow[], answer: string): Exchange {
  let at = -1
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i]
    if (r && r.role === 'user' && r.text.trim() !== '') {
      at = i
      break
    }
  }
  const user = at < 0 ? '' : (rows[at]?.text ?? '').trim()
  const tools = rows.slice(at < 0 ? 0 : at + 1).reduce((n, r) => n + (r.toolUses?.length ?? 0), 0)
  const material = `USER: ${clip(user, 3000)}\n\nASSISTANT: ${clip(answer.trim(), 3000)}`
  return { user, userWords: words(user), tools, material: material.slice(0, EXCHANGE_CHARS) }
}

export type SkipInput = {
  isHeadless: boolean
  agentId: string | undefined
  reason: string
  isRunning: boolean
  userWords: number
  tools: number
  minWords: number
}

// Why a turn is not looked at, or null to look at it. A short turn with no tools is chatter; a subagent's turn is not
// the user's; a turn that did not end in an answer has nothing to remember.
export function skipReason(i: SkipInput): string | null {
  if (i.isHeadless) return 'headless'
  if (i.agentId !== undefined) return 'subagent'
  if (i.reason !== 'answer') return `turn ended ${i.reason}`
  if (i.isRunning) return 'a memory update is running'
  if (i.userWords < i.minWords && i.tools === 0) return 'short turn, no tools'
  return null
}

// ---------- the prompts ----------

export const CLASSIFY_QUESTION =
  'In this exchange, did the user say something worth remembering in later sessions: a preference, a correction of how to work, a fact about them or their role, a decision, a constraint, or a pointer to an outside resource, that is not obvious from the code itself? Ordinary task instructions for this one request are not worth remembering. Answer yes or no.'

export const existingList = (existing: readonly Existing[]): string =>
  existing.length === 0
    ? '(none yet)'
    : existing
        .slice(0, MAX_EXISTING)
        .map(e => `- ${e.file}: ${e.name} - ${clip(e.description, 140)}`)
        .join('\n')

const FORMAT = `Reply with JSON only, no prose and no code fence: {"entries":[{"file":"short-kebab-slug","name":"short-kebab-slug","description":"one line saying when this memory is relevant","type":"user|feedback|project|reference","body":"the fact; for feedback and project add a line starting \\"Why:\\" and a line starting \\"How to apply:\\""}]}
Types: user = who the user is and how they like to work; feedback = guidance on how to work, corrections and confirmed approaches; project = ongoing work, goals and constraints not visible in the code; reference = pointers to outside resources.
Rules: at most ${MAX_ENTRIES} entries, each one fact. Never include a key, token, password or other secret. Do not store what the code, git history or the project's instruction files already say. If an existing file already covers a fact, reuse its exact file name so it is updated, not duplicated. If nothing is worth keeping, reply {"entries":[]}.`

export const forkPrompt = (existing: readonly Existing[], forced?: string): string =>
  `${forced === undefined ? 'From the exchange you just had with the user, write the memory entries worth keeping for later sessions.' : `The user asked you to remember this: <remember>${forced}</remember>\nWrite it as a memory entry (one, or a few if it holds several facts), using the conversation for context.`}\n\nExisting memory files (file: name - description):\n${existingList(existing)}\n\n${FORMAT}`

// For /remember when there is no conversation to fork: the text alone.
export const textOnlyPrompt = (existing: readonly Existing[], text: string): string => forkPrompt(existing, text)

// ---------- reading the fork's reply ----------

export const slugify = (s: string): string => {
  const slug = s
    .toLowerCase()
    .replace(/\.md$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '')
  // MEMORY.md is the index; on a case-insensitive disk `memory.md` would be the same file.
  return slug === 'memory' ? 'memory-note' : slug
}

const asType = (v: unknown): MemType | null => {
  const t = typeof v === 'string' ? v.trim().toLowerCase() : ''
  return (MEM_TYPES as readonly string[]).includes(t) ? (t as MemType) : null
}

// The JSON value inside a reply: bare, fenced, or with a sentence around it. undefined when there is none.
export function jsonOf(text: string): unknown {
  const t = text.trim().replace(/^```[a-z]*\s*/i, '').replace(/\s*```\s*$/, '')
  const tries = [t]
  const o = t.indexOf('{')
  const a = t.indexOf('[')
  const start = o < 0 ? a : a < 0 ? o : Math.min(o, a)
  if (start >= 0) tries.push(t.slice(start, Math.max(t.lastIndexOf('}'), t.lastIndexOf(']')) + 1))
  for (const s of tries) {
    try {
      return JSON.parse(s)
    } catch {}
  }
  return undefined
}

export type Parsed = { entries: Entry[]; rejected: number } | null

// null when the reply holds no entries array at all (unparsable); otherwise the valid entries and how many were dropped.
export function parseEntries(text: string): Parsed {
  const v = jsonOf(text)
  const list = Array.isArray(v) ? v : v && typeof v === 'object' && Array.isArray((v as { entries?: unknown }).entries) ? (v as { entries: unknown[] }).entries : null
  if (list === null) return null
  const entries: Entry[] = []
  let rejected = 0
  for (const raw of list.slice(0, MAX_ENTRIES * 2)) {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    const name = typeof r.name === 'string' ? slugify(r.name) : ''
    const file = slugify(typeof r.file === 'string' && r.file.trim() !== '' ? r.file : name)
    const description = typeof r.description === 'string' ? clip(oneLine(r.description), MAX_DESCRIPTION) : ''
    const type = asType(r.type)
    const body = typeof r.body === 'string' ? r.body.trim().slice(0, MAX_BODY) : ''
    if (!name || !file || !description || !type || !body || entries.length >= MAX_ENTRIES || entries.some(e => e.file === `${file}.md`)) {
      rejected++
      continue
    }
    entries.push({ file: `${file}.md`, name, description, type, body })
  }
  return { entries, rejected }
}

// ---------- redaction (FR-MEM-03) ----------

// Shapes of keys, tokens and passwords. The `key = value` form keeps the key and replaces the value.
const SECRET_SHAPES: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  /\bAIza[0-9A-Za-z_-]{30,}/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi,
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/gi,
]
const SECRET_ASSIGN = /\b((?:[a-z0-9_-]*(?:password|passwd|pwd|secret|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key|credential)[a-z0-9_-]*)\s*(?:[:=]|\bis\b)\s*)(["']?)([^\s"',;]{4,})\2/gi
// A long mixed-case token with digits: key-shaped even without a label.
const TOKEN_SHAPE = /\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[a-z])(?=[A-Za-z0-9_-]*[A-Z])[A-Za-z0-9_-]{32,}\b/g

export const REDACTED = '[redacted]'

export type Redaction = { text: string; hits: number; chars: number }

// `chars` counts the characters of secret that were replaced, so a reply that is mostly secrets can be told apart.
export function redact(text: string): Redaction {
  let hits = 0
  let chars = 0
  const sub = (re: RegExp, s: string) =>
    s.replace(re, m => {
      if (m === REDACTED) return m
      hits++
      chars += m.length
      return REDACTED
    })
  let out = text
  for (const re of SECRET_SHAPES) out = sub(re, out)
  out = out.replace(SECRET_ASSIGN, (m, key: string, q: string, value: string) => {
    if (value === REDACTED || value.startsWith('[redacted')) return m
    hits++
    chars += value.length
    return `${key}${q}${REDACTED}${q}`
  })
  out = sub(TOKEN_SHAPE, out)
  return { text: out, hits, chars }
}

export type Cleaned = { entries: Entry[]; hits: number; mostlySecrets: boolean }

// Redacts every field. The reply is dropped (mostlySecrets) when half or more of its characters were secret, or when
// an entry's body is nothing but redaction markers.
export function cleanEntries(entries: readonly Entry[]): Cleaned {
  let hits = 0
  let chars = 0
  let total = 0
  let empty = 0
  const out = entries.map(e => {
    const fields = [e.name, e.description, e.body].map(t => redact(t))
    for (const f of fields) {
      hits += f.hits
      chars += f.chars
    }
    total += e.name.length + e.description.length + e.body.length
    const body = fields[2]!.text
    if (body.replace(/\[redacted\]/g, '').replace(/[\s\p{P}]+/gu, '') === '') empty++
    return { ...e, name: slugify(fields[0]!.text) || e.name, description: fields[1]!.text, body }
  })
  const mostlySecrets = total > 0 && (chars / total >= 0.5 || empty > 0)
  return { entries: out, hits, mostlySecrets }
}

// ---------- the files ----------

// This repo's memory file format.
export const memoryFile = (e: Entry): string => `---\nname: ${e.name}\ndescription: ${e.description}\nmetadata:\n  type: ${e.type}\n---\n\n${e.body}\n`

// name and description out of an existing file's frontmatter; the file name stands in when they are missing.
export function readExisting(file: string, text: string): Existing {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? ''
  const pick = (k: string) => new RegExp(`^${k}:[ \\t]*(.*)$`, 'm').exec(fm)?.[1]?.trim() ?? ''
  return { file, name: pick('name') || file.replace(/\.md$/, ''), description: pick('description'), text: clip(text, EXISTING_TEXT) }
}

// Counts lines present in `after` and not `before` (added), and the reverse (removed), as multisets.
export function lineDiff(before: string | null, after: string): { added: number; removed: number } {
  const lines = (s: string) => s.replace(/\r\n/g, '\n').split('\n').filter(l => l.trim() !== '')
  const count = new Map<string, number>()
  for (const l of lines(before ?? '')) count.set(l, (count.get(l) ?? 0) + 1)
  let added = 0
  for (const l of lines(after)) {
    const n = count.get(l) ?? 0
    if (n > 0) count.set(l, n - 1)
    else added++
  }
  let removed = 0
  for (const n of count.values()) removed += n
  return { added, removed }
}

// New, update or duplicate for each entry. An entry matches an existing file by its file name or its name; a match is
// updated, never duplicated; the same text again is refused ('duplicate', nothing to write).
export function planWrites(entries: readonly Entry[], existing: readonly Existing[], existingFull: ReadonlyMap<string, string>): Change[] {
  const out: Change[] = []
  for (const e of entries) {
    const match = existing.find(x => x.file.toLowerCase() === e.file.toLowerCase() || slugify(x.name) === slugify(e.name))
    const file = match ? match.file : e.file
    if (out.some(c => c.file === file)) continue
    const before = match ? (existingFull.get(match.file) ?? null) : null
    const after = memoryFile(e)
    const same = before !== null && before.replace(/\r\n/g, '\n').trim() === after.trim()
    const d = lineDiff(before, after)
    out.push({ file, kind: same ? 'duplicate' : before === null ? 'new' : 'update', before, after, added: same ? 0 : d.added, removed: same ? 0 : d.removed, name: e.name })
  }
  return out
}

export const indexLine = (c: { file: string; name: string; description: string }): string => `- [${c.name}](${c.file}) — ${clip(oneLine(c.description), 110)}`

// MEMORY.md with each written file's one line added, or replaced in place when it was already listed.
export function upsertIndex(index: string, lines: readonly { file: string; line: string }[]): string {
  const rows = index === '' ? [] : index.replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n')
  for (const l of lines) {
    const at = rows.findIndex(r => r.includes(`](${l.file})`))
    if (at >= 0) rows[at] = l.line
    else rows.push(l.line)
  }
  return `${rows.join('\n')}\n`
}

export const descriptionOf = (after: string): string => readExisting('x', after).description

// ---------- sources.json and the one-deep undo ----------

export type Source = { file: string; session: string; at: number; kind: 'new' | 'update' }
export type Sources = { writes: Source[] }

export function parseSources(v: unknown): Sources {
  let raw = v
  if (typeof v === 'string') {
    try {
      raw = JSON.parse(v)
    } catch {
      return { writes: [] }
    }
  }
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { writes?: unknown }).writes) ? (raw as { writes: unknown[] }).writes : []
  const writes: Source[] = []
  for (const w of list) {
    const r = (w && typeof w === 'object' ? w : {}) as Record<string, unknown>
    if (typeof r.file === 'string' && typeof r.session === 'string' && typeof r.at === 'number' && (r.kind === 'new' || r.kind === 'update')) {
      writes.push({ file: r.file, session: r.session, at: r.at, kind: r.kind })
    }
  }
  return { writes }
}

// The writes of one batch added; oldest dropped past the cap.
export const addSources = (old: Sources, batch: readonly Written[], session: string, at: number): Sources => ({
  writes: [...old.writes, ...batch.map(w => ({ file: w.file, session, at, kind: w.kind }))].slice(-KEPT_SOURCES),
})

export type UndoRecord = { at: number; files: { file: string; before: string | null }[]; index: string | null; sources: string | null }

export function parseUndo(v: unknown): UndoRecord | null {
  let raw = v
  if (typeof v === 'string') {
    try {
      raw = JSON.parse(v)
    } catch {
      return null
    }
  }
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.at !== 'number' || !Array.isArray(r.files)) return null
  const files: UndoRecord['files'] = []
  for (const f of r.files) {
    const o = (f && typeof f === 'object' ? f : {}) as Record<string, unknown>
    if (typeof o.file === 'string' && (typeof o.before === 'string' || o.before === null)) files.push({ file: o.file, before: o.before })
  }
  return { at: r.at, files, index: typeof r.index === 'string' ? r.index : null, sources: typeof r.sources === 'string' ? r.sources : null }
}

// ---------- texts ----------

export const sessionShort = (id: string) => (id.length > 8 ? id.slice(0, 8) : id)

export const writtenLine = (w: Written): string => `${w.file} (${w.kind}) +${w.added} -${w.removed}`

export function memoriesText(sources: Sources, limit = LISTED_WRITES): string {
  const rows = sources.writes.slice(-limit).reverse()
  if (rows.length === 0) return 'No memories written yet.'
  return [`The last ${rows.length} memory write${rows.length === 1 ? '' : 's'}, newest first:`, ...rows.map(w => `- ${w.file}: ${w.kind}, session ${sessionShort(w.session)}, ${new Date(w.at).toISOString().slice(0, 16).replace('T', ' ')}`)].join('\n')
}

export const rememberUsage = 'Usage: /remember <what to remember>'

export function undoneText(rec: UndoRecord): string {
  const emptied = rec.files.filter(f => f.before === null).length
  const restored = rec.files.length - emptied
  const parts = [`Undid the last memory write: ${restored} file${restored === 1 ? '' : 's'} restored`]
  if (emptied > 0) parts.push(`${emptied} new file${emptied === 1 ? '' : 's'} emptied (a mod cannot delete files; its index line is gone)`)
  return `${parts.join(', ')}.`
}

export function resultText(written: readonly Written[], duplicates: number): string {
  if (written.length === 0) return duplicates > 0 ? 'Nothing new: that is already in memory.' : 'Nothing was worth saving.'
  return `Memory updated: ${written.map(writtenLine).join('; ')}.`
}

// The summary atom (FR-ALL-05): the chip while working, the file count while the pane is open, a warning after a failure.
export function memorySummary(v: View): ModSummary | null {
  if (v.phase === 'working') return makeSummary('busy', 'memory updating')
  if (v.phase === 'done') return makeSummary('ok', `memory: ${v.written.length} file${v.written.length === 1 ? '' : 's'}`, v.written.map(writtenLine).join('; '))
  if (v.phase === 'error') return makeSummary('warn', 'memory not saved', v.note)
  return null
}

// The one debug line for a skipped or failed run. It never carries the exchange, a file's text or a secret.
export const failLine = (step: string, reason: string) => `${PLUGIN}: ${step} failed (${reason}); nothing written`

// ---------- where ----------

export const joinPath = (dir: string, name: string) => `${dir.replace(/[\\/]+$/, '')}/${name}`

// The memory folder: the option when set (a relative one is under the project), else <project>/.claude/bws-memory.
export function resolveDir(option: unknown, cwd: string): string {
  const base = cwd.replace(/\\/g, '/').replace(/\/+$/, '')
  const o = typeof option === 'string' ? option.trim().replace(/\\/g, '/') : ''
  if (o === '') return `${base}/.claude/bws-memory`
  const abs = /^([a-zA-Z]:)?\//.test(o)
  return (abs ? o : `${base}/${o.replace(/^\.\//, '')}`).replace(/\/+$/, '')
}
