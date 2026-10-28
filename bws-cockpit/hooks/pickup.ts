// /pickup: the new session's side of /handoff. Finds a HANDOFF.md under runs/, shows what it says, and queues the
// prompt that reads it and re-checks its live-state claims before trusting them. Pure: no `$`, so tests call it directly.

export type HandoffFile = { folder: string; mtime: number } // folder is "runs/<name>"

// The handoff to pick up: with no argument the newest; else the newest whose folder name equals the argument (with or
// without "runs/"), then the newest whose name contains it.
export const pickHandoff = (files: readonly HandoffFile[], arg: string): HandoffFile | null => {
  const byNew = [...files].sort((a, b) => b.mtime - a.mtime)
  const want = arg.trim().replace(/\\/g, '/').replace(/\/HANDOFF\.md$/i, '').replace(/\/+$/, '').toLowerCase()
  if (want === '') return byNew[0] ?? null
  const name = (f: HandoffFile) => f.folder.replace(/^runs\//, '').toLowerCase()
  const bare = want.replace(/^.*?runs\//, '')
  return byNew.find(f => name(f) === bare) ?? byNew.find(f => name(f).includes(bare)) ?? null
}

// The lines under a `## <name>` heading, up to the next heading.
const section = (text: string, name: RegExp): string[] => {
  const lines = text.split(/\r?\n/)
  const at = lines.findIndex(l => /^##\s/.test(l) && name.test(l))
  if (at < 0) return []
  const out: string[] = []
  for (const l of lines.slice(at + 1)) {
    if (/^#{1,2}\s/.test(l)) break
    out.push(l)
  }
  return out
}

export type HandoffInfo = { title: string; next: string; done: number; open: number; claims: number }

export const parseHandoff = (text: string): HandoffInfo => {
  const h1 = text.split(/\r?\n/).find(l => /^#\s/.test(l)) ?? ''
  const title = h1.replace(/^#\s+/, '').replace(/^Handoff:\s*/i, '').trim()
  const next =
    section(text, /next step/i)
      .map(l => l.replace(/^\s*(?:[-*]|\d+\.)\s+/, '').trim())
      .find(Boolean) ?? ''
  let done = 0
  let open = 0
  for (const l of section(text, /finish line/i)) {
    if (!/^\s*(?:[-*]|\d+\.)\s/.test(l)) continue
    if (/\[[xX]\]|\bdone\b|✅/.test(l)) done++
    else if (/\[ \]|\bopen\b|⬜/.test(l)) open++
  }
  // A Markdown table: the header row and the |---| row are not claims.
  const rows = section(text, /live state/i).filter(l => /^\s*\|/.test(l) && !/^\s*\|[\s:|-]+\|\s*$/.test(l))
  return { title, next, done, open, claims: Math.max(0, rows.length - 1) }
}

export const STALE_MS = 3 * 24 * 60 * 60_000

export const ageText = (ms: number) => {
  const m = Math.max(0, Math.floor(ms / 60_000))
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h ago`
  return `${Math.floor(h / 24)} days ago`
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

// The /pickup reply: what is being picked up, before Claude reads it.
export const pickupText = (folder: string, info: HandoffInfo, ageMs: number): string => {
  const lines = [`📥 Picking up ${folder}/HANDOFF.md · written ${ageText(ageMs)}`]
  if (info.title) lines.push(`🏷️ ${clip(info.title, 100)}`)
  if (info.done + info.open > 0) lines.push(`🏁 Finish line: ✅ ${info.done} done · ⬜ ${info.open} open`)
  lines.push(info.claims > 0 ? `🔍 Live state: ${info.claims} claim${info.claims === 1 ? '' : 's'} to re-check first` : '🔍 Live state: no claims table, so the receipts get checked instead')
  if (info.next) lines.push(`➡️ Next: ${clip(info.next, 160)}`)
  if (ageMs > STALE_MS) lines.push('⚠️ Over 3 days old: expect some of it to be out of date')
  return lines.join('\n')
}

export const pickupPrompt = (folder: string) =>
  `Pick up the handoff in ${folder}/HANDOFF.md. Read it first, then the RUNLOG.md, PLAN.md and TASKS.md beside it if they exist. ` +
  'Before trusting it, re-check every row of its "Live state" table with the check given (or, without one, the receipts it cites), ' +
  'and list each claim as confirmed or stale: stale whenever the check does not show the claim exactly as written, never reinterpreted to fit. ' +
  'Then restate the finish line and the next step in two lines and continue from the next step.'

export const noHandoffText = (arg: string) =>
  arg.trim()
    ? `📭 No HANDOFF.md in a run folder matching "${arg.trim()}" under runs/.`
    : '📭 No HANDOFF.md under runs/. A session writes one with /handoff.'
