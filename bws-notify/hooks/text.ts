// What a toast says. Pure: no engine, so the tests can hold every wording.

import { card, makeTab, text } from './kit/tab'
import type { ModTab } from './kit/tab'

const MARKUP = /!?\[([^\]]*)\]\([^)]*\)|[`*_#>]|^\s*[-+]\s+/gm

// The first non-empty line of a reply, markup stripped, cut to max characters with an ellipsis.
export const firstLine = (text: string | undefined, max: number): string => {
  const line = (text ?? '')
    .split(/\r?\n/)
    .map(l => l.replace(MARKUP, (_m, label) => (typeof label === 'string' ? label : '')).trim())
    .find(l => l !== '')
  if (line === undefined) return ''
  return line.length > max ? `${line.slice(0, Math.max(1, max - 1)).trimEnd()}…` : line
}

export const project = (cwd: string): string => {
  const parts = cwd.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] ?? cwd
}

export const duration = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`
}

export type Toast = { title: string; body: string }

export const needsInput = (cwd: string, message: string, kind: string, max: number): Toast => ({
  title: `${project(cwd)} · ${kind === 'idle_prompt' ? 'waiting for you' : 'needs you'}`,
  body: firstLine(message, max) || 'Claude is waiting on you.',
})

export const turnDone = (cwd: string, last: string | undefined, ms: number | undefined, max: number): Toast => ({
  title: `${project(cwd)} · done${ms === undefined ? '' : ` (${duration(ms)})`}`,
  body: firstLine(last, max) || 'Claude finished.',
})

export const subagentDone = (cwd: string, agentType: string, last: string | undefined, max: number): Toast => ({
  title: `${project(cwd)} · ${agentType} finished`,
  body: firstLine(last, max) || 'Subagent finished.',
})

export const failure = (cwd: string, error: string, details: string | undefined, max: number): Toast => ({
  title: `${project(cwd)} · error: ${error}`,
  body: firstLine(details, max) || 'The turn ended on an error.',
})

// The wscript argument: base64 of the UTF-8 JSON, so no quoting or escaping reaches a shell.
export const encode = (t: Toast): string => {
  const json = JSON.stringify(t)
  let bin = ''
  for (const b of new TextEncoder().encode(json)) bin += String.fromCharCode(b)
  return btoa(bin)
}

// A real subagent report: it has a type and is not the JSON array a prompt-suggestion fork returns.
export const isReport = (agentType: string | undefined, last: string | undefined): boolean =>
  (agentType ?? '').trim() !== '' && !/^\s*\[\s*\{\s*"label"/.test(last ?? '')

// ---------- the dashboard tab (bws-kit/tab.ts) ----------

export type Sent = { at: number; title: string; body: string }
export const SENT_KEPT = 5

const clock = (ms: number) => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// Which events toast, and the last few toasts this session sent.
export function notifyTab(flags: Record<'needsInput' | 'turnDone' | 'subagentDone' | 'errors', boolean>, minTurnSeconds: number, sent: readonly Sent[], count: number): ModTab {
  const on = (Object.keys(flags) as (keyof typeof flags)[]).filter(k => flags[k])
  const names: Record<keyof typeof flags, string> = { needsInput: 'when Claude needs you', turnDone: 'finished turns', subagentDone: 'finished subagents', errors: 'errors' }
  const recent = sent.slice(-SENT_KEPT).reverse()
  return makeTab(
    'Notify',
    [
      text(on.length > 0 ? `Windows toasts for ${on.map(k => names[k]).join(', ')}.` : 'Every toast is switched off in the plugin options.', { isBold: true }),
      ...(flags.turnDone ? [text(`A finished turn toasts only after ${minTurnSeconds} s or more.`, { isDim: true })] : []),
      card(
        'Last toasts',
        recent.length > 0 ? recent.map(s => text(`${clock(s.at)}  ${s.title}: ${s.body}`)) : [text('None yet in this session.', { isDim: true })],
      ),
    ],
    { badge: count > 0 ? String(count) : '', tone: count > 0 ? 'ok' : 'idle' },
  )
}
