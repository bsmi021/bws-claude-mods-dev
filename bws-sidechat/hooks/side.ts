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

// Word-wraps `text` to `width` cells, one string per row. Blank lines stay; a word longer than a row is split.
export function wrapLines(text: string, width: number): string[] {
  const w = Math.max(8, Math.floor(width))
  const out: string[] = []
  for (const para of text.replace(/\r/g, '').split('\n')) {
    if (para.trim() === '') {
      out.push('')
      continue
    }
    let row = ''
    for (const word of para.split(/ +/)) {
      if (word === '') continue
      let rest = word
      while (rest.length > w) {
        if (row !== '') {
          out.push(row)
          row = ''
        }
        out.push(rest.slice(0, w))
        rest = rest.slice(w)
      }
      if (row === '') row = rest
      else if (row.length + 1 + rest.length <= w) row += ` ${rest}`
      else {
        out.push(row)
        row = rest
      }
    }
    if (row !== '') out.push(row)
  }
  return out
}

export type Row = { text: string; kind: 'you' | 'claude' | 'body' | 'tool' | 'note' | 'send'; msgIndex?: number }

// The whole transcript as rows the pane can window, the streaming answer last. Every row is at most `width` cells,
// so the pane never wraps one itself and the row count is exact. With `isSendable`, each answer ends with a row the pane
// draws as its Send to main button (`msgIndex` is the answer's place in `msgs`).
export function transcriptRows(msgs: readonly SideMsg[], live: string, width: number, isSendable = false): Row[] {
  const rows: Row[] = []
  for (const [i, m] of msgs.entries()) {
    if (m.role === 'user' || m.role === 'assistant') {
      rows.push({ text: ROLE_PREFIX[m.role], kind: m.role === 'user' ? 'you' : 'claude' })
      for (const t of wrapLines(m.text, width)) rows.push({ text: t, kind: 'body' })
      if (isSendable && m.role === 'assistant') rows.push({ text: '↩ Send to main', kind: 'send', msgIndex: i })
    } else {
      for (const t of wrapLines(`${ROLE_PREFIX[m.role]} ${m.text}`, width)) rows.push({ text: t, kind: m.role })
    }
  }
  if (live !== '') {
    rows.push({ text: 'Claude', kind: 'claude' })
    for (const t of wrapLines(`${live}▌`, width)) rows.push({ text: t, kind: 'body' })
  }
  return rows
}

// Rows the pane keeps for everything that is not transcript: the header, the two scroll buttons, the busy row and the
// Ask box (which may wrap to a second row), with one to spare.
export const CHROME_ROWS = 7

export const roomOf = (bodyRows: number, chromeRows = CHROME_ROWS) => Math.max(3, Math.floor(bodyRows) - chromeRows)

// A scroll step of half the room (at least 3 rows).
export const scrollStep = (room: number) => Math.max(3, Math.floor(room / 2))

// `back` rows up from the newest, kept inside what there is to scroll.
export const clampBack = (back: number, total: number, room: number) => Math.min(Math.max(0, back), Math.max(0, total - room))

// The rows [from, to) shown, and how many hide above and below.
export function windowRows(total: number, room: number, back: number): { from: number; to: number; above: number; below: number } {
  const to = total - clampBack(back, total, room)
  const from = Math.max(0, to - room)
  return { from, to, above: from, below: total - to }
}

// The Ask box's key: it changes with each send, which clears the box.
export const askKey = (asks: number) => `ask-${asks}`

// The command line that ends the side chat's child by its session id (it is in every argv of the child, first turn or
// later), since the stream only ends it once the next piece arrives. Null for an id that is not a uuid.
export function killArgv(sideId: string, isWindows: boolean): string[] | null {
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(sideId)) return null
  if (!isWindows) return ['pkill', '-f', sideId]
  const filter = `$_.CommandLine -like '*${sideId}*' -and $_.ProcessId -ne $PID`
  return [
    'powershell',
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `Get-CimInstance Win32_Process | Where-Object { ${filter} } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
  ]
}

// `/fork native` and `/branch native` hand the command back to Claude Code's own fork.
export function nativeArgs(args: string): string | null {
  const m = /^\s*native(?:\s+([\s\S]*))?$/i.exec(args)
  return m === null ? null : (m[1] ?? '').trim()
}

export type SideCommand =
  | { kind: 'open' }
  | { kind: 'new'; message: string }
  | { kind: 'close' }
  | { kind: 'model'; name: string } // '' = report the current one
  | { kind: 'refresh' }
  | { kind: 'pull'; message: string }
  | { kind: 'send-back' }
  | { kind: 'send'; message: string }

// `/side [new [msg] | close | model [name] | refresh | pull [question] | send-back | msg]`. The subcommands match whole,
// so a message that merely starts with one of the words is still a message.
export function parseSide(args: string): SideCommand {
  const t = args.trim()
  if (t === '') return { kind: 'open' }
  if (/^close$/i.test(t)) return { kind: 'close' }
  if (/^refresh$/i.test(t)) return { kind: 'refresh' }
  if (/^send-back$/i.test(t)) return { kind: 'send-back' }
  const model = /^model(?:\s+(\S+))?$/i.exec(t)
  if (model !== null) return { kind: 'model', name: model[1] ?? '' }
  const pull = /^pull(?:\s+([\s\S]*))?$/i.exec(t)
  if (pull !== null) return { kind: 'pull', message: (pull[1] ?? '').trim() }
  const m = /^new(?:\s+([\s\S]*))?$/i.exec(t)
  if (m !== null) return { kind: 'new', message: (m[1] ?? '').trim() }
  return { kind: 'send', message: t }
}

// ---------- the model ----------

// The aliases the pane offers beside "default"; any other id is typed as `/side model <id>`.
export const MODEL_CHOICES = ['opus', 'sonnet', 'haiku'] as const

// A model alias or id as `claude --model` takes it (`opus`, `claude-opus-5-5`, `sonnet[1m]`): no spaces, and no leading
// dash, so it can never read as another flag.
export const isModelName = (name: string) => /^[A-Za-z0-9][A-Za-z0-9._:[\]-]*$/.test(name)

// The model a side turn runs on: the open chat's override, else the sideModel setting ('' = the session's).
export const modelOf = (override: string, setting: string) => (override.trim() !== '' ? override.trim() : setting.trim())

// ---------- refresh ----------

const clip = (text: string, n: number) => {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}

// What a re-forked side chat is told first: the earlier questions and answers of the chat it replaces (the last six,
// shortened), since the new fork only knows the main conversation. '' when nothing was asked yet.
export function replayPrefix(msgs: readonly SideMsg[]): string {
  const pairs: string[] = []
  let q = ''
  for (const m of msgs) {
    if (m.role === 'user') q = m.text
    else if (m.role === 'assistant' && q !== '') {
      pairs.push(`Q: ${clip(q, 240)}\nA: ${clip(m.text, 240)}`)
      q = ''
    }
  }
  if (pairs.length === 0) return ''
  return [
    'This side session was re-forked from the main conversation as it stands now. In the side session it replaces, the person asked and you answered (oldest first, shortened):',
    ...pairs.slice(-6),
    'Their next message follows.',
    '',
  ].join('\n\n')
}
