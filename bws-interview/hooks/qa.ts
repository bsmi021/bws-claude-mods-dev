// bws-interview's record of AskUserQuestion rounds: what was asked, what was picked, and the text that feeds it back
// into the chat. Pure: no `$`, so the tests call it directly.

import { buttons, card, makeTab, text } from './kit/tab'
import type { ModTab, TabNode } from './kit/tab'

export type QaQuestion = {
  header: string
  question: string
  options: string[]
  isMulti: boolean
  answer: string // what the person picked or typed; '' when they left it
  notes: string // their note on the question, if any
}

export type QaRound = {
  id: string // the tool_use_id
  at: number // ms epoch
  session: string
  source: string // metadata.source: "interview:<slug>" from the interview skill, else ''
  questions: QaQuestion[]
  response: string // free text typed instead of picking
  isFollowUp: boolean // they asked for another round
  isAfk: boolean // the dialog resolved itself while they were away
}

export const MAX_ROUNDS = 400
const CAP = { header: 40, question: 600, option: 80, answer: 1000, notes: 1000, response: 2000, source: 80 }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

// The store key for a project: one record per working directory, case and slashes folded (Windows paths).
export const projectKey = (cwd: string) => `p:${cwd.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()}`

// One round from the tool's input and the result core returned. Null when there is nothing to keep: no questions,
// or not one answer, note or free text (the dialog was dismissed).
export function parseRound(input: unknown, result: unknown, meta: { id: string; at: number; session: string }): QaRound | null {
  if (!isObj(input) || !Array.isArray(input.questions)) return null
  const r = isObj(result) ? result : {}
  const answers = isObj(r.answers) ? r.answers : {}
  const notes = isObj(r.annotations) ? r.annotations : {}
  const questions: QaQuestion[] = []
  for (const q of input.questions.slice(0, 8)) {
    if (!isObj(q)) continue
    const question = str(q.question, CAP.question)
    if (!question) continue
    const raw = q.question as string
    const note = notes[raw]
    questions.push({
      header: str(q.header, CAP.header),
      question,
      options: Array.isArray(q.options) ? q.options.flatMap(o => (isObj(o) && str(o.label, CAP.option) ? [str(o.label, CAP.option)] : [])) : [],
      isMulti: q.multiSelect === true,
      answer: str(answers[raw], CAP.answer),
      notes: isObj(note) ? str(note.notes, CAP.notes) : str(note, CAP.notes),
    })
  }
  if (questions.length === 0) return null
  const response = str(r.response, CAP.response)
  if (!response && questions.every(q => !q.answer && !q.notes)) return null
  const metadata = isObj(input.metadata) ? input.metadata : {}
  return {
    id: meta.id,
    at: meta.at,
    session: meta.session,
    source: str(metadata.source, CAP.source),
    questions,
    response,
    isFollowUp: r.followUp === true,
    isAfk: typeof r.afkTimeoutMs === 'number',
  }
}

// The stored record, checked: anything malformed is dropped.
export function parseLog(v: unknown): QaRound[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is QaRound => isObj(x) && typeof x.id === 'string' && typeof x.at === 'number' && Array.isArray(x.questions))
}

// Appends a round (a repeat of the same tool_use_id replaces it) and keeps the newest MAX_ROUNDS.
export function addRound(log: readonly QaRound[], round: QaRound, max = MAX_ROUNDS): QaRound[] {
  const out = log.filter(r => r.id !== round.id)
  out.push(round)
  return out.slice(Math.max(0, out.length - max))
}

const pad = (n: number) => String(n).padStart(2, '0')
export const when = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const label = (source: string) => (source.startsWith('interview:') ? `interview ${source.slice(10)}` : source)

const answerOf = (q: QaQuestion) => q.answer || '(no answer)'

// One round as lines of plain text: the digest that goes back to Claude, and /qa.
export function roundLines(r: QaRound, n: number): string[] {
  const head = [`Round ${n}`, when(r.at), label(r.source), r.isAfk ? 'auto-resolved while away' : ''].filter(Boolean).join(' · ')
  const out = [head]
  for (const q of r.questions) {
    out.push(`- ${q.header ? `[${q.header}] ` : ''}${q.question} → ${answerOf(q)}${q.notes ? ` (note: ${q.notes})` : ''}`)
  }
  if (r.response) out.push(`- Typed instead: ${r.response}`)
  if (r.isFollowUp) out.push('- Asked for another round of questions.')
  return out
}

// Which rounds `/qa send` and the tool mean: this session's, all of the project's, or the last N.
export type Scope = { kind: 'session' } | { kind: 'all' } | { kind: 'last'; n: number }

export function parseScope(arg: string): Scope | null {
  const a = arg.trim().toLowerCase()
  if (a === '' || a === 'session') return { kind: 'session' }
  if (a === 'all' || a === 'project') return { kind: 'all' }
  if (/^\d{1,3}$/.test(a) && Number(a) > 0) return { kind: 'last', n: Number(a) }
  return null
}

// The rounds in scope, each with its number in the whole project record (1 = oldest).
export function pick(log: readonly QaRound[], scope: Scope, session: string): { round: QaRound; n: number }[] {
  const all = log.map((round, i) => ({ round, n: i + 1 }))
  if (scope.kind === 'all') return all
  if (scope.kind === 'last') return all.slice(Math.max(0, all.length - scope.n))
  return all.filter(x => x.round.session === session)
}

// The digest Claude reads: the agreed answers, newest last. Over `maxChars` the oldest rounds go first, and the
// header says how many were left out.
export function digest(rounds: readonly { round: QaRound; n: number }[], maxChars = 12000): string {
  if (rounds.length === 0) return ''
  const blocks = rounds.map(x => roundLines(x.round, x.n).join('\n'))
  let kept = blocks.length
  let size = blocks.reduce((s, b) => s + b.length + 2, 0)
  while (kept > 1 && size > maxChars) {
    size -= (blocks[blocks.length - kept]?.length ?? 0) + 2
    kept -= 1
  }
  const dropped = blocks.length - kept
  const head =
    `What we agreed in earlier question-and-answer rounds (recorded by bws-interview, ${kept} round${kept === 1 ? '' : 's'}, oldest first` +
    (dropped > 0 ? `; ${dropped} older left out` : '') +
    '). Treat these answers as decided unless I change them now.'
  return [head, ...blocks.slice(blocks.length - kept)].join('\n\n')
}

// ---------- the dashboard tab ----------

// `shown` counts back from the newest round: 0 is the newest.
export function clampShown(shown: number, count: number) {
  return Math.max(0, Math.min(shown, count - 1))
}

export function qaTab(log: readonly QaRound[], shown: number, session: string, o: { show?: number; hasSent?: string } = {}): ModTab {
  const count = log.length
  if (count === 0) {
    return makeTab('Interview', [text('No question rounds recorded in this project yet.', { isDim: true }), text('Each AskUserQuestion round lands here with its answers; /qa send gives them back to Claude.', { isDim: true })], { badge: '', show: o.show })
  }
  const i = clampShown(shown, count)
  const n = count - i
  const r = log[n - 1]!
  const inSession = log.filter(x => x.session === session).length
  const body: TabNode[] = [
    text(`Round ${n} of ${count} · ${when(r.at)}${r.source ? ` · ${label(r.source)}` : ''}${r.session === session ? ' · this session' : ''}`, { isBold: true }),
  ]
  for (const q of r.questions) {
    const lines: TabNode[] = [text(q.question)]
    if (q.options.length > 0) lines.push(text(`options: ${q.options.join(' / ')}${q.isMulti ? ' (multi)' : ''}`, { isDim: true }))
    lines.push(text(`→ ${answerOf(q)}`, { color: q.answer ? 'ok' : 'warn', isBold: true }))
    if (q.notes) lines.push(text(`note: ${q.notes}`, { color: 'accent' }))
    body.push(card(q.header || 'Question', lines))
  }
  if (r.response) body.push(text(`Typed instead: ${r.response}`, { color: 'accent' }))
  if (r.isFollowUp) body.push(text('Asked for another round.', { isDim: true }))
  if (r.isAfk) body.push(text('Auto-resolved while away: not a real answer.', { color: 'warn' }))
  if (o.hasSent) body.push(text(o.hasSent, { color: 'ok', isDim: true }))
  body.push(
    buttons(
      { id: 'older', label: 'Older', hotkey: 'o' },
      { id: 'newer', label: 'Newer', hotkey: 'n' },
      { id: 'newest', label: 'Newest', hotkey: 'e' },
    ),
    buttons(
      { id: 'send-round', label: 'Send this round', hotkey: 's', isPrimary: true },
      { id: 'send-session', label: `Send session (${inSession})`, hotkey: 'a' },
    ),
  )
  return makeTab('Interview', body, { badge: String(count), tone: inSession > 0 ? 'ok' : 'idle', show: o.show })
}

// /qa: the record as text, newest `limit` rounds.
export function recordText(log: readonly QaRound[], limit = 20): string {
  if (log.length === 0) return 'No question rounds recorded in this project yet.'
  const from = Math.max(0, log.length - limit)
  const blocks = log.slice(from).map((r, i) => roundLines(r, from + i + 1).join('\n'))
  const head = `${log.length} round${log.length === 1 ? '' : 's'} recorded in this project${from > 0 ? `, newest ${limit} shown` : ''}. /qa send [all|N] gives them back to Claude.`
  return [head, ...blocks].join('\n\n')
}
