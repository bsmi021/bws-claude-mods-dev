// Pure helpers for bws-assumptions: the list, the lines the pane and status draw, and the verdict prompt.
import type { Assumption, Verdict } from '../types'

export const TOOL_NAME = 'record_assumption'
export const MAX_ITEMS = 200

export const TOOL_DESCRIPTION =
  'Record an assumption you are making while building, so the user can confirm or correct it later from a side pane. ' +
  'Call it the moment you choose something the user did not specify and that would change the result if wrong: ' +
  'a library, a file location, a name, an API shape, a default value, a behaviour in an edge case, what "done" means. ' +
  'One call per assumption, stated as a plain claim ("Dates are stored as UTC ISO strings"). ' +
  'Then keep working on that assumption; do not stop to ask. Do not record facts you verified in the code or that the user stated.'

export const TOOL_SCHEMA = {
  type: 'object',
  properties: {
    assumption: { type: 'string', description: 'The assumption as one plain claim, under 200 characters.' },
    why: { type: 'string', description: 'Optional: why you chose it, or the main alternative, in a few words.' },
  },
  required: ['assumption'],
} as const

export const GUIDE =
  `# Assumptions\n` +
  `While you build, change or configure anything, call mcp__bws-assumptions__${TOOL_NAME} each time you make an assumption ` +
  `the user did not state and could reasonably disagree with (a choice of library, location, naming, data shape, default, ` +
  `edge-case behaviour, scope). Record it and keep going; do not stop to ask about it. ` +
  `The user reviews them in a side pane. When a message arrives headed "Assumption review", treat each WRONG item as a ` +
  `correction: change the work that relied on it directly, then continue the task.`

export function clip(text: string, max: number): string {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > max ? `${one.slice(0, max - 1)}…` : one
}

export function add(list: readonly Assumption[], text: string, why: string): { list: Assumption[]; item: Assumption } {
  const n = list.reduce((max, a) => Math.max(max, a.n), 0) + 1
  const item: Assumption = { n, text: clip(text, 400), why: clip(why, 200), verdict: 'open', correction: '', isSent: false }
  return { list: [...list, item].slice(-MAX_ITEMS), item }
}

// Pressing the verdict an item already has clears it back to open.
export function setVerdict(list: readonly Assumption[], n: number, verdict: Verdict): Assumption[] {
  return list.map(a => (a.n !== n || a.isSent ? a : { ...a, verdict: a.verdict === verdict ? 'open' : verdict }))
}

export function setCorrection(list: readonly Assumption[], n: number, correction: string): Assumption[] {
  return list.map(a => (a.n !== n || a.isSent ? a : { ...a, correction: clip(correction, 400) }))
}

export const unreviewed = (list: readonly Assumption[]) => list.filter(a => !a.isSent && a.verdict === 'open')
export const ready = (list: readonly Assumption[]) => list.filter(a => !a.isSent && a.verdict !== 'open')
export const active = (list: readonly Assumption[]) => list.filter(a => !a.isSent)
export const sent = (list: readonly Assumption[]) => list.filter(a => a.isSent)

export function markSent(list: readonly Assumption[], ns: readonly number[]): Assumption[] {
  return list.map(a => (ns.includes(a.n) ? { ...a, isSent: true } : a))
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

// The pane's collapsed line and the status line.
export function summary(list: readonly Assumption[]): string {
  const open = unreviewed(list).length
  const marked = ready(list).length
  const parts = [`⚑ ${plural(active(list).length, 'assumption')}`]
  if (open > 0) parts.push(`${open} to review`)
  if (marked > 0) parts.push(`${marked} ready to send`)
  if (active(list).length === 0) parts.push(`${sent(list).length} reviewed`)
  return parts.join(' · ')
}

// What the status line shows; undefined clears it once nothing waits on the person.
export function statusText(list: readonly Assumption[]): string | undefined {
  if (active(list).length === 0) return undefined
  return `${summary(list)} · /assumptions`
}

// The prompt that hands the verdicts to Claude. Wrong items lead: they are the work.
export function verdictPrompt(items: readonly Assumption[], corrections: ReadonlyMap<number, string> = new Map()): string {
  const fix = (a: Assumption) => (corrections.get(a.n) ?? a.correction).trim()
  const wrong = items.filter(a => a.verdict === 'wrong')
  const right = items.filter(a => a.verdict === 'right')
  const lines = ['Assumption review (from the assumptions pane):']
  for (const a of wrong) {
    const c = fix(a)
    lines.push(c ? `- A${a.n} is WRONG: "${a.text}". Instead: ${c}` : `- A${a.n} is WRONG: "${a.text}". No correction given: ask me what it should be before changing it.`)
  }
  for (const a of right) lines.push(`- A${a.n} is right: "${a.text}". Keep it.`)
  lines.push('')
  lines.push(
    wrong.length > 0
      ? 'Apply each correction now: change the work already done that relied on a wrong assumption, then continue the task. Do not record these as new assumptions.'
      : 'All confirmed. Carry on.',
  )
  return lines.join('\n')
}

// /assumptions where nothing draws a pane (claude -p, SDK hosts).
export function listText(list: readonly Assumption[]): string {
  if (list.length === 0) return 'No assumptions recorded in this session.'
  const mark = (a: Assumption) => (a.isSent ? `sent, ${a.verdict}` : a.verdict === 'open' ? 'to review' : a.verdict)
  return [summary(list), ...list.map(a => `A${a.n} [${mark(a)}] ${a.text}${a.why ? ` (${a.why})` : ''}`)].join('\n')
}
