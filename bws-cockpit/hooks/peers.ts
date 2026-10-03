// Repo Sessions: the other Claude Code sessions open in this repo, read from the engine's own
// registry (<config dir>/sessions/<pid>.json). Pure helpers; register.tsx does the reading.

import type { PeerSend, PeerView, SendState } from '../types'
import { ago } from './loop'
import { toSlash } from './projects'

export type SessionRecord = {
  pid: number
  procStart: string
  pipe: string | null // messagingSocketPath, normalized: where delivery notices name it
  sessionId: string
  cwd: string
  name: string
  status: string
  kind: string
  startedAt: number | null
  statusSince: number | null
  updatedAt: number | null
}

// Registry entries are `<pid>.json`; the `<pid>.<hash>.key` files beside them are never read.
export const isRecordFile = (name: string) => /^\d+\.json$/.test(name)

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown, dflt = ''): string => (typeof v === 'string' ? v : dflt)

export function parseRecord(text: string): SessionRecord | undefined {
  let raw: Record<string, unknown>
  try {
    const v: unknown = JSON.parse(text)
    if (typeof v !== 'object' || v === null) return undefined
    raw = v as Record<string, unknown>
  } catch {
    return undefined
  }
  const pid = num(raw.pid)
  const sessionId = str(raw.sessionId)
  const cwd = str(raw.cwd)
  if (pid === null || !sessionId || !cwd) return undefined
  return {
    pid,
    procStart: str(raw.procStart),
    pipe: str(raw.messagingSocketPath) ? normPipe(str(raw.messagingSocketPath)) : null,
    sessionId,
    cwd,
    name: str(raw.name) || sessionId.slice(0, 8),
    status: str(raw.status, 'unknown'),
    kind: str(raw.kind, 'unknown'),
    startedAt: num(raw.startedAt),
    statusSince: num(raw.statusUpdatedAt) ?? num(raw.updatedAt),
    updatedAt: num(raw.updatedAt),
  }
}

export const parentOf = (p: string) => {
  const cut = p.lastIndexOf('/')
  return cut <= 0 ? p : p.slice(0, cut)
}

// Resolves `a/../b` and `./` segments in a slash path.
const tidy = (p: string) => {
  const out: string[] = []
  for (const part of p.split('/')) {
    if (part === '.' || (part === '' && out.length > 0)) continue
    if (part === '..' && out.length > 1) out.pop()
    else out.push(part)
  }
  return out.join('/')
}

const isAbsolute = (p: string) => /^[a-z]:\//i.test(p) || p.startsWith('/')

// The repo's common git dir, lowercased, from the folder holding `.git`: the `.git` folder
// itself, or for a worktree (a `.git` file, `gitdir: <main>/.git/worktrees/<name>`) the main one.
export function repoKey(dir: string, gitFile?: string): string {
  const base = toSlash(dir)
  if (gitFile === undefined) return `${base}/.git`.toLowerCase()
  const line = gitFile.match(/^gitdir:\s*(.+?)\s*$/m)?.[1]
  if (!line) return `${base}/.git`.toLowerCase()
  const target = toSlash(line)
  const abs = tidy(isAbsolute(target) ? target : `${base}/${target}`)
  return abs.replace(/\/worktrees\/[^/]+$/i, '').toLowerCase()
}

// Where a session runs, relative to the repo root: '' at the root, the subpath under it,
// or the full path when it sits elsewhere (a worktree outside the repo folder).
export function whereIn(cwd: string, root: string): string {
  const c = toSlash(cwd)
  const r = toSlash(root)
  if (c.toLowerCase() === r.toLowerCase()) return ''
  if (c.toLowerCase().startsWith(`${r.toLowerCase()}/`)) return c.slice(r.length + 1)
  return c
}

export const repoName = (root: string) => toSlash(root).split('/').pop() || root

// PID to image name from `tasklist /FO CSV /NH` output: "Image","PID","Session","#","Mem".
export function parseTasklist(stdout: string): Map<number, string> {
  const pids = new Map<number, string>()
  for (const line of stdout.split(/\r?\n/)) {
    const m = line.match(/^"([^"]*)","(\d+)"/)
    const pid = Number(m?.[2])
    if (m && Number.isInteger(pid) && pid > 0) pids.set(pid, m[1] ?? '')
  }
  return pids
}

// A session is alive when its pid runs the same program as this session's own (claude.exe or
// node.exe), so a crashed session's pid reused by another program reads as gone. Without
// this session's own image, any running pid counts.
export function isAliveIn(images: ReadonlyMap<number, string>, pid: number, selfImage: string | undefined): boolean {
  const image = images.get(pid)
  if (image === undefined) return false
  return selfImage === undefined || image.toLowerCase() === selfImage.toLowerCase()
}

export const livenessKey = (r: { pid: number; procStart: string }) => `${r.pid}:${r.procStart}`

export type LatestPrompt = { text: string; at: number | null }

// The first non-empty line of a prompt, whitespace collapsed.
export const promptLine = (display: unknown): string =>
  typeof display !== 'string' ? '' : (display.split(/\r?\n/).find(l => l.trim() !== '') ?? '').replace(/\s+/g, ' ').trim()

// The newest prompt of each wanted session in history.jsonl (the engine's prompt history, one
// `{ display, timestamp, project, sessionId }` per line, appended), scanned from the end. Only
// the lines of wanted sessions are parsed; the scan stops once every one is found. A slash
// command with arguments counts (it carries the task); a bare one is skipped.
export function latestPrompts(history: string, ids: ReadonlySet<string>): Map<string, LatestPrompt> {
  const out = new Map<string, LatestPrompt>()
  let end = history.length
  while (end > 0 && out.size < ids.size) {
    const start = history.lastIndexOf('\n', end - 1)
    const line = history.slice(start + 1, end)
    end = start < 0 ? 0 : start
    const id = line.match(/"sessionId":\s*"([^"]+)"/)?.[1]
    if (id === undefined || !ids.has(id) || out.has(id)) continue
    let rec: Record<string, unknown>
    try {
      rec = JSON.parse(line) as Record<string, unknown>
    } catch {
      continue
    }
    const text = promptLine(rec.display)
    // A bare slash command (/clear, /repo-sessions) says nothing about the task: look further back.
    if (text && !/^\/\S+$/.test(text)) out.set(id, { text, at: num(rec.timestamp) })
  }
  return out
}

export function toPeer(r: SessionRecord, root: string, prompt?: LatestPrompt): PeerView {
  return {
    sessionId: r.sessionId,
    pid: r.pid,
    name: r.name,
    status: r.status,
    kind: r.kind,
    repo: repoName(root),
    where: whereIn(r.cwd, root),
    startedAt: r.startedAt,
    statusSince: r.statusSince,
    pipe: r.pipe,
    prompt: prompt?.text ?? null,
    promptAt: prompt?.at ?? null,
  }
}

const STATUS_RANK: Record<string, number> = { busy: 0, waiting: 1, idle: 2, shell: 3 }

const byRank = (a: PeerView, b: PeerView) => {
  const rank = (p: PeerView) => [p.kind === 'interactive' ? 0 : 1, STATUS_RANK[p.status] ?? 4, -(p.startedAt ?? 0)]
  const ra = rank(a)
  const rb = rank(b)
  for (let i = 0; i < ra.length; i++) {
    const d = (ra[i] ?? 0) - (rb[i] ?? 0)
    if (d !== 0) return d
  }
  return a.name.localeCompare(b.name)
}

// Interactive sessions first, then by status (busy first), then the newest first.
export const sortPeers = (peers: readonly PeerView[]): PeerView[] => [...peers].sort(byRank)

// Sessions in other repos: by repo name, then as sortPeers within each repo.
export const sortOthers = (peers: readonly PeerView[]): PeerView[] =>
  [...peers].sort((a, b) => a.repo.toLowerCase().localeCompare(b.repo.toLowerCase()) || byRank(a, b))

export const STATUS_COLOR: Record<string, string | undefined> = { busy: 'claude', waiting: 'warning', idle: 'success' }

// "busy 3m", the time in that status without the "ago".
export const forText = (since: number | null, now: number) => (since === null ? '' : ago(since, now).replace(/ ago$/, ''))

export function peerDetail(p: PeerView, now: number): string {
  return [
    p.kind !== 'interactive' ? p.kind : '',
    p.where ? `in ${p.where}` : '',
    p.startedAt !== null ? `started ${ago(p.startedAt, now)}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

// ---------- msg delivery states ----------

// A pipe as the registry (`messagingSocketPath`) and the delivery notices (`uds:<pipe>`) spell it.
export const normPipe = (p: string) => p.replace(/^uds:/i, '').replace(/[\\/]+/g, '/').toLowerCase()

export type DeliveryNotice = { state: SendState; pipe: string; ids: string[]; summary: string }

const NOTICE = '[Cross-session delivery notice]'

// The engine's delivery notice for a message this session sent, as `prompt.submit` sees it:
// "[Cross-session delivery notice] Your message to another session was held by that session
// (recipient: uds:<pipe>; msg_id: <id>[, <id>]). ...". Only the first sentence decides the
// state: the held notice goes on to mention "release, denial or expiry". Wording not seen
// yet keeps that first sentence as the summary.
export function parseNotice(text: string): DeliveryNotice | undefined {
  if (!text.startsWith(NOTICE)) return undefined
  const head = text.slice(NOTICE.length).split(' (recipient:')[0]?.trim() ?? ''
  const pipe = text.match(/\(recipient:\s*([^;)]+)/)?.[1]?.trim()
  if (!pipe) return undefined
  const ids = (text.match(/msg_id:\s*([^)]+)\)/)?.[1] ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const state: SendState = /\bheld by\b/.test(head)
    ? 'held'
    : /\bapproved and released\b/.test(head)
      ? 'released'
      : /\bdenied\b/.test(head)
        ? 'denied'
        : /\bexpired\b/.test(head)
          ? 'expired'
          : 'other'
  return { state, pipe: normPipe(pipe), ids, summary: head.replace(/\.$/, '') }
}

const OPEN_STATES: readonly SendState[] = ['sending', 'sent', 'held']

// Applies one notice to the pane's sends: each id binds to the send already holding it, else
// to the oldest unbound open send to that pipe (a batch binds in send order). A notice with no
// such send (one the model sent, say) changes nothing.
export function applyNotice(sends: readonly PeerSend[], n: DeliveryNotice, at: number): PeerSend[] {
  const out = [...sends]
  for (const id of n.ids.length > 0 ? n.ids : [null]) {
    let i = id === null ? -1 : out.findIndex(s => s.msgId === id)
    if (i < 0) i = out.findIndex(s => s.pipe === n.pipe && s.msgId === null && OPEN_STATES.includes(s.state))
    const s = out[i]
    if (s === undefined) continue
    out[i] = { ...s, msgId: s.msgId ?? id, state: n.state, text: n.state === 'other' ? n.summary : '', stateAt: at }
  }
  return out
}

// The send's line under its row, and how it is colored; held stays until a final notice.
export function sendLine(s: PeerSend, now: number): { text: string; color: string | undefined; isOver: boolean } {
  const age = ago(s.stateAt, now)
  const isOver = s.state !== 'held' && s.state !== 'sending' && now - s.stateAt >= SEND_NOTE_MS
  switch (s.state) {
    case 'sending':
      return { text: '… sending', color: undefined, isOver }
    case 'sent':
      return { text: `✓ sent · ${age}`, color: 'success', isOver }
    case 'held':
      return { text: `◆ held: waiting for approval in ${s.name} · ${forText(s.stateAt, now)}`, color: 'warning', isOver }
    case 'released':
      return { text: `✓ approved and delivered · ${age}`, color: 'success', isOver }
    case 'denied':
      return { text: `✗ denied by the recipient · ${age}`, color: 'error', isOver }
    case 'expired':
      return { text: `✗ expired, not delivered · ${age}`, color: 'error', isOver }
    case 'failed':
      return { text: `✗ ${s.text} · ${age}`, color: 'error', isOver }
    default:
      return { text: `• ${s.text} · ${age}`, color: undefined, isOver }
  }
}

export const SEND_NOTE_MS = 60_000 // how long a final state stays under the row

// A session in another repo, on one line: the kind when not interactive, the folder when not the root.
export const otherDetail = (p: PeerView) => [p.kind !== 'interactive' ? p.kind : '', p.where ? `in ${p.where}` : ''].filter(Boolean).join(' · ')

export function peersText(peers: readonly PeerView[], root: string, now: number, others: readonly PeerView[] = []): string {
  const head =
    peers.length === 0
      ? `No other Claude Code sessions in ${repoName(root)}.`
      : `${peers.length} other session${peers.length === 1 ? '' : 's'} in ${repoName(root)}:\n` +
        peers
          .map(p => {
            const detail = peerDetail(p, now)
            const line = `- ${p.name}: ${p.status} ${forText(p.statusSince, now)}${detail ? ` (${detail})` : ''}`
            return p.prompt ? `${line}\n  › ${p.prompt}` : line
          })
          .join('\n')
  if (others.length === 0) return head
  const lines: string[] = []
  let repo: string | undefined
  for (const p of others) {
    if (p.repo !== repo) lines.push(`${(repo = p.repo)}:`)
    const detail = otherDetail(p)
    lines.push(`- ${p.name}: ${p.status} ${forText(p.statusSince, now)}${detail ? ` (${detail})` : ''}`)
  }
  return `${head}\n\nOther repos (${others.length}):\n${lines.join('\n')}`
}
