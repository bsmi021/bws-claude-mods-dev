// What the tools return and the wake says: strings, each under about 3 KB. Pure.

import type { TurnSummary } from './events'
import type { DiffStat, Job } from './job'
import { isTerminal, patchFileOf } from './job'

export const RESULT_MAX = 3000
const MESSAGE_MAX = 1500
const STAT_LINES = 12

export function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`
}

export const diffText = (d: DiffStat) => (d.files === 0 ? 'no changes' : `${d.files} file${d.files === 1 ? '' : 's'} +${d.insertions} -${d.deletions}`)

const short = (sha: string | null) => (sha ? sha.slice(0, 8) : '?')

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s)

const oneLine = (s: string, max: number) => clip(s.replace(/\s+/g, ' ').trim(), max)

const tokens = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : String(n))

// `codex job <id> "<title>": <state ...>`
export function headline(job: Job, now: number): string {
  const name = `codex job ${job.id} "${job.title}"`
  const took = duration((job.endedAt ?? now) - job.turnStartedAt)
  const turn = `turn ${job.turn}`
  switch (job.state) {
    case 'starting':
      return `${name}: starting ${turn}`
    case 'running':
      return `${name}: running ${turn} for ${took}`
    case 'done':
      return `${name}: done in ${took} (${turn}); branch ${job.branch}: ${diffText(job.diffstat)} vs base ${short(job.base)}`
    case 'failed':
      return `${name}: failed after ${took} (${turn})${job.error ? `: ${oneLine(job.error, 300)}` : ''}`
    case 'cancelled':
      return `${name}: cancelled after ${took} (${turn})`
    case 'timed_out':
      return `${name}: timed out after ${took} (${turn})`
  }
}

// Shown under a result while Claude has not merged: what to do next.
function nextSteps(job: Job): string {
  const steps = [
    `review with \`git -C ${job.top} diff ${short(job.base)}...${job.branch}\` (patch: ${patchFileOf(job.dir)})`,
    `merge it in ${job.top} with \`git merge --no-ff ${job.branch}\``,
    `codex_followup {"id": "${job.id}", "prompt": "..."} continues the same Codex thread`,
    `after merging, codex_cancel {"id": "${job.id}", "drop": true} removes the worktree`,
  ]
  return `Next: ${steps.join('; ')}.`
}

export function carryWarning(job: Job): string | null {
  if (!job.carry?.commit) return null
  return (
    `Carried edits: the branch starts with a commit (${short(job.carry.commit)}) holding the uncommitted edits ${job.top} had at the start, and they are still uncommitted there. ` +
    `A merge refuses to overwrite them: first \`git stash push -m bws-codex-${job.id}\`, merge, then apply that stash entry (find it by its message; other sessions share the stash list) and drop it.`
  )
}

// The full answer for a job: codex_result, a waited codex_delegate or codex_followup.
// `stat` is git's --stat text for the branch vs base; `message` Codex's last message for the latest turn.
export function resultText(job: Job, summary: TurnSummary | undefined, message: string | null, stat: string, now: number, canWake: boolean): string {
  const lines = [headline(job, now)]
  if (!isTerminal(job.state)) {
    const phase = summary && job.state === 'running' ? ` Now ${summary.phase}${summary.lastItem ? `; last: ${oneLine(summary.lastItem, 160)}` : ''}.` : ''
    lines[0] += '.' + phase
    lines.push(
      canWake
        ? `Call codex_result {"id": "${job.id}", "wait_s": 300} to wait for it, or carry on: you are told when it finishes.`
        : `Call codex_result {"id": "${job.id}", "wait_s": 300} to wait for it (this session is not woken when it finishes).`,
    )
    return clip(lines.join('\n'), RESULT_MAX)
  }
  lines.push(`Worktree: ${job.worktree} (HEAD ${short(job.head)})`)
  if (job.diffstat.files > 0 && stat.trim() !== '') {
    const st = stat.split(/\r?\n/).filter(l => l.trim() !== '')
    const body = st.length > STAT_LINES + 1 ? [...st.slice(0, STAT_LINES), ` … ${st.length - STAT_LINES - 1} more file(s)`, st[st.length - 1] ?? ''] : st
    lines.push('Changes:', ...body)
  } else if (job.diffstat.files === 0) {
    lines.push('Codex made no changes on the branch; nothing to merge.')
  }
  if (summary) {
    const u = summary.usage
    const usage = u ? `; tokens ${tokens(u.input)} in (${u.input > 0 ? Math.round((100 * u.cached) / u.input) : 0}% cached), ${tokens(u.output)} out` : ''
    lines.push(`Codex ran ${summary.commands} command(s), ${summary.failedCommands} failed${usage}.`)
    const errs = summary.errors.filter(e => !job.error?.includes(e))
    if (errs.length > 0) lines.push(`Codex errors: ${oneLine(errs.join(' | '), 300)}`)
  }
  const warn = carryWarning(job)
  const tail = [...(job.diffstat.files > 0 ? [nextSteps(job)] : [`codex_cancel {"id": "${job.id}", "drop": true} removes the worktree.`]), ...(warn ? [warn] : [])]
  const head = lines.join('\n')
  const room = RESULT_MAX - head.length - tail.join('\n').length - 40
  const said = message?.trim() ? clip(message.trim(), Math.max(200, Math.min(MESSAGE_MAX, room))) : '(no final message)'
  return clip([head, 'Codex says:', said, ...tail].join('\n'), RESULT_MAX)
}

// codex_delegate / codex_followup answering at once.
export function startedText(job: Job, canWake: boolean): string {
  const carry = job.carry?.commit ? ` Carried your uncommitted edits in as commit ${short(job.carry.commit)}.` : job.carry?.error ? ` Carry failed (${oneLine(job.carry.error, 160)}); the job starts from the base commit.` : ''
  const what =
    job.turn === 1
      ? `Started codex job ${job.id} "${job.title}" (effort ${job.effort}, network ${job.network ? 'on' : 'off'}): worktree ${job.worktree} on branch ${job.branch} from ${short(job.base)}.${carry}`
      : `Sent follow-up turn ${job.turn} to codex job ${job.id} "${job.title}" (effort ${job.effort}) in ${job.worktree}.`
  const after = canWake
    ? `A turn usually takes 1-3 minutes. Carry on or end your turn: you are told when it finishes. codex_result {"id": "${job.id}", "wait_s": 300} waits for it.`
    : `A turn usually takes 1-3 minutes. This session is not woken when it finishes: call codex_result {"id": "${job.id}", "wait_s": 300} to wait for it.`
  return `${what}\n${after}`
}

// The prompt that wakes an idle Claude. It can land after /clear, so it says everything needed to act.
export function wakeText(jobs: { job: Job; message: string | null }[], now: number): string {
  const one = ({ job, message }: { job: Job; message: string | null }) => {
    const said = message?.trim() ? ` Codex: ${oneLine(message, 300)}` : ''
    const merge = job.state === 'done' && job.diffstat.files > 0 ? ` Not merged; merge in ${job.top}.` : ''
    return `${headline(job, now)}.${said}${merge} codex_result {"id": "${job.id}"} gives the full result.`
  }
  if (jobs.length === 1 && jobs[0]) return `bws-codex: ${one(jobs[0])}`
  return [`bws-codex: ${jobs.length} Codex jobs finished:`, ...jobs.map(j => `- ${one(j)}`)].join('\n')
}

// The pinned status line while jobs run; undefined clears it.
export function statusLine(jobs: Job[], now: number, phases: Record<string, string>): string | undefined {
  const live = jobs.filter(j => !isTerminal(j.state))
  if (live.length === 0) return undefined
  const one = (j: Job) => `${j.id} ${duration(now - j.turnStartedAt)}${phases[j.id] ? ` ${phases[j.id]}` : ''}`
  return live.length === 1 && live[0] ? `codex: ${one(live[0])}` : `codex: ${live.length} running · ${live.map(one).join(' · ')}`
}

// codex_status: this repo's jobs, newest first.
export function listText(jobs: Job[], repo: string, now: number): string {
  if (jobs.length === 0) return `No Codex jobs for ${repo}.`
  const lines = jobs.map(j => `- ${headline(j, now)}${isTerminal(j.state) ? ` · worktree ${j.worktree}` : ''}${j.delivered < j.turn && isTerminal(j.state) ? ' · not yet reported' : ''}`)
  return clip([`Codex jobs for ${repo} (newest first):`, ...lines].join('\n'), RESULT_MAX)
}
