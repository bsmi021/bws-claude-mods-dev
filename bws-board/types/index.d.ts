// The same shapes as hooks/board.ts's Card, Ask, Act and Inbox (the manifest's types contract is read
// alone, so they are written out here, not imported).
export type BoardCard = {
  version: 1
  sessionId: string
  role: string | null
  cwd: string
  startedAt: number
  seenAt: number
  status: 'busy' | 'idle'
  task: string
  run: string | null
  lastFile: string | null
  claims: { path: string; since: number; at: number }[]
  outbox: { seq: number; to: string; text: string; at: number }[]
  asks: { id: string; to: string; text: string; urgent: boolean; at: number; state: 'open' | 'done' | 'withdrawn'; by?: string; note?: string }[]
  acts: { askId: string; kind: 'take' | 'done' | 'decline'; at: number; note?: string }[]
  git?: { since: number; at: number; verb: string; tree: string }
  gone?: true
}

export type BoardOwn = {
  sessionId: string
  joinedAt: number
  seq: number
  card: BoardCard
  // per sender, the last message seq delivered
  cursors: Record<string, number>
  // ask events already told to this conversation, by key, with when
  seen: Record<string, number>
  // per receiver, when this session last woke it with an urgent ask
  lastWake: Record<string, number>
  // news read by the heartbeat, waiting for the next tool result or prompt
  pending: { lines: string[]; messages: { from: string; seq: number; text: string; at: number }[] }
  // live peers already announced to this conversation; null until its first read
  known: string[] | null
}

export type BoardSummary = { agents: number; openAsks: number; askedOfMe: number }

// hooks/board.ts's PaneView: the dashboard's cards, already worded.
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

declare module 'claude-code' {
  // The board tools' inputs, here because the generated MCP types list only the tools the engine saw
  // at its last interactive load, and a test run regenerates them.
  interface McpToolInputs {
    'mcp__bws-board__board_status': { task?: string }
    'mcp__bws-board__board_ask': { to: string; text: string; urgent?: boolean }
    'mcp__bws-board__board_take': { id: string }
    'mcp__bws-board__board_done': { id: string; note?: string }
    'mcp__bws-board__board_decline': { id: string; note?: string }
    'mcp__bws-board__board_withdraw': { id: string }
    'mcp__bws-board__board_send': { to: string; text: string }
    'mcp__bws-board__board_release': { paths?: string[] }
  }
  interface PluginState {
    'bws-board': {
      // this process's role: not keyed by session id, so it outlives /clear, /resume and /branch
      role: string | null
      // each session's own card as it last wrote it, with its cursors, by session id: a new id
      // (after /clear, /resume, /branch) starts a new card; the newest few are kept
      own: Record<string, BoardOwn>
      // for the band chip and the pane
      summary: BoardSummary | null
      // the board as last read, for the pane
      lines: string[]
      // the same board as cards, for the dashboard's Board tab
      pane: BoardPane | null
    }
  }
}
