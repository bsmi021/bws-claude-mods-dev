declare module 'claude-code' {
  interface PluginState {
    'bws-secrets': {
      // The summary atom every mod publishes (FR-ALL-05); null draws no chip.
      summary: { state: 'idle' | 'busy' | 'ok' | 'warn' | 'bad'; label: string; detail?: string } | null
    }
  }
}

export type SecretsSummary = { state: 'idle' | 'busy' | 'ok' | 'warn' | 'bad'; label: string; detail?: string }
