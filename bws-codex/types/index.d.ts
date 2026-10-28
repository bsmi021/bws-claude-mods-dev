// bws-codex keeps no $.state in M1: its job index is in $.store (hooks/job.ts Job, one `job:<id>` key per job).

declare module 'claude-code' {
  // The tools' inputs, here because the generated MCP types list only the tools the engine saw at its last
  // interactive load, and a test run regenerates them.
  interface McpToolInputs {
    'mcp__bws-codex__codex_delegate': { prompt: string; title?: string; effort?: 'low' | 'medium' | 'high' | 'xhigh'; network?: boolean; carry?: boolean; wait?: number }
    'mcp__bws-codex__codex_result': { id: string; wait_s?: number }
    'mcp__bws-codex__codex_status': { id?: string; all?: boolean }
    'mcp__bws-codex__codex_cancel': { id: string; drop?: boolean }
    'mcp__bws-codex__codex_followup': { id: string; prompt: string; wait?: number }
  }
}

export type CodexJobState = 'starting' | 'running' | 'done' | 'failed' | 'cancelled' | 'timed_out'
