export type CockpitRun = {
  folder: string
  next?: string
  finish?: string
  open: number
}

// good: up and usable; warn: needs attention; bad: down; off: not running.
export type CockpitState = 'good' | 'warn' | 'bad' | 'off'

export type CockpitChip = {
  label: string // UE, Unity, Blender, adb, VRAM
  detail?: string // :3092, 6.4/8.0 GB, unauthorized
  word: string // the state in words, for text output: up, down, open, off, ready
  state: CockpitState
}

export type CockpitDevices = {
  chips: CockpitChip[]
  isPressure: boolean
}

export type CockpitView = {
  run: CockpitRun | null
  devices: CockpitDevices | null
  lastGuard: string | null
  lastGuardAt: number | null
}

// ---------- Loop Watch (harness-loop state) ----------

export type LoopUnit = {
  id: string
  name: string
  status: string // PENDING, RUNNING, PAUSED, STOPPED, DONE
  sessions: number
  costUsd: number
  crashes: number
  folder: string | null
  message: string
  heartbeatAt: number | null // ms epoch of the running worker's last tool call
  heartbeatTool: string | null
  tasksDone: number | null
  tasksTotal: number | null
}

// `answered` is the first line of the user's answer in the unit's ANSWERS.md, or null.
export type LoopNeed = { id: string; text: string; answered: string | null }

export type LoopAlert = { key: string; level: 'warn' | 'bad' | 'info'; text: string }

export type LoopView = {
  name: string
  title: string
  harnessPy: string // relative to the repo root
  boardUrl: string | null
  driver: { status: string; message: string; updatedAt: number | null; desired: string }
  current: string | null
  units: LoopUnit[]
  needs: LoopNeed[] // open needs of the current unit
  alerts: LoopAlert[]
  stateMtime: number
}

export type LoopActionNote = { text: string; at: number; isError: boolean }

// ---------- Session Bus ----------

// The same shapes as hooks/bus.ts's BusEntry and Inbox (the manifest's types contract is read alone).
export type BusOwnEntry = {
  sessionId: string
  cwd: string
  startedAt: number
  seenAt: number
  status: 'busy' | 'idle'
  task: string
  run: string | null
  lastFile: string | null
  claims: { path: string; since: number; at: number }[]
  outbox: { seq: number; to: string; text: string; at: number }[]
}

export type BusOwn = {
  sessionId: string
  joinedAt: number
  seq: number
  entry: BusOwnEntry
  cursors: Record<string, number>
  pending: { from: string; seq: number; text: string; at: number }[]
  // live peers already announced to this conversation; null until its first sync
  known: string[] | null
}

declare module 'claude-code' {
  // The Session Bus tools' inputs, here because the generated MCP types list only the tools the
  // engine saw at its last interactive load, and a test run regenerates them.
  interface McpToolInputs {
    'mcp__bws-cockpit__bus_status': { task?: string }
    'mcp__bws-cockpit__bus_send': { to: string; text: string }
    'mcp__bws-cockpit__bus_release': { paths?: string[] }
  }
  interface PluginState {
    'bws-cockpit': {
      view: CockpitView | null
      isHidden: boolean
      loops: LoopView[]
      loopSelected: string | null
      loopAction: LoopActionNote | null
      stopArmedAt: number | null
      // Finish-Line Guard: run folders this conversation's own tool calls wrote to, keyed by its start
      touched: { startedAt: number; folders: string[] } | null
      // Session Bus: this session's own entry as it last wrote it, its read cursors and unread
      // messages, keyed by session id so a /clear or resume (a new id) starts fresh
      bus: BusOwn | null
    }
  }
}
