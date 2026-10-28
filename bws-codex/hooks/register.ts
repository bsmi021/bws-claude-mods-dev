import type { EngineInterface, Register } from 'claude-code'

import { parseCancel, parseDelegate, parseFollowup, parseResult } from './args'
import type { DelegateArgs } from './args'
import { codexCandidates, execArgv, firstPrompt, followupPrompt, resumeArgv, turnSpec } from './argv'
import type { CodexRun } from './argv'
import { reduceEvents } from './events'
import type { TurnSummary } from './events'
import { isAllowed } from './gate'
import {
  EFFORTS,
  NO_DIFF,
  STORE_PREFIX,
  applyStatus,
  isTerminal,
  jobDirOf,
  jobId,
  mainRootOf,
  parseJob,
  parseStatus,
  samePath,
  slash,
  statusFileOf,
  storeKey,
  turnFiles,
  worktreeOf,
} from './job'
import type { Carry, Effort, Job, SupervisorStatus } from './job'
import { diffText, listText, resultText, startedText, statusLine, wakeText } from './result'

// bws-codex: Claude delegates write work to Codex CLI jobs. Each job runs in a worktree the mod makes, on branch
// codex/<id>; a detached supervisor (bin/supervise.py) runs `codex exec`, then commits what Codex changed. The
// job index is in $.store (one `job:<id>` key per job, shared by every session); the truth is the job folder
// <git-common-dir>/bws-codex/jobs/<id>. Engine functions (startJob, followupJob, cancelJob, listJobs, readResult)
// are what the tools call, and what the Codex tab calls (INTERFACE.md in the build run).

type Options = {
  model: string
  effort: Effort
  timeoutS: number
  isWake: boolean
  codexPath: string
  python: string
}

const POLL_MS = 4000
const WAKE_GAP_MS = 30_000
const GIT_MS = 120_000

// Jobs whose turn this process started: it polls them and wakes Claude when they end.
const watched = new Set<string>()
// Ended turns not yet reported to Claude, waiting for an idle moment.
const pending = new Set<string>()
const phases: Record<string, string> = {}
let isBusy = false
let isInteractive = false
let lastWakeAt = 0
let lastStatus: string | undefined
let poll: { cancel: () => void } | undefined
let isTicking = false
let codexExe: string | undefined

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err))
const tail = (s: string | undefined, n = 300) => (s ?? '').trim().slice(-n)

async function settle<T>(p: Promise<T>): Promise<T | undefined> {
  try {
    return await p
  } catch {
    return undefined
  }
}

// ---------- repo, codex, supervisor ----------

type Repo = { top: string; common: string; main: string; head: string }

async function repoOf($: EngineInterface, cwd: string): Promise<Repo | string> {
  const r = await settle($.process.run(['git', 'rev-parse', '--path-format=absolute', '--show-toplevel', '--git-common-dir', 'HEAD'], { cwd, timeoutMs: 20_000 }))
  if (r === undefined) return 'git could not run here'
  if (r.exitCode !== 0) return /unknown revision|ambiguous argument 'HEAD'/.test(r.stderr) ? 'this repository has no commits yet' : `${cwd} is not in a git repository`
  const [top, common, head] = r.stdout.trim().split(/\r?\n/)
  if (!top || !common || !head) return 'git rev-parse gave no answer'
  return { top: slash(top), common: slash(common), main: mainRootOf(common, top), head: head.trim() }
}

async function codexOf($: EngineInterface, o: Options): Promise<string | undefined> {
  if (o.codexPath) return o.codexPath
  if (codexExe !== undefined) return codexExe
  for (const p of codexCandidates(await $.env.get('APPDATA'))) {
    if (await settle($.fs.exists(p))) {
      codexExe = p
      return p
    }
  }
  return undefined
}

async function supervise($: EngineInterface, o: Options, args: string[], timeoutMs: number, stdin?: string) {
  return $.process.run([o.python, `${$.plugin.root}/bin/supervise.py`, ...args], {
    timeoutMs,
    env: { PYTHONIOENCODING: 'utf-8' },
    ...(stdin !== undefined ? { stdin } : {}),
  })
}

const runOf = (codex: string, job: Job): CodexRun => ({
  codex,
  model: job.model,
  effort: job.effort,
  network: job.network,
  worktree: job.worktree,
  lastFile: turnFiles(job.dir, job.turn).last,
})

// ---------- the index ----------

async function loadJob($: EngineInterface, id: string): Promise<Job | undefined> {
  return parseJob(await $.store.get(storeKey(id)))
}

// Saves the job; a turn already reported stays reported, whoever saved last.
async function saveJob($: EngineInterface, job: Job) {
  const stored = parseJob(await settle($.store.get(storeKey(job.id))))
  const delivered = stored && stored.turn === job.turn ? Math.max(stored.delivered, job.delivered) : job.delivered
  await $.store.set(storeKey(job.id), { ...job, delivered })
}

type Fresh = { job: Job; summary: TurnSummary | undefined; status: SupervisorStatus | undefined }

// The job as its folder says now: status.json and the latest turn's events. Saved when it changed.
async function refresh($: EngineInterface, job: Job): Promise<Fresh> {
  const now = await $.clock.now()
  const status = parseStatus(await settle($.fs.read(statusFileOf(job.dir))))
  const events = await settle($.fs.read(turnFiles(job.dir, job.turn).events))
  const summary = events === undefined ? undefined : reduceEvents(events)
  let fresh = applyStatus(job, status, now)
  if (summary?.threadId && summary.threadId !== fresh.threadId) fresh = { ...fresh, threadId: summary.threadId, updatedAt: now }
  if (fresh !== job) await saveJob($, fresh)
  return { job: fresh, summary, status }
}

// The Codex thread id, from the newest turn whose events name it.
async function threadOf($: EngineInterface, job: Job): Promise<string | null> {
  for (let n = job.turn; n >= 1; n--) {
    const events = await settle($.fs.read(turnFiles(job.dir, n).events))
    const id = events === undefined ? null : reduceEvents(events).threadId
    if (id) return id
  }
  return null
}

// ---------- engine ----------

// Hands the turn's files to the supervisor and starts it detached. The job is saved either way.
async function launchTurn($: EngineInterface, o: Options, job: Job, prompt: string, argv: string[]): Promise<{ job: Job } | { error: string }> {
  const files = {
    'job.json': JSON.stringify(job, null, 1),
    [`turn-${job.turn}.json`]: JSON.stringify(turnSpec(job, job.turn, argv, o.timeoutS), null, 1),
    [`turn-${job.turn}.prompt.txt`]: prompt,
  }
  let r
  try {
    r = await supervise($, o, ['launch', job.dir, String(job.turn)], 30_000, JSON.stringify({ files }))
  } catch (err) {
    r = { exitCode: -1, stdout: '', stderr: `${o.python} could not run (${errText(err)}); set the pythonPath option` }
  }
  if (r.exitCode !== 0) {
    const now = await $.clock.now()
    const failed: Job = { ...job, state: 'failed', endedAt: now, updatedAt: now, error: `the supervisor did not start: ${tail(r.stderr || r.stdout)}`, delivered: job.turn }
    await saveJob($, failed)
    return { error: `${failed.error}. The worktree ${job.worktree} is kept; codex_cancel {"id": "${job.id}", "drop": true} removes it.` }
  }
  await saveJob($, job)
  watched.add(job.id)
  startPoll($, o)
  return { job }
}

// Copies the tracked uncommitted edits of the tree the job starts from into the worktree, as one commit.
async function carryIn($: EngineInterface, job: Job): Promise<Carry> {
  const run = (cwd: string, args: string[]) => settle($.process.run(['git', '-C', cwd, ...args], { timeoutMs: GIT_MS }))
  const made = await run(job.top, ['stash', 'create'])
  if (made === undefined || made.exitCode !== 0) return { stash: '', commit: null, error: `git stash create failed: ${tail(made?.stderr)}` }
  const stash = made.stdout.trim()
  if (stash === '') return { stash: '', commit: null, error: null }
  const applied = await run(job.worktree, ['stash', 'apply', stash])
  if (applied === undefined || applied.exitCode !== 0) return { stash, commit: null, error: `git stash apply failed: ${tail(applied?.stderr || applied?.stdout)}` }
  await run(job.worktree, ['add', '-A'])
  const done = await run(job.worktree, ['commit', '-q', '-m', `carry: uncommitted edits from ${job.top}`])
  if (done === undefined || done.exitCode !== 0) return { stash, commit: null, error: `carry commit failed: ${tail(done?.stderr || done?.stdout)}` }
  const head = await run(job.worktree, ['rev-parse', 'HEAD'])
  return { stash, commit: head?.stdout.trim() || null, error: null }
}

// Starts a job: worktree, optional carry, first turn. The tools' codex_delegate and the tab's job start.
async function startJob($: EngineInterface, o: Options, a: DelegateArgs): Promise<{ job: Job } | { error: string }> {
  const repo = await repoOf($, await $.session.cwd())
  if (typeof repo === 'string') return { error: repo }
  const codex = await codexOf($, o)
  if (codex === undefined) return { error: 'codex.exe not found: install @openai/codex with npm, or set the codexPath option to the native codex.exe (not the npm .cmd shim)' }
  const id = jobId(a.title, Math.random)
  const worktree = worktreeOf(repo.main, id)
  const branch = `codex/${id}`
  const added = await settle($.process.run(['git', '-C', repo.main, 'worktree', 'add', '-b', branch, worktree, repo.head], { timeoutMs: GIT_MS }))
  if (added === undefined || added.exitCode !== 0) return { error: `git worktree add failed: ${tail(added?.stderr || added?.stdout)}` }
  const now = await $.clock.now()
  let job: Job = {
    version: 1,
    id,
    title: a.title,
    repo: repo.main,
    top: repo.top,
    worktree,
    branch,
    base: repo.head,
    dir: jobDirOf(repo.common, id),
    model: o.model,
    effort: a.effort,
    network: a.network,
    carry: null,
    owner: await $.session.id(),
    createdAt: now,
    updatedAt: now,
    turn: 1,
    state: 'starting',
    turnStartedAt: now,
    endedAt: null,
    threadId: null,
    head: repo.head,
    diffstat: NO_DIFF,
    error: null,
    delivered: 0,
  }
  if (a.carry) {
    const carry = await carryIn($, job)
    job = { ...job, carry, head: carry.commit ?? job.head }
  }
  return launchTurn($, o, job, firstPrompt(job, a.prompt), execArgv(runOf(codex, job)))
}

// The next turn on a finished job's Codex thread, in the same worktree.
async function followupJob($: EngineInterface, o: Options, id: string, prompt: string): Promise<{ job: Job } | { error: string }> {
  const stored = await loadJob($, id)
  if (stored === undefined) return { error: `no Codex job ${id} (codex_status lists them)` }
  const { job } = await refresh($, stored)
  if (!isTerminal(job.state)) return { error: `job ${id} is still on turn ${job.turn}: wait for it with codex_result, or codex_cancel it first` }
  const threadId = job.threadId ?? (await threadOf($, job))
  if (threadId === null) return { error: `job ${id} has no Codex thread to continue (its first turn never started one); start a new job instead` }
  if (!(await settle($.fs.exists(job.worktree)))) return { error: `the worktree ${job.worktree} is gone; start a new job instead` }
  const codex = await codexOf($, o)
  if (codex === undefined) return { error: 'codex.exe not found: set the codexPath option' }
  const now = await $.clock.now()
  const turn: Job = {
    ...job,
    threadId,
    turn: job.turn + 1,
    state: 'starting',
    turnStartedAt: now,
    endedAt: null,
    updatedAt: now,
    error: null,
    owner: await $.session.id(),
  }
  return launchTurn($, o, turn, followupPrompt(job, turn.turn, prompt), resumeArgv(runOf(codex, turn), threadId))
}

// Stops a running turn; with drop, also removes the worktree, archives the thread and deletes a merged branch.
async function cancelJob($: EngineInterface, o: Options, id: string, drop: boolean): Promise<string> {
  const stored = await loadJob($, id)
  if (stored === undefined) return `No Codex job ${id} (codex_status lists them).`
  let { job } = await refresh($, stored)
  const lines: string[] = []
  if (!isTerminal(job.state)) {
    await settle(supervise($, o, ['cancel', job.dir], 60_000))
    job = (await refresh($, job)).job
    if (!isTerminal(job.state)) {
      const now = await $.clock.now()
      job = { ...job, state: 'cancelled', endedAt: now, updatedAt: now, error: 'cancel sent; the supervisor did not confirm' }
    }
    lines.push(job.state === 'cancelled' ? `Cancelled turn ${job.turn} of codex job ${id}; edits so far are committed on ${job.branch} (${diffText(job.diffstat)}).` : `Codex job ${id} had already ended: ${job.state}.`)
    job = { ...job, delivered: job.turn }
    await saveJob($, job)
  } else if (!drop) {
    lines.push(`Codex job ${id} is not running (${job.state}). Pass drop: true to remove its worktree.`)
  }
  pending.delete(id)
  watched.delete(id)
  if (drop) {
    const gone = await settle($.process.run(['git', '-C', job.repo, 'worktree', 'remove', '--force', job.worktree], { timeoutMs: GIT_MS }))
    lines.push(gone?.exitCode === 0 ? `Removed the worktree ${job.worktree}.` : `The worktree ${job.worktree} was not removed: ${tail(gone?.stderr) || 'git did not run'}.`)
    const threadId = job.threadId ?? (await threadOf($, job))
    const codex = await codexOf($, o)
    if (threadId !== null && codex !== undefined) {
      const archived = await settle($.process.run([codex, 'archive', threadId], { timeoutMs: 120_000, stdin: '' }))
      lines.push(archived?.exitCode === 0 ? `Archived Codex thread ${threadId}.` : `Codex thread ${threadId} was not archived: ${tail(archived?.stderr || archived?.stdout) || 'codex did not run'}.`)
    }
    const deleted = await settle($.process.run(['git', '-C', job.top, 'branch', '-d', job.branch], { timeoutMs: GIT_MS }))
    lines.push(
      deleted?.exitCode === 0
        ? `Deleted branch ${job.branch} (it was merged).`
        : `Kept branch ${job.branch}: it is not merged into ${job.top}'s HEAD. \`git branch -D ${job.branch}\` deletes it.`,
    )
    await $.store.delete(storeKey(id))
  }
  return lines.join('\n')
}

// This repo's jobs (every repo's with `repo` undefined), newest first, running ones refreshed.
async function listJobs($: EngineInterface, repo: string | undefined): Promise<Job[]> {
  const out: Job[] = []
  for (const key of await $.store.keys()) {
    if (!key.startsWith(STORE_PREFIX)) continue
    const job = parseJob(await settle($.store.get(key)))
    if (job === undefined || (repo !== undefined && !samePath(job.repo, repo))) continue
    out.push(isTerminal(job.state) ? job : (await refresh($, job)).job)
  }
  return out.sort((a, b) => b.createdAt - a.createdAt)
}

// A job's result as Claude reads it; waits up to waitS for a running turn. A finished turn counts as reported.
async function readResult($: EngineInterface, o: Options, id: string, waitS: number): Promise<{ text: string; job: Job } | { error: string }> {
  const stored = await loadJob($, id)
  if (stored === undefined) return { error: `no Codex job ${id} (codex_status lists them)` }
  let fresh = await refresh($, stored)
  if (!isTerminal(fresh.job.state) && waitS > 0) {
    await settle(supervise($, o, ['wait', fresh.job.dir, String(fresh.job.turn), String(waitS)], (waitS + 20) * 1000))
    fresh = await refresh($, fresh.job)
  }
  let job = fresh.job
  const now = await $.clock.now()
  let message: string | null = null
  if (isTerminal(job.state)) {
    message = (await settle($.fs.read(turnFiles(job.dir, job.turn).last))) ?? fresh.summary?.lastMessage ?? null
    if (job.delivered < job.turn) {
      job = { ...job, delivered: job.turn }
      await saveJob($, job)
    }
    pending.delete(id)
  }
  return { text: resultText(job, fresh.summary, message, fresh.status?.stat ?? '', now, canWake(o)), job }
}

const canWake = (o: Options) => isInteractive && o.isWake

// ---------- progress and wake ----------

function startPoll($: EngineInterface, o: Options) {
  if (poll === undefined) poll = $.clock.every(POLL_MS, () => void settle(tick($, o)))
}

function setStatus($: EngineInterface, text: string | undefined) {
  if (text === lastStatus) return
  lastStatus = text
  $.ui.status(text)
}

// Reads the watched jobs' folders: the status line, a toast and a pending report when a turn ends.
async function tick($: EngineInterface, o: Options) {
  if (isTicking) return
  isTicking = true
  try {
    const now = await $.clock.now()
    const live: Job[] = []
    for (const id of [...watched]) {
      const stored = await loadJob($, id)
      if (stored === undefined) {
        watched.delete(id)
        continue
      }
      const { job, summary } = await refresh($, stored)
      if (isTerminal(job.state)) {
        watched.delete(id)
        delete phases[id]
        if (job.delivered < job.turn) pending.add(id)
        $.ui.toast(`codex: job ${id} ${job.state === 'done' ? `done (${diffText(job.diffstat)})` : job.state.replace('_', ' ')}`, { timeoutMs: 8000 })
      } else {
        if (summary) phases[id] = summary.phase
        live.push(job)
      }
    }
    setStatus($, statusLine(live, now, phases))
    await wake($, o, now)
    if (watched.size === 0 && pending.size === 0 && poll !== undefined) {
      poll.cancel()
      poll = undefined
    }
  } finally {
    isTicking = false
  }
}

// One prompt for every ended turn not yet reported, while Claude is idle, at most once per WAKE_GAP_MS.
// Called from timers only: a hook awaiting a prompt that waits for idle would deadlock its own turn.
async function wake($: EngineInterface, o: Options, now: number) {
  if (pending.size === 0 || isBusy || now - lastWakeAt < WAKE_GAP_MS) return
  if (!canWake(o)) {
    pending.clear()
    return
  }
  const items: { job: Job; message: string | null }[] = []
  for (const id of [...pending]) {
    const job = await loadJob($, id)
    if (job === undefined || job.delivered >= job.turn || !isTerminal(job.state)) continue
    items.push({ job, message: (await settle($.fs.read(turnFiles(job.dir, job.turn).last))) ?? null })
  }
  pending.clear()
  if (items.length === 0) return
  lastWakeAt = now
  for (const { job } of items) await saveJob($, { ...job, delivered: job.turn })
  // The wake starts a turn of its own; turn.complete frees the next one.
  isBusy = true
  void $.prompt.submit({ text: wakeText(items, now) }).catch(() => undefined)
}

// ---------- tool bodies ----------

type ToolAnswer = { result: string } | { deny: string }

async function delegateTool($: EngineInterface, o: Options, e: Record<string, unknown>): Promise<ToolAnswer> {
  const a = parseDelegate(e, o.effort)
  if ('error' in a) return { deny: `bws-codex: ${a.error}` }
  const started = await startJob($, o, a)
  if ('error' in started) return { deny: `bws-codex: ${started.error}` }
  if (a.waitS === 0) return { result: startedText(started.job, canWake(o)) }
  const r = await readResult($, o, started.job.id, a.waitS)
  return 'error' in r ? { deny: `bws-codex: ${r.error}` } : { result: r.text }
}

async function followupTool($: EngineInterface, o: Options, e: Record<string, unknown>): Promise<ToolAnswer> {
  const a = parseFollowup(e)
  if ('error' in a) return { deny: `bws-codex: ${a.error}` }
  const started = await followupJob($, o, a.id, a.prompt)
  if ('error' in started) return { deny: `bws-codex: ${started.error}` }
  if (a.waitS === 0) return { result: startedText(started.job, canWake(o)) }
  const r = await readResult($, o, a.id, a.waitS)
  return 'error' in r ? { deny: `bws-codex: ${r.error}` } : { result: r.text }
}

async function resultTool($: EngineInterface, o: Options, e: Record<string, unknown>): Promise<ToolAnswer> {
  const a = parseResult(e)
  if ('error' in a) return { deny: `bws-codex: ${a.error}` }
  const r = await readResult($, o, a.id, a.waitS)
  return 'error' in r ? { deny: `bws-codex: ${r.error}` } : { result: r.text }
}

async function statusTool($: EngineInterface, e: Record<string, unknown>): Promise<ToolAnswer> {
  const now = await $.clock.now()
  if (typeof e.id === 'string' && e.id.trim() !== '') {
    const stored = await loadJob($, e.id.trim())
    if (stored === undefined) return { deny: `bws-codex: no Codex job ${e.id}` }
    return { result: listText([(await refresh($, stored)).job], stored.repo, now) }
  }
  const repo = await repoOf($, await $.session.cwd())
  const scope = e.all === true || typeof repo === 'string' ? undefined : repo.main
  return { result: listText(await listJobs($, scope), scope ?? 'every repository', now) }
}

async function cancelTool($: EngineInterface, o: Options, e: Record<string, unknown>): Promise<ToolAnswer> {
  const a = parseCancel(e)
  if ('error' in a) return { deny: `bws-codex: ${a.error}` }
  return { result: await cancelJob($, o, a.id, a.drop) }
}

const DELEGATE_DESCRIPTION =
  'Delegate a coding task to OpenAI Codex, which runs on the user\'s ChatGPT plan. Codex works in its own git worktree on a new branch ' +
  'codex/<id> made from your current commit, so your working tree is untouched. It edits files and runs commands in a sandbox ' +
  '(workspace-write; no internet unless network is true; localhost is reachable) but cannot commit: the mod commits each turn on the branch, ' +
  'and you review and merge it. Codex cannot see this conversation, so the prompt must be the complete task: the files, the constraints, ' +
  'and the checks to run. Returns a job id at once; a turn takes 1-3 minutes and you are told when it finishes (or pass wait). ' +
  'Good for self-contained work you can review as a diff.'

export const register: Register = (on, options) => {
  const effort = EFFORTS.includes(options.effort as Effort) ? (options.effort as Effort) : 'medium'
  const o: Options = {
    model: typeof options.model === 'string' && options.model.trim() !== '' ? options.model.trim() : 'gpt-6.1-sol',
    effort,
    timeoutS: Math.max(1, Number(options.timeoutMinutes ?? 30)) * 60,
    isWake: options.wake !== false,
    codexPath: typeof options.codexPath === 'string' ? options.codexPath.trim() : '',
    python: typeof options.pythonPath === 'string' && options.pythonPath.trim() !== '' ? options.pythonPath.trim() : 'python',
  }

  on('session.start', async ($, e, next) => {
    isInteractive = e.isInteractive === true
    await $.tool.register({
      name: 'codex_delegate',
      description: DELEGATE_DESCRIPTION,
      isDeferred: false,
      inputSchema: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'The complete task for Codex: what to change, which files, constraints, and the checks to run (tests, build).' },
          title: { type: 'string', maxLength: 80, description: 'Short label for the job; it names the branch.' },
          effort: { type: 'string', enum: [...EFFORTS], description: `Codex reasoning effort. Default ${o.effort}.` },
          network: { type: 'boolean', description: 'Let Codex\'s commands reach the internet (package installs, web requests). Default false.' },
          carry: {
            type: 'boolean',
            description: 'Copy your working tree\'s uncommitted tracked edits into the job as its first commit (untracked files stay behind). Default false: Codex starts from your last commit.',
          },
          wait: { type: 'integer', minimum: 0, maximum: 540, description: 'Seconds to wait for the turn to finish before returning. Default 0: return the job id at once.' },
        },
        required: ['prompt'],
      },
    })
    await $.tool.register({
      name: 'codex_result',
      description:
        'Get a Codex job\'s result: its state, branch, diff stat against the base, and Codex\'s final message; for a running job, what it is doing. ' +
        'wait_s blocks up to that many seconds for a running turn.',
      isDeferred: false,
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The job id codex_delegate returned.' },
          wait_s: { type: 'integer', minimum: 0, maximum: 540, description: 'Seconds to wait for a running turn. Default 0: answer at once.' },
        },
        required: ['id'],
      },
    })
    await $.tool.register({
      name: 'codex_status',
      description: 'List this repository\'s Codex jobs (newest first) with state, branch and diff stat, or one job by id.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'One job id; empty lists the jobs.' },
          all: { type: 'boolean', description: 'List jobs of every repository. Default false.' },
        },
      },
    })
    await $.tool.register({
      name: 'codex_cancel',
      description:
        'Stop a running Codex job (its edits so far are committed on its branch). drop: true also removes the job\'s worktree, archives its Codex thread, ' +
        'and deletes its branch if it is merged (an unmerged branch is kept). Use drop after merging a job, or to throw one away.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The job id.' },
          drop: { type: 'boolean', description: 'Also remove the worktree, archive the thread and delete the branch if merged. Default false.' },
        },
        required: ['id'],
      },
    })
    await $.tool.register({
      name: 'codex_followup',
      description:
        'Send a finished Codex job more instructions: the next turn on the same Codex thread (it remembers the earlier turns), in the same worktree and branch. ' +
        'Returns at once like codex_delegate, or waits with wait.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The job id.' },
          prompt: { type: 'string', description: 'What to do next. Codex sees its earlier turns but not this conversation.' },
          wait: { type: 'integer', minimum: 0, maximum: 540, description: 'Seconds to wait for the turn to finish. Default 0.' },
        },
        required: ['id', 'prompt'],
      },
    })
    // After a hot reload: keep watching the jobs this session started.
    const me = await settle($.session.id())
    for (const key of (await settle($.store.keys())) ?? []) {
      if (!key.startsWith(STORE_PREFIX)) continue
      const job = parseJob(await settle($.store.get(key)))
      if (job !== undefined && job.owner === me && !isTerminal(job.state)) watched.add(job.id)
    }
    if (watched.size > 0) startPoll($, o)
    return next(e)
  })

  // A prompt starts a turn: hold wakes until it ends.
  on('prompt.submit', async ($, e, next) => {
    isBusy = true
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) {
      isBusy = false
      if (pending.size > 0) $.clock.after(1500, () => void settle(tick($, o)))
    }
    return next(e)
  })

  // The write tools go through the permission system first (next(e)): the native dialog, rules, tool.check hooks.
  on('tool.call', { tool: 'mcp__bws-codex__codex_delegate' }, async ($, e, next) => {
    const gate = await next(e)
    if (!isAllowed(gate)) return gate
    return delegateTool($, o, e as unknown as Record<string, unknown>)
  }).catch(($, e, next) => ({ deny: `bws-codex: codex_delegate failed: ${errText(next.error)}` }))

  on('tool.call', { tool: 'mcp__bws-codex__codex_followup' }, async ($, e, next) => {
    const gate = await next(e)
    if (!isAllowed(gate)) return gate
    return followupTool($, o, e as unknown as Record<string, unknown>)
  }).catch(($, e, next) => ({ deny: `bws-codex: codex_followup failed: ${errText(next.error)}` }))

  on('tool.call', { tool: 'mcp__bws-codex__codex_cancel' }, async ($, e, next) => {
    const gate = await next(e)
    if (!isAllowed(gate)) return gate
    return cancelTool($, o, e as unknown as Record<string, unknown>)
  }).catch(($, e, next) => ({ deny: `bws-codex: codex_cancel failed: ${errText(next.error)}` }))

  // Reading a job changes nothing: no permission step.
  on('tool.call', { tool: 'mcp__bws-codex__codex_result' }, async ($, e) => resultTool($, o, e as unknown as Record<string, unknown>)).catch(($, e, next) => ({
    deny: `bws-codex: codex_result failed: ${errText(next.error)}`,
  }))

  on('tool.call', { tool: 'mcp__bws-codex__codex_status' }, async ($, e) => statusTool($, e as unknown as Record<string, unknown>)).catch(($, e, next) => ({
    deny: `bws-codex: codex_status failed: ${errText(next.error)}`,
  }))
}
