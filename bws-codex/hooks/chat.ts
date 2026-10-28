// The Codex chat: its state, the text a turn sends, what Pull from Claude brings in and what Send back hands Claude.
// Pure: register.ts runs the engines (api: the Responses API; codex: a chat job with follow-ups).

import type { ApiChoice } from './api'

export type Engine = 'api' | 'codex'
export const ENGINES: readonly Engine[] = ['api', 'codex']

// `meta`: the dim line under an answer (model, time, tokens, what Codex changed). A note is an error unless `isInfo`.
export type ChatMsg = { role: 'user' | 'codex' | 'note'; text: string; meta?: string; isInfo?: boolean }

// What rides with the next message, pulled from Claude's side of the session.
export type Pulled = { label: string; text: string }

// The answer being waited for: an api response id, or the chat job's id on the codex engine.
export type Pending = { id: string; engine: Engine; startedAt: number; turn: number; phase: string }

export type Chat = {
  engine: Engine
  choice: ApiChoice
  msgs: ChatMsg[]
  // api: the last stored response, chained with previous_response_id; codex: the chat job.
  thread: string | null
  pending: Pending | null
  pulled: Pulled | null
  // Counts sends; it re-keys the input, which clears it.
  asks: number
}

export const emptyChat = (engine: Engine): Chat => ({ engine, choice: 'default', msgs: [], thread: null, pending: null, pulled: null, asks: 0 })

// Older messages drop off; the tab shows the newest that fit anyway.
export const MAX_MSGS = 80

export const withMsgs = (c: Chat, ...add: ChatMsg[]): Chat => ({ ...c, msgs: [...c.msgs, ...add].slice(-MAX_MSGS) })

export function parseChat(v: unknown, engine: Engine): Chat {
  if (typeof v !== 'object' || v === null) return emptyChat(engine)
  const c = v as Partial<Chat>
  if (!Array.isArray(c.msgs) || (c.engine !== 'api' && c.engine !== 'codex')) return emptyChat(engine)
  return { ...emptyChat(c.engine), ...c } as Chat
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

// ---------- pull from Claude ----------

type Said = { role: string; text: string }

export function lastReply(msgs: readonly Said[]): string {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i]
    if (m !== undefined && m.role === 'assistant' && m.text.trim() !== '') return m.text.trim()
  }
  return ''
}

export const PULL_MAX = 12_000
const TURN_MAX = 2000

// Claude's latest reply, or its recent turns (the developer's prompts and Claude's replies, oldest first).
export function pullOf(msgs: readonly Said[], what: 'reply' | 'turns', turns = 6): Pulled | null {
  if (what === 'reply') {
    const reply = lastReply(msgs)
    return reply === '' ? null : { label: "Claude's latest reply", text: clip(reply, PULL_MAX) }
  }
  const said = msgs.filter(m => (m.role === 'user' || m.role === 'assistant') && m.text.trim() !== '').slice(-turns)
  if (said.length === 0) return null
  const text = said.map(m => `${m.role === 'user' ? 'Developer' : 'Claude'}: ${clip(m.text.trim(), TURN_MAX)}`).join('\n\n')
  return { label: `Claude's last ${said.length} messages`, text: clip(text, PULL_MAX) }
}

// ---------- what a turn sends ----------

// The capsule, what was pulled, then the message.
export function turnInput(capsule: string, pulled: Pulled | null, message: string): string {
  const parts = [capsule]
  if (pulled !== null) parts.push(`${pulled.label}, pulled in by the developer:\n<claude>\n${pulled.text}\n</claude>`)
  parts.push(message.trim())
  return parts.join('\n\n')
}

// A codex thread's first prompt carries the brief; later turns resume the thread, which remembers it.
export const codexFirstPrompt = (brief: string, input: string) => `${brief}\n\n${input}\n`

// What Send back puts in Claude's prompt box: Codex's answer, said to be Codex's.
export const sendBackText = (answer: string) => `Codex (side chat) says:\n\n${answer.trim()}`

// The newest answer, or the one at `index`.
export function answerAt(msgs: readonly ChatMsg[], index?: number): string {
  const m = index === undefined ? [...msgs].reverse().find(x => x.role === 'codex') : msgs[index]
  return m !== undefined && m.role === 'codex' ? m.text.trim() : ''
}

// ---------- the command ----------

export type CodexCommand =
  | { kind: 'open' }
  | { kind: 'jobs' }
  | { kind: 'new'; message: string }
  | { kind: 'pull'; what: 'reply' | 'turns'; message: string }
  | { kind: 'send-back' }
  | { kind: 'engine'; engine: Engine | null }
  | { kind: 'fast'; isOn: boolean | null }
  | { kind: 'stop' }
  | { kind: 'send'; message: string }

// `/codex [jobs | new [msg] | pull [turns] [question] | send-back | engine api|codex | fast on|off | stop | message]`.
// The words match whole, so a message that merely starts with one is still a message.
export function parseCodex(args: string): CodexCommand {
  const t = args.trim()
  if (t === '' || /^chat$/i.test(t)) return { kind: 'open' }
  if (/^jobs$/i.test(t)) return { kind: 'jobs' }
  if (/^send-back$/i.test(t)) return { kind: 'send-back' }
  if (/^stop$/i.test(t)) return { kind: 'stop' }
  const engine = /^engine(?:\s+(\S+))?$/i.exec(t)
  if (engine !== null) {
    const e = (engine[1] ?? '').toLowerCase()
    return { kind: 'engine', engine: e === 'api' || e === 'codex' ? e : null }
  }
  const fast = /^fast(?:\s+(on|off))?$/i.exec(t)
  if (fast !== null) return { kind: 'fast', isOn: fast[1] === undefined ? null : fast[1].toLowerCase() === 'on' }
  const pull = /^pull(?:\s+(turns))?(?:\s+([\s\S]*))?$/i.exec(t)
  if (pull !== null) return { kind: 'pull', what: pull[1] ? 'turns' : 'reply', message: (pull[2] ?? '').trim() }
  const m = /^new(?:\s+([\s\S]*))?$/i.exec(t)
  if (m !== null) return { kind: 'new', message: (m[1] ?? '').trim() }
  return { kind: 'send', message: t }
}

// `/codex --<id> [text]`: a tab button's or input's id and the text it sent.
export function pressOf(args: string): { id: string; value?: string } | null {
  const m = /^--([\w:.-]+)(?:\s+([\s\S]*))?$/.exec(args.trim())
  if (!m || m[1] === undefined) return null
  return m[2] === undefined ? { id: m[1] } : { id: m[1], value: m[2] }
}
