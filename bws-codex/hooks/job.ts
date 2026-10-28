// Job records, ids, paths and the supervisor's status file. Pure: register.ts is the only module that uses $.

export type Effort = 'low' | 'medium' | 'high' | 'xhigh'
export const EFFORTS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh']

// `starting` until the supervisor has Codex running; `running` while a turn runs (and while the mod commits it).
export type JobState = 'starting' | 'running' | 'done' | 'failed' | 'cancelled' | 'timed_out'
export const TERMINAL: readonly JobState[] = ['done', 'failed', 'cancelled', 'timed_out']
export const isTerminal = (s: JobState) => TERMINAL.includes(s)

export type DiffStat = { files: number; insertions: number; deletions: number }
export const NO_DIFF: DiffStat = { files: 0, insertions: 0, deletions: 0 }

// The main checkout's uncommitted tracked edits, carried into the worktree as one commit before Codex starts.
export type Carry = { stash: string; commit: string | null; error: string | null }

// One delegated job: the $.store value under `job:<id>`, and the job folder's job.json.
export type Job = {
  version: 1
  id: string
  title: string
  // The main checkout's root; jobs are listed per repo by it.
  repo: string
  // The working tree the job was started from: its HEAD is the base, and the branch merges back there.
  top: string
  worktree: string
  branch: string
  base: string
  // The job folder: <git-common-dir>/bws-codex/jobs/<id>.
  dir: string
  model: string
  effort: Effort
  network: boolean
  carry: Carry | null
  // The session that started it; its process wakes Claude when a turn ends.
  owner: string
  createdAt: number
  updatedAt: number
  // The latest turn, from 1. A follow-up is the next turn on the same thread and worktree.
  turn: number
  state: JobState
  turnStartedAt: number
  endedAt: number | null
  threadId: string | null
  head: string | null
  // The branch against the base, after the latest turn's commit.
  diffstat: DiffStat
  error: string | null
  // The last turn whose end Claude was told about (a wake or a result); 0 for none.
  delivered: number
}

// ---------- ids ----------

export const slugOf = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
    .replace(/-+$/, '') || 'job'

// `<slug>-<6 hex>`: readable in a branch name and unlikely to collide. `rand` returns [0, 1).
export function jobId(title: string, rand: () => number): string {
  const hex = Math.floor(rand() * 0x1000000)
    .toString(16)
    .padStart(6, '0')
  return `${slugOf(title)}-${hex}`
}

export const ID_RE = /^[a-z0-9-]{1,40}$/

// ---------- paths ----------

export const slash = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')
const parentOf = (p: string) => p.slice(0, p.lastIndexOf('/'))
const nameOf = (p: string) => p.slice(p.lastIndexOf('/') + 1)

// The main checkout's root: the common dir's parent when it is `<root>/.git`, else the working tree itself.
export function mainRootOf(commonDir: string, top: string): string {
  const c = slash(commonDir)
  return nameOf(c) === '.git' ? parentOf(c) : slash(top)
}

export const worktreeOf = (mainRoot: string, id: string) => `${parentOf(slash(mainRoot))}/${nameOf(slash(mainRoot))}.codex-worktrees/${id}`
export const jobDirOf = (commonDir: string, id: string) => `${slash(commonDir)}/bws-codex/jobs/${id}`

export type TurnFiles = { spec: string; prompt: string; events: string; last: string; raw: string; stderr: string }
export const turnFiles = (dir: string, n: number): TurnFiles => ({
  spec: `${dir}/turn-${n}.json`,
  prompt: `${dir}/turn-${n}.prompt.txt`,
  events: `${dir}/turn-${n}.events.jsonl`,
  last: `${dir}/turn-${n}.last.txt`,
  raw: `${dir}/turn-${n}.raw.jsonl`,
  stderr: `${dir}/turn-${n}.stderr`,
})
export const statusFileOf = (dir: string) => `${dir}/status.json`
export const jobFileOf = (dir: string) => `${dir}/job.json`
export const patchFileOf = (dir: string) => `${dir}/diff.patch`

// Paths compared as Windows does: slashes either way, any case.
export const samePath = (a: string, b: string) => slash(a).toLowerCase() === slash(b).toLowerCase()

// ---------- store ----------

export const STORE_PREFIX = 'job:'
export const storeKey = (id: string) => `${STORE_PREFIX}${id}`

export function parseJob(v: unknown): Job | undefined {
  if (typeof v !== 'object' || v === null) return undefined
  const j = v as Partial<Job>
  if (j.version !== 1 || typeof j.id !== 'string' || typeof j.dir !== 'string' || typeof j.turn !== 'number') return undefined
  return j as Job
}

// ---------- the supervisor's status.json ----------

export type SupervisorStatus = {
  turn: number
  state: JobState | 'committing'
  supervisorPid: number | null
  codexPid: number | null
  startedAt: number
  beatAt: number
  endedAt?: number | null
  exitCode?: number | null
  turnEnded?: boolean
  error?: string | null
  commit?: string | null
  commitError?: string | null
  head?: string | null
  stat?: string
  shortstat?: string
}

export function parseStatus(text: string | undefined): SupervisorStatus | undefined {
  if (text === undefined) return undefined
  try {
    const v = JSON.parse(text) as Partial<SupervisorStatus>
    return typeof v === 'object' && v !== null && typeof v.turn === 'number' && typeof v.state === 'string' ? (v as SupervisorStatus) : undefined
  } catch {
    return undefined
  }
}

// ` 3 files changed, 41 insertions(+), 2 deletions(-)` (either count may be missing).
export function parseShortstat(s: string | undefined): DiffStat {
  const num = (re: RegExp) => Number(re.exec(s ?? '')?.[1] ?? 0)
  return { files: num(/(\d+) files? changed/), insertions: num(/(\d+) insertions?\(\+\)/), deletions: num(/(\d+) deletions?\(-\)/) }
}

// The supervisor writes status.json at least every 15 s while a turn runs; silence this long means it died.
export const LOST_MS = 90_000

// The job as the latest status.json says. A status of another turn (an older one, before a follow-up's
// launch rewrote it) changes nothing.
export function applyStatus(job: Job, st: SupervisorStatus | undefined, now: number): Job {
  if (st === undefined || st.turn !== job.turn || isTerminal(job.state)) return job
  const isLive = st.state === 'starting' || st.state === 'running' || st.state === 'committing'
  if (isLive) {
    if (now - (st.beatAt || st.startedAt) > LOST_MS) {
      const what = st.state === 'starting' ? 'the supervisor never started' : 'the supervisor stopped answering'
      return { ...job, state: 'failed', endedAt: now, updatedAt: now, error: `${what} (no heartbeat for ${Math.round((now - (st.beatAt || st.startedAt)) / 1000)}s)` }
    }
    const state: JobState = st.state === 'starting' ? 'starting' : 'running'
    return state === job.state ? job : { ...job, state, updatedAt: now }
  }
  const commitError = st.commitError ? `commit failed: ${st.commitError}` : null
  return {
    ...job,
    state: st.state as JobState,
    endedAt: st.endedAt ?? now,
    updatedAt: now,
    head: st.head ?? job.head,
    diffstat: st.shortstat !== undefined ? parseShortstat(st.shortstat) : job.diffstat,
    error: [st.error, commitError].filter(Boolean).join('; ') || null,
  }
}
