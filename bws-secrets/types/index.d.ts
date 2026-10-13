// What the entry pane draws while request_secret waits: never the value.
export type EntryView = { name: string; purpose: string; hasSaved: boolean; note: string }

declare module 'claude-code' {
  interface PluginState {
    'bws-secrets': {
      entry: { name: string; purpose: string; hasSaved: boolean; note: string } | null
      // The summary atom every mod publishes (FR-ALL-05); null draws no chip.
      summary: { state: 'idle' | 'busy' | 'ok' | 'warn' | 'bad'; label: string; detail?: string } | null
    }
  }
}

// This mod's own tool, so `tool.call` can match it before the engine has laid it into claude-code-mcp.
declare module 'claude-code' {
  interface McpToolInputs {
    'mcp__bws-secrets__request_secret': { name: string; purpose?: string }
  }
}
