// One file the last memory write touched: what the pane lists.
export type Written = { file: string; kind: 'new' | 'update'; added: number; removed: number }

// The memory update in flight or just finished. idle: nothing to show; working: the chip; done: the pane lists `written`;
// error: a run failed (note says why, no prompt text).
export type View = { phase: 'idle' | 'working' | 'done' | 'error'; written: Written[]; note: string }

// One step of a dream plan, flat so one shape serves all three kinds. merge: `files` are the sources and `into` the one that
// survives (name, description, type and body are the merged text); remove: `files` = [file]; rewrite: `files` = [file], the
// new description (may be empty: keep) and body (type empty: keep).
export type DreamAction = {
  action: 'merge' | 'remove' | 'rewrite'
  files: string[]
  into: string
  reason: string
  name: string
  description: string
  type: string
  body: string
}

declare module 'claude-code' {
  interface PluginState {
    'bws-memory': {
      view: View
      // The summary atom every mod publishes (FR-ALL-05); null draws no chip.
      summary: { state: 'idle' | 'busy' | 'ok' | 'warn' | 'bad'; label: string; detail?: string } | null
    }
  }
}
