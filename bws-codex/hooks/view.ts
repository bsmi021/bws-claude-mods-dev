// The Codex tab bws-cockpit draws in its dashboard (bws-kit/tab.ts) and the summary chip. Two views: Chat (the side
// chat with Codex, either engine) and Jobs (this repository's Codex jobs). Pure: no `$`.
//
// Ids sent back (and `/codex --<id> [text]`, the same action):
// both views: chat, jobs (switch view), refresh;
// chat: new, pull, pull-turns, unpull, send-back, send-<message index>, stop, engine-api, engine-codex, model-default,
//   model-fast, ask-<n> (with the text);
// jobs: diff-<job>, follow-<job> (opens its input; with text, sends it), fu-<job>-<n> (the input, with the text),
//   cancel-<job>, drop-<job>, merge-<job>.
import { API_MODELS } from './api'
import type { Chat, ChatMsg } from './chat'
import { buttons, card, makeTab, markdown, text } from './kit/tab'
import type { ModTab, TabButton, TabColor, TabNode } from './kit/tab'
import type { Job, JobState } from './job'
import { isChat, isTerminal, patchFileOf } from './job'
import { carryWarning, diffText, duration } from './result'

export type View = 'chat' | 'jobs'

// A job's Diff, read when it is opened: git's --stat of the branch and Codex's last message.
export type JobDetail = { id: string; stat: string; message: string }

export type TabView = {
  view: View
  chat: Chat
  jobs: readonly Job[]
  now: number
  hasKey: boolean
  repo: string
  expanded: string | null
  following: string | null
  detail: JobDetail | null
  follows: number
  show: number
  open: number
  raise: number
  isPin: boolean
}

// The dashboard draws at most 200 nodes: messages are added newest first while they fit in this many.
const NODE_BUDGET = 170
const MAX_JOBS = 12
const STAT_LINES = 12
const MESSAGE_MAX = 1500

const short = (sha: string | null) => (sha ? sha.slice(0, 8) : '?')
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const countNodes = (ns: readonly TabNode[]): number => ns.reduce((s, n) => s + 1 + (n.kind === 'card' ? countNodes(n.body) : 0), 0)

// The input's key: it changes with each send, which clears it.
export const askKey = (asks: number) => `ask-${asks}`
export const followKey = (id: string, n: number) => `fu-${id}-${n}`

// ---------- jobs ----------

const STATE: Record<JobState, { icon: string; color?: TabColor }> = {
  starting: { icon: '⏳', color: 'accent' },
  running: { icon: '⚙️', color: 'accent' },
  done: { icon: '✅', color: 'ok' },
  failed: { icon: '❌', color: 'bad' },
  cancelled: { icon: '⏹' },
  timed_out: { icon: '⌛', color: 'warn' },
}

export function stateText(job: Job, now: number): string {
  const took = duration((job.endedAt ?? now) - job.turnStartedAt)
  const turn = job.turn > 1 ? ` (turn ${job.turn})` : ''
  if (job.state === 'starting') return `starting${turn}`
  if (job.state === 'running') return `running ${took}${turn}`
  if (job.state === 'done') return `done in ${took}${turn}`
  if (job.state === 'timed_out') return `timed out after ${took}${turn}`
  return `${job.state} after ${took}${turn}`
}

// What the Merge button puts in Claude's prompt box: the steps, for Claude to run in its own Bash (bws-board sees it).
export function mergeHint(job: Job): string {
  const steps = [
    `Merge Codex job ${job.id} ("${job.title}") from branch ${job.branch}.`,
    `Review it first: \`git -C ${job.top} diff ${short(job.base)}...${job.branch}\` (patch: ${patchFileOf(job.dir)}).`,
    `Then in ${job.top}: \`git merge --no-ff ${job.branch}\`.`,
    `After merging, codex_cancel {"id": "${job.id}", "drop": true} removes its worktree.`,
  ]
  const warn = carryWarning(job)
  return [...steps, ...(warn ? [warn] : [])].join(' ')
}

function jobCard(job: Job, v: TabView): TabNode[] {
  const s = STATE[job.state]
  const isDone = isTerminal(job.state)
  const isOpen = v.expanded === job.id
  const ago = isDone && job.endedAt !== null ? ` · ${duration(v.now - job.endedAt)} ago` : ''
  const body: TabNode[] = [
    text(`${stateText(job, v.now)} · ${job.branch} · ${diffText(job.diffstat)}${ago}`, { isDim: true, isClipped: true }),
  ]
  if (job.error) body.push(text(`❗ ${clip(job.error, 300)}`, { color: 'warn' }))
  if (job.carry?.commit) body.push(text(`📦 carried uncommitted edits in (${short(job.carry.commit)}): stash before merging`, { color: 'warn', isClipped: true }))
  const row: TabButton[] = [{ id: `diff-${job.id}`, label: isOpen ? '🔽 Hide diff' : '🔍 Diff' }]
  if (isDone) row.push({ id: `follow-${job.id}`, label: '💬 Follow up' })
  if (isDone && job.diffstat.files > 0) row.push({ id: `merge-${job.id}`, label: '🔀 Merge (ask Claude)' })
  row.push(isDone ? { id: `drop-${job.id}`, label: '🗑 Drop' } : { id: `cancel-${job.id}`, label: '⏹ Cancel' })
  body.push(buttons(...row))
  if (isOpen) {
    const d = v.detail !== null && v.detail.id === job.id ? v.detail : null
    const stat = (d?.stat ?? '').split(/\r?\n/).filter(l => l.trim() !== '')
    const cut = stat.length > STAT_LINES + 1 ? [...stat.slice(0, STAT_LINES), ` … ${stat.length - STAT_LINES - 1} more`, stat[stat.length - 1] ?? ''] : stat
    if (cut.length > 0) body.push(...cut.map(l => text(l, { isClipped: true })))
    else body.push(text(job.diffstat.files === 0 ? 'No changes on the branch.' : 'No diff stat yet.', { isDim: true }))
    body.push(text(`📄 ${patchFileOf(job.dir)}`, { isDim: true, isClipped: true }))
    if (d?.message) body.push(text('Codex says:', { isBold: true }), markdown(clip(d.message, MESSAGE_MAX)))
    if (isDone && job.diffstat.files > 0) body.push(text(`🔀 ${mergeHint(job)}`, { isDim: true }))
  }
  if (v.following === job.id && isDone)
    body.push({ kind: 'input', id: followKey(job.id, v.follows), placeholder: `💬 follow-up for job ${job.id}, Enter sends`, isFocused: true })
  const title = `${s.icon} ${isChat(job) ? '💬 ' : ''}${job.title} · ${job.id}`
  return [card(title, body, s.color)]
}

function jobsNodes(v: TabView): TabNode[] {
  const live = v.jobs.filter(j => !isTerminal(j.state)).length
  const nodes: TabNode[] = [
    text('🧰 Codex jobs', { isBold: true, color: 'accent' }),
    text(`📁 ${v.repo || 'no repository'} · ${v.jobs.length} job${v.jobs.length === 1 ? '' : 's'}${live > 0 ? ` · ${live} running` : ''}`, { isDim: true, isClipped: true }),
    buttons({ id: 'chat', label: '💬 Chat' }, { id: 'refresh', label: '🔄 Refresh' }),
  ]
  if (v.jobs.length === 0) {
    const tips = [
      'Claude hands work to Codex with its **codex_delegate** tool: ask it to "have Codex do X".',
      '',
      '- 🌿 Each job runs in its own worktree on branch `codex/<id>`; the mod commits each turn',
      '- 🔍 **Diff** shows what changed, 💬 **Follow up** continues the same Codex thread',
      '- 🔀 **Merge** asks Claude to review and merge the branch; 🗑 **Drop** removes the worktree',
    ]
    nodes.push(card('👋 No Codex jobs in this repository yet', [markdown(tips.join('\n'))], 'accent'))
    return nodes
  }
  for (const job of v.jobs.slice(0, MAX_JOBS)) nodes.push(...jobCard(job, v))
  if (v.jobs.length > MAX_JOBS) nodes.push(text(`⋯ ${v.jobs.length - MAX_JOBS} older jobs not shown (codex_status lists them all)`, { isDim: true }))
  return nodes
}

// ---------- chat ----------

function messageNodes(m: ChatMsg, i: number): TabNode[] {
  if (m.role === 'note') return [text(`❗ ${m.text}`, { color: 'warn' })]
  if (m.role === 'user') return [card('🧑 You', [markdown(m.text)], 'ok')]
  const body: TabNode[] = [markdown(m.text)]
  if (m.meta) body.push(text(m.meta, { isDim: true, isClipped: true }))
  body.push(buttons({ id: `send-${i}`, label: '📤 Send back to Claude' }))
  return [card('🤖 Codex', body, 'accent')]
}

function engineLine(v: TabView): string {
  const c = v.chat
  if (c.engine === 'api') {
    const m = API_MODELS[c.choice]
    return `🌐 api · ${m.id} · ${m.effort}${c.thread ? ` · chained on ${c.thread.slice(0, 14)}…` : ' · new thread'}`
  }
  const job = c.thread === null ? undefined : v.jobs.find(j => j.id === c.thread)
  return `🧰 codex exec · ${job ? `thread ${job.id} on ${job.branch}` : c.thread ? `thread ${c.thread}` : 'new thread (its own worktree)'}`
}

function chatNodes(v: TabView): TabNode[] {
  const c = v.chat
  const live = v.jobs.filter(j => !isTerminal(j.state) && !isChat(j)).length
  const engines: TabButton[] = [
    c.engine === 'api' ? { id: 'engine-api', label: '● api', isPrimary: true } : { id: 'engine-api', label: v.hasKey ? 'api' : 'api (no key)' },
    c.engine === 'codex' ? { id: 'engine-codex', label: '● codex', isPrimary: true } : { id: 'engine-codex', label: 'codex' },
  ]
  if (c.engine === 'api')
    engines.push(
      c.choice === 'default' ? { id: 'model-default', label: `● ${API_MODELS.default.label}`, isPrimary: true } : { id: 'model-default', label: API_MODELS.default.label },
      c.choice === 'fast' ? { id: 'model-fast', label: `● ⚡ ${API_MODELS.fast.label}`, isPrimary: true } : { id: 'model-fast', label: `⚡ ${API_MODELS.fast.label}` },
    )
  const head: TabNode[] = [
    text('💬 Codex chat', { isBold: true, color: 'accent' }),
    text(engineLine(v), { isDim: true, isClipped: true }),
    buttons(
      { id: 'jobs', label: `🧰 Jobs${v.jobs.length > 0 ? ` (${v.jobs.length}${live > 0 ? `, ${live} running` : ''})` : ''}` },
      { id: 'new', label: '✨ New thread' },
      { id: 'pull', label: '📥 Pull Claude' },
      { id: 'pull-turns', label: '📥 Pull turns' },
      { id: 'send-back', label: '📤 Send back' },
    ),
    buttons(...engines),
  ]
  const tail: TabNode[] = []
  if (c.pulled !== null) tail.push(text(`📎 attached to the next message: ${c.pulled.label} (${c.pulled.text.length} characters)`, { color: 'accent', isClipped: true }), buttons({ id: 'unpull', label: '✖ Unattach' }))
  if (c.pending !== null) {
    const secs = Math.max(0, Math.round((v.now - c.pending.startedAt) / 1000))
    tail.push(text(`🤔 Codex is thinking… ${secs}s${c.pending.phase ? ` · ${c.pending.phase}` : ''}`, { color: 'accent' }), buttons({ id: 'stop', label: '⏹ Stop' }))
  }
  const placeholder = c.pending !== null ? '⏳ wait for the answer…' : c.engine === 'api' && !v.hasKey ? '🔑 set the openaiApiKey option, or switch to codex' : '💭 ask Codex, Enter sends'
  tail.push({ kind: 'input', id: askKey(c.asks), placeholder, isFocused: true })

  const body = [...head]
  if (c.msgs.length === 0 && c.pending === null) {
    const tips = [
      c.engine === 'api'
        ? 'A side chat with Codex over the OpenAI API: a few seconds a turn, no files. Answers are stored at OpenAI and chained.'
        : 'A side chat with Codex CLI in its own worktree (`codex/chat-<id>`): it can read and run things; a turn takes a minute or two.',
      '',
      "- 🧭 Every message starts with a small `<workspace>` block: Claude's branch, dirty files, diff stat, last commit",
      "- 📥 **Pull Claude** attaches Claude's latest reply (or its recent turns) to your next message",
      "- 📤 **Send back** puts Codex's answer in Claude's prompt box",
    ]
    body.push(card('👋 Ask Codex on the side', [markdown(tips.join('\n'))], 'accent'))
  }
  let room = NODE_BUDGET - countNodes(head) - countNodes(tail) - 1
  const shown: TabNode[][] = []
  for (let k = c.msgs.length - 1; k >= 0; k--) {
    const ns = messageNodes(c.msgs[k] as ChatMsg, k)
    const n = countNodes(ns)
    if (n > room) break
    room -= n
    shown.unshift(ns)
  }
  if (shown.length < c.msgs.length) body.push(text(`⋯ ${c.msgs.length - shown.length} earlier messages not shown`, { isDim: true }))
  for (const ns of shown) body.push(...ns)
  return [...body, ...tail]
}

// ---------- the tab and the chip ----------

export function codexTab(v: TabView): ModTab {
  const live = v.jobs.filter(j => !isTerminal(j.state) && !isChat(j)).length
  const isBusy = v.chat.pending !== null || live > 0
  const badge = v.chat.pending !== null ? '…' : live > 0 ? `${live}▶` : v.jobs.length > 0 ? String(v.jobs.length) : ''
  const tone = isBusy ? 'busy' : v.jobs.some(j => j.state === 'failed') ? 'warn' : v.jobs.length > 0 || v.chat.msgs.length > 0 ? 'ok' : 'idle'
  const body = v.view === 'jobs' ? jobsNodes(v) : chatNodes(v)
  return makeTab('Codex', body, { badge, tone, raise: v.raise, show: v.show, open: v.open, isPinnedEnd: v.view === 'chat' && (v.chat.pending !== null || v.isPin) })
}

// The chip and bws-board's line: what is running, else nothing.
export function codexSummary(jobs: readonly Job[], chat: Chat, now: number): { state: 'busy' | 'warn'; label: string; detail?: string } | null {
  const live = jobs.filter(j => !isTerminal(j.state) && !isChat(j))
  if (live.length > 0) {
    const label = live.length === 1 && live[0] ? `codex ${live[0].id} ${stateText(live[0], now)}` : `codex: ${live.length} jobs running`
    return { state: 'busy', label, detail: live.map(j => `${j.id} ${stateText(j, now)}`).join(' · ') }
  }
  if (chat.pending !== null) return { state: 'busy', label: 'codex chat thinking' }
  return null
}
