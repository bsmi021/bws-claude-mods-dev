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

// ---------- Repo Sessions (other Claude Code sessions in this repo) ----------

export type PeerView = {
  sessionId: string
  pid: number
  name: string
  status: string // busy, idle, shell, or whatever the registry says
  kind: string // interactive, or a headless kind
  repo: string // its repo's folder name
  where: string // relative to its repo root; '' at the root
  startedAt: number | null
  statusSince: number | null
  prompt: string | null // first line of its latest prompt in history.jsonl (same-repo peers only)
  promptAt: number | null
}

export type PeersView = {
  root: string // this session's repo root
  at: number // when it was scanned
  peers: PeerView[]
  others: PeerView[] // live sessions in other repos, by repo name
}

// The outcome of the last message sent from the pane, shown under that peer's row.
export type PeerNote = { sessionId: string; text: string; isError: boolean; at: number }

declare module 'claude-code' {
  interface PluginState {
    'bws-cockpit': {
      view: CockpitView | null
      isHidden: boolean
      loops: LoopView[]
      loopSelected: string | null
      loopAction: LoopActionNote | null
      stopArmedAt: number | null
      peers: PeersView | null
      peersAnnounced: string[]
      peerCompose: string | null // the sessionId whose message Input is open
      peerNote: PeerNote | null
    }
  }
}
