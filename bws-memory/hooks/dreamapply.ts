// DreamPath, the second half, pure (no `$`): the view and chip, fingerprints, what applying a plan does to each file,
// MEMORY.md and sources.json, backups and the texts the commands print. register.tsx does the I/O.

import { makeSummary } from './kit/summary'
import type { ModSummary } from './kit/summary'
import { indexLine, memoryFile, memorySummary, MEM_TYPES, upsertIndex, type MemType, type Sources } from './memory'
import { planText } from './dream'
import type { DreamAction, DreamFile } from './dream'
import type { DreamView, View } from '../types'

export const IDLE_DREAM: DreamView = { phase: 'idle', due: false, auto: false, actions: [], sessions: {}, bases: {}, skipped: 0, note: '', backup: '' }

export const DREAM_PANE = 'bws-dream'
export const BACKUP_DIR = '.dream-backup'
export const RESTORED_MARK = 'restored.json'

const asType = (v: string): MemType | null => ((MEM_TYPES as readonly string[]).includes(v) ? (v as MemType) : null)

export const counts = (actions: readonly DreamAction[]) => ({
  merged: actions.filter(a => a.action === 'merge').length,
  removed: actions.filter(a => a.action === 'remove').length,
  rewritten: actions.filter(a => a.action === 'rewrite').length,
})

export const countsText = (c: { merged: number; removed: number; rewritten: number }) => `${c.merged} merged, ${c.removed} removed, ${c.rewritten} rewritten`

// The chip (FR-ALL-05): dreaming while the fork runs; otherwise memory's own chip when it has one; then the dream's.
export function combinedSummary(v: View, d: DreamView): ModSummary | null {
  if (d.phase === 'working') return makeSummary('busy', 'dreaming')
  const m = memorySummary(v)
  if (m) return m
  if (d.phase === 'error') return makeSummary('warn', 'dream failed', d.note)
  if (d.phase === 'applied') return makeSummary('ok', 'dream applied', countsText(counts(d.actions)))
  if (d.phase === 'preview') return makeSummary('ok', d.due ? 'dream due' : 'dream preview', planText(d.actions))
  if (d.due) return makeSummary('ok', 'dream due')
  return null
}

// ---------- fingerprints ----------

// A short stable fingerprint of a file's text: if it differs at Apply, the plan was made for another version.
export function hashText(text: string): string {
  const t = text.replace(/\r\n/g, '\n')
  let h = 5381
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0
  return `${t.length.toString(36)}-${(h >>> 0).toString(36)}`
}

// The fingerprint of every file the plan touches.
export function basesOf(actions: readonly DreamAction[], files: readonly DreamFile[]): Record<string, string> {
  const out: Record<string, string> = {}
  const by = new Map(files.map(f => [f.file, f.text]))
  for (const a of actions) for (const f of a.files) out[f] = hashText(by.get(f) ?? '')
  return out
}

// The files whose text is no longer what the preview was made from.
export function staleFiles(bases: Readonly<Record<string, string>>, files: readonly DreamFile[]): string[] {
  const by = new Map(files.map(f => [f.file, f.text]))
  return Object.keys(bases).filter(f => !by.has(f) || hashText(by.get(f) ?? '') !== bases[f])
}

// ---------- applying a plan (FR-DP-02) ----------

export type DreamChange = { file: string; before: string; after: string; role: 'merged-into' | 'merged-away' | 'rewritten' | 'removed'; name: string; description: string }

// What each file becomes. A file that goes away becomes '' (a mod cannot delete files; see DECISIONS.md).
export function dreamChanges(actions: readonly DreamAction[], files: readonly DreamFile[]): DreamChange[] {
  const by = new Map(files.map(f => [f.file, f]))
  const out: DreamChange[] = []
  for (const a of actions) {
    if (a.action === 'merge') {
      const type = asType(a.type) ?? 'project'
      for (const f of a.files) {
        const before = by.get(f)?.text ?? ''
        if (f === a.into) out.push({ file: f, before, after: memoryFile({ file: f, name: a.name, description: a.description, type, body: a.body }), role: 'merged-into', name: a.name, description: a.description })
        else out.push({ file: f, before, after: '', role: 'merged-away', name: '', description: '' })
      }
    } else if (a.action === 'remove') {
      out.push({ file: a.into, before: by.get(a.into)?.text ?? '', after: '', role: 'removed', name: '', description: '' })
    } else {
      const cur = by.get(a.into)
      const name = cur?.name ?? a.into.replace(/\.md$/, '')
      const description = a.description || cur?.description || name
      const type = asType(a.type) ?? cur?.type ?? 'project'
      out.push({ file: a.into, before: cur?.text ?? '', after: memoryFile({ file: a.into, name, description, type, body: a.body }), role: 'rewritten', name, description })
    }
  }
  return out
}

// MEMORY.md after the plan: a gone file's line is dropped, a rewritten or merged file's line is replaced in place.
export function dreamIndex(index: string, changes: readonly DreamChange[]): string {
  const gone = changes.filter(c => c.after === '').map(c => `](${c.file})`)
  const kept = index
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter(l => !gone.some(g => l.includes(g)))
    .join('\n')
  const lines = changes.filter(c => c.after !== '').map(c => ({ file: c.file, line: indexLine({ file: c.file, name: c.name, description: c.description }) }))
  return upsertIndex(kept.trim() === '' ? '' : kept, lines)
}

// sources.json after the plan: a merged-away file's rows move to the file that survives (so its sessions are the
// union of both), a removed file's rows go (FR-DP-04).
export function dreamSources(sources: Sources, actions: readonly DreamAction[]): Sources {
  const to = new Map<string, string | null>()
  for (const a of actions) {
    if (a.action === 'merge') for (const f of a.files) to.set(f, a.into)
    else if (a.action === 'remove') to.set(a.into, null)
  }
  const writes: Sources['writes'] = []
  for (const w of sources.writes) {
    const t = to.has(w.file) ? to.get(w.file) : w.file
    if (t === null || t === undefined) continue
    writes.push({ ...w, file: t })
  }
  return { writes }
}

// ---------- backups (FR-DP-02) ----------

const pad = (n: number, w = 2) => String(n).padStart(w, '0')

// `<memoryDir>/.dream-backup/<this>/`: UTC, sortable, no characters Windows refuses.
export function backupName(now: number): string {
  const d = new Date(now)
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}-${pad(d.getUTCMilliseconds(), 3)}`
}

// The newest backup folder name, or null.
export const latestBackup = (names: readonly string[]): string | null => [...names].sort().pop() ?? null

// ---------- texts ----------

export const appliedText = (actions: readonly DreamAction[], backup: string): string =>
  `Dream applied: ${countsText(counts(actions))}. Backup: ${BACKUP_DIR}/${backup}/ (restore with /dream undo).`

export const dreamUndoText = (name: string, restored: number): string => `Dream undone: ${restored} file${restored === 1 ? '' : 's'} restored from ${BACKUP_DIR}/${name}/.`

export function dreamStatusText(d: DreamView, everyTurns: number, turns: number): string {
  const trig = everyTurns > 0 ? `every ${everyTurns} turns (${turns} so far) and before a compaction` : 'off'
  const state = d.phase === 'preview' ? `a plan is waiting (${d.actions.length} action${d.actions.length === 1 ? '' : 's'})` : d.phase === 'working' ? 'dreaming now' : d.due ? 'due: run /dream' : 'nothing waiting'
  return `Dream: ${state}. Automatic: ${trig}.`
}

// ---------- the pane's lines (FR-DP-02, FR-DP-04) ----------

export const SHOWN_ACTIONS = 8

export function actionLine(a: DreamAction): string {
  if (a.action === 'merge') return `merge ${a.files.join(' + ')} -> ${a.into}`
  return `${a.action} ${a.into}`
}

// The sessions behind an action's files, from the view's own list: the union (FR-DP-04).
export function actionSessions(a: DreamAction, sessions: Readonly<Record<string, string[]>>): string[] {
  const out: string[] = []
  for (const f of a.files) for (const s of sessions[f] ?? []) if (!out.includes(s)) out.push(s)
  return out
}

export const fromLine = (list: readonly string[]): string => `from: ${list.length === 0 ? 'unknown session' : list.join(', ')}`
