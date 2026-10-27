// bws-inventory's state: what the conversation used, the dashboard tab bws-cockpit draws (bws-kit/tab.ts ModTab, read
// there as unknown and checked) and the summary chip (bws-kit/summary.ts).
declare module 'claude-code' {
  interface PluginState {
    'bws-inventory': {
      inventory: {
        todos: { id: string; text: string; status: 'pending' | 'in_progress' | 'completed' }[]
        connectors: { name: string; calls: number; errors: number; lastTool: string; lastAt: number; tools: number }[]
        files: { path: string; reads: number; edits: number; writes: number; lastAt: number }[]
        skills: { name: string; uses: number; lastAt: number }[]
        toolNames: string[]
      }
      tab: unknown
      // The summary atom every mod publishes; null draws no chip.
      summary: { state: 'idle' | 'busy' | 'ok' | 'warn' | 'bad'; label: string; detail?: string } | null
    }
    // bws-cockpit's last press in a mod tab (bws-kit/tab.ts TabEvent), watched for this plugin's own.
    'bws-cockpit': { tabEvent: { seq: number; plugin: string; id: string; value?: string } | null }
  }
}

// An export keeps this file a module, so the block above augments claude-code instead of replacing it.
export type InventoryState = unknown
