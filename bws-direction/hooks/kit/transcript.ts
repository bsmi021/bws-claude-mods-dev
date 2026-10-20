// vendored from bws-kit/transcript.ts by tools/sync-kit.py, do not edit: change the kit and run `python tools/sync-kit.py`
// The conversation as plain text, for when there is nothing to fork (a resumed session's first command).
// Pure: no `$`. Copied from bws-cockpit's handoff.ts; the cockpit keeps its own copy.

export const words = (text: string) => text.split(/\s+/).filter(Boolean).length

export type TranscriptRow = { role: string; text: string; toolUses?: readonly { tool: string; input?: unknown; text?: string }[] }

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}...` : s)

// Newest turns kept, oldest dropped past maxChars.
export const transcriptText = (rows: readonly TranscriptRow[], maxChars = 80_000) => {
  const parts: string[] = []
  let total = 0
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i]
    if (!r) continue
    const tools = (r.toolUses ?? []).map(t => `  [${t.tool} ${clip(JSON.stringify(t.input ?? {}), 300)}]${t.text ? ` -> ${clip(t.text, 300)}` : ''}`)
    const block = [`${r.role.toUpperCase()}: ${clip(r.text, 4000)}`, ...tools].join('\n')
    if (total + block.length > maxChars) break
    parts.unshift(block)
    total += block.length
  }
  return parts.join('\n\n')
}
