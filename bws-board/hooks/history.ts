// The board's history: what each session did on the board, kept after its card is tombstoned and
// swept, for the team digest. One file per session under <board>/history/, written only by that
// session. Only text the card already holds redacted (task, ask text, notes) and file paths go in:
// never a message's text, never a command. Pure helpers; register.tsx does the reads and writes.

export type HistKind =
  | 'start'
  | 'end'
  | 'busy'
  | 'idle'
  | 'task'
  | 'claim'
  | 'edit'
  | 'release'
  | 'deny'
  | 'ask'
  | 'take'
  | 'done'
  | 'decline'
  | 'withdraw'
  | 'send'
  | 'wake'
  | 'wakeHeld'
  | 'gitHold'
  | 'gitWait'

// `file`/`files`: normalized absolute paths (see board.ts normFile). `holder`: the session that held
// a refused file or the git lease. `verb`: a git subcommand (gitHold, gitWait). `to`: a session id (wake, send), 'all', or an ask's target. `from`: an ask's asker.
export type HistEvent = {
  at: number
  kind: HistKind
  role: string | null
  file?: string
  files?: string[]
  task?: string
  holder?: string
  holderRole?: string | null
  askId?: string
  to?: string
  from?: string
  urgent?: boolean
  text?: string
  note?: string
  delivered?: boolean
  reason?: string
  verb?: string
}

export type History = { version: 1; sessionId: string; folder: string; events: HistEvent[] }

export const HIST_MAX = 5000
export const HIST_DAYS = 14
const DAY_MS = 24 * 60 * 60 * 1000

export const historyDir = (dir: string) => `${dir}/history`
export const historyPath = (dir: string, sessionId: string) => `${historyDir(dir)}/${sessionId}.json`

const KINDS: readonly HistKind[] = ['start', 'end', 'busy', 'idle', 'task', 'claim', 'edit', 'release', 'deny', 'ask', 'take', 'done', 'decline', 'withdraw', 'send', 'wake', 'wakeHeld', 'gitHold', 'gitWait']

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const optStr = (v: unknown) => (typeof v === 'string' && v !== '' ? v : undefined)

function parseEvent(o: Record<string, unknown>): HistEvent | undefined {
  const kind = KINDS.find(k => k === o.kind)
  if (kind === undefined || typeof o.at !== 'number' || !Number.isFinite(o.at)) return undefined
  const ev: HistEvent = { at: o.at, kind, role: optStr(o.role) ?? null }
  for (const k of ['file', 'task', 'holder', 'askId', 'to', 'from', 'text', 'note', 'reason', 'verb'] as const) {
    const s = optStr(o[k])
    if (s !== undefined) ev[k] = s
  }
  if (Array.isArray(o.files)) ev.files = o.files.filter((f): f is string => typeof f === 'string')
  if ('holderRole' in o) ev.holderRole = optStr(o.holderRole) ?? null
  if (typeof o.urgent === 'boolean') ev.urgent = o.urgent
  if (typeof o.delivered === 'boolean') ev.delivered = o.delivered
  return ev
}

// A history as read from its file, or undefined when the text is not a whole one.
export function parseHistory(text: string | undefined, sessionId: string): History | undefined {
  if (text === undefined || text.trim() === '') return undefined
  let v: unknown
  try {
    v = JSON.parse(text)
  } catch {
    return undefined
  }
  if (!isObj(v) || v.version !== 1 || !Array.isArray(v.events)) return undefined
  const events = v.events.filter(isObj).flatMap(o => parseEvent(o) ?? [])
  return { version: 1, sessionId, folder: typeof v.folder === 'string' ? v.folder : '', events }
}

export const historyText = (h: History) => `${JSON.stringify(h)}\n`

// The history with one event added; past the cap the oldest go.
export const addEvent = (h: History, ev: HistEvent): History => ({ ...h, events: [...h.events, ev].slice(-HIST_MAX) })

// History files untouched for longer than `days`: what the sweep deletes. Never this session's own.
export const expiredHistory = (entries: readonly { name: string; kind: string; mtimeMs: number }[], selfId: string, now: number, days: number) =>
  entries
    .filter(e => e.kind === 'file' && /^[A-Za-z0-9-]{8,80}\.json$/.test(e.name) && e.name !== `${selfId}.json` && now - e.mtimeMs > days * DAY_MS)
    .map(e => e.name)
