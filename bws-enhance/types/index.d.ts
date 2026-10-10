export type Phase = 'idle' | 'working' | 'ready' | 'error'

// The enhance in flight or waiting on Send: what the band above the prompt draws.
export type View = {
  phase: Phase
  original: string
  enhanced: string
  // True when the enhanced text went into the prompt box; false when the box held other text.
  isFilled: boolean
  note: string
}

declare module 'claude-code' {
  interface PluginState {
    'bws-enhance': { view: View }
  }
}
