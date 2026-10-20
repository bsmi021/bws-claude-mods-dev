// The project's document corpus: the .md files under docs/, split by headings, and the excerpt a check sends. The anchor
// documents (a spec, PRD, requirements, architecture or design doc, a GDD; found by name, or the anchorDocs option)
// always send their heading outline; other sections are picked by how many of the turn's words they share. Works for any
// kind of project. Pure: no `$`, so tests call it directly.

export type DocFile = { path: string; text: string }
export type Section = { path: string; heading: string; text: string }

// Anchor names, strongest first. 0: the product's own definition (PRD, GDD, spec, requirements, a design doc, vision).
// 1: supporting authorities (architecture, technical design, any *-spec or SPEC-*).
const ANCHOR_NAMES: readonly RegExp[] = [
  /^(prd|gdd|spec|specs|specification|requirements|design|vision)([\W_].*)?\.md$|^.*[\W_](prd|gdd)\.md$|^(product|game|software)[\W_]?(requirements|design|spec).*\.md$|^design[\W_]?doc.*\.md$/i,
  /^(architecture|technical[\W_]?design|system[\W_]?design|tech[\W_]?spec).*\.md$|^.*[\W_](spec|specification|architecture|design)\.md$/i,
]

// 0 or 1 for an anchor file name (see ANCHOR_NAMES), null for an ordinary doc.
export function anchorRank(name: string): number | null {
  const i = ANCHOR_NAMES.findIndex(r => r.test(name))
  return i < 0 ? null : i
}

// The anchors among the corpus (paths under docs/): the anchor-named files at the shallowest depth any of them has,
// strongest kind first, then the shortest name; at most `max`. A folder of nested specs never crowds out a top-level PRD.
export function pickAnchors(relPaths: readonly string[], max = 3): string[] {
  const named = relPaths.map(p => ({ p, rank: anchorRank(p.split('/').pop() ?? ''), depth: p.split('/').length })).filter(x => x.rank !== null)
  if (named.length === 0) return []
  const top = Math.min(...named.map(x => x.depth))
  return named
    .filter(x => x.depth === top)
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0) || a.p.length - b.p.length || a.p.localeCompare(b.p))
    .slice(0, max)
    .map(x => x.p)
}

// `anchorDocs` option: paths separated by , or ;, relative to the project. Empty entries dropped, slashes forward.
export const parseAnchorDocs = (text: string): string[] =>
  [...new Set(text.split(/[,;]/).map(s => s.trim().replace(/\\/g, '/')).filter(Boolean))]

const HEADING = /^(#{1,4})\s+(.+?)\s*#*\s*$/

// Sections by heading (levels 1-4). Text before the first heading is "(top)". Code fences do not start sections.
export function splitSections(path: string, text: string): Section[] {
  const out: Section[] = []
  let heading = '(top)'
  let lines: string[] = []
  let inFence = false
  const flush = () => {
    const body = lines.join('\n').trim()
    if (body || heading !== '(top)') out.push({ path, heading, text: body })
  }
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence
    const m = inFence ? null : line.match(HEADING)
    if (m) {
      flush()
      heading = m[2] ?? ''
      lines = []
    } else lines.push(line)
  }
  flush()
  return out
}

// The heading outline (levels 1-3), indented, within `max` characters. Deeper levels go first when it does not fit.
export function outline(text: string, max = 2500): string {
  const heads: { level: number; text: string }[] = []
  let inFence = false
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence
    const m = inFence ? null : line.match(HEADING)
    if (m && (m[1] ?? '').length <= 3) heads.push({ level: (m[1] ?? '').length, text: m[2] ?? '' })
  }
  for (const depth of [3, 2, 1]) {
    const kept = heads.filter(h => h.level <= depth).map(h => `${'  '.repeat(h.level - 1)}- ${h.text}`)
    const joined = kept.join('\n')
    if (joined.length <= max) return joined
    if (depth === 1) return joined.slice(0, max)
  }
  return ''
}

const STOP = new Set(
  'about above after again also aren been before being below between both cant could didn does doesn doing down during each from further have haven having here hers herself himself into itself just more most mustn myself only other ought ours ourselves over same shan should shouldn some such than that their theirs them themselves then there these they this those through under until very wasn were weren what when where which while whom will with without would your yours yourself yourselves true false null undefined const return import export function async await type string number boolean value input output file files line lines text make made does done need needs want using used uses use thing things like just will shall into onto http https docs runs'.split(' '),
)

// Words worth matching: 4+ letters, lowercase, camelCase and snake_case and path parts split, stop words dropped.
export function terms(text: string): string[] {
  const spaced = text.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_\-./\\:]+/g, ' ')
  const out = new Set<string>()
  for (const w of spaced.toLowerCase().split(/[^a-z0-9]+/)) {
    if (w.length >= 4 && w.length <= 30 && !/^\d+$/.test(w) && !STOP.has(w)) out.add(w)
  }
  return [...out]
}

export type Excerpt = { path: string; heading: string; text: string; score: number }

// Sections ranked by the query words they contain, each word weighted by how rare it is in the corpus (a word in every
// section says nothing). Ties keep corpus order. Each excerpt is clipped to `perSection`; the set stays within `budget`.
export function pickExcerpts(sections: readonly Section[], query: readonly string[], budget = 7000, perSection = 1400): Excerpt[] {
  if (sections.length === 0 || query.length === 0 || budget <= 0) return []
  const q = new Set(query)
  const sets = sections.map(s => new Set(terms(`${s.heading} ${s.text}`).filter(t => q.has(t))))
  const df = new Map<string, number>()
  for (const set of sets) for (const t of set) df.set(t, (df.get(t) ?? 0) + 1)
  const n = sections.length
  const scored = sections
    .map((s, i) => {
      let score = 0
      for (const t of sets[i] ?? []) score += Math.log(1 + n / (df.get(t) ?? 1))
      return { s, i, score }
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
  const out: Excerpt[] = []
  let used = 0
  for (const { s, score } of scored) {
    const body = s.text.length > perSection ? `${s.text.slice(0, perSection)}...` : s.text
    const cost = body.length + s.heading.length + s.path.length + 8
    if (used + cost > budget) continue
    out.push({ path: s.path, heading: s.heading, text: body, score: Math.round(score * 10) / 10 })
    used += cost
    if (used >= budget - 200) break
  }
  return out
}

// What a check is told about the corpus: which docs exist, the anchors' outlines, then the matched excerpts.
export function corpusText(o: { docs: readonly string[]; anchors: readonly string[]; outline: string; excerpts: readonly Excerpt[] }, maxDocs = 60): string {
  if (o.docs.length === 0) return ''
  const list = o.docs.slice(0, maxDocs).join(', ') + (o.docs.length > maxDocs ? ` (+${o.docs.length - maxDocs} more)` : '')
  const parts = [`Documents: ${list}`]
  if (o.anchors.length > 0) parts.push(`Anchor documents (the authority on what the project is): ${o.anchors.join(', ')}`, o.outline ? `Outline:\n${o.outline}` : '')
  for (const e of o.excerpts) parts.push(`--- ${e.path} § ${e.heading}\n${e.text}`)
  return parts.filter(Boolean).join('\n\n')
}
