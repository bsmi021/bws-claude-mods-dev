// The session's task and the turn that just ended, read from the transcript rows. Pure: no `$`.

export type Row = { role: string; text: string; toolUses: readonly { tool: string; input?: Record<string, unknown> }[]; hasToolResults: boolean }

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}...` : s)
const one = (s: string) => s.replace(/\s+/g, ' ').trim()

// A prompt the person typed: a user row with text, not a tool result, not a slash command, a system/command tag or a
// skill's injected instructions.
export const isTyped = (r: Row) => {
  if (r.role !== 'user' || r.hasToolResults) return false
  const t = r.text.trim()
  return t.length > 0 && !t.startsWith('/') && !t.startsWith('<') && !t.startsWith('Base directory for this skill:')
}

export const typedPrompts = (rows: readonly Row[]) => rows.filter(isTyped).map(r => r.text.trim())

const EDITS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

export type Conversation = { first: string; turns: string[]; omitted: number }

// The whole conversation the check reads: the opening request in full, then every later prompt with a short line of
// what that turn did (files edited, the head of its answer). Over `budget` characters the middle turns go first, so the
// start and the newest turns always stay.
export function sessionConversation(rows: readonly Row[], budget = 16_000): Conversation {
  const starts = rows.flatMap((r, i) => (isTyped(r) ? [i] : []))
  const turns: string[] = []
  starts.forEach((s, k) => {
    const seg = rows.slice(s + 1, starts[k + 1] ?? rows.length)
    const files: string[] = []
    let answer = ''
    for (const r of seg) {
      if (r.role !== 'assistant') continue
      if (r.text.trim()) answer = r.text
      for (const t of r.toolUses) {
        const path = (str(t.input, 'file_path') || str(t.input, 'notebook_path')).replace(/\\/g, '/').split('/').slice(-2).join('/')
        if (EDITS.has(t.tool) && path && !files.includes(path)) files.push(path)
      }
    }
    const did = [files.length > 0 ? `edited ${files.slice(0, 6).join(', ')}` : '', answer ? `answered: ${clip(one(answer), 240)}` : ''].filter(Boolean).join('; ')
    const prompt = rows[s]?.text.trim() ?? ''
    turns.push(k === 0 ? (did ? `-> ${did}` : '') : `${k + 1}. ${clip(one(prompt), 700)}${did ? `\n   -> ${did}` : ''}`)
  })
  const first = clip(rows[starts[0] ?? -1]?.text.trim() ?? '', 4000)
  const opening = turns.shift() ?? ''
  const size = (xs: readonly string[]) => xs.reduce((n, x) => n + x.length + 1, 0)
  const head = turns.slice(0, 3)
  let tail = turns.slice(3)
  while (tail.length > 0 && size(head) + size(tail) > budget) tail = tail.slice(1)
  const omitted = turns.length - head.length - tail.length
  return { first: opening ? `${first}\n${opening}` : first, turns: [...head, ...tail], omitted }
}

const str = (input: Record<string, unknown> | undefined, k: string) => {
  const v = input?.[k]
  return typeof v === 'string' ? v : ''
}

export type TurnDigest = { prompt: string; toolCalls: number; files: string[]; actions: string[]; answer: string }

// The turn since the last typed prompt: the prompt, every tool call as one short line, the files edited, the answer.
export function turnDigest(rows: readonly Row[], answer: string, maxActions = 40): TurnDigest {
  let start = rows.length
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i]
    if (r && isTyped(r)) {
      start = i
      break
    }
  }
  const prompt = start < rows.length ? (rows[start]?.text.trim() ?? '') : ''
  const files: string[] = []
  const actions: string[] = []
  let toolCalls = 0
  for (const r of rows.slice(start + 1)) {
    if (r.role !== 'assistant') continue
    for (const t of r.toolUses) {
      toolCalls++
      const path = (str(t.input, 'file_path') || str(t.input, 'notebook_path') || str(t.input, 'path')).replace(/\\/g, '/')
      if (EDITS.has(t.tool) && path && !files.includes(path)) files.push(path)
      const what = path || str(t.input, 'command') || str(t.input, 'pattern') || str(t.input, 'query') || str(t.input, 'description') || str(t.input, 'prompt')
      if (actions.length < maxActions) actions.push(clip(one(`${t.tool} ${what}`), 160))
    }
  }
  return { prompt: clip(prompt, 2000), toolCalls, files, actions, answer: clip(answer.trim(), 2500) }
}

// The newest assistant text, for a check started by a command rather than at the end of the turn.
export function lastAnswer(rows: readonly Row[]): string {
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i]
    if (r?.role === 'assistant' && r.text.trim()) return r.text
  }
  return ''
}

// The turn's number: how many prompts the person has typed so far.
export const turnNumber = (rows: readonly Row[]) => rows.filter(isTyped).length

// A turn worth checking: it edited a file, or it did real work (3+ tool calls).
export const isWorking = (d: TurnDigest) => d.files.length > 0 || d.toolCalls >= 3

// The runs/<date>-<slug> folder the session named last in any tool call.
const RUN_DIR = /runs[\\/]+(\d{4}-\d{2}-\d{2}-[^\\/\s'"`;|&)<>*]+)/g

export function sessionRunDir(rows: readonly Row[]): string | null {
  let last: string | null = null
  for (const r of rows) {
    if (r.role !== 'assistant') continue
    for (const t of r.toolUses) {
      for (const v of Object.values(t.input ?? {})) {
        if (typeof v !== 'string') continue
        for (const m of v.matchAll(RUN_DIR)) if (m[1]) last = m[1]
      }
    }
  }
  return last
}

// The words a turn is about: its prompt, its file paths and actions, and the start of its answer.
export const turnQuery = (d: TurnDigest, task: string) => [d.prompt, ...d.files, ...d.actions, d.answer.slice(0, 800), task.slice(0, 600)].join('\n')

export type Gate = { isAuto: boolean; agentId?: string; reason: string; isRunning: boolean; isWorking: boolean; every: number; working: number }

// Why the automatic check skips this turn, or null to run it. `working` counts this session's working turns so far,
// this one included; the check runs on every `every`th one.
export function skipReason(g: Gate): string | null {
  if (!g.isAuto) return 'autoCheck is off'
  if (g.agentId) return 'a subagent turn'
  if (g.reason !== 'answer') return `the turn ended: ${g.reason}`
  if (!g.isWorking) return 'not a working turn'
  if (g.isRunning) return 'a check is already running'
  if (g.every > 1 && g.working % g.every !== 0) return `every ${g.every} working turns`
  return null
}

export const turnText = (d: TurnDigest) =>
  [
    `Prompt for this turn: ${d.prompt || '(none)'}`,
    `Files edited: ${d.files.length > 0 ? d.files.join(', ') : 'none'}`,
    `Tool calls (${d.toolCalls}):`,
    ...d.actions.map(a => `- ${a}`),
    `Claude's answer:\n${d.answer || '(empty)'}`,
  ].join('\n')
