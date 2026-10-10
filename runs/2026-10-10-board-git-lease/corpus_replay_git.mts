// Replays gitOps over the real-command corpus (session-bus corpus_build.py). Usage:
//   node corpus_replay_git.mts <corpus.jsonl> <out.md>
// Compares the parser with a plain text search for "git <verb>", so the misses and the extra hits
// can be read by eye. Command text in the receipt is cut short and masked for credentials.
import { readFileSync, writeFileSync } from 'node:fs'
import { GIT_LEASE_VERBS, gitOps } from '../../bws-board/hooks/shell.ts'

const [corpusPath, outPath] = process.argv.slice(2)
if (!corpusPath || !outPath) throw new Error('usage: corpus_replay_git.mts <corpus.jsonl> <out.md>')
const rows = readFileSync(corpusPath, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as { tool: string; command: string })

const verbs = [...GIT_LEASE_VERBS].join('|')
const naive = new RegExp(`\\bgit(?:\\.exe)?\\s+(?:-[^\\s]+\\s+(?:[^-\\s][^\\s]*\\s+)?)*(${verbs})(?![-\\w])(?!\\s+(?:list|show)\\b)`)
const mask = (s: string) =>
  s
    .replace(/https?:\/\/[^\s@/]+@/g, 'https://[masked]@')
    .replace(/\b(gh[pousr]_|github_pat_|sk-|xox[bp]-)[A-Za-z0-9_-]+/g, '$1[masked]')
    .replace(/((?:token|password|secret|api[_-]?key)\s*[=:]\s*)\S+/gi, '$1[masked]')
const show = (r: { tool: string; command: string }) => `${r.tool.padEnd(10)} ${mask(r.command.replace(/\s+/g, ' ')).slice(0, 150)}`

const byVerb = new Map<string, number>()
const flags = { all: 0, staged: 0, stagedAll: 0, dir: 0, unknownDir: 0 }
const hits: string[] = []
const missed: string[] = []
const extra: string[] = []
let parsed = 0
let found = 0
const t0 = performance.now()
for (const r of rows) {
  const ops = gitOps(r.command, r.tool === 'PowerShell' ? 'powershell' : 'bash')
  const isNaive = naive.test(r.command)
  if (isNaive) found++
  if (ops.length > 0) parsed++
  if (isNaive && ops.length === 0) missed.push(show(r))
  if (!isNaive && ops.length > 0) extra.push(show(r))
  for (const o of ops) {
    byVerb.set(o.verb, (byVerb.get(o.verb) ?? 0) + 1)
    if (o.isAll) flags.all++
    if (o.staged) flags.staged++
    if (o.staged?.isAll) flags.stagedAll++
    if (o.dir) flags.dir++
    if (o.dir === undefined) flags.unknownDir++
    hits.push(`${(o.verb + (o.isAll ? ' all' : '') + (o.staged ? ` [staged${o.staged.isAll ? ' all' : ` ${o.staged.paths.length}`}]` : '') + (o.dir ? ` @${o.dir}` : o.dir === undefined ? ' @?' : '')).padEnd(34)} <= ${show(r)}`)
  }
}
const ms = performance.now() - t0
const pick = (list: string[], n: number) => {
  const step = Math.max(1, Math.floor(list.length / n))
  return list.filter((_, i) => i % step === 0).slice(0, n)
}
const md = [
  '# Corpus replay: git lease detector (gitOps)',
  '',
  `Corpus: ${rows.length} distinct Bash/PowerShell commands (last 30 days, day-job projects excluded).`,
  `Commands the parser says take the lease: ${parsed}. Commands a plain text search for "git <verb>" finds: ${found}.`,
  `Replay time ${ms.toFixed(0)} ms (${((ms / rows.length) * 1000).toFixed(1)} µs per command).`,
  '',
  '| verb | ops |',
  '|---|---|',
  ...[...byVerb].sort((a, b) => b[1] - a[1]).map(([v, n]) => `| ${v} | ${n} |`),
  '',
  `commit -a / add -A-style: ${flags.all}; commits with an add before them in the same command: ${flags.staged} (of which add-all: ${flags.stagedAll}); with -C or cd: ${flags.dir}; folder unknown after cd: ${flags.unknownDir}.`,
  '',
  `## Text search finds "git <verb>" but the parser takes no lease: ${missed.length}`,
  'Expected: the verb inside an echo, a quoted string, a commit message, a heredoc, `stash list`, `--git-dir`. Each sample was read by eye.',
  '```',
  ...pick(missed, 80),
  '```',
  '',
  `## Parser takes the lease but the text search misses: ${extra.length}`,
  '```',
  ...pick(extra, 40),
  '```',
  '',
  `## Sample of lease-taking ops (${hits.length})`,
  '```',
  ...pick(hits, 80),
  '```',
  '',
].join('\n')
writeFileSync(outPath, md)
console.log(`rows=${rows.length} parsed=${parsed} naive=${found} missed=${missed.length} extra=${extra.length} ms=${ms.toFixed(0)}`)
