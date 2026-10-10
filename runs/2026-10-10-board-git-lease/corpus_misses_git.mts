import { readFileSync } from 'node:fs'
import { GIT_LEASE_VERBS, gitOps } from '../../bws-board/hooks/shell.ts'

// Lease misses worth reading: git <verb> at the start of a line or after ; & | ( once heredoc
// bodies and here-strings are cut out, where the parser finds no lease-taking op.
const rows = readFileSync(process.argv[2]!, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
const mode = process.argv[3] ?? 'heredoc'
const verbs = [...GIT_LEASE_VERBS].join('|')
const re = new RegExp(`(?:^|[;&|\\n(]\\s*)git(?:\\.exe)?\\s+(?:-\\S+\\s+(?:[^-\\s]\\S*\\s+)?)*(${verbs})(?![-\\w])(?!\\s+(?:list|show)\\b)`)
const cut = (c: string) =>
  c
    .replace(/<<-?\s*['"]?(\w+)['"]?[^\n]*\n[\s\S]*?\n\s*\1(?=\n|$)/g, '<<H')
    .replace(/@(['"])\r?\n[\s\S]*?\r?\n\1@/g, '@H')
let n = 0
for (const r of rows) {
  const hasDoc = /<<|@'|@"/.test(r.command)
  if ((mode === 'heredoc') !== hasDoc) continue
  const body = cut(r.command)
  if (!re.test(body)) continue
  if (gitOps(r.command, r.tool === 'PowerShell' ? 'powershell' : 'bash').length > 0) continue
  n++
  if (n <= 40) console.log(r.tool, '|', body.replace(/\s+/g, ' ').slice(0, 220))
}
console.log(mode, 'count', n)
