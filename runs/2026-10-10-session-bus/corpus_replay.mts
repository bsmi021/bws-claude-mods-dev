// Replays writeTargets over the real-command corpus. Usage: node corpus_replay.mts <corpus.jsonl> <out.md>
import { readFileSync, writeFileSync } from 'node:fs'
import { writeTargets } from '../../bws-cockpit/hooks/shell.ts'

const [corpusPath, outPath] = process.argv.slice(2)
if (!corpusPath || !outPath) throw new Error('usage: corpus_replay.mts <corpus.jsonl> <out.md>')
const rows = readFileSync(corpusPath, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as { tool: string; command: string })

const byVia = new Map<string, number>()
const samples = new Map<string, string[]>()
const odd: string[] = []
let withTargets = 0
let targets = 0
const t0 = performance.now()
for (const r of rows) {
  const ts = writeTargets(r.command, r.tool === 'PowerShell' ? 'powershell' : 'bash')
  if (ts.length === 0) continue
  withTargets++
  for (const t of ts) {
    targets++
    byVia.set(t.via, (byVia.get(t.via) ?? 0) + 1)
    const line = `${r.tool.padEnd(10)} ${t.via.padEnd(9)} ${t.path.padEnd(50)} <= ${r.command.replace(/\s+/g, ' ').slice(0, 140)}`
    const list = samples.get(t.via) ?? []
    list.push(line)
    samples.set(t.via, list)
    // A target with no folder part and no extension, or punctuation in it, is worth a look.
    if (!/[./\\]/.test(t.path) || /^[-=&|;:,]|[,;"']$/.test(t.path)) odd.push(line)
  }
}
const ms = performance.now() - t0
const pick = (list: string[], n: number) => {
  const step = Math.max(1, Math.floor(list.length / n))
  return list.filter((_, i) => i % step === 0).slice(0, n)
}
const md = [
  '# Corpus replay: Session Bus shell write targets',
  '',
  `Corpus: ${rows.length} distinct Bash/PowerShell commands (last 30 days, day-job projects excluded).`,
  `Commands with at least one write target: ${withTargets}; targets: ${targets}; replay time ${ms.toFixed(0)} ms (${((ms / rows.length) * 1000).toFixed(1)} µs per command).`,
  '',
  '| via | targets |',
  '|---|---|',
  ...[...byVia].sort((a, b) => b[1] - a[1]).map(([v, n]) => `| ${v} | ${n} |`),
  '',
  `## Targets worth a look (no folder or extension, or stray punctuation): ${odd.length}`,
  '```',
  ...[...new Set(odd)].slice(0, 120),
  '```',
  '',
  ...[...samples].flatMap(([via, list]) => [`## Sample: ${via} (${list.length})`, '```', ...pick(list, 25), '```', '']),
]
writeFileSync(outPath, md.join('\n'))
console.log(md.slice(0, 12).join('\n'))
console.log('odd:', odd.length)
