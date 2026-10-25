// The judge: what a check asks the model, and how its answer is read. Pure: no `$`.

export type Verdict = 'aligned' | 'drifting' | 'off-course'
export type Cause = 'agent' | 'user' | 'none'
export const VERDICTS: readonly Verdict[] = ['aligned', 'drifting', 'off-course']

export type Judgement = { verdict: Verdict; score: number; reason: string; anchor: string; cause: Cause; suggestion: string }

export const CHECK_TIMEOUT_MS = 45_000
export const OVERALL_TIMEOUT_MS = 45_000

const SHAPE =
  'Answer with one JSON object and nothing else: ' +
  '{"verdict": "aligned" | "drifting" | "off-course", "score": 0-100 (100 = exactly on the plan), ' +
  '"reason": "one sentence, at most 35 words, naming what moved away from what", ' +
  '"anchor": "the plan item, document and section the judgement rests on (path § heading), or \\"task\\"", ' +
  '"cause": "agent" (the agent went beyond what was asked) | "user" (the person widened or changed the scope) | "none", ' +
  '"suggestion": "one short sentence: how to get back on course, or empty when aligned"}'

export const CHECK_SYSTEM = [
  'You check a coding session for drift. The yardstick is the opening request: the first thing the person asked for in this session. Drift is a step unrelated to that opening request.',
  'Read the whole conversation first. Work toward the opening goal takes many turns: follow-ups, confirmations ("yes", "do it", "publish it"), fixes, tests, reviews, iterations, tuning passes, release and publish steps, run logs, and the tooling the work hits. All of that is aligned, however long the conversation runs.',
  'aligned (score 75-100): the turn serves the opening request, directly or as a step it needs or implies.',
  'drifting (40-74): the turn starts work the opening request does not call for: a tangent, an unrelated improvement, a different feature.',
  'off-course (0-39): the turn works on something with no relation to the opening request.',
  'The plan and the documents only help you understand what the opening goal means; a turn is not drift because they are silent on it.',
  'A later prompt that continues or refines the opening goal is aligned. A later prompt that asks for unrelated work is drift with cause "user": say so plainly, the person may have good reasons.',
  'cause "agent": the agent turned to unrelated work on its own.',
  SHAPE,
].join('\n')

export type CheckInput = { task: { first: string; turns: string[]; omitted: number }; plan: string; planPath: string; corpus: string; turn: string }

export function checkPrompt(i: CheckInput): string {
  const later = i.task.omitted > 0 ? [...i.task.turns.slice(0, 3), `(${i.task.omitted} turns in between left out)`, ...i.task.turns.slice(3)] : i.task.turns
  const parts = [
    `<opening_request>\n${i.task.first || '(no typed prompt yet)'}\n</opening_request>`,
    later.length > 0 ? `<conversation>\nEvery later prompt from the person, in order, with what each turn did:\n${later.join('\n')}\n</conversation>` : '',
    i.plan ? `<plan path="${i.planPath}">\n${i.plan}\n</plan>` : '<plan>(no run-folder plan found)</plan>',
    i.corpus ? `<documents>\n${i.corpus}\n</documents>` : '<documents>(no docs/ folder found)</documents>',
    `<turn>\n${i.turn}\n</turn>`,
    'Does this turn serve the opening request, read in the light of the whole conversation?',
  ]
  return parts.filter(Boolean).join('\n\n')
}

export const OVERALL_SYSTEM = [
  'You check a software project for drift over time: is the recent work still heading where the project documents (specs, requirements, design docs) and plans say?',
  'aligned: recent commits build what the documents describe, in their priority order.',
  'drifting: a growing share of work is tangents, tooling, polish or features the documents do not ask for, or documented priorities are left untouched.',
  'off-course: the work contradicts the anchor documents, or has moved to a different product.',
  'cause: "agent" when sessions wander on their own, "user" when the person keeps widening scope, "none" when aligned.',
  SHAPE,
].join('\n')

export type OverallInput = { log: string; history: string; plan: string; planPath: string; corpus: string }

export function overallPrompt(i: OverallInput): string {
  return [
    i.corpus ? `<documents>\n${i.corpus}\n</documents>` : '<documents>(no docs/ folder found)</documents>',
    i.plan ? `<current_plan path="${i.planPath}">\n${i.plan}\n</current_plan>` : '',
    `<recent_commits>\n${i.log || '(no git history available)'}\n</recent_commits>`,
    `<earlier_checks>\n${i.history || '(none yet)'}\n</earlier_checks>`,
    'Is the project as a whole still aligned with its documents and plans?',
  ]
    .filter(Boolean)
    .join('\n\n')
}

const one = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

// Reads the model's answer: the first {...} object in it, fenced or not. Unknown verdicts and malformed answers are null.
// A missing score is taken from the verdict; cause falls back to none.
export function parseJudgement(text: string | undefined): Judgement | null {
  if (!text) return null
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  let o: Record<string, unknown>
  try {
    const v: unknown = JSON.parse(text.slice(start, end + 1))
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return null
    o = v as Record<string, unknown>
  } catch {
    return null
  }
  const raw = one(o.verdict, 20).toLowerCase().replace(/[\s_]+/g, '-')
  const verdict = (raw === 'offcourse' ? 'off-course' : raw) as Verdict
  if (!VERDICTS.includes(verdict)) return null
  const fallback = verdict === 'aligned' ? 90 : verdict === 'drifting' ? 55 : 20
  const n = typeof o.score === 'number' ? o.score : typeof o.score === 'string' ? Number(o.score) : NaN
  const score = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : fallback
  const c = one(o.cause, 10).toLowerCase()
  const cause: Cause = c === 'agent' || c === 'user' ? c : 'none'
  return { verdict, score, reason: one(o.reason, 300), anchor: one(o.anchor, 160), cause: verdict === 'aligned' ? 'none' : cause, suggestion: verdict === 'aligned' ? '' : one(o.suggestion, 240) }
}

export const failLine = (step: string, reason: string) => `bws-direction: ${step} failed (${reason}); nothing was changed`
