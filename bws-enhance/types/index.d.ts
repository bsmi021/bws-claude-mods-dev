export type Phase = 'idle' | 'working' | 'ready' | 'error' | 'bounced'

// The enhance in flight or waiting on Send, or a prompt held by the bouncer (phase bounced, note = the reason):
// what the band above the prompt draws.
export type View = {
  phase: Phase
  original: string
  enhanced: string
  // True when the enhanced text went into the prompt box; false when the box held other text.
  isFilled: boolean
  note: string
}

// What /bounce set for this session (mode null: the bounce option decides), and the text held once in warn mode.
export type Setting = {
  mode: 'off' | 'warn' | 'block' | null
  warned: string | null
}

declare module 'claude-code' {
  // bws-better's automatic-mode switch, read by the bouncer (it declares the value itself, the same way).
  interface PluginState {
    'bws-better': { auto: boolean }
  }
  interface PluginState {
    'bws-enhance': {
      view: View
      setting: Setting
      // The summary atom every mod publishes (FR-ALL-05); null draws no chip.
      summary: { state: 'idle' | 'busy' | 'ok' | 'warn' | 'bad'; label: string; detail?: string } | null
      // The Enhance tab bws-cockpit draws (bws-kit/tab.ts ModTab), read there as unknown and checked.
      tab: unknown
    }
    // bws-cockpit's last press in a mod tab (bws-kit/tab.ts TabEvent), watched for this plugin's own.
    'bws-cockpit': { tabEvent: { seq: number; plugin: string; id: string; value?: string } | null }
  }
}
