// bws-agents: the session's subagents as a roster, and the Agents tab bws-cockpit draws from it. Pure: no `$`, so the
// tests call it directly.
import { card, makeTab, text } from './kit/tab'
import type { ModTab, TabColor, TabNode } from './kit/tab'
import type { SummaryState } from './kit/summary'

export type Status = 'pending' | 'running' | 'waiting' | 'idle' | 'completed' | 'failed' | 'killed'
const STATUSES: readonly Status[] = ['pending', 'running', 'waiting', 'idle', 'completed', 'failed', 'killed']
export const isStatus = (s: unknown): s is Status => STATUSES.includes(s as Status)
export const isEnded = (s: Status) => s === 'completed' || s === 'failed' || s === 'killed'
const isLive = (s: Status) => s === 'pending' || s === 'running' || s === 'waiting'

export type Agent = {
  id: string
  type: string
  description: string
  model: string
  parentId?: string
  isBackground: boolean
  status: Status
  startedAt: number
  endedAt?: number
  lastToolAt?: number
  tools: number
  recent: string[] // newest last, at most RECENT
  tokensIn: number
  tokensOut: number
  answer: string // the first line of its last answer
}

export const RECENT = 3
const MAX_AGENTS = 40

// What the roster learns from each source. All return a new list; unknown ids are ignored where noted.
export function spawned(list: readonly Agent[], a: Pick<Agent, 'id' | 'type' | 'description' | 'model' | 'parentId' | 'isBackground'>, now: number): Agent[] {
  const fresh: Agent = { ...a, status: 'running', startedAt: now, tools: 0, recent: [], tokensIn: 0, tokensOut: 0, answer: '' }
  const rest = list.filter(x => x.id !== a.id)
  return trim([...rest, fresh])
}

// Keeps every live agent and the newest ended ones, up to MAX_AGENTS.
function trim(list: Agent[]): Agent[] {
  if (list.length <= MAX_AGENTS) return list
  const drop = new Set(list.filter(a => isEnded(a.status)).slice(0, list.length - MAX_AGENTS).map(a => a.id))
  return list.filter(a => !drop.has(a.id))
}

// A tool call inside an agent's loop. An id the roster has not seen yet (spawned before a reload) is ignored.
export function toolCalled(list: readonly Agent[], id: string, label: string, now: number): Agent[] {
  return list.map(a => (a.id !== id ? a : { ...a, status: isEnded(a.status) ? a.status : 'running', tools: a.tools + 1, lastToolAt: now, recent: [...a.recent, label].slice(-RECENT) }))
}

export type Usage = { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

// One of the agent's turns ended. A subagent's final answer is its last turn; a teammate goes idle between turns, so
// the status here is a guess the next $.agent.list() sync corrects.
export function turnDone(list: readonly Agent[], id: string, t: { answer: string; reason: string; usage?: Usage }, now: number): Agent[] {
  return list.map(a => {
    if (a.id !== id) return a
    const u = t.usage ?? {}
    const status: Status = t.reason === 'error' || t.reason === 'refusal' ? 'failed' : t.reason === 'aborted' ? 'killed' : a.type === 'teammate' ? 'idle' : 'completed'
    return {
      ...a,
      status,
      endedAt: isEnded(status) ? now : a.endedAt,
      tokensIn: a.tokensIn + n(u.input_tokens) + n(u.cache_read_input_tokens) + n(u.cache_creation_input_tokens),
      tokensOut: a.tokensOut + n(u.output_tokens),
      answer: firstLine(t.answer) || a.answer,
    }
  })
}

export type Info = { id: string; type: string; description: string; status: string; parentId?: string }

// $.agent.list()'s view wins on status; agents it lists that the roster lacks (spawned before a reload) are added.
// An agent the list no longer names keeps its last status: the engine drops ended tasks after a while.
export function synced(list: readonly Agent[], infos: readonly Info[], now: number): Agent[] {
  const byId = new Map(infos.map(i => [i.id, i]))
  const out = list.map(a => {
    const i = byId.get(a.id)
    if (i === undefined || !isStatus(i.status) || i.status === a.status) return a
    const ended = isEnded(i.status)
    return { ...a, status: i.status, endedAt: ended ? (a.endedAt ?? now) : undefined }
  })
  for (const i of infos) {
    if (out.some(a => a.id === i.id) || !isStatus(i.status)) continue
    out.push({ id: i.id, type: i.type, description: i.description, model: '', parentId: i.parentId, isBackground: false, status: i.status, startedAt: now, endedAt: isEnded(i.status) ? now : undefined, tools: 0, recent: [], tokensIn: 0, tokensOut: 0, answer: '' })
  }
  return trim(out)
}

export const clearFinished = (list: readonly Agent[]): Agent[] => list.filter(a => !isEnded(a.status))

const firstLine = (s: string) =>
  s
    .split('\n')
    .map(l => l.replace(/^[#>*\-\s]+/, '').trim())
    .find(l => l !== '')
    ?.slice(0, 200) ?? ''

// A tool call as one short line: the tool and what it touched.
export function toolLabel(tool: string, input: Record<string, unknown>): string {
  const s = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '')
  const base = (p: string) => p.replace(/\\/g, '/').split('/').filter(Boolean).slice(-2).join('/')
  const what =
    s('file_path') !== ''
      ? base(s('file_path'))
      : s('command') !== ''
        ? s('command')
        : s('pattern') !== ''
          ? s('pattern')
          : s('url') !== ''
            ? s('url')
            : s('query') !== ''
              ? s('query')
              : s('description')
  const name = tool.startsWith('mcp__') ? tool.split('__').slice(1).join(':') : tool
  const one = what.replace(/\s+/g, ' ').trim()
  return one === '' ? name : `${name} ${one.length > 60 ? `${one.slice(0, 59)}…` : one}`
}

export const dur = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

export const tokens = (v: number): string => (v < 1000 ? String(v) : v < 1_000_000 ? `${(v / 1000).toFixed(1)}k` : `${(v / 1_000_000).toFixed(2)}M`)

// An agent with no tool call (or start) for this long while it runs is flagged stalled.
export const isStalled = (a: Agent, now: number, stallMs: number) => a.status === 'running' && stallMs > 0 && now - (a.lastToolAt ?? a.startedAt) >= stallMs

const EMOJI: Record<Status, string> = { pending: '⏳', running: '🟢', waiting: '⏸️', idle: '💤', completed: '✅', failed: '❌', killed: '🛑' }
const WORD: Record<Status, string> = { pending: 'starting', running: 'running', waiting: 'waiting', idle: 'idle', completed: 'done', failed: 'failed', killed: 'stopped' }

const TYPE_EMOJI = (type: string) => {
  const t = type.toLowerCase()
  if (t === 'explore') return '🔎'
  if (t === 'plan') return '🗺️'
  if (t === 'teammate') return '🤝'
  if (t === 'fork') return '🍴'
  if (t.includes('review')) return '🧐'
  if (t.includes('test')) return '🧪'
  return '🤖'
}

const colorOf = (a: Agent, stalled: boolean): TabColor | undefined => {
  if (stalled) return 'warn'
  if (a.status === 'failed' || a.status === 'killed') return 'bad'
  if (a.status === 'completed') return 'ok'
  if (a.status === 'running' || a.status === 'pending') return 'accent'
  if (a.status === 'waiting') return 'warn'
  return undefined
}

const shortModel = (m: string) => m.replace(/^claude-/, '').replace(/-\d{8}$/, '')

// Running first (oldest first, so cards stay put), then waiting/idle, then ended (newest first).
const rank = (a: Agent) => (isLive(a.status) ? 0 : isEnded(a.status) ? 2 : 1)
export const ordered = (list: readonly Agent[]): Agent[] =>
  [...list].sort((x, y) => rank(x) - rank(y) || (rank(x) === 2 ? (y.endedAt ?? 0) - (x.endedAt ?? 0) : x.startedAt - y.startedAt))

function agentCard(a: Agent, all: readonly Agent[], now: number, stallMs: number): TabNode {
  const stalled = isStalled(a, now, stallMs)
  // One emoji per line, at its start: a wide glyph mid-line can push a round border out of line.
  const title = `${EMOJI[a.status]} ${a.type} · ${a.description || a.id.slice(0, 8)}`
  const took = dur((a.endedAt ?? now) - a.startedAt)
  const facts = [`${WORD[a.status]} ${took}`, ...(a.model ? [shortModel(a.model)] : []), `${a.tools} tool${a.tools === 1 ? '' : 's'}`, ...(a.isBackground ? ['background'] : [])]
  const body: TabNode[] = [text(`${TYPE_EMOJI(a.type)} ${facts.join(' · ')}`, { isBold: true })]
  if (a.tokensIn + a.tokensOut > 0) body.push(text(`🪙 ${tokens(a.tokensIn)} in · ${tokens(a.tokensOut)} out`, { isDim: true }))
  const parent = a.parentId ? all.find(p => p.id === a.parentId) : undefined
  if (a.parentId) body.push(text(`↳ spawned by ${parent ? `${parent.type} · ${parent.description}` : a.parentId.slice(0, 8)}`, { isDim: true }))
  if (stalled) body.push(text(`⚠️ no tool call for ${dur(now - (a.lastToolAt ?? a.startedAt))}`, { color: 'warn', isBold: true }))
  if (!isEnded(a.status)) for (const r of a.recent) body.push(text(`  ▸ ${r}`, { isDim: true, isClipped: true }))
  if (a.answer) body.push(text(`💬 ${a.answer}`, { color: a.status === 'failed' ? 'bad' : undefined, isClipped: true }))
  return card(title, body, colorOf(a, stalled))
}

export type View = { list: readonly Agent[]; now: number; stallMs: number; show: number; raise: number }

export function counts(list: readonly Agent[], now: number, stallMs: number) {
  return {
    live: list.filter(a => isLive(a.status)).length,
    idle: list.filter(a => a.status === 'idle').length,
    done: list.filter(a => a.status === 'completed').length,
    failed: list.filter(a => a.status === 'failed' || a.status === 'killed').length,
    stalled: list.filter(a => isStalled(a, now, stallMs)).length,
    tokens: list.reduce((s, a) => s + a.tokensIn + a.tokensOut, 0),
  }
}

export function agentsTab(v: View): ModTab {
  const c = counts(v.list, v.now, v.stallMs)
  const tone: ModTab['tone'] = c.stalled > 0 ? 'warn' : c.live > 0 ? 'busy' : c.failed > 0 ? 'bad' : v.list.length > 0 ? 'ok' : 'idle'
  const badge = c.live > 0 ? `🟢${c.live}` : v.list.length > 0 ? String(v.list.length) : ''
  const strip = [`${c.live} running`, `${c.done} done`, ...(c.idle > 0 ? [`${c.idle} idle`] : []), `${c.failed} failed`, `${tokens(c.tokens)} tokens`]
  const head: TabNode[] = [text(`${c.live > 0 ? '🟢' : c.failed > 0 ? '🔴' : '⚪'} ${strip.join(' · ')}`, { isBold: true, color: c.failed > 0 && c.live === 0 ? 'bad' : undefined })]
  if (c.stalled > 0) head.push(text(`⚠️ ${c.stalled} stalled: no tool call for ${dur(v.stallMs)}+`, { color: 'warn', isBold: true }))
  const body: TabNode[] = [card('🤖 Subagents this session', head, c.stalled > 0 ? 'warn' : c.live > 0 ? 'accent' : undefined)]
  if (v.list.length === 0) {
    body.push(text('No subagents yet. They appear here as Claude starts them, one card each, live.', { isDim: true }))
  } else {
    for (const a of ordered(v.list)) body.push(agentCard(a, v.list, v.now, v.stallMs))
  }
  body.push({ kind: 'buttons', items: [{ id: 'clear', label: '🧹 Clear finished', hotkey: 'c' }, { id: 'refresh', label: '🔄 Refresh', hotkey: 'r' }] })
  return makeTab('Agents', body, { badge, tone, raise: v.raise, show: v.show })
}

// The chip every mod publishes (bws-kit/summary.ts).
export function agentsChip(list: readonly Agent[], now: number, stallMs: number): { state: SummaryState; label: string; detail?: string } | null {
  if (list.length === 0) return null
  const c = counts(list, now, stallMs)
  const state: SummaryState = c.stalled > 0 ? 'warn' : c.live > 0 ? 'busy' : c.failed > 0 ? 'bad' : 'ok'
  return { state, label: c.live > 0 ? `${c.live} agent${c.live === 1 ? '' : 's'} running` : `${list.length} agent${list.length === 1 ? '' : 's'}`, detail: `${c.done} done, ${c.failed} failed` }
}

// The roster as plain text: /subagents text and headless sessions.
export function agentsText(list: readonly Agent[], now: number, stallMs: number): string {
  if (list.length === 0) return 'No subagents this session.'
  const c = counts(list, now, stallMs)
  const head = `Subagents: ${c.live} running, ${c.done} done, ${c.failed} failed, ${tokens(c.tokens)} tokens`
  const rows = ordered(list).map(a => {
    const flag = isStalled(a, now, stallMs) ? ' (stalled)' : ''
    const ans = a.answer ? ` - ${a.answer}` : ''
    return `${EMOJI[a.status]} ${a.type} · ${a.description || a.id.slice(0, 8)}: ${WORD[a.status]} ${dur((a.endedAt ?? now) - a.startedAt)}, ${a.tools} tools${flag}${ans}`
  })
  return [head, ...rows].join('\n')
}
