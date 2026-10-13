// DreamPath's logic, pure (no `$`): what the fork is shown, reading and validating its plan of merge / remove / rewrite
// actions, and (later sections) turning a plan into file changes, backups, the trigger and the pane's texts.
// register.tsx does the I/O. Extends bws-memory; reuses memory.ts for the file format and redaction.

import { jsonOf, MEM_TYPES, readExisting, redact, sessionShort, slugify, type MemType, type Sources } from './memory'
import type { DreamAction } from '../types'

export type { DreamAction } from '../types'

export const FORK_DREAM_TIMEOUT_MS = 90_000
export const MAX_DREAM_FILES = 40
export const MAX_FILE_CHARS = 4000
export const MAX_ACTIONS = 20
export const MAX_REMOVED_SHARE = 0.4
const MAX_REASON = 160
const MAX_DESCRIPTION = 200

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 3)}...` : s)
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()

// One memory file the dream may touch: its full text and what its frontmatter says.
export type DreamFile = { file: string; text: string; name: string; description: string; type: MemType | null }

// `type:` under `metadata:` in a memory file's frontmatter.
const typeOf = (text: string): MemType | null => {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? ''
  const t = /^[ \t]*type:[ \t]*(\S+)/m.exec(fm)?.[1]?.toLowerCase() ?? ''
  return (MEM_TYPES as readonly string[]).includes(t) ? (t as MemType) : null
}

// What the dream works on: every non-empty .md file that is not the index. A file over MAX_FILE_CHARS, or past the
// MAX_DREAM_FILES-th, is left alone (the fork is never shown a cut-short text it could then "rewrite"). `skipped` counts them.
export function dreamFiles(all: readonly { file: string; text: string }[]): { files: DreamFile[]; skipped: number } {
  const live = all.filter(f => f.text.trim() !== '').sort((a, b) => a.file.localeCompare(b.file))
  const files: DreamFile[] = []
  let skipped = 0
  for (const f of live) {
    if (f.text.length > MAX_FILE_CHARS || files.length >= MAX_DREAM_FILES) {
      skipped++
      continue
    }
    const e = readExisting(f.file, f.text)
    files.push({ file: f.file, text: f.text, name: e.name, description: e.description, type: typeOf(f.text) })
  }
  return { files, skipped }
}

// The sessions each file came from, from sources.json: distinct, oldest first, shortened for display (FR-DP-04).
export function sessionsByFile(sources: Sources): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const w of sources.writes) {
    const s = sessionShort(w.session)
    const list = out.get(w.file) ?? []
    if (!list.includes(s)) list.push(s)
    out.set(w.file, list)
  }
  return out
}

// ---------- the prompt ----------

export const DREAM_FORMAT = `Reply with JSON only, no prose and no code fence: {"actions":[
{"action":"merge","files":["a.md","b.md"],"into":"a.md","name":"short-kebab-slug","description":"one line saying when this memory is relevant","type":"user|feedback|project|reference","body":"the merged text","reason":"why"},
{"action":"remove","file":"c.md","reason":"why it is stale or contradicted"},
{"action":"rewrite","file":"d.md","description":"one line","body":"the clearer text","reason":"why"}]}
Rules: merge files that say the same thing or overlap (2 or more files; "into" must be one of them; the merged body keeps every distinct fact). Remove a file only when a newer file contradicts it or it is plainly stale; never remove more than 40% of the files. Rewrite a file only to make it clearer without losing any fact. Each file may appear in at most one action. Use only the file names listed below. Never include a key, token, password or other secret. If nothing needs doing, reply {"actions":[]}.`

export const dreamPrompt = (files: readonly DreamFile[], sessions: ReadonlyMap<string, readonly string[]>): string => {
  const list = files
    .map(f => {
      const s = sessions.get(f.file) ?? []
      return `=== ${f.file} (sessions: ${s.length === 0 ? 'unknown' : s.join(', ')})\n${f.text.trim()}`
    })
    .join('\n\n')
  return `Consolidate the user's memory folder: merge duplicates, drop entries that are stale or contradicted by newer ones, and rewrite for clarity. Propose actions; do not carry them out.\n\n${DREAM_FORMAT}\n\nThe memory files:\n\n${list}`
}

// ---------- reading and validating the plan (FR-DP-01) ----------

export type ParsedPlan = { ok: true; actions: DreamAction[] } | { ok: false; error: string }

const asType = (v: unknown): MemType | null => {
  const t = typeof v === 'string' ? v.trim().toLowerCase() : ''
  return (MEM_TYPES as readonly string[]).includes(t) ? (t as MemType) : null
}

// A file name as the fork may have written it: trimmed, `.md` added when missing, no folder part.
const fileRef = (v: unknown): string => {
  const s = typeof v === 'string' ? v.trim().replace(/\\/g, '/') : ''
  if (s === '' || s.includes('/')) return ''
  return s.toLowerCase().endsWith('.md') ? s : `${s}.md`
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

// The fork's JSON as flat actions, shapes checked. Anything malformed rejects the whole plan: a half-read plan is
// not applied. Whether the files exist is `validatePlan`'s job.
export function parseDreamPlan(text: string): ParsedPlan {
  const v = jsonOf(text)
  const list = Array.isArray(v) ? v : v && typeof v === 'object' && Array.isArray((v as { actions?: unknown }).actions) ? (v as { actions: unknown[] }).actions : null
  if (list === null) return { ok: false, error: 'the reply held no actions list' }
  if (list.length > MAX_ACTIONS) return { ok: false, error: `more than ${MAX_ACTIONS} actions` }
  const actions: DreamAction[] = []
  for (const [i, raw] of list.entries()) {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    const kind = str(r.action).toLowerCase()
    const reason = clip(oneLine(str(r.reason)), MAX_REASON)
    const at = `action ${i + 1}`
    if (reason === '') return { ok: false, error: `${at} has no reason` }
    if (kind === 'remove') {
      const file = fileRef(r.file)
      if (file === '') return { ok: false, error: `${at} (remove) names no file` }
      actions.push({ action: 'remove', files: [file], into: file, reason, name: '', description: '', type: '', body: '' })
    } else if (kind === 'rewrite') {
      const file = fileRef(r.file)
      const body = str(r.body)
      if (file === '') return { ok: false, error: `${at} (rewrite) names no file` }
      if (body === '') return { ok: false, error: `${at} (rewrite) has no body` }
      const description = clip(oneLine(str(r.description)), MAX_DESCRIPTION)
      const type = r.type === undefined ? '' : (asType(r.type) ?? 'bad')
      if (type === 'bad') return { ok: false, error: `${at} (rewrite) has an unknown type` }
      actions.push({ action: 'rewrite', files: [file], into: file, reason, name: '', description, type, body })
    } else if (kind === 'merge') {
      const files = Array.isArray(r.files) ? r.files.map(fileRef) : []
      if (files.length < 2 || files.some(f => f === '')) return { ok: false, error: `${at} (merge) needs two or more files` }
      if (new Set(files).size !== files.length) return { ok: false, error: `${at} (merge) lists a file twice` }
      const into = r.into === undefined ? (files[0] ?? '') : fileRef(r.into)
      if (!files.includes(into)) return { ok: false, error: `${at} (merge) "into" is not one of its files` }
      const name = slugify(str(r.name))
      const description = clip(oneLine(str(r.description)), MAX_DESCRIPTION)
      const type = asType(r.type)
      const body = str(r.body)
      if (!name || !description || !type || !body) return { ok: false, error: `${at} (merge) lacks a name, description, type or body` }
      actions.push({ action: 'merge', files, into, reason, name, description, type, body })
    } else {
      return { ok: false, error: `${at} has an unknown action` }
    }
  }
  return { ok: true, actions }
}

// A plan is refused when it names a file the folder does not hold, uses a file in two actions, or removes more than
// 40% of the files. Merged-away files are not counted as removed: their facts live on in the merged file.
export function validatePlan(actions: readonly DreamAction[], files: readonly Pick<DreamFile, 'file'>[]): ParsedPlan {
  const known = new Set(files.map(f => f.file))
  const used = new Set<string>()
  let removed = 0
  for (const a of actions) {
    for (const f of a.files) {
      if (!known.has(f)) return { ok: false, error: `the plan names an unknown file: ${f}` }
      if (used.has(f)) return { ok: false, error: `the plan uses ${f} in two actions` }
      used.add(f)
    }
    if (a.action === 'remove') removed++
  }
  if (files.length > 0 && removed / files.length > MAX_REMOVED_SHARE) {
    return { ok: false, error: `the plan removes ${removed} of ${files.length} files (more than ${Math.round(MAX_REMOVED_SHARE * 100)}%)` }
  }
  return { ok: true, actions: [...actions] }
}

// Redacts what the fork wrote before anything is applied (FR-MEM-03 holds for dreams too). A merged or rewritten body
// that is nothing but redaction markers rejects the plan.
export function cleanPlan(actions: readonly DreamAction[]): ParsedPlan {
  const out: DreamAction[] = []
  for (const a of actions) {
    if (a.action === 'remove') {
      out.push(a)
      continue
    }
    const body = redact(a.body)
    if (body.text.replace(/\[redacted\]/g, '').replace(/[\s\p{P}]+/gu, '') === '') return { ok: false, error: 'a rewritten body was only secrets' }
    out.push({ ...a, body: body.text, description: redact(a.description).text, reason: redact(a.reason).text })
  }
  return { ok: true, actions: out }
}

// Plan text for headless runs and /dream status: one line per action.
export function planText(actions: readonly DreamAction[], skipped = 0): string {
  if (actions.length === 0) return 'Nothing to consolidate: the memory is already tidy.'
  const lines = actions.map(a => {
    if (a.action === 'merge') return `- merge ${a.files.join(' + ')} into ${a.into}: ${a.reason}`
    if (a.action === 'remove') return `- remove ${a.into}: ${a.reason}`
    return `- rewrite ${a.into}: ${a.reason}`
  })
  const tail = skipped > 0 ? [`(${skipped} file${skipped === 1 ? ' was' : 's were'} too long or past the limit and are left alone.)`] : []
  return [`Dream plan: ${actions.length} action${actions.length === 1 ? '' : 's'}.`, ...lines, ...tail].join('\n')
}

export const dreamFailLine = (step: string, reason: string) => `bws-memory: dream ${step} failed (${reason}); nothing changed`
