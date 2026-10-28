// bws-codex's job index is in $.store (hooks/job.ts Job, one `job:<id>` key per job). Its $.state: the Codex tab
// bws-cockpit draws (bws-kit/tab.ts ModTab, read there as unknown and checked), the summary chip (bws-kit/summary.ts)
// and the chat (hooks/chat.ts Chat, parsed on read, so typed unknown here).

declare module 'claude-code' {
  interface PluginState {
    'bws-codex': {
      tab: unknown
      summary: { state: 'idle' | 'busy' | 'ok' | 'warn' | 'bad'; label: string; detail?: string } | null
      chat: unknown
    }
    // bws-cockpit's last press in a mod tab (bws-kit/tab.ts TabEvent), watched for this plugin's own.
    'bws-cockpit': { tabEvent: { seq: number; plugin: string; id: string; value?: string } | null }
  }

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
