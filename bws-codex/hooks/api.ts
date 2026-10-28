// The OpenAI Responses API as the api chat engine uses it: request bodies, answer text, terminal states and errors.
// Pure: register.ts makes the calls ($.http.fetch). The recipe (background + poll, models, limits) is the S2 spike's
// NOTE.md in the build run.

export const API_URL = 'https://api.openai.com'

// The default model and the fast one. sol rejects effort none; terra answers a capsule turn in about 4.5 s.
export type ApiModel = { id: string; effort: string; label: string }
export const API_MODELS = {
  default: { id: 'gpt-6.1-sol', effort: 'low', label: 'sol · low' },
  fast: { id: 'gpt-6.1-terra', effort: 'none', label: 'terra · none (fast)' },
} as const satisfies Record<string, ApiModel>
export type ApiChoice = keyof typeof API_MODELS

// Reasoning tokens count against it: a small cap ends `incomplete` with no answer.
export const MAX_OUTPUT_TOKENS = 8000
// The longest an answer is waited for before it is cancelled.
export const API_WAIT_MS = 5 * 60_000
export const POLL_MS = 1000
// Past this, every other poll tick is skipped (2 s).
export const SLOW_AFTER_MS = 30_000

export type Terminal = 'completed' | 'incomplete' | 'failed' | 'cancelled'
export const isTerminal = (s: unknown): s is Terminal => s === 'completed' || s === 'incomplete' || s === 'failed' || s === 'cancelled'

// The answer's text: every output_text of every message item, joined.
export function textOf(resp: unknown): string {
  const out: string[] = []
  const output = (resp as { output?: unknown } | null)?.output
  for (const item of Array.isArray(output) ? output : []) {
    if (item?.type !== 'message' || !Array.isArray(item.content)) continue
    for (const c of item.content) if (c?.type === 'output_text' && typeof c.text === 'string') out.push(c.text)
  }
  return out.join('')
}

export type Body = {
  model: string
  input: string
  store: true
  background: true
  max_output_tokens: number
  reasoning?: { effort: string }
  instructions?: string
  previous_response_id?: string
}

// One turn, always stored (so the next one can chain on it) and in the background (the fetch cap is 30 s).
// `instructions` are not inherited along a chain: they go with every turn.
export function bodyFor(o: { model: string; effort: string; input: string; instructions?: string; previous?: string | null; max?: number }): Body {
  return {
    model: o.model,
    input: o.input,
    store: true,
    background: true,
    max_output_tokens: o.max ?? MAX_OUTPUT_TOKENS,
    ...(o.effort !== '' ? { reasoning: { effort: o.effort } } : {}),
    ...(o.instructions ? { instructions: o.instructions } : {}),
    ...(o.previous ? { previous_response_id: o.previous } : {}),
  }
}

// Anything shaped like an OpenAI key (OpenAI's own errors echo a masked one) never reaches the screen or a log.
const KEY_RE = /sk-[A-Za-z0-9_*-]{6,}/g
export const stripKeys = (s: string) => s.replace(KEY_RE, 'sk-…')

// OpenAI errors resolve as { status >= 400, text: '{"error":{message,type,code,param}}' }.
export function apiError(status: number, text: string): string {
  try {
    const e = (JSON.parse(text) as { error?: { message?: string; code?: string | null; type?: string } }).error
    if (e && typeof e.message === 'string') return stripKeys(`OpenAI ${status} ${e.code ?? e.type ?? 'error'}: ${e.message}`)
  } catch {
    // not JSON: the raw text, cut
  }
  return stripKeys(`OpenAI ${status}: ${text.replace(/\s+/g, ' ').trim().slice(0, 200)}`)
}

export type Usage = { input: number; cached: number; output: number; reasoning: number }

export function usageOf(resp: unknown): Usage | null {
  const u = (resp as { usage?: Record<string, unknown> } | null)?.usage
  if (typeof u !== 'object' || u === null) return null
  const n = (v: unknown) => (typeof v === 'number' ? v : 0)
  const inDetails = (u.input_tokens_details ?? {}) as Record<string, unknown>
  const outDetails = (u.output_tokens_details ?? {}) as Record<string, unknown>
  return { input: n(u.input_tokens), cached: n(inDetails.cached_tokens), output: n(u.output_tokens), reasoning: n(outDetails.reasoning_tokens) }
}

// What a terminal response becomes in the chat: Codex's answer, or a note saying why there is none.
export type Outcome = { kind: 'answer'; text: string; isCut: boolean } | { kind: 'note'; text: string }

export function outcomeOf(resp: unknown): Outcome {
  const r = (resp ?? {}) as { status?: unknown; error?: { message?: string; code?: string } | null; incomplete_details?: { reason?: string } | null }
  const text = textOf(resp).trim()
  if (r.status === 'completed' && text !== '') return { kind: 'answer', text, isCut: false }
  if (r.status === 'completed') return { kind: 'note', text: 'Codex returned no text.' }
  if (r.status === 'incomplete') {
    const why = r.incomplete_details?.reason ?? 'unknown'
    if (text !== '') return { kind: 'answer', text, isCut: true }
    return { kind: 'note', text: `The answer ran out (${why}) before any text: reasoning used the ${MAX_OUTPUT_TOKENS}-token budget. Ask for less, or use the default model.` }
  }
  if (r.status === 'cancelled') return { kind: 'note', text: 'Stopped.' }
  const e = r.error
  return { kind: 'note', text: stripKeys(`The answer failed${e?.code ? ` (${e.code})` : ''}${e?.message ? `: ${e.message}` : ''}.`) }
}

// Whether a poll tick runs at `elapsed` ms into the wait: every tick at first, every other one after SLOW_AFTER_MS.
export const isPollDue = (elapsed: number, tick: number) => elapsed < SLOW_AFTER_MS || tick % 2 === 0
