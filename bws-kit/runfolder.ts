// Run-folder and handoff text helpers. Pure: no `$`. Copied from bws-cockpit's handoff.ts; the cockpit keeps its own copy.

const pad = (n: number) => String(n).padStart(2, '0')

const local = (ms: number) => {
  const d = new Date(ms)
  return { y: d.getFullYear(), mo: pad(d.getMonth() + 1), d: pad(d.getDate()), h: pad(d.getHours()), mi: pad(d.getMinutes()) }
}

export const joinPath = (dir: string, name: string) => `${dir.replace(/[\/]+$/, '')}/${name}`

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

export const transcriptPrompt = (transcript: string, folder: string, focus: string) =>
  `Below is the transcript of a Claude Code session, newest part last.\n<transcript>\n${transcript}\n</transcript>\n\n${handoffPrompt(folder, focus)}`
