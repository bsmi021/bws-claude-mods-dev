// Repo Sessions: the other Claude Code sessions open in this repo, read from the engine's own
// registry (<config dir>/sessions/<pid>.json). Pure helpers; register.tsx does the reading.

import type { PeerView } from '../types'
import { ago } from './loop'
import { toSlash } from './projects'

export type SessionRecord = {
  pid: number
  procStart: string
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

// PIDs in `tasklist /FO CSV /NH` output: "Image","PID","Session","#","Mem".
export function parseTasklist(stdout: string): Set<number> {
  const pids = new Set<number>()
  for (const line of stdout.split(/\r?\n/)) {
    const pid = Number(line.match(/^"[^"]*","(\d+)"/)?.[1])
    if (Number.isInteger(pid) && pid > 0) pids.add(pid)
  }
  return pids
}

export const livenessKey = (r: { pid: number; procStart: string }) => `${r.pid}:${r.procStart}`

export function toPeer(r: SessionRecord, root: string): PeerView {
  return {
    sessionId: r.sessionId,
    pid: r.pid,
    name: r.name,
    status: r.status,
    kind: r.kind,
    where: whereIn(r.cwd, root),
    startedAt: r.startedAt,
    statusSince: r.statusSince,
  }
}

const STATUS_RANK: Record<string, number> = { busy: 0, waiting: 1, idle: 2, shell: 3 }

// Interactive sessions first, then by status (busy first), then the newest first.
export function sortPeers(peers: readonly PeerView[]): PeerView[] {
  const rank = (p: PeerView) => [p.kind === 'interactive' ? 0 : 1, STATUS_RANK[p.status] ?? 4, -(p.startedAt ?? 0)]
  return [...peers].sort((a, b) => {
    const ra = rank(a)
    const rb = rank(b)
    for (let i = 0; i < ra.length; i++) {
      const d = (ra[i] ?? 0) - (rb[i] ?? 0)
      if (d !== 0) return d
    }
    return a.name.localeCompare(b.name)
  })
}

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

export function peersText(peers: readonly PeerView[], root: string, now: number): string {
  if (peers.length === 0) return `No other Claude Code sessions in ${repoName(root)}.`
  const lines = peers.map(p => {
    const detail = peerDetail(p, now)
    return `- ${p.name}: ${p.status} ${forText(p.statusSince, now)}${detail ? ` (${detail})` : ''}`
  })
  return `${peers.length} other session${peers.length === 1 ? '' : 's'} in ${repoName(root)}:\n${lines.join('\n')}`
}
