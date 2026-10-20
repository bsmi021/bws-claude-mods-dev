// The judge: what a check asks the model, and how its answer is read. Pure: no `$`.

export type Verdict = 'aligned' | 'drifting' | 'off-course'
export type Cause = 'agent' | 'user' | 'none'
export const VERDICTS: readonly Verdict[] = ['aligned', 'drifting', 'off-course']

export type Judgement = { verdict: Verdict; score: number; reason: string; anchor: string; cause: Cause; suggestion: string }

export const CHECK_TIMEOUT_MS = 20_000
export const OVERALL_TIMEOUT_MS = 45_000

const SHAPE =
  'Answer with one JSON object and nothing else: ' +
  '{"verdict": "aligned" | "drifting" | "off-course", "score": 0-100 (100 = exactly on the plan), ' +
  '"reason": "one sentence, at most 35 words, naming what moved away from what", ' +
  '"anchor": "the plan item, document and section the judgement rests on (path § heading), or \\"task\\"", ' +
  '"cause": "agent" (the agent went beyond what was asked) | "user" (the person widened or changed the scope) | "none", ' +
  '"suggestion": "one short sentence: how to get back on course, or empty when aligned"}'

export const CHECK_SYSTEM = [
  'You check a coding session for drift: work that moves away from the original task, the plan or the project documents (specs, requirements, design docs), whoever asked for it.',
  'aligned (score 75-100): the turn serves the original task and agrees with the plan and documents. Small necessary side work (a fix the task needs, a test, tooling it hit) is aligned.',
  'drifting (40-74): the turn adds scope the original task and plan do not cover, starts a tangent, gold-plates, or bends a documented design.',
  'off-course (0-39): the turn works on something unrelated, contradicts the plan or the anchor documents, or undoes agreed decisions.',
  'Judge only what the turn did. Do not mark drift because documents are silent on an implementation detail.',
  'A later prompt from the person does not make its work aligned: if it adds work outside the original task or plan, or goes against the documents, that is drift with cause "user". The person may have good reasons; your job is to make the widening visible. Flagging the conflict does not make the work aligned.',
  'cause "agent": the agent did more or other than it was asked.',
  SHAPE,
].join('\n')

export type CheckInput = { task: { first: string; recent: string[] }; plan: string; planPath: string; corpus: string; turn: string }

export function checkPrompt(i: CheckInput): string {
  const parts = [
    `<task>\n${i.task.first || '(no typed prompt yet)'}\n</task>`,
    i.task.recent.length > 0 ? `<later_prompts>\n${i.task.recent.map(p => `- ${p}`).join('\n')}\n</later_prompts>` : '',
    i.plan ? `<plan path="${i.planPath}">\n${i.plan}\n</plan>` : '<plan>(no run-folder plan found)</plan>',
    i.corpus ? `<documents>\n${i.corpus}\n</documents>` : '<documents>(no docs/ folder found)</documents>',
    `<turn>\n${i.turn}\n</turn>`,
    'Is this turn aligned with the task, the plan and the documents?',
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
