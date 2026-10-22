// bws-summary's pure parts: the transcript a summary reads, the snapshot it builds on (rollback and compaction), and
// the dashboard tab, chip and text. No `$`, so tests call it directly.
import { makeSummary, type ModSummary } from './kit/summary'
import { buttons, makeTab, text, type ModTab, type TabButton, type TabNode } from './kit/tab'

export type Snapshot = {
  id: number
  turn: number
  count: number
  tailSig: string // the last message it covered: role, first 200 characters, tool-use count
  text: string
  at: string // HH:MM
  isRolledBack: boolean
}

export type Status = 'idle' | 'working' | 'error'

// A transcript row as the summary reads it (SessionMessage, narrowed).
export type Row = { role: string; text: string; toolUses: readonly { tool: string; input: unknown; isError?: boolean }[] }

export const MAX_SNAPSHOTS = 50
const MAX_MSG_CHARS = 4000
const MAX_INPUT_CHARS = 300
const MAX_TRANSCRIPT_CHARS = 180_000
// $.session.messages() returns at most this many rows; at the cap a missing tail is not a rollback.
export const MESSAGE_CAP = 4096

export const SYSTEM = `You keep a running summary of a coding conversation between a user and Claude (an AI coding assistant).
Write it so the user can quickly re-read it and remember the earlier context.
Use short Markdown with these sections, leaving out any that are empty:
## Goal
## Key decisions
## Done so far
## Open items / next steps
Use plain words and bullet points. Name files, commands and tickets exactly. Keep it under 350 words.
Reply with the summary only.`

export const sig = (m: Row | undefined): string => (m ? `${m.role}:${m.text.slice(0, 200)}:${m.toolUses.length}` : '')

const clip = (s: string, n: number): string => (s.length <= n ? s : `${s.slice(0, n)} …[${s.length - n} chars cut]`)

// One row as prompt text. A user row made only of tool results adds noise: ''.
export const renderMessage = (m: Row): string => {
  const parts: string[] = []
  if (m.text.trim()) parts.push(clip(m.text.trim(), MAX_MSG_CHARS))
  for (const t of m.toolUses) parts.push(`[used ${t.tool} ${clip(JSON.stringify(t.input) ?? '', MAX_INPUT_CHARS)}${t.isError ? ' -> error' : ''}]`)
  return parts.length === 0 ? '' : `${m.role === 'user' ? 'User' : 'Claude'}: ${parts.join('\n')}`
}

// The rows as prompt text, cut to the first quarter and last three quarters of the cap.
export const renderTranscript = (rows: readonly Row[]): string => {
  const all = rows.map(renderMessage).filter(Boolean).join('\n\n')
  if (all.length <= MAX_TRANSCRIPT_CHARS) return all
  const head = Math.floor(MAX_TRANSCRIPT_CHARS * 0.25)
  return `${all.slice(0, head)}\n\n…[middle of conversation cut]…\n\n${all.slice(-(MAX_TRANSCRIPT_CHARS - head))}`
}

// The newest snapshot whose last message is still in the transcript, so a rollback builds on the summary from before
// it. Matched by content, not position: messages() returns only the newest MESSAGE_CAP rows.
export const findBase = (list: readonly Snapshot[], rows: readonly Row[]): { base?: Snapshot; from: number; isNewest: boolean } => {
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i]
    if (!s) continue
    const at = rows.findLastIndex(m => sig(m) === s.tailSig)
    if (at >= 0) return { base: s, from: at + 1, isNewest: i === list.length - 1 }
  }
  return { from: 0, isNewest: false }
}

export type Plan = { prompt: string; isRolledBack: boolean } | null

// What the next summary sends, or null when the newest one already covers the last message. `isFull` (Refresh)
// rebuilds from the whole transcript; `isCompacted`: the old rows are gone, so build on the newest summary and read the
// whole compacted transcript as what came since.
export const planSummary = (list: readonly Snapshot[], rows: readonly Row[], o: { isFull: boolean; isCompacted: boolean }): Plan => {
  if (rows.length === 0) return null
  const newest = list.at(-1)
  if (!o.isFull && newest && newest.tailSig === sig(rows.at(-1))) return null
  let { base, from, isNewest } = findBase(list, rows)
  if (newest && !isNewest && o.isCompacted) {
    base = newest
    from = 0
    isNewest = true
  }
  if (o.isFull) base = undefined
  const isRolledBack = newest !== undefined && !isNewest && rows.length < MESSAGE_CAP
  const prompt = base
    ? `Here is the summary so far:\n\n${base.text}\n\nHere is what happened since:\n\n${renderTranscript(rows.slice(from))}\n\nWrite the updated summary of the whole conversation.`
    : `Here is the conversation:\n\n${renderTranscript(rows)}\n\nWrite the summary.`
  return { prompt, isRolledBack }
}

export const addSnapshot = (list: readonly Snapshot[], s: Omit<Snapshot, 'id'>): Snapshot[] =>
  [...list, { ...s, id: (list.at(-1)?.id ?? 0) + 1 }].slice(-MAX_SNAPSHOTS)

export const clockTime = (ms: number): string => {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// What the tab shows. `viewing` -1 follows the newest summary.
export type View = { list: readonly Snapshot[]; viewing: number; status: Status; error: string; show: number }

export const shownIndex = (v: Pick<View, 'list' | 'viewing'>) => (v.viewing < 0 || v.viewing >= v.list.length ? v.list.length - 1 : v.viewing)

// The viewing index after a press: older / newer / latest; -1 when it lands on the newest.
export const step = (v: Pick<View, 'list' | 'viewing'>, id: 'older' | 'newer' | 'latest'): number => {
  const i = shownIndex(v)
  const to = id === 'older' ? Math.max(0, i - 1) : id === 'newer' ? i + 1 : v.list.length - 1
  return to >= v.list.length - 1 ? -1 : to
}

// The summary's Markdown as tab rows: `## Goal` bold, bullets as •, **bold** markers dropped, blank lines skipped.
export const markdownNodes = (md: string): TabNode[] => {
  const out: TabNode[] = []
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.replace(/\*\*(.+?)\*\*/g, '$1').trimEnd()
    if (!line.trim()) continue
    const head = /^#{1,6}\s+(.*)$/.exec(line.trim())
    if (head) out.push(text(head[1] ?? '', { isBold: true, color: 'accent' }))
    else out.push(text(line.replace(/^(\s*)[-*+]\s+/, '$1• ')))
  }
  return out
}

export function summaryTab(v: View): ModTab {
  const i = shownIndex(v)
  const snap = v.list[i]
  const isLatest = i === v.list.length - 1
  const body: TabNode[] = []
  if (snap) body.push(text(`${i + 1}/${v.list.length} · turn ${snap.turn} · ${snap.at}`, { isBold: true }))
  if (v.status === 'working') body.push(text('Updating…', { color: 'accent' }))
  if (v.status === 'error' && v.error) body.push(text(v.error, { color: 'bad' }))
  if (snap?.isRolledBack) body.push(text('↺ made after a rollback', { color: 'warn' }))
  if (snap && !isLatest) body.push(text('Viewing an older summary', { color: 'warn' }))
  // The buttons sit above the summary, so they never scroll away on a long one.
  const items: TabButton[] = []
  if (i > 0) items.push({ id: 'older', label: '◀ Older', hotkey: 'o' })
  if (snap && !isLatest) items.push({ id: 'newer', label: 'Newer ▶', hotkey: 'n' }, { id: 'latest', label: 'Latest', hotkey: 'l' })
  items.push({ id: 'refresh', label: 'Refresh', hotkey: 'r', isPrimary: !snap })
  body.push(buttons(...items))
  if (snap) body.push(...markdownNodes(snap.text))
  else body.push(text('No summary yet. One appears after Claude finishes a turn.', { isDim: true }))
  const tone = v.status === 'working' ? 'busy' : v.status === 'error' ? 'bad' : 'idle'
  const badge = v.status === 'working' ? '…' : v.list.length > 0 ? String(v.list.length) : ''
  return makeTab('Summary', body, { badge, tone, show: v.show })
}

export function summaryChip(v: View): ModSummary | null {
  if (v.status === 'working') return makeSummary('busy', 'summary updating')
  if (v.status === 'error') return makeSummary('bad', 'summary failed', v.error)
  return null
}

// /summary headless (and without a dashboard): the shown summary as text.
export function summaryText(v: View): string {
  const i = shownIndex(v)
  const snap = v.list[i]
  if (!snap) return v.status === 'error' ? v.error : 'No summary yet. One appears after Claude finishes a turn.'
  const head = `Summary ${i + 1}/${v.list.length} (turn ${snap.turn}, ${snap.at}${snap.isRolledBack ? ', made after a rollback' : ''})`
  return `${head}\n\n${snap.text}`
}
