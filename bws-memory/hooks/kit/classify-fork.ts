// vendored from bws-kit/classify-fork.ts by tools/sync-kit.py, do not edit: change the kit and run `python tools/sync-kit.py`
// The video's one pattern, as pure logic: a cheap classifier decides whether anything is worth doing; if yes a fork
// (same prompt cache) does the work off to the side. No `$` here: the plugin's register.tsx hands in `KitModel`,
// a thin adapter over `$.model.*`, `$.session.*` and `$.clock.after`, so every branch is testable.
//
// Everything fails open (FR-ALL-03): a classifier or fork failure, timeout or abort comes back as a `failed`
// outcome and never throws, so the caller leaves the turn, prompt or tool call as it was and logs `failLine`.

import { transcriptText } from './transcript'
import type { TranscriptRow } from './transcript'

export type ModelReply = { isAnswered: true; text: string } | { isAnswered: false; reason: string }

export type KitModel = {
  // $.model.classify: resolves a label, undefined for none of them; REJECTS on a failed request.
  classify: (text: string, labels: readonly string[], options?: { model?: string }) => Promise<string | undefined>
  // $.model.complete (no tools, no history).
  complete: (
    request: { model: string; prompt: string; maxTokens?: number; timeoutMs?: number },
    options?: { signal?: AbortSignal },
  ) => Promise<ModelReply>
  // $.model.fork: the session's own transcript plus one prompt; no signal and no timeout of its own.
  fork: (request: { prompt: string }) => Promise<ModelReply | { isAnswered: false; reason: 'nothing-to-fork' }>
  // $.session.messages() and $.session.model(), for the resumed-session fallback.
  messages: () => Promise<readonly TranscriptRow[]>
  sessionModel: () => Promise<string>
  // $.clock.after: fires `fn` once after `ms`. The timer is never cancelled; a late fire is ignored.
  after: (ms: number, fn: () => void) => unknown
}

export type Bounds = { timeoutMs: number; signal?: AbortSignal }

export type Bounded<T> = { ok: true; value: T } | { ok: false; reason: 'timeout' | 'aborted' | 'error'; error: string }

// Races `p` against a timeout and an abort signal. Never rejects.
export function bound<T>(p: Promise<T>, after: KitModel['after'], b: Bounds): Promise<Bounded<T>> {
  return new Promise(resolve => {
    let done = false
    const finish = (r: Bounded<T>) => {
      if (done) return
      done = true
      resolve(r)
    }
    if (b.signal?.aborted) return finish({ ok: false, reason: 'aborted', error: 'aborted' })
    b.signal?.addEventListener('abort', () => finish({ ok: false, reason: 'aborted', error: 'aborted' }), { once: true })
    after(b.timeoutMs, () => finish({ ok: false, reason: 'timeout', error: `timed out after ${b.timeoutMs} ms` }))
    p.then(
      value => finish({ ok: true, value }),
      err => finish({ ok: false, reason: 'error', error: err instanceof Error ? err.message : String(err) }),
    )
  })
}

// ---------- the gate: what the classifier is shown, and how its answer is read ----------

// The classifier's input: the question, then the material (newest part kept when it must be cut) as data.
export const gateInput = (question: string, material: string, maxChars = 6000): string => {
  const cut = material.length > maxChars ? `...${material.slice(material.length - maxChars)}` : material
  return `${question.trim()}\n\n<material>\n${cut}\n</material>`
}

// A yes/no answer: the first word, case-folded, punctuation and markdown stripped ("**Yes.**", "no, because ...").
// Anything else is undefined (unparsable), which the caller treats as a failure and fails open.
export function parseYesNo(text: string | undefined): boolean | undefined {
  const first = (text ?? '').trim().split(/\s+/)[0] ?? ''
  const w = first.toLowerCase().replace(/[^a-z]/g, '')
  if (w === 'yes') return true
  if (w === 'no') return false
  return undefined
}

// ---------- the pieces ----------

export type GateOptions = Bounds & { question: string; material: string; model?: string; maxChars?: number }

export type GateOutcome = { ok: true; verdict: boolean } | { ok: false; reason: 'timeout' | 'aborted' | 'error' | 'unparsable'; error: string }

// One small-model call through `classify`. `verdict` true is "yes, do the work".
export async function classifyGate(m: KitModel, o: GateOptions): Promise<GateOutcome> {
  const input = gateInput(o.question, o.material, o.maxChars)
  const r = await bound(m.classify(input, ['yes', 'no'], o.model ? { model: o.model } : undefined), m.after, o)
  if (!r.ok) return r
  const verdict = parseYesNo(r.value)
  return verdict === undefined ? { ok: false, reason: 'unparsable', error: 'the classifier named neither label' } : { ok: true, verdict }
}

export type ForkOptions = Bounds & {
  prompt: string
  // Used only by the fallback `complete`: the alias or id; default the session's own model.
  model?: string
  maxTokens?: number
  maxTranscriptChars?: number
}

export type ForkOutcome =
  | { ok: true; text: string; via: 'fork' | 'complete' }
  | { ok: false; reason: 'timeout' | 'aborted' | 'error' | 'api-error' | 'empty-reply' | 'nothing-to-fork'; error: string }

export const fallbackPrompt = (transcript: string, prompt: string) =>
  `Below is the transcript of a Claude Code session, newest part last.\n<transcript>\n${transcript}\n</transcript>\n\n${prompt}`

const reasonOf = (r: { isAnswered: false; reason: string }): ForkOutcome => {
  const reason = r.reason === 'api-error' || r.reason === 'empty-reply' || r.reason === 'aborted' || r.reason === 'nothing-to-fork' ? r.reason : 'error'
  return { ok: false, reason, error: r.reason }
}

// Forks; when there is nothing to fork (a resumed session's first command, or right after /clear) falls back to
// the transcript rows through `complete`. The fork itself cannot be cancelled: a timeout or abort only stops waiting for it.
export async function runFork(m: KitModel, o: ForkOptions): Promise<ForkOutcome> {
  const f = await bound(m.fork({ prompt: o.prompt }), m.after, o)
  if (!f.ok) return f
  const r = f.value
  if (r.isAnswered) return r.text.trim() ? { ok: true, text: r.text, via: 'fork' } : { ok: false, reason: 'empty-reply', error: 'empty reply' }
  if (r.reason !== 'nothing-to-fork') return reasonOf(r)

  const rows = await bound(m.messages(), m.after, o)
  if (!rows.ok) return rows
  const transcript = transcriptText(rows.value, o.maxTranscriptChars)
  if (!transcript) return { ok: false, reason: 'nothing-to-fork', error: 'no messages to work from' }
  const model = o.model ?? (await bound(m.sessionModel(), m.after, o).then(x => (x.ok ? x.value : '')))
  if (!model) return { ok: false, reason: 'error', error: 'no model for the fallback call' }
  const c = await bound(
    m.complete({ model, prompt: fallbackPrompt(transcript, o.prompt), maxTokens: o.maxTokens ?? 3000, timeoutMs: o.timeoutMs }, o.signal ? { signal: o.signal } : undefined),
    m.after,
    o,
  )
  if (!c.ok) return c
  if (!c.value.isAnswered) return reasonOf(c.value)
  return c.value.text.trim() ? { ok: true, text: c.value.text, via: 'complete' } : { ok: false, reason: 'empty-reply', error: 'empty reply' }
}

// ---------- the whole decision ----------

export type ClassifyForkOptions = {
  gate: GateOptions
  fork: ForkOptions
}

export type Outcome =
  | { kind: 'no' } // the classifier said no: nothing was forked
  | { kind: 'done'; text: string; via: 'fork' | 'complete' }
  | { kind: 'failed'; step: 'classify' | 'fork'; reason: string; error: string }

export async function classifyThenFork(m: KitModel, o: ClassifyForkOptions): Promise<Outcome> {
  const g = await classifyGate(m, o.gate)
  if (!g.ok) return { kind: 'failed', step: 'classify', reason: g.reason, error: g.error }
  if (!g.verdict) return { kind: 'no' }
  const f = await runFork(m, o.fork)
  return f.ok ? { kind: 'done', text: f.text, via: f.via } : { kind: 'failed', step: 'fork', reason: f.reason, error: f.error }
}

// The one debug-log line for a failed step. Never carries the prompt, the material or the model's text.
export const failLine = (plugin: string, o: Extract<Outcome, { kind: 'failed' }>) => `${plugin}: ${o.step} failed (${o.reason}); continuing unchanged`
