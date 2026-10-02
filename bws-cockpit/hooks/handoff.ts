// /handoff and the worker model pin. Pure: no `$`, so tests call it directly.

const pad = (n: number) => String(n).padStart(2, '0')

const local = (ms: number) => {
  const d = new Date(ms)
  return { y: d.getFullYear(), mo: pad(d.getMonth() + 1), d: pad(d.getDate()), h: pad(d.getHours()), mi: pad(d.getMinutes()) }
}

// A new run folder for a session that has none yet.
export const handoffFolder = (now: number) => {
  const t = local(now)
  return `runs/${t.y}-${t.mo}-${t.d}-handoff`
}

// The name the previous HANDOFF.md is kept under.
export const keptName = (now: number) => {
  const t = local(now)
  return `HANDOFF.${t.y}${t.mo}${t.d}-${t.h}${t.mi}.md`
}

export const handoffPrompt = (folder: string, focus: string) =>
  [
    'Write a handoff for a fresh agent that will continue this work and has none of this conversation.',
    `It will be saved as ${folder}/HANDOFF.md, beside the run folder's RUNLOG.md, PLAN.md and TASKS.md if they exist.`,
    focus ? `Focus the handoff on: ${focus}.` : '',
    'Output only the handoff, in Markdown, under about 450 words, written to the next agent. Use these sections:',
    '# Handoff: <short title>',
    '## Objective (one or two sentences)',
    '## Finish line (the agreed checklist, each item marked done or open)',
    '## Done so far (what is finished, with the receipts that prove it: test counts, file paths, commit hashes)',
    '## Next step (the single next action, concrete enough to start without asking)',
    '## Open items (anything else not done, and anything waiting on the user)',
    '## Key files and commands (exact paths and command lines)',
    "## Decisions and constraints (the user's rules and choices that still apply)",
    '## Watch out for (traps this session hit, and how they were handled)',
    'Use exact paths, hashes and commands from this session. Do not invent anything; if a section has nothing, write "none".',
  ]
    .filter(Boolean)
    .join('\n')

export const startPrompt = (folder: string) =>
  `Read ${folder}/HANDOFF.md first, then the RUNLOG.md, PLAN.md and TASKS.md beside it if they exist. ` +
  'Restate the finish line and the next step in two lines, check what is actually done against the receipts, then continue from the next step.'

export const words = (text: string) => text.split(/\s+/).filter(Boolean).length

// The conversation as plain text, for when there is nothing to fork (a resumed session's first
// command): newest turns kept, oldest dropped past maxChars.
export type TranscriptRow = { role: string; text: string; toolUses?: readonly { tool: string; input?: unknown; text?: string }[] }

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}...` : s)

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

export const transcriptPrompt = (transcript: string, folder: string, focus: string) =>
  `Below is the transcript of a Claude Code session, newest part last.\n<transcript>\n${transcript}\n</transcript>\n\n${handoffPrompt(folder, focus)}`

// ---------- worker model pin ----------

export type PinConfig = { model: string; types: string[] }

export type SpawnFacts = { subagentType: string; model?: string; fork: boolean }

// The model to run this spawn on, or undefined to leave it alone. An explicit model in
// the Agent call wins ("unless the task is complex"); forks always inherit.
export const pinnedModel = (s: SpawnFacts, cfg: PinConfig): string | undefined => {
  if (!cfg.model || s.fork) return undefined
  if (s.model && s.model.toLowerCase() !== 'inherit') return undefined
  return cfg.types.includes(s.subagentType.toLowerCase()) ? cfg.model : undefined
}

export const parseTypes = (text: string) =>
  text
    .split(/[,;]/)
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
