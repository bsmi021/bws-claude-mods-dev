// One file the last memory write touched: what the pane lists.
export type Written = { file: string; kind: 'new' | 'update'; added: number; removed: number }

// The memory update in flight or just finished. idle: nothing to show; working: the chip; done: the pane lists `written`;
// error: a run failed (note says why, no prompt text).
export type View = { phase: 'idle' | 'working' | 'done' | 'error'; written: Written[]; note: string }

declare module 'claude-code' {
  interface PluginState {
    'bws-memory': {
      view: View
      // The summary atom every mod publishes (FR-ALL-05); null draws no chip.
      summary: { state: 'idle' | 'busy' | 'ok' | 'warn' | 'bad'; label: string; detail?: string } | null
    }
  }
}
