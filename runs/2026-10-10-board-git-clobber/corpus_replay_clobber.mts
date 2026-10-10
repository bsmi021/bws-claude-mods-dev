// Replays the overwrite detector (gitOps' clobber) over the real-command corpus (session-bus
// corpus_build.py). Usage: node corpus_replay_clobber.mts <corpus.jsonl> <out.md>
// Lists, per verb and scope, what it flags, and the commands that name an overwriting git verb at a
// line start (heredoc bodies cut out) but get no clobber, for reading by eye. Text is masked and cut.
import { readFileSync, writeFileSync } from 'node:fs'
import { gitOps } from '../../bws-board/hooks/shell.ts'

const [corpusPath, outPath] = process.argv.slice(2)
if (!corpusPath || !outPath) throw new Error('usage: corpus_replay_clobber.mts <corpus.jsonl> <out.md>')
const rows = readFileSync(corpusPath, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as { tool: string; command: string })

const mask = (s: string) =>
  s
    .replace(/https?:\/\/[^\s@/]+@/g, 'https://[masked]@')
    .replace(/\b(gh[pousr]_|github_pat_|sk-|xox[bp]-)[A-Za-z0-9_-]+/g, '$1[masked]')
    .replace(/((?:token|password|secret|api[_-]?key)\s*[=:]\s*)\S+/gi, '$1[masked]')
const show = (r: { tool: string; command: string }) => `${r.tool.padEnd(10)} ${mask(r.command.replace(/\s+/g, ' ')).slice(0, 150)}`
const cut = (c: string) =>
  c.replace(/<<-?\s*['"]?(\w+)['"]?[^\n]*\n[\s\S]*?\n\s*\1(?=\n|$)/g, '<<H').replace(/@(['"])\r?\n[\s\S]*?\r?\n\1@/g, '@H')
const atStart = /(?:^|[;&|\n(]\s*)git(?:\.exe)?\s+(?:-\S+\s+(?:[^-\s]\S*\s+)?)*(stash|reset|checkout|switch|restore|clean|rm)(?![-\w])([^;&|\n]*)/

const byKey = new Map<string, number>()
const hits: string[] = []
const unflagged = new Map<string, string[]>()
let flagged = 0
const t0 = performance.now()
for (const r of rows) {
  const ops = gitOps(r.command, r.tool === 'PowerShell' ? 'powershell' : 'bash').filter(o => o.clobber)
  if (ops.length > 0) flagged++
  for (const o of ops) {
    const c = o.clobber!
    const key = `${o.verb} ${c.scope}${c.isAll ? ' all' : ' paths'}${c.untracked ? ' +untracked' : ''}`
    byKey.set(key, (byKey.get(key) ?? 0) + 1)
    hits.push(`${key.padEnd(28)} <= ${show(r)}`)
  }
  const m = atStart.exec(cut(r.command))
  if (m && ops.length === 0) {
    const verb = m[1] ?? ''
    const list = unflagged.get(verb) ?? []
    list.push(show(r))
    unflagged.set(verb, list)
  }
}
const ms = performance.now() - t0
const pick = (list: string[], n: number) => {
  const step = Math.max(1, Math.floor(list.length / n))
  return list.filter((_, i) => i % step === 0).slice(0, n)
}
const md = [
  '# Corpus replay: git overwrite detector (clobber)',
  '',
  `Corpus: ${rows.length} distinct Bash/PowerShell commands (last 30 days, day-job projects excluded).`,
  `Commands with an overwriting git op: ${flagged}. Replay time ${ms.toFixed(0)} ms.`,
  '',
  '| verb, scope | ops |',
  '|---|---|',
  ...[...byKey].sort((a, b) => b[1] - a[1]).map(([k, n]) => `| ${k} | ${n} |`),
  '',
  '## A verb at a line start but no overwrite flagged, by verb (sampled)',
  'Expected: `stash list/show/pop/apply`, `reset` without `--hard`, branch switches without `-f`, `checkout -b`, `restore --staged`, dry runs, `rm --cached`, and verbs inside quoted text.',
  '',
  ...[...unflagged].flatMap(([v, list]) => [`### ${v} (${list.length})`, '```', ...pick(list, 25), '```', '']),
  `## Sample of flagged ops (${hits.length})`,
  '```',
  ...pick(hits, 80),
  '```',
  '',
].join('\n')
writeFileSync(outPath, md)
console.log(`rows=${rows.length} flagged=${flagged} ms=${ms.toFixed(0)} ${[...byKey].map(([k, n]) => `${k}=${n}`).join('; ')}`)
console.log([...unflagged].map(([v, l]) => `${v}:${l.length}`).join(' '))
