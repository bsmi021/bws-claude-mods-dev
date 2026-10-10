// Finish-Line Guard: decides whether the main loop may stop. Pure: no `$`, so tests call it directly.

export type FinishInput = {
  open: string[] // actionable open items of this session's run folder
  folder: string | null
  message: string // the assistant's last message
  continuesUsed: number // blocks already spent since the person's last prompt
  maxContinues: number
  isWaiting: boolean // background tasks or session crons still pending
  evidenceCheck: boolean
  owner?: string // what the block message calls the person ("the user" unless configured)
}

export type FinishDecision = { block: string; kind: 'open' | 'evidence' } | null

const clean = (s: string) => s.replace(/\*\*/g, '').replace(/`/g, '').replace(/\s+/g, ' ').trim()

// `- [ ] text` lines, the text cleaned.
export const openItems = (markdown: string): string[] =>
  markdown
    .split(/\r?\n/)
    .map(l => l.match(/^\s*[-*]\s+\[ \]\s+(.+)$/)?.[1])
    .filter((t): t is string => t !== undefined)
    .map(clean)

// Items that wait on someone else or were put aside: they never hold the session open.
// "needs <Name>:" (the form the block message asks for) counts for any name.
const PARKED =
  /\b(blocked|waiting (on|for)|needs? (the user|you|user)|on hold|parked|deferred?|follow-?ups?|later|out of scope|won'?t do|not now|optional)\b|\bneeds? [A-Z][\w-]*:/i

// A harness proposal waits on the person too, and so does an item addressed to them ("<ownerName>: ...").
const PROPOSED = /\(proposed[- ]task\)/i

export const isParked = (item: string, owner?: string) => {
  if (PARKED.test(item) || PROPOSED.test(item)) return true
  const who = owner?.trim()
  return who !== undefined && who.length > 0 && who !== 'the user' && item.toLowerCase().startsWith(`${who.toLowerCase()}:`)
}

export const actionable = (items: string[], owner?: string) => items.filter(i => !isParked(i, owner))

// ---------- ownership ----------

// The runs/<date>-<slug> folders a tool call writes to. Edit, Write and NotebookEdit by their path;
// Bash and PowerShell only when the command also writes (redirect, tee, sed -i, mkdir, cp/mv, the
// PowerShell write cmdlets, Python file writes). Reading a worker's TASKS.md claims nothing.
const RUN_DIR = /runs[\\/]+(\d{4}-\d{2}-\d{2}-[^\\/\s'"`;|&)<>*]+)/g
const SHELL_WRITE =
  /(?:^|[^<>=&\d-])>>?(?![&=])|\btee\b|\bsed\s+(-[a-zA-Z]*\s+)*-i|\b(mkdir|cp|mv|touch)\b|\b(Set|Add)-Content\b|\bOut-File\b|\bNew-Item\b|\b(Copy|Move)-Item\b|\bwrite_text\b|\.write\(|\bopen\([^)]*['"][wax]\+?['"]/i

const runDirs = (text: string) => [...text.matchAll(RUN_DIR)].map(m => m[1] ?? '').filter(Boolean)

export function writtenRunFolders(tool: string, input: Record<string, unknown>): string[] {
  const str = (k: string) => {
    const v = input[k]
    return typeof v === 'string' ? v : ''
  }
  if (tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit' || tool === 'MultiEdit') {
    return [...new Set(runDirs(str('file_path') || str('notebook_path')))]
  }
  if (tool === 'Bash' || tool === 'PowerShell') {
    const cmd = str('command')
    return SHELL_WRITE.test(cmd) ? [...new Set(runDirs(cmd))] : []
  }
  return []
}

// A reply that hands control back to the person: a question, or an explicit hand-back.
const HAND_BACK =
  /(your call|want me to|should i\b|shall i\b|which (one|do you|would you)|do you want|waiting on you|need(s)? you to|needs? your|let me know|over to you|your decision|confirm (whether|if|before)|before i (continue|proceed))/i

// Imperative asks hand back too ("tell me when it's plugged in", "say go"). "Say if you want X"
// does not: it offers an option while there is still work to do.
const IMPERATIVE_ASK =
  /\btell me (when|once|whether|["“'])|\bwhen you say\b|\bsay ["“']?(go|yes|the word)\b|\bwhen you next ask\b|\bonce you (answer|confirm|decide|reply|approve)\b|\bwaiting (on|for) your\b/i

export const isHandBack = (message: string) => {
  const tail = message.trim().replace(/[\s*_`)\]]+$/, '')
  const end = message.slice(-1500)
  return tail.endsWith('?') || HAND_BACK.test(end) || IMPERATIVE_ASK.test(end)
}

// A completion claim in the headline or the closing lines.
const CLAIM =
  /(\b(all )?(done|complete[d]?|finished|shipped)\b|\ball (tests|checks) pass(ed|ing)?\b|\bready to (merge|ship|push)\b|\bworks now\b|✅)/i

export const claimsDone = (message: string) => {
  const lines = message.trim().split(/\r?\n/).filter(l => l.trim().length > 0)
  const ends = [...lines.slice(0, 3), ...lines.slice(-3)].join('\n')
  return CLAIM.test(ends)
}

const EVIDENCE = [
  /[\w./\\-]+\.(txt|png|jpe?g|webp|gif|json|jsonl|log|md|html|xml|csv)\b/i, // a receipt or file path
  /\breceipts?\b/i,
  /\b\d+\s*\/\s*\d+\b.*\b(pass|tests?|green)\b|\b(pass|tests?)\b.*\b\d+\s*\/\s*\d+\b/i, // 48/48 tests
  /\b\d+\s+(tests?\s+)?(pass(ed|ing)?|green)\b/i, // 16 pass
  /\b0 fail(s|ed|ures)?\b/i,
  /\bexit(ed)?( code)? 0\b/i,
  /\b(commit|committed|sha)\b[^\n]{0,40}\b[0-9a-f]{7,40}\b/i,
  /https?:\/\/\S+/i,
]

export const hasEvidence = (message: string) => EVIDENCE.some(r => r.test(message))

export const openSummary = (open: string[], max = 5) =>
  open
    .slice(0, max)
    .map(i => (i.length > 90 ? `${i.slice(0, 87)}...` : i))
    .join('; ') + (open.length > max ? `; and ${open.length - max} more` : '')

export const decide = (x: FinishInput): FinishDecision => {
  if (x.continuesUsed >= x.maxContinues || x.isWaiting || isHandBack(x.message)) return null
  if (x.open.length > 0) {
    const owner = x.owner && x.owner.trim().length > 0 ? x.owner.trim() : 'the user'
    return {
      kind: 'open',
      block:
        `bws-cockpit finish line: ${x.folder ?? 'the run folder'} still has ${x.open.length} open item${x.open.length === 1 ? '' : 's'}: ` +
        `${openSummary(x.open)}. Keep going on them. If one is blocked or needs ${owner}, say so plainly in your reply and mark it in the ` +
        `checklist (e.g. "- [ ] item (blocked: reason)" or "(needs ${owner}: question)"); the guard then lets you stop.`,
    }
  }
  if (x.evidenceCheck && claimsDone(x.message) && !hasEvidence(x.message)) {
    return {
      kind: 'evidence',
      block:
        'bws-cockpit finish line: your reply says the work is done but cites no evidence. Name the receipts: test output with counts, ' +
        'file paths of logs or screenshots, the commit hash. If something is unverified, say so plainly instead of claiming done.',
    }
  }
  return null
}
