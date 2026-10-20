// The record of checks (per project, across sessions), its trends, and what the person sees: the dashboard tab, the
// summary chip, the /direction text and the note Claude gets. Pure: no `$`.
import { makeSummary, type ModSummary } from './kit/summary'
import { buttons, card, makeTab, text, type ModTab, type TabButton, type TabColor, type TabNode } from './kit/tab'
import { VERDICTS, type Judgement, type Verdict } from './verdict'

export type Check = Judgement & { at: number; session: string; scope: 'turn' | 'overall'; turn: number; files: string[] }

export const MAX_CHECKS = 300
const DAY = 86_400_000

// Store key for a project: its folder, case and slashes folded.
export const projectKey = (cwd: string) => `project:${cwd.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()}`

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

// Reads the stored record; anything malformed is dropped.
export function parseChecks(v: unknown): Check[] {
  if (!Array.isArray(v)) return []
  return v.filter(
    (c): c is Check =>
      isObj(c) && typeof c.at === 'number' && typeof c.session === 'string' && VERDICTS.includes(c.verdict as Verdict) && typeof c.score === 'number' && (c.scope === 'turn' || c.scope === 'overall'),
  ).map(c => ({ ...c, files: Array.isArray(c.files) ? c.files.filter(f => typeof f === 'string') : [], reason: String(c.reason ?? ''), anchor: String(c.anchor ?? ''), suggestion: String(c.suggestion ?? ''), turn: Number(c.turn) || 0 }))
}

export const addCheck = (log: readonly Check[], c: Check, max = MAX_CHECKS): Check[] => [...log, c].slice(-max)

const GLYPH: Record<Verdict, string> = { aligned: '✓', drifting: '~', 'off-course': '✗' }
const COLOR: Record<Verdict, TabColor> = { aligned: 'ok', drifting: 'warn', 'off-course': 'bad' }
const WORD: Record<Verdict, string> = { aligned: 'Aligned', drifting: 'Drifting', 'off-course': 'Off course' }

export const isDrift = (c: Check | null | undefined) => c !== null && c !== undefined && c.verdict !== 'aligned'

const avg = (xs: readonly number[]) => (xs.length === 0 ? 0 : Math.round(xs.reduce((a, b) => a + b, 0) / xs.length))
const pct = (n: number, of: number) => (of === 0 ? 0 : Math.round((100 * n) / of))

export type Trend = { checks: number; avg: number; aligned: number; drifting: number; offCourse: number; glyphs: string; direction: 'up' | 'down' | 'flat' }

// A run of checks: counts, average score, the last 20 as glyphs, and whether the second half scores better or worse.
export function trend(checks: readonly Check[]): Trend {
  const n = checks.length
  const half = Math.floor(n / 2)
  const first = avg(checks.slice(0, half).map(c => c.score))
  const second = avg(checks.slice(half).map(c => c.score))
  const direction = n < 4 || Math.abs(second - first) < 8 ? 'flat' : second > first ? 'up' : 'down'
  return {
    checks: n,
    avg: avg(checks.map(c => c.score)),
    aligned: checks.filter(c => c.verdict === 'aligned').length,
    drifting: checks.filter(c => c.verdict === 'drifting').length,
    offCourse: checks.filter(c => c.verdict === 'off-course').length,
    glyphs: checks.slice(-20).map(c => GLYPH[c.verdict]).join(''),
    direction,
  }
}

const ARROW = { up: '↑ improving', down: '↓ worsening', flat: '→ steady' }

export const sessionChecks = (log: readonly Check[], session: string) => log.filter(c => c.session === session && c.scope === 'turn')

export function sessionLine(log: readonly Check[], session: string): string {
  const t = trend(sessionChecks(log, session))
  if (t.checks === 0) return 'This session: no checks yet.'
  return `This session: ${t.glyphs}  ${t.checks} check${t.checks === 1 ? '' : 's'}, average ${t.avg}, ${ARROW[t.direction]}`
}

// The project across sessions: this week against the week before, and how many sessions drifted.
export function projectLine(log: readonly Check[], now: number): string {
  const turns = log.filter(c => c.scope === 'turn')
  if (turns.length === 0) return 'Project: no checks yet.'
  const t = trend(turns)
  const week = turns.filter(c => c.at > now - 7 * DAY)
  const before = turns.filter(c => c.at <= now - 7 * DAY && c.at > now - 14 * DAY)
  const sessions = new Set(turns.map(c => c.session))
  const drifted = new Set(turns.filter(c => c.verdict !== 'aligned').map(c => c.session))
  const weekText = week.length > 0 ? `; last 7 days ${avg(week.map(c => c.score))}${before.length > 0 ? ` (week before ${avg(before.map(c => c.score))})` : ''}` : ''
  return `Project: ${t.checks} check${t.checks === 1 ? '' : 's'} over ${sessions.size} session${sessions.size === 1 ? '' : 's'}, ${pct(t.aligned, t.checks)}% aligned, average ${t.avg}${weekText}; ${drifted.size} session${drifted.size === 1 ? '' : 's'} drifted.`
}

export const lastOf = (log: readonly Check[], scope: 'turn' | 'overall', session?: string): Check | null => {
  for (let i = log.length - 1; i >= 0; i--) {
    const c = log[i]
    if (c && c.scope === scope && (session === undefined || c.session === session)) return c
  }
  return null
}

const pad = (n: number) => String(n).padStart(2, '0')
export const when = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const causeText = (c: Check) => (c.cause === 'user' ? ' · scope widened by you' : c.cause === 'agent' ? ' · agent tangent' : '')

export function checkLines(c: Check): string[] {
  return [
    `${WORD[c.verdict]} (${c.score})${causeText(c)}`,
    c.reason,
    c.anchor ? `Anchor: ${c.anchor}` : '',
    c.suggestion ? `Next: ${c.suggestion}` : '',
    c.files.length > 0 ? `Files: ${c.files.slice(0, 6).join(', ')}${c.files.length > 6 ? ` +${c.files.length - 6}` : ''}` : '',
  ].filter(Boolean)
}

const checkCard = (title: string, c: Check): TabNode => {
  const [head, ...rest] = checkLines(c)
  return card(title, [text(head ?? '', { isBold: true, color: COLOR[c.verdict] }), ...rest.map(l => text(l))], COLOR[c.verdict])
}

export type View = {
  log: readonly Check[]
  session: string
  now: number
  phase: 'idle' | 'checking' | 'overall'
  note: string
  isAuto: boolean
  anchors: string // "docs/PRD.md · 41 docs · plan runs/…/PLAN.md"
  counts: { raise: number; show: number }
}

// The Direction tab: the last check of this session, the last overall check, both trends, the buttons.
export function directionTab(v: View): ModTab {
  const last = lastOf(v.log, 'turn', v.session)
  const overall = lastOf(v.log, 'overall')
  const body: TabNode[] = []
  if (v.phase !== 'idle') body.push(text(v.phase === 'overall' ? 'Checking the whole project...' : 'Checking the last turn...', { color: 'accent' }))
  if (v.note) body.push(text(v.note, { color: 'warn' }))
  if (last) body.push(checkCard(`Last turn · turn ${last.turn} · ${when(last.at)}`, last))
  else body.push(text(v.isAuto ? 'No check yet. Turns that edit files are checked when they end.' : 'Automatic checks are off. Check now runs one.', { isDim: true }))
  body.push(text(sessionLine(v.log, v.session)), text(projectLine(v.log, v.now)))
  if (overall) body.push(checkCard(`Whole project · ${when(overall.at)}`, overall))
  if (v.anchors) body.push(text(`Anchors: ${v.anchors}`, { isDim: true, isClipped: true }))
  const items: TabButton[] = [
    { id: 'check', label: 'Check now', hotkey: 'c', isPrimary: !isDrift(last) },
    { id: 'overall', label: 'Whole project', hotkey: 'o' },
  ]
  if (isDrift(last)) items.unshift({ id: 'tell', label: 'Tell Claude', hotkey: 't', isPrimary: true })
  items.push({ id: v.isAuto ? 'pause' : 'resume', label: v.isAuto ? 'Pause auto' : 'Resume auto', hotkey: 'p' })
  body.push(buttons(...items))
  const tone = v.phase !== 'idle' ? 'busy' : last ? COLOR[last.verdict] === 'ok' ? 'ok' : COLOR[last.verdict] === 'warn' ? 'warn' : 'bad' : 'idle'
  const badge = v.phase !== 'idle' ? '…' : last ? `${GLYPH[last.verdict]} ${last.score}` : ''
  return makeTab('Direction', body, { badge, tone, raise: v.counts.raise, show: v.counts.show })
}

export function directionSummary(v: View): ModSummary | null {
  if (v.phase !== 'idle') return makeSummary('busy', 'direction checking')
  const last = lastOf(v.log, 'turn', v.session)
  if (!last) return null
  if (last.verdict === 'aligned') return makeSummary('ok', `on course ${last.score}`)
  return makeSummary(last.verdict === 'drifting' ? 'warn' : 'bad', `${last.verdict} ${last.score}`, last.reason)
}

// /direction with no argument (and headless): the same content as the tab, as text.
export function statusText(v: View): string {
  const last = lastOf(v.log, 'turn', v.session)
  const overall = lastOf(v.log, 'overall')
  return [
    `Direction${v.isAuto ? '' : ' (automatic checks paused)'}`,
    v.anchors ? `Anchors: ${v.anchors}` : 'Anchors: none found (no docs/ folder, no run-folder PLAN.md); checks use the session task only.',
    ...(last ? ['', `Last turn (turn ${last.turn}, ${when(last.at)}):`, ...checkLines(last).map(l => `  ${l}`)] : ['', 'No check in this session yet.']),
    '',
    sessionLine(v.log, v.session),
    projectLine(v.log, v.now),
    ...(overall ? ['', `Whole project (${when(overall.at)}):`, ...checkLines(overall).map(l => `  ${l}`)] : []),
  ].join('\n')
}

// The note Claude gets while this session's last check found drift (the `nudge` option), and the prompt Tell Claude sends.
export function nudgeText(c: Check): string {
  return [
    `Direction check (bws-direction) on turn ${c.turn}: ${WORD[c.verdict].toLowerCase()}, score ${c.score}${c.cause === 'user' ? ', the scope was widened by the person' : ''}.`,
    c.reason,
    c.anchor ? `It rests on: ${c.anchor}.` : '',
    c.suggestion ? `Suggested: ${c.suggestion}` : '',
    c.cause === 'user'
      ? 'Before more work, say plainly that this widens the agreed scope and offer to park it as a follow-up.'
      : 'Before more work, either get back to the agreed task and plan, or say in one line why this work is in scope.',
  ]
    .filter(Boolean)
    .join(' ')
}

// The earlier checks an overall check reads: one line each, newest last.
export const historyText = (log: readonly Check[], max = 40) =>
  log
    .slice(-max)
    .map(c => `${when(c.at)} ${c.scope} ${c.verdict} ${c.score}${c.cause !== 'none' ? ` (${c.cause})` : ''}: ${c.reason}`)
    .join('\n')
