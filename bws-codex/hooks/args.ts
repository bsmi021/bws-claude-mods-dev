// The tools' arguments as the model sent them, checked. Pure: an error string goes back as the tool's deny.

import { EFFORTS, ID_RE } from './job'
import type { Effort } from './job'

export const WAIT_MAX_S = 540
const PROMPT_MAX = 100_000

export type DelegateArgs = { prompt: string; title: string; effort: Effort; network: boolean; carry: boolean; waitS: number }
export type FollowupArgs = { id: string; prompt: string; waitS: number }
export type ResultArgs = { id: string; waitS: number }
export type CancelArgs = { id: string; drop: boolean }

type Raw = Record<string, unknown>

// A tool's first line: the label when the model gave none.
export function titleOf(title: unknown, prompt: string): string {
  const t = typeof title === 'string' ? title.replace(/\s+/g, ' ').trim() : ''
  if (t) return t.slice(0, 80)
  const first = prompt.trim().split(/\r?\n/)[0]?.replace(/\s+/g, ' ').trim() ?? ''
  return (first.length > 60 ? `${first.slice(0, 57)}...` : first) || 'Codex job'
}

export function waitOf(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : v === true ? WAIT_MAX_S : 0
  return Number.isFinite(n) ? Math.min(WAIT_MAX_S, Math.max(0, Math.round(n))) : 0
}

const promptOf = (v: unknown): string | { error: string } => {
  if (typeof v !== 'string' || v.trim() === '') return { error: 'prompt is required: the complete task for Codex' }
  if (v.length > PROMPT_MAX) return { error: `prompt is ${v.length} characters; keep it under ${PROMPT_MAX} and point Codex at files instead` }
  return v
}

const idOf = (v: unknown): string | { error: string } =>
  typeof v === 'string' && ID_RE.test(v.trim()) ? v.trim() : { error: `id must be a job id like fix-calc-3f2a1c (got ${JSON.stringify(v)})` }

export function parseDelegate(e: Raw, defaultEffort: Effort): DelegateArgs | { error: string } {
  const prompt = promptOf(e.prompt)
  if (typeof prompt !== 'string') return prompt
  const effort = e.effort === undefined || e.effort === null || e.effort === '' ? defaultEffort : e.effort
  if (!EFFORTS.includes(effort as Effort)) return { error: `effort must be one of ${EFFORTS.join(', ')}` }
  return {
    prompt,
    title: titleOf(e.title, prompt),
    effort: effort as Effort,
    network: e.network === true,
    carry: e.carry === true,
    waitS: waitOf(e.wait),
  }
}

export function parseFollowup(e: Raw): FollowupArgs | { error: string } {
  const id = idOf(e.id)
  if (typeof id !== 'string') return id
  const prompt = promptOf(e.prompt)
  if (typeof prompt !== 'string') return prompt
  return { id, prompt, waitS: waitOf(e.wait) }
}

export function parseResult(e: Raw): ResultArgs | { error: string } {
  const id = idOf(e.id)
  return typeof id !== 'string' ? id : { id, waitS: waitOf(e.wait_s) }
}

export function parseCancel(e: Raw): CancelArgs | { error: string } {
  const id = idOf(e.id)
  return typeof id !== 'string' ? id : { id, drop: e.drop === true }
}
