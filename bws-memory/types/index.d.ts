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

// The dream in flight or waiting. idle: nothing; working: the fork is planning; preview: `actions` wait for Apply or Dismiss
// (`bases` fingerprints the files they were planned from, `sessions` lists each touched file's sessions); applied: done,
// `backup` names the folder copy; error: `note` says why. `due`: the trigger fired and no dream has been applied or dismissed
// since. `auto`: this run was started by the trigger, not by /dream.
export type DreamView = {
  phase: 'idle' | 'working' | 'preview' | 'applied' | 'error'
  due: boolean
  auto: boolean
  actions: DreamAction[]
  sessions: Record<string, string[]>
  bases: Record<string, string>
  skipped: number
  note: string
  backup: string
}

declare module 'claude-code' {
  interface PluginState {
    'bws-memory': {
      view: View
      dream: DreamView
      // The summary atom every mod publishes (FR-ALL-05); null draws no chip.
      summary: { state: 'idle' | 'busy' | 'ok' | 'warn' | 'bad'; label: string; detail?: string } | null
      // The Memory tab bws-cockpit draws (bws-kit/tab.ts ModTab), read there as unknown and checked.
      tab: unknown
    }
    // bws-cockpit's last press in a mod tab (bws-kit/tab.ts TabEvent), watched for this plugin's own.
    'bws-cockpit': { tabEvent: { seq: number; plugin: string; id: string; value?: string } | null }
  }
}
