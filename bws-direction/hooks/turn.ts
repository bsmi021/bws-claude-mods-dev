// The session's task and the turn that just ended, read from the transcript rows. Pure: no `$`.

export type Row = { role: string; text: string; toolUses: readonly { tool: string; input?: Record<string, unknown> }[]; hasToolResults: boolean }

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}...` : s)
const one = (s: string) => s.replace(/\s+/g, ' ').trim()

// A prompt the person typed: a user row with text, not a tool result, not a slash command or a system/command tag.
export const isTyped = (r: Row) => {
  if (r.role !== 'user' || r.hasToolResults) return false
  const t = r.text.trim()
  return t.length > 0 && !t.startsWith('/') && !t.startsWith('<')
}

export const typedPrompts = (rows: readonly Row[]) => rows.filter(isTyped).map(r => r.text.trim())

// The task: the session's first typed prompt, and the latest few after it (redirections the person made).
export function sessionTask(rows: readonly Row[], recent = 3): { first: string; recent: string[] } {
  const all = typedPrompts(rows)
  return { first: clip(all[0] ?? '', 3000), recent: all.slice(1).slice(-recent).map(p => clip(p, 1200)) }
}

const EDITS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

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
