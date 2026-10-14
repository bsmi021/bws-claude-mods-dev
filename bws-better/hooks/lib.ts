// bws-better: the pure parts. Which prompts are taken, the two model prompts and their replies, big digits,
// rows sized to the pane, and the history list. Nothing here touches `$`.
import type { Answer, Entry, Question, Step } from '../types'

export const GOLD = '#F2C46D'
export const HAIR = '#262B33'
export const MUTED = '#7D8590'
export const INK = '#E6EDF3'
export const GREEN = '#3DD68C'
export const AMBER = '#E3B341'
// Dark text on a gold chip.
export const ON_GOLD = '#0D1117'

export const TITLE = 'PROMPT UPGRADE'
export const HISTORY_MAX = 20

// ---------------------------------------------------------------------------------------------------------------
// Which typed prompts go to the pane.

export type Submitted = {
  text: string
  origin: { kind: string }
  command?: unknown
  isMeta?: true
  attachments?: readonly unknown[]
  turnId?: string
}

export type Verdict = { kind: 'pass' } | { kind: 'armed' } | { kind: 'strip'; text: string } | { kind: 'take' }

const ACK = /^(y|yes|yeah|yep|yup|no|nope|n|ok|okay|k|sure|thanks|thank you|thx|ty|go|go ahead|go on|keep going|continue|carry on|proceed|do it|ship it|sounds good|looks good|lgtm|perfect|great|nice|cool|right|correct|exactly|agreed|stop|wait|hold on|never mind|nevermind|cancel|again|retry|try again|done)\b/i

export function wordCount(text: string): number {
  const t = text.trim()
  return t === '' ? 0 : t.split(/\s+/).length
}

// "yes", "keep going", "ok do it": three words or fewer, or an acknowledgement of up to six.
export function isShortReply(text: string): boolean {
  const words = wordCount(text)
  if (words <= 3) return true
  return words <= 6 && ACK.test(text.trim())
}

// The order matters: only the person's own Enter is ever taken (the mod's own submit is a plugin's, so Run can never
// come back here); Edit's one free pass is spent on that Enter; with auto off nothing is touched.
export function classify(e: Submitted, s: { auto: boolean; armed: boolean }): Verdict {
  if (e.origin.kind !== 'composer') return { kind: 'pass' }
  if (s.armed) return { kind: 'armed' }
  if (!s.auto) return { kind: 'pass' }
  if (e.command !== undefined || e.isMeta === true) return { kind: 'pass' }
  if ((e.attachments?.length ?? 0) > 0) return { kind: 'pass' }
  if (e.turnId !== undefined) return { kind: 'pass' }
  const t = e.text.trim()
  if (t.startsWith('>')) {
    const rest = t.replace(/^>\s?/, '')
    return rest.trim() === '' ? { kind: 'pass' } : { kind: 'strip', text: rest }
  }
  if (t === '' || t.startsWith('/')) return { kind: 'pass' }
  if (isShortReply(t)) return { kind: 'pass' }
  return { kind: 'take' }
}

// ---------------------------------------------------------------------------------------------------------------
// The two model calls.

export const QUESTIONS_SYSTEM = `You help a person sharpen a rough request before they send it to Claude Code, an AI assistant that works in their project.

Pick at most three multiple-choice questions whose answers would most improve the result: the goal, who it is for, the format or scope of the result, or what "done" looks like. Do not ask about anything the request already says.

Each question is short (under 70 characters) and has two to four short options (under 28 characters each) that are real, distinct choices. Never ask the person to type facts such as names, numbers or prices: those become placeholders later. If no question would clearly help, return no questions.

Reply with JSON only, no other text:
{"questions":[{"q":"...","options":["...","..."]}]}`

export function questionsPrompt(original: string): string {
  return `<request>\n${original}\n</request>`
}

export const REWRITE_SYSTEM = `You rewrite a person's rough request into a better one for Claude Code, an AI assistant that works in their project.

Rules:
- Keep exactly what they meant. Do not change the task, add new tasks or widen the scope.
- Make clear the goal, who it is for, the format of the result, and what "done" looks like.
- Use the answers they gave. Leave out anything they skipped.
- Never invent facts, names, numbers, prices, files or tools. Where something needed is unknown, write a [placeholder] in square brackets.
- Write it as one request they could have typed themselves, in plain language and the first person. No title, no preamble, no quotes around it.

Reply with JSON only, no other text:
{"prompt":"the upgraded request","added":["each thing you added, under 60 characters"]}
The "added" list names two to six concrete additions, such as "Audience: new players" or "Done when the tests pass".`

// The answers that count: picked or typed. Skipped and unanswered questions are left out.
export function answerLines(questions: readonly Question[], answers: readonly Answer[]): string[] {
  const lines: string[] = []
  questions.forEach((q, i) => {
    const a = answers[i]
    if (a && a.kind !== 'skip' && a.value.trim() !== '') lines.push(`${q.text} ${a.value.trim()}`)
  })
  return lines
}

export function rewritePrompt(original: string, questions: readonly Question[], answers: readonly Answer[]): string {
  const lines = answerLines(questions, answers)
  const given = lines.length === 0 ? '(none)' : lines.map(l => `- ${l}`).join('\n')
  return `<request>\n${original}\n</request>\n\n<answers>\n${given}\n</answers>`
}

// The first JSON object in a reply, fences and chatter around it ignored; undefined when there is none.
function jsonIn(text: string): unknown {
  const t = text.replace(/```(?:json)?/gi, '')
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start < 0 || end <= start) return undefined
  try {
    return JSON.parse(t.slice(start, end + 1))
  } catch {
    return undefined
  }
}

function clipWords(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`
}

// Up to three questions with two to four distinct options each; [] when the model says none would help,
// null when the reply cannot be read.
export function parseQuestions(text: string): Question[] | null {
  const data = jsonIn(text)
  if (typeof data !== 'object' || data === null) return null
  const list = (data as { questions?: unknown }).questions
  if (!Array.isArray(list)) return null
  const out: Question[] = []
  for (const item of list) {
    if (typeof item !== 'object' || item === null) continue
    const raw = item as { q?: unknown; question?: unknown; text?: unknown; options?: unknown }
    const q = [raw.q, raw.question, raw.text].find((v): v is string => typeof v === 'string' && v.trim() !== '')
    if (q === undefined || !Array.isArray(raw.options)) continue
    const options: string[] = []
    for (const o of raw.options) {
      if (typeof o !== 'string' || o.trim() === '') continue
      const c = clipWords(o, 40)
      if (!options.some(x => x.toLowerCase() === c.toLowerCase())) options.push(c)
    }
    if (options.length < 2) continue
    out.push({ text: clipWords(q, 120), options: options.slice(0, 4) })
    if (out.length === 3) break
  }
  return out
}

export type Rewrite = { prompt: string; added: string[] }

// The upgraded prompt and what it added; a reply with no JSON at all is taken as the prompt itself.
export function parseRewrite(text: string): Rewrite | null {
  const data = jsonIn(text)
  if (typeof data === 'object' && data !== null) {
    const raw = data as { prompt?: unknown; added?: unknown }
    if (typeof raw.prompt !== 'string' || raw.prompt.trim() === '') return null
    const added = Array.isArray(raw.added)
      ? raw.added.filter((a): a is string => typeof a === 'string' && a.trim() !== '').map(a => clipWords(a, 80)).slice(0, 8)
      : []
    return { prompt: raw.prompt.trim(), added }
  }
  const plain = text.replace(/```[a-z]*\n?/gi, '').trim()
  if (plain === '' || plain.startsWith('{')) return null
  return { prompt: plain, added: [] }
}

// ---------------------------------------------------------------------------------------------------------------
// Big numbers: three rows of heavy box-drawing, three cells a digit, one cell between digits.

const DIGITS: Record<string, [string, string, string]> = {
  '0': ['┏━┓', '┃ ┃', '┗━┛'],
  '1': ['╺┓ ', ' ┃ ', '╺┻╸'],
  '2': ['╺━┓', '┏━┛', '┗━╸'],
  '3': ['╺━┓', ' ━┫', '╺━┛'],
  '4': ['╻ ╻', '┗━┫', '  ╹'],
  '5': ['┏━╸', '┗━┓', '╺━┛'],
  '6': ['┏━╸', '┣━┓', '┗━┛'],
  '7': ['╺━┓', '  ┃', '  ╹'],
  '8': ['┏━┓', '┣━┫', '┗━┛'],
  '9': ['┏━┓', '┗━┫', '╺━┛'],
}

export function bigDigits(n: number): [string, string, string] {
  const s = String(Math.max(0, Math.floor(n)))
  const rows: [string[], string[], string[]] = [[], [], []]
  for (const ch of s) {
    const d = DIGITS[ch] ?? DIGITS['0']!
    rows[0].push(d[0])
    rows[1].push(d[1])
    rows[2].push(d[2])
  }
  return [rows[0].join(' '), rows[1].join(' '), rows[2].join(' ')]
}

export const TILE_LABELS = ['WORDS BEFORE', 'WORDS AFTER', 'DETAILS ADDED'] as const

// The inner width of a tile (padding included, border not): the widest of its number and its label, plus one each side.
export function tileInner(n: number, label: string): number {
  return Math.max(bigDigits(n)[0].length, label.length) + 2
}

// The tiles' width in all (borders and one-cell gaps); null when they do not fit and the plain line is drawn instead.
export function tilesWidth(nums: readonly number[], cols: number): number | null {
  const w = nums.reduce((sum, n, i) => sum + tileInner(n, TILE_LABELS[i] ?? '') + 2, 0) + (nums.length - 1)
  return w <= cols ? w : null
}

export function statsLine(before: number, after: number, added: number, cols: number): string {
  const long = `${before} words before · ${after} words after · ${added} ${added === 1 ? 'detail' : 'details'} added`
  if (long.length <= cols) return long
  return clipLine(`${before} → ${after} words · ${added} added`, cols)
}

// ---------------------------------------------------------------------------------------------------------------
// Rows sized to the pane.

export function clipLine(text: string, cols: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (cols <= 0) return ''
  return t.length <= cols ? t : `${t.slice(0, Math.max(0, cols - 1)).trimEnd()}…`
}

// The title's gold rule (as wide as the title) and the hairline that runs on to the edge.
export function titleRule(cols: number): { gold: string; hair: string } {
  const g = Math.min(TITLE.length, cols)
  return { gold: '━'.repeat(g), hair: '─'.repeat(Math.max(0, cols - g)) }
}

// A section heading: the label in small capitals, one space, then a hairline to the edge.
export function heading(label: string, cols: number): { label: string; hair: string } {
  const l = clipLine(label.toUpperCase(), cols)
  return { label: l, hair: '─'.repeat(Math.max(0, cols - l.length - 1)) }
}

export const STEPS = ['Your prompt', 'Questions', 'Rewrite', 'Review'] as const

export function stepIndex(step: Step, failed: 'questions' | 'rewrite' | null): number {
  switch (step) {
    case 'compose':
    case 'reading':
      return 0
    case 'questions':
      return 1
    case 'rewrite':
      return 2
    case 'review':
      return 3
    case 'error':
      return failed === 'rewrite' ? 2 : 0
    default:
      return -1
  }
}

export type Tone = 'done' | 'now' | 'todo' | 'line'
export type Seg = { text: string; tone: Tone }

// The four steps across the top: finished ones checked, the current one marked, the rest open. Its widest form that
// fits: joined by rules, by spaces, or the marks alone with the current step's name.
export function tracker(current: number, cols: number): Seg[] {
  const tone = (i: number): Tone => (i < current ? 'done' : i === current ? 'now' : 'todo')
  const mark = (i: number) => (i < current ? '✓' : i === current ? '●' : '○')
  const parts = STEPS.map((name, i) => ({ text: `${mark(i)} ${name}`, tone: tone(i) }))
  const named = parts.reduce((n, p) => n + p.text.length, 0)
  for (const sep of [' ── ', '  ']) {
    if (named + sep.length * (parts.length - 1) <= cols) {
      const out: Seg[] = []
      parts.forEach((p, i) => {
        if (i > 0) out.push({ text: sep, tone: 'line' })
        out.push(p)
      })
      return out
    }
  }
  const out: Seg[] = []
  STEPS.forEach((_, i) => {
    if (i > 0) out.push({ text: ' ', tone: 'line' })
    out.push({ text: mark(i), tone: tone(i) })
  })
  const name = STEPS[Math.max(0, Math.min(3, current))] ?? ''
  const room = cols - segWidth(out) - 2
  if (room > 1) out.push({ text: `  ${clipLine(name, room)}`, tone: 'now' })
  return out
}

export function segWidth(segs: readonly Seg[]): number {
  return segs.reduce((n, s) => n + s.text.length, 0)
}

// Two cards side by side from this width; stacked below it.
export const SIDE_BY_SIDE = 64

export function cardWidths(cols: number): { isSide: boolean; left: number; right: number } {
  if (cols < SIDE_BY_SIDE) return { isSide: false, left: cols, right: cols }
  const left = Math.floor((cols - 1) / 2)
  return { isSide: true, left, right: cols - 1 - left }
}

// ---------------------------------------------------------------------------------------------------------------
// History.

// Newest first, one per id, at most twenty.
export function addEntry(list: readonly Entry[], entry: Entry): Entry[] {
  return [entry, ...list.filter(e => e.id !== entry.id)].slice(0, HISTORY_MAX)
}

export function readHistory(raw: unknown): Entry[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(
      (e): e is Entry =>
        typeof e === 'object' && e !== null && typeof e.id === 'string' && typeof e.original === 'string' && typeof e.upgraded === 'string',
    )
    .map(e => ({ id: e.id, at: Number(e.at) || 0, original: e.original, upgraded: e.upgraded, added: Array.isArray(e.added) ? e.added.filter(a => typeof a === 'string') : [] }))
    .slice(0, HISTORY_MAX)
}

const pad = (n: number) => String(n).padStart(2, '0')

// "10-14 09:12", local time.
export function stamp(at: number): string {
  const d = new Date(at)
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function historyRow(entry: Entry, cols: number): { when: string; text: string } {
  const when = stamp(entry.at)
  return { when, text: clipLine(entry.original, cols - when.length - 2) }
}

// What the box should hold to put `original` back: it as is over an empty box, nothing when the box already holds
// it, else after what was typed meanwhile, so nothing is lost.
export function restoreFill(box: string, original: string): { text: string; mode: 'replace' | 'append' } | null {
  if (box.trim() === '') return { text: original, mode: 'replace' }
  if (box.trim() === original.trim()) return null
  return { text: `\n\n${original}`, mode: 'append' }
}
