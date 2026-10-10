export type Verdict = 'open' | 'right' | 'wrong'

// One assumption Claude recorded, numbered A1, A2… in the order it arrived.
export type Assumption = {
  n: number
  text: string
  why: string
  verdict: Verdict
  // What it should be instead; only read when verdict is 'wrong'. Empty: Claude is told to ask.
  correction: string
  // True once its verdict went to Claude.
  isSent: boolean
}

export type PaneView = {
  isExpanded: boolean
  // The person closed the pane: new assumptions update the status line instead of reopening it.
  isClosedByPerson: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'bws-assumptions': { items: Assumption[]; view: PaneView }
  }
}

// This mod's own tool, so `tool.call` can match it before the engine has laid it into claude-code-mcp
// (it is registered at session.start, after the types are written on a first load).
declare module 'claude-code' {
  interface McpToolInputs {
    'mcp__bws-assumptions__record_assumption': {
      assumption: string
      why?: string
    }
  }
}
