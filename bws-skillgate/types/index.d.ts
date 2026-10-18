// What /skillgate set for this session; null leaves the mode option in charge.
export type Setting = { mode: 'off' | 'on' | null }

declare module 'claude-code' {
  interface PluginState {
    'bws-skillgate': {
      setting: Setting
      // The last gated prompt, for /skillgate explain and the summary.
      last: {
        step: 'listing' | 'added'
        picks: string[]
        named: string[]
        added: string[]
        shown: number
        total: number
        savedTokens: number
        failed: string | null
      } | null
      // The summary atom every mod publishes (FR-ALL-05); null draws no chip.
      summary: { state: 'idle' | 'busy' | 'ok' | 'warn' | 'bad'; label: string; detail?: string } | null
      // The dashboard tab bws-cockpit draws (bws-kit/tab.ts ModTab), read there as unknown and checked.
      tab: unknown
    }
    // bws-cockpit's last press in a mod tab (bws-kit/tab.ts TabEvent), watched for this plugin's own.
    'bws-cockpit': { tabEvent: { seq: number; plugin: string; id: string; value?: string } | null }
  }
}
