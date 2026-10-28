// Reduces one turn's `codex exec --json` stream (the supervisor's compact copy) to what the mod reports. Pure.

export type Phase = 'starting' | 'thinking' | 'running a command' | 'editing files' | 'writing' | 'finished' | 'failed'

export type Usage = { input: number; cached: number; output: number; reasoning: number }

export type TurnSummary = {
  threadId: string | null
  isStarted: boolean
  end: 'completed' | 'failed' | null
  usage: Usage | null
  // Codex's latest agent message: its final answer once the turn completed.
  lastMessage: string | null
  commands: number
  failedCommands: number
  // Files Codex edited, as it reported them (absolute paths).
  files: string[]
  errors: string[]
  phase: Phase
  // One line on the latest item, for a running job's status.
  lastItem: string | null
}

type Item = {
  type?: string
  text?: string
  command?: string
  exit_code?: number | null
  status?: string
  message?: string
  changes?: { path?: string; kind?: string }[]
}
type Ev = { type?: string; thread_id?: string; item?: Item; usage?: Record<string, number>; error?: { message?: string }; message?: string }

// Under the person's own config Codex reports a plugin cache it cannot parse (a Claude mod's hooks.json): noise.
const isNoise = (msg: string) => /plugin hooks config|hooks\.json/i.test(msg)

const oneLine = (s: string, max: number) => {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

// pwsh.exe -Command '<the command>': show the command, not the wrapper.
export function shownCommand(cmd: string): string {
  const m = /-Command\s+'([\s\S]*)'\s*$/.exec(cmd) ?? /-Command\s+"([\s\S]*)"\s*$/.exec(cmd)
  return oneLine(m?.[1] ?? cmd, 120)
}

export function reduceEvents(text: string): TurnSummary {
  const s: TurnSummary = {
    threadId: null,
    isStarted: false,
    end: null,
    usage: null,
    lastMessage: null,
    commands: 0,
    failedCommands: 0,
    files: [],
    errors: [],
    phase: 'starting',
    lastItem: null,
  }
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue
    let ev: Ev
    try {
      ev = JSON.parse(line) as Ev
    } catch {
      continue
    }
    if (typeof ev !== 'object' || ev === null) continue
    const item = ev.item
    switch (ev.type) {
      case 'thread.started':
        if (typeof ev.thread_id === 'string') s.threadId = ev.thread_id
        break
      case 'turn.started':
        s.isStarted = true
        s.phase = 'thinking'
        break
      case 'turn.completed': {
        s.end = 'completed'
        s.phase = 'finished'
        const u = ev.usage ?? {}
        s.usage = {
          input: u.input_tokens ?? 0,
          cached: u.cached_input_tokens ?? 0,
          output: u.output_tokens ?? 0,
          reasoning: u.reasoning_output_tokens ?? 0,
        }
        break
      }
      case 'turn.failed':
        s.end = 'failed'
        s.phase = 'failed'
        s.errors.push(ev.error?.message ?? 'turn failed')
        break
      case 'error':
        if (typeof ev.message === 'string' && !isNoise(ev.message)) s.errors.push(ev.message)
        break
      case 'item.started':
      case 'item.updated':
        if (item?.type === 'command_execution' && typeof item.command === 'string') {
          s.phase = 'running a command'
          s.lastItem = `running ${shownCommand(item.command)}`
        } else if (item?.type === 'file_change') {
          s.phase = 'editing files'
        } else if (item?.type === 'reasoning') {
          s.phase = 'thinking'
        }
        break
      case 'item.completed':
        if (!item) break
        if (item.type === 'agent_message' && typeof item.text === 'string') {
          s.lastMessage = item.text.trim()
          if (s.end === null) s.phase = 'writing'
          s.lastItem = `said: ${oneLine(item.text, 100)}`
        } else if (item.type === 'command_execution') {
          s.commands++
          const failed = typeof item.exit_code === 'number' && item.exit_code !== 0
          if (failed) s.failedCommands++
          s.phase = 'thinking'
          if (typeof item.command === 'string') s.lastItem = `ran ${shownCommand(item.command)}${failed ? ` (exit ${item.exit_code})` : ''}`
        } else if (item.type === 'file_change') {
          for (const c of item.changes ?? []) if (typeof c.path === 'string' && !s.files.includes(c.path)) s.files.push(c.path)
          s.phase = 'thinking'
          s.lastItem = `edited ${(item.changes ?? []).length} file(s)`
        } else if (item.type === 'error' && typeof item.message === 'string' && !isNoise(item.message)) {
          s.errors.push(item.message)
        } else if (item.type === 'reasoning') {
          s.phase = 'thinking'
        }
        break
    }
  }
  return s
}
