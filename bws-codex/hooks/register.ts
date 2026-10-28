import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { API_MODELS, API_URL, API_WAIT_MS, POLL_MS as API_POLL_MS, apiError, bodyFor, isPollDue, isTerminal as isApiTerminal, outcomeOf, stripKeys, usageOf } from './api'
import { parseCancel, parseDelegate, parseFollowup, parseResult } from './args'
import type { DelegateArgs } from './args'
import { codexCandidates, execArgv, firstPrompt, followupPrompt, resumeArgv, turnSpec } from './argv'
import type { CodexRun } from './argv'
import { capsuleArgv, capsuleText, partnerBrief } from './capsule'
import { answerAt, codexFirstPrompt, emptyChat, parseChat, parseCodex, pressOf, pullOf, sendBackText, turnInput, withMsgs } from './chat'
import type { Chat, ChatMsg, Engine, Pulled } from './chat'
import { reduceEvents } from './events'
import type { TurnSummary } from './events'
import { isAllowed } from './gate'
import {
  EFFORTS,
  NO_DIFF,
  STORE_PREFIX,
  applyStatus,
  isChat,
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
import { makeSummary } from './kit/summary'
import { parseEvent } from './kit/tab'
import { diffText, duration, listText, resultText, startedText, wakeText } from './result'
import { codexSummary, codexTab, mergeHint } from './view'
import type { JobDetail, View } from './view'

// bws-codex: Claude delegates write work to Codex CLI jobs. Each job runs in a worktree the mod makes, on branch
// codex/<id>; a detached supervisor (bin/supervise.py) runs `codex exec`, then commits what Codex changed. The
// job index is in $.store (one `job:<id>` key per job, shared by every session); the truth is the job folder
// <git-common-dir>/bws-codex/jobs/<id>. Engine functions (startJob, followupJob, cancelJob, listJobs, readResult)
// are what the tools call, and what the Codex tab calls (INTERFACE.md in the build run).
//
// The Codex tab (bws-cockpit's dashboard, bws-kit/tab.ts) has a Jobs view over the same records and a Chat view. Chat
// runs on one of two engines: `api` (the OpenAI Responses API with the openaiApiKey option, background + a 1 s poll) or
// `codex` (a chat job: Codex CLI in its own worktree, one job turn per message, never a wake).

type Options = {
  model: string
  effort: Effort
  timeoutS: number
  isWake: boolean
  codexPath: string
  python: string
  // '' turns the api chat engine off. Sent only in the Authorization header: never logged, stored or drawn.
  apiKey: string
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
let poll: { cancel: () => void } | undefined
let isTicking = false
let codexExe: string | undefined

// ---------- the tab's state ----------

// The tab and chip bws-cockpit draws, and the chat (parsed by chat.ts parseChat: typed unknown, so a reload with an
// older shape starts empty instead of failing).
const tabAtom = atom({ plugin: 'bws-codex', key: 'tab' } as const, null as unknown)
const summaryAtom = atom({ plugin: 'bws-codex', key: 'summary' } as const, null)
const chatAtom = atom({ plugin: 'bws-codex', key: 'chat' } as const, null as unknown)

let view: View = 'chat'
// Count up: `open` when the person's command asks cockpit to open the dashboard on this tab, `raise` for news (an answer,
// a job's end), `show` is unused (this mod never opens the pane itself).
let openCount = 0
let raiseCount = 0
// The next write keeps the dashboard at the chat's end (the person just sent or opened it).
let isPinNext = false
// The Jobs view: the job whose Diff is open (and what was read for it), the job whose follow-up input is open.
let expanded: string | null = null
let detail: JobDetail | null = null
let following: string | null = null
let follows = 0
// This session's repository (main checkout), whose jobs the tab lists; '' outside a repository.
let repoRoot = ''
let jobsSeen: Job[] = []
let defaultEngine: Engine = 'codex'
let lastTabJson = ''
let lastSummaryJson = ''
// The api engine's poll timers, one per response id.
const apiPolls = new Map<string, { cancel: () => void }>()

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

// Starts a job: worktree, optional carry, first turn. The tools' codex_delegate, and a chat thread on the codex engine
// (`kind` chat: its prompt is the partner brief and the chat turn's input, as given).
async function startJob($: EngineInterface, o: Options, a: DelegateArgs, kind?: 'chat'): Promise<{ job: Job } | { error: string }> {
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
    ...(kind ? { kind } : {}),
  }
  if (a.carry) {
    const carry = await carryIn($, job)
    job = { ...job, carry, head: carry.commit ?? job.head }
  }
  const prompt = kind === 'chat' ? codexFirstPrompt(partnerBrief('codex', branch), a.prompt) : firstPrompt(job, a.prompt)
  return launchTurn($, o, job, prompt, execArgv(runOf(codex, job)))
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
  // A chat turn's input already says what it is (capsule, message); the thread has the brief.
  const text = isChat(job) ? `${prompt.trim()}\n` : followupPrompt(job, turn.turn, prompt)
  return launchTurn($, o, turn, text, resumeArgv(runOf(codex, turn), threadId))
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
    const listed = await settle($.process.run(['git', '-C', job.repo, 'worktree', 'list', '--porcelain'], { timeoutMs: GIT_MS }))
    const isListed = listed === undefined || listed.stdout.split(/\r?\n/).some(l => l.startsWith('worktree ') && samePath(l.slice(9), job.worktree))
    if (gone?.exitCode === 0) lines.push(`Removed the worktree ${job.worktree}.`)
    else if (!isListed) {
      // Git emptied and unregistered it, but Codex's sandbox helper can hold the folder itself for minutes.
      await settle(supervise($, o, ['reap', job.worktree], 30_000))
      lines.push(`Removed the worktree ${job.worktree} from git; its emptied folder is still held by a Codex helper and is deleted in the background.`)
    } else lines.push(`The worktree ${job.worktree} was not removed: ${tail(gone?.stderr) || 'git did not run'}.`)
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

// Reads the watched jobs' folders: the tab and chip (progress shows there: $.ui.status draws as a warning line), a
// toast and a pending report when a turn ends.
async function tick($: EngineInterface, o: Options) {
  if (isTicking) return
  isTicking = true
  try {
    const now = await $.clock.now()
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
        // A chat turn's answer goes to the chat, never to Claude.
        if (isChat(job)) {
          await chatTurnEnded($, job, summary)
          continue
        }
        if (job.delivered < job.turn) pending.add(id)
        raiseCount += 1
        $.ui.toast(`codex: job ${id} ${job.state === 'done' ? `done (${diffText(job.diffstat)})` : job.state.replace('_', ' ')}`, { timeoutMs: 8000 })
      } else {
        if (summary) phases[id] = summary.phase
        if (isChat(job)) await chatPhase($, job.id, summary?.phase ?? '')
      }
    }
    await publishTab($, true)
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

// ---------- the Codex tab ----------

const NO_KEY = 'bws-codex: the api engine needs the openaiApiKey option (/plugin, bws-codex, configure). The codex engine needs no key.'

const note = (text: string): ChatMsg => ({ role: 'note', text })
const info = (text: string): ChatMsg => ({ role: 'note', text, isInfo: true })
const kTokens = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : String(n))

function later($: EngineInterface, p: Promise<unknown>) {
  void p.catch(err => $.ui.log(`bws-codex: ${stripKeys(errText(err))}`, { to: 'debug' }))
}

async function isDrawn($: EngineInterface) {
  return (await $.session.surfaces()).length > 0
}

async function readChat($: EngineInterface): Promise<Chat> {
  return parseChat(await read($, chatAtom), defaultEngine)
}

// Every change of the chat goes through here, so the tab follows it.
async function setChat($: EngineInterface, f: (c: Chat) => Chat): Promise<Chat> {
  const next = parseChat(await update($, chatAtom, v => f(parseChat(v, defaultEngine))), defaultEngine)
  await publishTab($)
  return next
}

// The tab and the chip as the chat and the jobs stand. Writes are queued, so an older one never lands after a newer one;
// `isJobs` lists this repository's jobs again first (else the last list is drawn). An unchanged tab is not written.
let publishing: Promise<void> = Promise.resolve()
function publishTab($: EngineInterface, isJobs = false): Promise<void> {
  publishing = publishing
    .then(async () => {
      if (isJobs) jobsSeen = repoRoot === '' ? [] : await listJobs($, repoRoot)
      const chat = await readChat($)
      const now = await $.clock.now()
      const isPin = isPinNext
      isPinNext = false
      const tab = codexTab({ view, chat, jobs: jobsSeen, now, hasKey, repo: repoRoot, phases, expanded, following, detail, follows, show: 0, open: openCount, raise: raiseCount, isPin })
      const json = JSON.stringify(tab)
      if (json !== lastTabJson) {
        lastTabJson = json
        await update($, tabAtom, () => tab)
      }
      const s = codexSummary(jobsSeen, chat, now, phases)
      const chip = s === null ? null : makeSummary(s.state, s.label, s.detail)
      const chipJson = JSON.stringify(chip)
      if (chipJson !== lastSummaryJson) {
        lastSummaryJson = chipJson
        await update($, summaryAtom, () => chip)
      }
    })
    .catch(() => undefined)
  return publishing
}
let hasKey = false

// The person's command asks for the tab: `open` counts up and cockpit opens the dashboard on it inside this same
// dispatch, so the open is theirs and the pane is cockpit's (the ring goes to the focused input). Never opened here.
async function showTab($: EngineInterface, v: View) {
  view = v
  isPinNext = v === 'chat'
  openCount += 1
  await publishTab($, true)
}

// The <workspace> block for Claude's working tree, from git itself (no model turn).
async function capsuleOf($: EngineInterface, cwd: string): Promise<string> {
  const out: string[] = []
  for (const argv of capsuleArgv(cwd)) {
    const r = await settle($.process.run(argv, { timeoutMs: 20_000 }))
    if (out.length === 0 && (r === undefined || r.exitCode !== 0)) return capsuleText(cwd, null)
    out.push(r !== undefined && r.exitCode === 0 ? r.stdout : '')
  }
  return capsuleText(cwd, { status: out[0] ?? '', shortstat: out[1] ?? '', log: out[2] ?? '' })
}

type ApiReply = { status: number; ok: boolean; json: unknown; text: string }

// One Responses API call. HTTP errors resolve (status >= 400); a transport failure or the 30 s cap throws.
async function openai($: EngineInterface, key: string, method: string, path: string, body?: unknown): Promise<ApiReply> {
  const headers: Record<string, string> = { Authorization: `Bearer ${key}` }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const r = await $.http.fetch(`${API_URL}${path}`, body === undefined ? { method, headers } : { method, headers, body: JSON.stringify(body) })
  let json: unknown
  try {
    json = JSON.parse(r.text)
  } catch {
    json = undefined
  }
  return { status: r.status, ok: r.ok, json, text: r.text }
}

async function failTurn($: EngineInterface, text: string) {
  await setChat($, c => ({ ...withMsgs(c, note(text)), pending: null }))
}

// One chat turn: the capsule, anything pulled from Claude, then the message, on the chat's engine. Runs behind the
// press or the command (`later`), so a turn never holds a hook.
async function send($: EngineInterface, o: Options, message: string, pulledNow?: Pulled) {
  const text = message.trim()
  if (text === '') return
  const c = await readChat($)
  if (c.pending !== null) return void $.ui.toast('Codex chat: still answering. Stop it first, or wait.')
  if (c.engine === 'api' && o.apiKey === '') return void $.ui.toast(NO_KEY)
  const pulled = pulledNow ?? c.pulled
  const input = turnInput(await capsuleOf($, await $.session.cwd()), pulled, text)
  const now = await $.clock.now()
  isPinNext = true
  const shown = pulled === null ? text : `${text}\n\n📎 *${pulled.label} attached*`
  await setChat($, old => ({
    ...withMsgs(old, { role: 'user', text: shown }),
    pulled: null,
    asks: old.asks + 1,
    pending: { id: '', engine: old.engine, startedAt: now, turn: 0, phase: 'sending' },
  }))
  if (c.engine === 'api') await sendApi($, o, c, input)
  else await sendCodex($, o, c, input)
}

// The api engine: a stored background response chained on the thread's last one; the poll picks up the answer.
async function sendApi($: EngineInterface, o: Options, c: Chat, input: string) {
  const m = API_MODELS[c.choice]
  const body = bodyFor({ model: m.id, effort: m.effort, input, instructions: partnerBrief('api'), previous: c.thread })
  let r: ApiReply
  try {
    r = await openai($, o.apiKey, 'POST', '/v1/responses', body)
  } catch (err) {
    return failTurn($, `OpenAI did not answer: ${stripKeys(errText(err))}`)
  }
  if (!r.ok) {
    // The stored response the thread chains on is gone: start the thread again.
    const isGone = r.status === 400 && r.text.includes('previous_response_not_found')
    const said = isGone ? `${apiError(r.status, r.text)} The thread was reset: send the message again.` : apiError(r.status, r.text)
    await setChat($, old => ({ ...withMsgs(old, note(said)), pending: null, thread: isGone ? null : old.thread }))
    return
  }
  const id = (r.json as { id?: unknown } | undefined)?.id
  if (typeof id !== 'string' || id === '') return failTurn($, 'OpenAI answered without a response id.')
  const status = (r.json as { status?: unknown }).status
  const next = await setChat($, old => (old.pending === null ? old : { ...old, pending: { ...old.pending, id, phase: typeof status === 'string' ? status : 'queued' } }))
  // Stopped while the request was on its way: cancel it at OpenAI too.
  if (next.pending?.id !== id) return void (await settle(openai($, o.apiKey, 'POST', `/v1/responses/${id}/cancel`, {})))
  startApiPoll($, o, id)
}

// One timer per response: each tick returns at once and runs its GET behind, skipping a tick while one is out.
function startApiPoll($: EngineInterface, o: Options, id: string) {
  if (apiPolls.has(id)) return
  let isOut = false
  let ticks = 0
  const timer = $.clock.every(API_POLL_MS, () => {
    if (isOut) return
    isOut = true
    ticks += 1
    void apiTick($, o, id, ticks)
      .catch(() => undefined)
      .finally(() => {
        isOut = false
      })
  })
  apiPolls.set(id, timer)
}

function stopApiPoll(id: string) {
  apiPolls.get(id)?.cancel()
  apiPolls.delete(id)
}

async function apiTick($: EngineInterface, o: Options, id: string, tick: number) {
  const c = await readChat($)
  if (c.pending === null || c.pending.id !== id) return stopApiPoll(id)
  const now = await $.clock.now()
  const elapsed = now - c.pending.startedAt
  if (elapsed > API_WAIT_MS) {
    stopApiPoll(id)
    await settle(openai($, o.apiKey, 'POST', `/v1/responses/${id}/cancel`, {}))
    return failTurn($, `No answer within ${Math.round(API_WAIT_MS / 60_000)} minutes: cancelled.`)
  }
  if (!isPollDue(elapsed, tick)) return publishTab($)
  const r = await settle(openai($, o.apiKey, 'GET', `/v1/responses/${id}`))
  // A dropped connection, a rate limit or a server error: the next tick asks again.
  if (r === undefined || r.status === 429 || r.status >= 500) return publishTab($)
  if (!r.ok) {
    stopApiPoll(id)
    return failTurn($, apiError(r.status, r.text))
  }
  const resp = r.json as { status?: unknown; model?: unknown } | undefined
  if (!isApiTerminal(resp?.status)) {
    const phase = typeof resp?.status === 'string' ? resp.status.replace('_', ' ') : 'waiting'
    if (phase === c.pending.phase) return publishTab($)
    await setChat($, old => (old.pending?.id === id ? { ...old, pending: { ...old.pending, phase } } : old))
    return
  }
  stopApiPoll(id)
  const out = outcomeOf(resp)
  const u = usageOf(resp)
  const model = typeof resp?.model === 'string' ? resp.model : API_MODELS[c.choice].id
  const tokens = u ? `${kTokens(u.input)} in${u.cached > 0 && u.input > 0 ? ` (${Math.round((100 * u.cached) / u.input)}% cached)` : ''} · ${kTokens(u.output)} out` : ''
  const meta = [`api · ${model}`, duration(elapsed), tokens].filter(t => t !== '').join(' · ')
  const isChained = resp?.status === 'completed' || resp?.status === 'incomplete'
  const msg: ChatMsg = out.kind === 'answer' ? { role: 'codex', text: out.isCut ? `${out.text}\n\n*(cut short: the answer ran out of output tokens)*` : out.text, meta } : note(out.text)
  raiseCount += 1
  await setChat($, old => (old.pending?.id === id ? { ...withMsgs(old, msg), pending: null, thread: isChained ? id : old.thread } : old))
}

// The codex engine: the chat's job (its own worktree, branch codex/chat-<hex>) gets the next turn, or one is started.
async function sendCodex($: EngineInterface, o: Options, c: Chat, input: string) {
  const stored = c.thread === null ? undefined : await loadJob($, c.thread)
  const isThere = stored !== undefined && (await settle($.fs.exists(stored.worktree))) === true
  const started =
    stored !== undefined && isThere
      ? await followupJob($, o, stored.id, input)
      : await startJob($, o, { prompt: input, title: 'chat', effort: 'low', network: false, carry: false, waitS: 0 }, 'chat')
  if ('error' in started) return failTurn($, `Codex did not start: ${started.error}`)
  const job = started.job
  const next = await setChat($, old => (old.pending === null ? old : { ...old, thread: job.id, pending: { ...old.pending, id: job.id, turn: job.turn, phase: 'starting' } }))
  // Stopped while it was starting: stop the turn too.
  if (next.pending?.id !== job.id) await settle(cancelJob($, o, job.id, false))
  await publishTab($, true)
}

// A chat job's turn ended: its answer (or why there is none) goes into the chat. It counts as delivered: no wake.
async function chatTurnEnded($: EngineInterface, job: Job, summary: TurnSummary | undefined) {
  await saveJob($, { ...job, delivered: job.turn })
  const c = await readChat($)
  if (c.pending === null || c.pending.id !== job.id) return
  const said = ((await settle($.fs.read(turnFiles(job.dir, job.turn).last))) ?? summary?.lastMessage ?? '').trim()
  const now = await $.clock.now()
  const ran = summary ? ` · ${summary.commands} command${summary.commands === 1 ? '' : 's'}` : ''
  const changed = job.diffstat.files > 0 ? ` · branch ${job.branch}: ${diffText(job.diffstat)}` : ''
  const meta = `codex exec · ${job.model} · ${duration((job.endedAt ?? now) - job.turnStartedAt)}${ran}${changed}`
  const ended = job.state === 'done' ? 'ended with no answer' : job.state.replace('_', ' ')
  const msg: ChatMsg = job.state === 'done' && said !== '' ? { role: 'codex', text: said, meta } : note(`Codex's turn ${ended}${job.error ? `: ${job.error}` : ''}.`)
  raiseCount += 1
  await setChat($, old => (old.pending?.id === job.id ? { ...withMsgs(old, msg), pending: null } : old))
}

async function chatPhase($: EngineInterface, id: string, phase: string) {
  const c = await readChat($)
  if (c.pending === null || c.pending.id !== id || c.pending.phase === phase) return
  await setChat($, old => (old.pending?.id === id ? { ...old, pending: { ...old.pending, phase } } : old))
}

async function stopChat($: EngineInterface, o: Options) {
  const p = (await readChat($)).pending
  if (p === null) return
  await setChat($, c => ({ ...withMsgs(c, info('Stopped.')), pending: null }))
  if (p.id === '') return
  if (p.engine === 'api') {
    stopApiPoll(p.id)
    await settle(openai($, o.apiKey, 'POST', `/v1/responses/${p.id}/cancel`, {}))
  } else await settle(cancelJob($, o, p.id, false))
}

// Drops the chain (api) or the chat job (codex; its worktree and branch stay until dropped in Jobs).
async function newThread($: EngineInterface, o: Options) {
  await stopChat($, o)
  const c = await readChat($)
  const old = c.engine === 'codex' && c.thread !== null ? await loadJob($, c.thread) : undefined
  const said = old ? [info(`New thread. The last one's worktree and branch ${old.branch} stay: Drop it in Jobs when you are done with it.`)] : []
  await setChat($, x => ({ ...emptyChat(x.engine), choice: x.choice, asks: x.asks + 1, msgs: said }))
}

async function setEngine($: EngineInterface, o: Options, engine: Engine) {
  if (engine === 'api' && o.apiKey === '') return void $.ui.toast(NO_KEY)
  if ((await readChat($)).engine === engine) return
  await stopChat($, o)
  const name = engine === 'api' ? 'OpenAI API' : 'Codex CLI in its own worktree'
  await setChat($, c => ({ ...withMsgs(c, info(`Engine: ${name}. The next message starts a new thread.`)), engine, thread: null, pending: null }))
}

// Claude's latest reply or recent turns: attached to the next message, or sent at once with a question.
async function pull($: EngineInterface, o: Options, what: 'reply' | 'turns', question: string) {
  const p = pullOf(await $.session.messages(), what)
  if (p === null) return void $.ui.toast('Codex chat: Claude has nothing to pull yet.')
  if (question.trim() !== '') return send($, o, question, p)
  await setChat($, c => ({ ...c, pulled: p }))
  $.ui.toast(`Codex chat: ${p.label} is attached to your next message.`)
}

// Puts text in Claude's prompt box for the person to send: after the box's draft, if there is one. Deferred out of the
// command's or press's dispatch, as sidechat defers its submit.
function fillLater($: EngineInterface, text: string, done: string) {
  $.clock.after(10, () => later($, fillBox($, text, done)))
}

async function fillBox($: EngineInterface, text: string, done: string) {
  const draft = (await $.prompt.read()).text
  const r = await $.prompt.fill(draft.trim() === '' ? { text } : { text: `\n\n${text}`, mode: 'append' })
  $.ui.toast(r.isFilled ? done : `bws-codex: the prompt box did not take it (${r.refusal ?? 'a hook kept it out'}).`)
}

// An answer of the chat, the newest or the one at `index`, into Claude's prompt box.
async function sendBack($: EngineInterface, index?: number): Promise<boolean> {
  const answer = answerAt((await readChat($)).msgs, index)
  if (answer === '') {
    $.ui.toast('Codex chat: no answer to send back yet.')
    return false
  }
  fillLater($, sendBackText(answer), "Codex's answer is in Claude's prompt box: Enter sends it to Claude.")
  return true
}

// ---------- the Jobs view ----------

// Opens or closes a job's Diff. Read from the job folder, not through readResult, which would count the turn as reported.
async function toggleDiff($: EngineInterface, id: string) {
  if (expanded === id) {
    expanded = null
    detail = null
    return publishTab($)
  }
  const stored = await loadJob($, id)
  if (stored === undefined) return publishTab($, true)
  const { job, status } = await refresh($, stored)
  const message = isTerminal(job.state) ? ((await settle($.fs.read(turnFiles(job.dir, job.turn).last))) ?? '') : ''
  expanded = id
  detail = { id, stat: status?.stat ?? '', message: message.trim() }
  return publishTab($, true)
}

async function followFromTab($: EngineInterface, o: Options, id: string, text: string) {
  if (text.trim() === '') return
  const r = await followupJob($, o, id, text)
  following = null
  follows += 1
  $.ui.toast('error' in r ? `bws-codex: ${r.error}` : `Sent follow-up turn ${r.job.turn} to Codex job ${id}.`)
  await publishTab($, true)
}

async function cancelFromTab($: EngineInterface, o: Options, id: string, drop: boolean) {
  const said = await cancelJob($, o, id, drop)
  if (drop && expanded === id) {
    expanded = null
    detail = null
  }
  // The chat's own job: its turn is over, and a dropped one is no thread to continue.
  await setChat($, c => {
    const pendingNow = c.pending?.id === id ? null : c.pending
    const msgs = c.pending?.id === id ? withMsgs(c, info('Stopped from Jobs.')).msgs : c.msgs
    return { ...c, msgs, pending: pendingNow, thread: drop && c.thread === id ? null : c.thread }
  })
  $.ui.toast(said.split('\n')[0] ?? said)
  await publishTab($, true)
}

// Merging is Claude's, through its own Bash: the steps go in its prompt box.
async function mergeFromTab($: EngineInterface, id: string) {
  const job = await loadJob($, id)
  if (job === undefined) return void $.ui.toast(`bws-codex: no Codex job ${id}.`)
  fillLater($, mergeHint(job), `The merge steps for ${id} are in Claude's prompt box: Enter asks Claude to merge.`)
}

// A button or input of the Codex tab, or its `/codex --<id> [text]` twin.
async function act($: EngineInterface, o: Options, id: string, value: string | undefined) {
  let m: RegExpExecArray | null
  if (id === 'chat' || id === 'jobs') {
    view = id
    isPinNext = id === 'chat'
    await publishTab($, true)
  } else if (id === 'refresh') await publishTab($, true)
  else if (id === 'new') await newThread($, o)
  else if (id === 'pull' || id === 'pull-turns') later($, pull($, o, id === 'pull' ? 'reply' : 'turns', value ?? ''))
  else if (id === 'unpull') await setChat($, c => ({ ...c, pulled: null }))
  else if (id === 'send-back') await sendBack($)
  else if ((m = /^send-(\d+)$/.exec(id))) await sendBack($, Number(m[1]))
  else if (id === 'stop') await stopChat($, o)
  else if (id === 'engine-api' || id === 'engine-codex') await setEngine($, o, id === 'engine-api' ? 'api' : 'codex')
  else if (id === 'model-default' || id === 'model-fast') await setChat($, c => ({ ...c, choice: id === 'model-fast' ? 'fast' : 'default' }))
  else if (/^ask-\d+$/.test(id)) later($, send($, o, value ?? ''))
  else if ((m = /^diff-(.+)$/.exec(id)) && m[1] !== undefined) await toggleDiff($, m[1])
  else if ((m = /^fu-(.+)-\d+$/.exec(id)) && m[1] !== undefined) later($, followFromTab($, o, m[1], value ?? ''))
  else if ((m = /^follow-(.+)$/.exec(id)) && m[1] !== undefined) {
    if (value !== undefined && value.trim() !== '') later($, followFromTab($, o, m[1], value))
    else {
      following = following === m[1] ? null : m[1]
      await publishTab($)
    }
  } else if ((m = /^cancel-(.+)$/.exec(id)) && m[1] !== undefined) await cancelFromTab($, o, m[1], false)
  else if ((m = /^drop-(.+)$/.exec(id)) && m[1] !== undefined) await cancelFromTab($, o, m[1], true)
  else if ((m = /^merge-(.+)$/.exec(id)) && m[1] !== undefined) await mergeFromTab($, m[1])
}

// `/codex` and `/cx`: open the tab, chat, or press one of its buttons (`--<id> [text]`).
async function codexCommand($: EngineInterface, o: Options, args: string): Promise<{ text?: string }> {
  if (!(await isDrawn($))) {
    const jobs = repoRoot === '' ? [] : await listJobs($, repoRoot)
    return { text: `${listText(jobs, repoRoot || 'this folder', await $.clock.now())}\nThe Codex tab needs a terminal or Desktop window to draw in.` }
  }
  const press = pressOf(args)
  if (press !== null) {
    await act($, o, press.id, press.value)
    return {}
  }
  const cmd = parseCodex(args)
  if (cmd.kind === 'jobs') await showTab($, 'jobs')
  else if (cmd.kind === 'send-back') return (await sendBack($)) ? {} : { text: 'No Codex answer to send back yet.' }
  else if (cmd.kind === 'stop') await stopChat($, o)
  else if (cmd.kind === 'engine') {
    if (cmd.engine === null) return { text: `Codex chat engine: ${(await readChat($)).engine}. /codex engine api|codex switches it.` }
    await setEngine($, o, cmd.engine)
    await showTab($, 'chat')
  } else if (cmd.kind === 'fast') {
    const isOn = cmd.isOn ?? (await readChat($)).choice !== 'fast'
    await setChat($, c => ({ ...c, choice: isOn ? 'fast' : 'default' }))
    await showTab($, 'chat')
  } else if (cmd.kind === 'new') {
    await newThread($, o)
    await showTab($, 'chat')
    if (cmd.message !== '') later($, send($, o, cmd.message))
  } else if (cmd.kind === 'pull') {
    await showTab($, 'chat')
    later($, pull($, o, cmd.what, cmd.message))
  } else if (cmd.kind === 'send') {
    await showTab($, 'chat')
    later($, send($, o, cmd.message))
  } else await showTab($, 'chat')
  return {}
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
    apiKey: typeof options.openaiApiKey === 'string' ? options.openaiApiKey.trim() : '',
  }
  hasKey = o.apiKey !== ''
  defaultEngine = hasKey ? 'api' : 'codex'

  on('session.start', async ($, e, next) => {
    isInteractive = e.isInteractive === true
    const hint = '[jobs | new [message] | pull [turns] [question] | send-back | engine api|codex | fast on|off | stop | message]'
    await $.command.register({ name: 'codex', description: 'Codex tab: chat with Codex on the side, and this repository\'s Codex jobs', argumentHint: hint, immediate: true })
    // Claude Code Desktop may take /codex before a mod sees it.
    await $.command.register({ name: 'cx', description: 'Same as /codex: the Codex tab', argumentHint: hint, immediate: true })
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
    const repo = await settle(repoOf($, await $.session.cwd()))
    repoRoot = repo === undefined || typeof repo === 'string' ? '' : repo.main
    // After a reload: an api answer still being waited for is polled again; a send cut off before its id is dropped.
    const chat = await settle(readChat($))
    if (chat?.pending?.engine === 'api' && chat.pending.id !== '' && hasKey) startApiPoll($, o, chat.pending.id)
    else if (chat?.pending?.id === '') await settle(failTurn($, 'The message was cut off by a reload: send it again.'))
    await settle(publishTab($, true))
    return next(e)
  })

  // /codex and its fallback name: one handler.
  on('command.run', { command: 'codex' }, async ($, e) => codexCommand($, o, e.args)).catch(($, e, next) => ({ text: `bws-codex: /codex failed: ${stripKeys(errText(next.error))}` }))
  on('command.run', { command: 'cx' }, async ($, e) => codexCommand($, o, e.args)).catch(($, e, next) => ({ text: `bws-codex: /cx failed: ${stripKeys(errText(next.error))}` }))

  // A press or a submitted input in the Codex tab (bws-cockpit writes it). Acted on just after: this mod's own state
  // changes from inside a state.set dispatch would read the old values.
  on('state.set', { plugin: 'bws-cockpit', key: 'tabEvent' }, async ($, e, next) => {
    const ev = parseEvent(e.value)
    if (ev?.plugin === 'bws-codex') $.clock.after(10, () => later($, act($, o, ev.id, ev.value)))
    return next(e)
  }).catch(($, e, next) => next(e))

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
