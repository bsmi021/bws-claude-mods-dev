// Pure parts of the side chat: the child's command line, its stream-json lines, the transcript they build and the
// window of it the pane shows. No `$` here; register.tsx does the effects.

import type { SideMsg } from '../types'

export type SideConfig = {
  tools: string // allowed tool names, comma/space separated
  isMcpOff: boolean // --strict-mcp-config with no servers: the side chat starts faster
  model: string // '' = the session's
}

export type SideRun = {
  message: string
  mainId: string // the conversation forked from
  sideId: string // the side session's own id, minted here so no init line has to be parsed
  isFirst: boolean // first turn forks mainId; later turns resume sideId
}

// `claude -p` for one side turn. The first turn forks the main session into sideId; later ones continue it.
export function sideArgs(run: SideRun, cfg: SideConfig): string[] {
  const args = ['-p', run.message]
  if (run.isFirst) args.push('--resume', run.mainId, '--fork-session', '--session-id', run.sideId)
  else args.push('--resume', run.sideId)
  args.push('--output-format', 'stream-json', '--verbose', '--include-partial-messages')
  if (cfg.isMcpOff) args.push('--strict-mcp-config')
  const tools = cfg.tools.split(/[\s,]+/).filter(t => t !== '')
  if (tools.length > 0) args.push('--allowedTools', ...tools)
  if (cfg.model.trim() !== '') args.push('--model', cfg.model.trim())
  return args
}

// Text arrives in pieces that end wherever a write did: whole lines out, the unfinished tail kept.
export function splitLines(pending: string, chunk: string): { lines: string[]; rest: string } {
  const parts = (pending + chunk).split('\n')
  const rest = parts.pop() ?? ''
  return { lines: parts.map(l => l.replace(/\r$/, '')).filter(l => l.trim() !== ''), rest }
}

export type Draft = { msgs: SideMsg[]; live: string }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

// One short line for a tool the side chat ran: `Read C:/x/y.ts`.
export function toolNote(name: string, input: unknown): string {
  const o = isObj(input) ? input : {}
  const arg = [o.file_path, o.path, o.pattern, o.command, o.url, o.query].find(v => typeof v === 'string')
  const text = typeof arg === 'string' ? arg.replace(/\s+/g, ' ') : ''
  return text === '' ? name : `${name} ${text.length > 70 ? text.slice(0, 69) + '…' : text}`
}

// Folds one stream-json line into the draft. Streamed text builds `live`; the finished assistant message replaces it.
export function reduceLine(d: Draft, line: string): Draft {
  let o: unknown
  try {
    o = JSON.parse(line)
  } catch {
    return d
  }
  if (!isObj(o)) return d
  if (o.type === 'stream_event' && isObj(o.event)) {
    const ev = o.event
    const delta = isObj(ev.delta) ? ev.delta : null
    if (ev.type === 'content_block_delta' && delta !== null && delta.type === 'text_delta' && typeof delta.text === 'string') {
      return { msgs: d.msgs, live: d.live + delta.text }
    }
    return d
  }
  if (o.type === 'assistant' && isObj(o.message) && Array.isArray(o.message.content)) {
    const added: SideMsg[] = []
    const text = o.message.content
      .filter((b): b is Record<string, unknown> => isObj(b) && b.type === 'text' && typeof b.text === 'string')
      .map(b => String(b.text))
      .join('')
      .trim()
    if (text !== '') added.push({ role: 'assistant', text })
    for (const b of o.message.content) {
      if (isObj(b) && b.type === 'tool_use' && typeof b.name === 'string') added.push({ role: 'tool', text: toolNote(b.name, b.input) })
    }
    return { msgs: [...d.msgs, ...added], live: '' }
  }
  if (o.type === 'result') {
    const out: SideMsg[] = []
    if (o.is_error === true) out.push({ role: 'note', text: `Error: ${typeof o.result === 'string' && o.result !== '' ? o.result : String(o.subtype ?? 'failed')}` })
    else if (typeof o.result === 'string' && o.result.trim() !== '' && !d.msgs.some(m => m.role === 'assistant' && m.text === o.result)) {
      // no assistant line carried it (a slash command's output, say)
      if (d.live.trim() === '') out.push({ role: 'assistant', text: o.result.trim() })
    }
    return { msgs: [...d.msgs, ...out], live: '' }
  }
  return d
}

// What shows when the child exits without having printed a result (a missing exe, a bad flag).
export function exitNote(code: number | null, stderr: string): string | null {
  if (code === 0) return null
  const tail = stderr.trim().split('\n').slice(-3).join(' ').slice(0, 300)
  return `The side chat process ended (${code === null ? 'killed' : `exit ${code}`})${tail === '' ? '' : `: ${tail}`}`
}

// ---------- the window the pane shows ----------

export const ROLE_PREFIX: Record<SideMsg['role'], string> = { user: 'You', assistant: 'Claude', tool: '·', note: '!' }

// Rows a message takes at this width (one header row, then its wrapped lines).
export function rowsOf(m: SideMsg, width: number): number {
  const w = Math.max(10, width)
  if (m.role === 'tool' || m.role === 'note') return Math.max(1, Math.ceil((m.text.length + 2) / w))
  return 1 + m.text.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / w)), 0)
}

// The newest messages that fit `rows`, skipping `back` messages from the end (the person scrolled up).
export function windowOf(msgs: readonly SideMsg[], rows: number, width: number, back: number): { from: number; to: number } {
  const to = Math.max(0, msgs.length - Math.max(0, back))
  let used = 0
  let from = to
  while (from > 0) {
    const need = rowsOf(msgs[from - 1] as SideMsg, width)
    if (used + need > rows && from < to) break
    used += need
    from--
  }
  return { from, to }
}

// `/fork native` and `/branch native` hand the command back to Claude Code's own fork.
export function nativeArgs(args: string): string | null {
  const m = /^\s*native(?:\s+([\s\S]*))?$/i.exec(args)
  return m === null ? null : (m[1] ?? '').trim()
}

export type SideCommand = { kind: 'open' } | { kind: 'new'; message: string } | { kind: 'close' } | { kind: 'send'; message: string }

// `/side [new [msg] | close | msg]`
export function parseSide(args: string): SideCommand {
  const t = args.trim()
  if (t === '') return { kind: 'open' }
  if (/^close$/i.test(t)) return { kind: 'close' }
  const m = /^new(?:\s+([\s\S]*))?$/i.exec(t)
  if (m !== null) return { kind: 'new', message: (m[1] ?? '').trim() }
  return { kind: 'send', message: t }
}
