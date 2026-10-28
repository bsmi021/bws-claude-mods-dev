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

// ---------- Dashboard (Assumptions and Shelf moved in from bws-assumptions and bws-shelf) ----------

export type Verdict = 'open' | 'right' | 'wrong'

// One assumption Claude recorded, numbered A1, A2… in the order it arrived.
export type Assumption = {
  n: number
  text: string
  why: string
  verdict: Verdict
  // What it should be instead; only read when verdict is 'wrong'. Empty: Claude is told to ask.
  correction: string
  // True once its verdict went to Claude.
  isSent: boolean
}

// An idea on the shelf, as hooks/shelf.ts writes it to the shelf file.
export type ShelfIdea = {
  id: number
  text: string
  detail?: string
  by: 'user' | 'claude'
  project: string
  createdAt: number
  status: 'open' | 'done' | 'dropped'
  closedAt?: number
}

// What the Shelf tab draws: the open ideas as last loaded from the shelf file, and this project's open count.
export type ShelfView = {
  isAll: boolean
  root: string
  ideas: ShelfIdea[]
  now: number
  note: string
  count: number
}

export type DashTab = 'assumptions' | 'shelf' | 'board' | 'loop' | 'mods'

export type DashView = {
  // The tab shown: a DashTab, or a mod's `mod:<plugin>`; null until something picks one.
  tab: string | null
  // The person closed the dashboard: news lights the bar instead of reopening it, until they open it again.
  isClosedByPerson: boolean
}

// The handoff nudge, once per session (keyed by its start): Handoff stays highlighted until it runs.
export type HandoffNudge = { startedAt: number; isDone: boolean }

// bws-kit/summary.ts: what a mod publishes under { plugin, key: 'summary' }; null or idle draws nothing.
// bws-board's Board tab cards (bws-board/types BoardPane), written out so cockpit loads without bws-board.
export type BoardSessionCard = {
  id: string
  who: string
  status: 'busy' | 'idle'
  task: string
  run: string | null
  seen: string
  claims: string[]
  claimsMore: number
  lease: string | null
}
export type BoardAskCard = {
  id: string
  view: 'open' | 'taken' | 'done' | 'declined' | 'withdrawn'
  urgent: boolean
  from: string
  to: string
  text: string
  actor: string | null
  note: string | null
}
export type BoardPane = { self: BoardSessionCard; peers: BoardSessionCard[]; asks: BoardAskCard[] }

export type ModSummary = { state: 'idle' | 'busy' | 'ok' | 'warn' | 'bad'; label: string; detail?: string }

declare module 'claude-code' {
  // bws-board's band summary, read for the board chip (bws-board's own contract declares it the
  // same way; written here inline so cockpit type-checks and loads without bws-board).
  interface PluginState {
    'bws-board': {
      summary: { agents: number; openAsks: number; askedOfMe: number } | null
      // the board as last read, drawn by the dashboard's Board tab when pane is absent (bws-board before 0.6.0)
      lines: string[]
      // the board as cards (bws-board 0.6.0+)
      pane: BoardPane | null
    }
  }
  // Each mod's summary (bws-kit/summary.ts) and dashboard tab (bws-kit/tab.ts), read for the dashboard's mod tabs;
  // each mod declares its own the same way. `tab` is read as unknown and checked by parseTab, so a broken or older
  // mod can never fail the dashboard. Written inline so cockpit type-checks and loads without them.
  interface PluginState {
    'bws-memory': { summary: ModSummary | null; tab: unknown }
    'bws-diagram': { summary: ModSummary | null; tab: unknown }
    'bws-enhance': { summary: ModSummary | null; tab: unknown }
    'bws-better': { summary: ModSummary | null; tab: unknown }
    'bws-sidechat': { summary: ModSummary | null; tab: unknown }
    'bws-secrets': { summary: ModSummary | null; tab: unknown }
    'bws-skillgate': { summary: ModSummary | null; tab: unknown }
    'bws-notify': { summary: ModSummary | null; tab: unknown }
    'bws-shell-lint': { summary: ModSummary | null; tab: unknown }
    'bws-interview': { tab: unknown }
    'bws-direction': { summary: ModSummary | null; tab: unknown }
    'bws-summary': { summary: ModSummary | null; tab: unknown }
    'bws-agents': { summary: ModSummary | null; tab: unknown }
    'bws-inventory': { summary: ModSummary | null; tab: unknown }
    'bws-mask': { summary: ModSummary | null; tab: unknown }
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
      assumptions: Assumption[]
      dash: DashView
      shelf: ShelfView
      handoffNudge: HandoffNudge | null
      // The last press or submitted input in a mod's dashboard tab (bws-kit/tab.ts TabEvent); the mod reads it with a
      // state.set hook filtered to its own plugin name.
      tabEvent: { seq: number; plugin: string; id: string; value?: string } | null
      // Cache clock: the window (its startedAt), the last main-loop turn end, the main-loop turns since the last
      // handoff, and when the last auto handoff was written (hooks/cacheclock.ts)
      cacheClock: { startedAt: number; lastAt: number; turns: number; autoHandoffAt: number | null } | null
      // the chip the bar draws from it
      cacheBar: { text: string; state: 'fresh' | 'low' | 'expired' } | null
      // The Mods tab (hooks/switchboard.ts Board): installed bws mods as `claude plugin list` last said (null until it
      // answered), tabs the person hid, mods switched since the last /reload-plugins, a note, and a switch in flight
      switchboard: {
        installed: Record<string, { version: string; isEnabled: boolean }> | null
        hidden: string[]
        pending: string[]
        note: string
        isBusy: boolean
      }
    }
  }
}

// This mod's own tools, so `tool.call` can match them before the engine has laid them into claude-code-mcp
// (they are registered at session.start, after the types are written on a first load).
declare module 'claude-code' {
  interface McpToolInputs {
    'mcp__bws-cockpit__record_assumption': { assumption: string; why?: string }
    'mcp__bws-cockpit__shelve_idea': { text: string; detail?: string }
    'mcp__bws-cockpit__list_ideas': { scope?: 'project' | 'all' }
    'mcp__bws-cockpit__close_idea': { id: number; status: 'done' | 'dropped' | 'open' }
  }
}
