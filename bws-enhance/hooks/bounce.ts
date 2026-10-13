// Prompt bouncer for bws-enhance: holds a vague prompt before it is sent, with the reason. Pure: no `$` here.
// register.tsx makes the model and file calls and hands the answers in. Anything that is not a clear verdict fails
// open (FR-ALL-03): the prompt is sent as it was, and one debug line is written. That line never carries prompt text.

import { makeSummary } from './kit/summary'
import type { ModSummary } from './kit/summary'
import { clip, cleanReply } from './lib'

export type BounceMode = 'off' | 'warn' | 'block'

export const BOUNCE_TIMEOUT_MS = 4000
export const GLOSSARY_CAP = 4000
export const REASON_WORDS = 40
export const MIN_WORDS = 4

// The option value or the /bounce argument; anything else is null.
export function parseMode(v: unknown): BounceMode | null {
  const s = String(v ?? '').trim().toLowerCase()
  return s === 'off' || s === 'warn' || s === 'block' ? s : null
}

// Short replies that answer a question: a yes, a no, a go-ahead, a number or an option letter.
const ANSWERS = new Set(['yes', 'y', 'yeah', 'yep', 'yup', 'no', 'n', 'nope', 'ok', 'okay', 'sure', 'continue', 'go', 'go on', 'go ahead', 'proceed', 'do it', 'skip', 'stop', 'cancel', 'all', 'none'])

export function isAnswer(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/[.!?]+$/, '')
  return ANSWERS.has(t) || /^\d+([.,]\d+)?$/.test(t) || /^\(?[a-z]\)?$/.test(t)
}

// Leftover paste placeholders (the engine expands pastes, so this only catches what it leaves behind).
const PASTE = /\[(?:Pasted (?:text|content)|Image)\b[^\]]*\]|<pasted_content/i

// The person's own words: typed at the terminal, sent from the Remote Control bridge, or the SDK host's prompt (claude -p).
// A plugin's prompt, a peer's, a schedule's or a task's is never checked, so the bouncer's own "send anyway" passes.
const PERSON_ORIGINS = new Set(['composer', 'bridge', 'sdk'])

export type Candidate = { text: string; attachments?: readonly unknown[]; origin?: { kind: string } }

// Why a prompt is not checked, or null when it is. `headless` is true for a run with no surface (claude -p).
export function skipReason(e: Candidate, mode: BounceMode, headless: boolean): string | null {
  if (!e.origin || !PERSON_ORIGINS.has(e.origin.kind)) return 'not typed by the person'
  if (mode === 'warn' && headless) return 'headless warn: no pane for send anyway'
  const text = e.text.trim()
  if (text === '') return 'empty'
  if (text.startsWith('/')) return 'slash command'
  if ((e.attachments?.length ?? 0) > 0) return 'attachment'
  if (PASTE.test(text)) return 'pasted content'
  if (text.split(/\s+/).length < MIN_WORDS && isAnswer(text)) return 'short answer'
  return null
}

// The `## Glossary` section of a markdown file: from its heading to the next `#` or `##` heading.
export function glossarySection(md: string): string {
  const lines = md.split(/\r?\n/)
  const start = lines.findIndex(l => /^##\s+Glossary\s*$/i.test(l))
  if (start < 0) return ''
  const rest = lines.slice(start + 1)
  const end = rest.findIndex(l => /^#{1,2}\s/.test(l))
  return (end < 0 ? rest : rest.slice(0, end)).join('\n').trim()
}

// A whole glossary file, or its section, capped at GLOSSARY_CAP characters.
export function glossaryText(md: string, wholeFile: boolean): string {
  return clip(wholeFile ? md : glossarySection(md), GLOSSARY_CAP)
}

// A path the user or the plugin named: as it is when absolute, else under the project root.
export function resolvePath(root: string, p: string): string {
  return /^([a-zA-Z]:[\\/]|[\\/])/.test(p) ? p : `${root.replace(/[\\/]+$/, '')}/${p}`
}

// The classifier's question. "yes" means vague (the kit's yes/no gate); the prompt is the material.
const VAGUE_QUESTION = [
  'Is the prompt in <material> vague? It is vague when Claude Code would have to ask before acting: it names no file, area, symptom or change, or no way to tell when it is done.',
  'Answer yes if it is vague, no if it is clear enough to act on.',
].join(' ')

export function vagueQuestion(glossary: string): string {
  return glossary ? `${VAGUE_QUESTION}\n\nThe project's glossary, for the names it uses:\n${glossary}` : VAGUE_QUESTION
}

export const REASON_SYSTEM = `A developer's prompt for Claude Code was held because it is too vague to act on without questions. In one sentence, at most 40 words, say what is missing: the file or area, the change, or what "done" looks like. If a glossary is given, use its names for the project's things. Plain, calm words. Output only that sentence.`

export function reasonPrompt(prompt: string, glossary: string): string {
  return [
    `<glossary>\n${glossary || '(none)'}\n</glossary>`,
    `<prompt>\n${prompt.trim()}\n</prompt>`,
    'Say what is missing, in one sentence of at most 40 words.',
  ].join('\n\n')
}

// The model's reply as the pane shows it: cleaned, at most REASON_WORDS words. Empty when there is nothing usable.
export function reasonText(reply: string): string {
  const words = cleanReply(reply).split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  return words.length <= REASON_WORDS ? words.join(' ') : `${words.slice(0, REASON_WORDS).join(' ')}…`
}

export const MODE_NOTE: Record<BounceMode, string> = {
  off: 'Prompts are sent as typed.',
  warn: 'A vague prompt is held with the reason; Enter again sends it as it is.',
  block: 'A vague prompt is not sent; the draft stays in the box.',
}

export function statusText(mode: BounceMode, fromSession: boolean): string {
  return `Bounce: ${mode} (${fromSession ? 'this session' : 'the bounce option'}). ${MODE_NOTE[mode]}`
}

// The summary atom (FR-ALL-05): no chip when off; "bounce <mode>" when on; "prompt held" with the reason while held.
export function bounceSummary(mode: BounceMode, held: string | null): ModSummary | null {
  if (mode === 'off') return null
  return held === null ? makeSummary('ok', `bounce ${mode}`) : makeSummary('warn', 'prompt held', held)
}

// The one debug line for a failed step. It names the step and the reason, never the prompt or the model's text.
export function failLine(step: string, reason: string): string {
  return `bws-enhance: bounce ${step} failed (${reason}); the prompt was sent unchanged`
}
