// bws-interview's state: the dashboard tab bws-cockpit draws (bws-kit/tab.ts ModTab), read there as unknown and checked.
declare module 'claude-code' {
  interface PluginState {
    'bws-interview': { tab: unknown }
    // bws-cockpit's last press in a mod tab (bws-kit/tab.ts TabEvent), watched for this plugin's own.
    'bws-cockpit': { tabEvent: { seq: number; plugin: string; id: string; value?: string } | null }
  }
  interface McpToolInputs {
    'mcp__bws-interview__qa_history': { scope?: 'session' | 'all'; last?: number }
  }
}

// An export keeps this file a module, so the block above augments claude-code instead of replacing it.
export type TabState = unknown
