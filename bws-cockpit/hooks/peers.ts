// Session registry: the live Claude Code sessions on this machine, read from the engine's own
// registry (<config dir>/sessions/<pid>.json), with repo keys and process liveness. Pure helpers,
// kept from the Repo Sessions pane (dropped in 0.10.0) for an editor lease to build on.

import { toSlash } from './projects'
export type SessionRecord = {
  pid: number
  procStart: string
  pipe: string | null // messagingSocketPath, normalized
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
export const normPipe = (p: string) => p.replace(/^uds:/i, '').replace(/[\\/]+/g, '/').toLowerCase()

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
