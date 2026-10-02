// Project Locator: an index of the projects under the configured roots, and answers from it.
// Pure: no `$`, so tests call it directly. Paths are kept with forward slashes.

export type ProjectEntry = {
  name: string // relative to its root: "street-war", "old-drive/RPG Project"
  path: string // absolute, forward slashes
  root: string
  kinds: string[] // unreal, unity, node, android, python, git
  uprojects: string[] // absolute paths
  unity?: string // editor version
  pkg?: string // package.json name
  loops: string[] // harness loop names (Tools/<name>/loop.json)
  hasRuns: boolean
  hasAgents: boolean // AGENTS.md or CLAUDE.md
  mtime: number
}

export type ProjectIndex = { at: number; roots: string[]; projects: ProjectEntry[] }

export const SCAN_DEPTH = 3

// Folders the scan never enters: build output, engine content, dependencies, run folders.
export const SKIP = new Set(
  ['node_modules', '.git', 'content', 'library', 'intermediate', 'saved', 'deriveddatacache', 'binaries', 'runs', 'plugins',
    'assets', 'packages', 'temp', 'obj', 'build', '.venv', 'venv', 'source', 'logs', 'dist', 'out', '.gradle', '.idea', '.vs'],
)

export const isSkipped = (name: string) => SKIP.has(name.toLowerCase()) || name.startsWith('.')

export const toSlash = (p: string) => p.split(String.fromCharCode(92)).join('/').replace(/\/+$/, '')

export const toWin = (p: string) => p.split('/').join(String.fromCharCode(92))

export const sameDir = (a: string, b: string) => toSlash(a).toLowerCase() === toSlash(b).toLowerCase()

export const parseUnityVersion = (text: string) => text.match(/m_EditorVersion:\s*(\S+)/)?.[1]

export const parsePkgName = (text: string): string | undefined => {
  try {
    const name = (JSON.parse(text) as { name?: unknown }).name
    return typeof name === 'string' ? name : undefined
  } catch {
    return undefined
  }
}

// ---------- Glob over the index ----------

const MARKER_FILE = /^(\*\.uproject|ProjectVersion\.txt)$/i

// A pattern made only of `*` / `**` folder segments (or the ProjectSettings folder) and a marker file.
export const isMarkerGlob = (rel: string) => {
  const segs = toSlash(rel).replace(/^\.\//, '').split('/').filter(Boolean)
  const last = segs[segs.length - 1] ?? ''
  if (!MARKER_FILE.test(last)) return false
  return segs.slice(0, -1).every(s => s === '*' || s === '**' || /^ProjectSettings$/i.test(s))
}

export const globRegex = (rel: string): RegExp => {
  const segs = toSlash(rel).replace(/^\.\//, '').split('/').filter(Boolean)
  let src = ''
  segs.forEach((s, i) => {
    const isLast = i === segs.length - 1
    if (s === '**') {
      src += isLast ? '.*' : '(?:[^/]+/)*'
      return
    }
    src += s.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')
    if (!isLast) src += '/'
  })
  return new RegExp(`^${src}$`, 'i')
}

// Splits a Glob into its literal base folder and the wildcard rest.
export const splitGlob = (pattern: string, path: string): { base: string; rel: string } => {
  const p = toSlash(pattern)
  const isAbs = /^[A-Za-z]:\//.test(p) || p.startsWith('/')
  const full = isAbs ? p : `${toSlash(path)}/${p}`
  const segs = full.split('/')
  const firstWild = segs.findIndex(s => /[*?[{]/.test(s))
  if (firstWild < 0) return { base: segs.slice(0, -1).join('/'), rel: segs[segs.length - 1] ?? '' }
  return { base: segs.slice(0, firstWild).join('/'), rel: segs.slice(firstWild).join('/') }
}

// The marker files under `root` (absolute) as the index knows them.
export const markerFiles = (idx: ProjectIndex, root: string): string[] => {
  const out: string[] = []
  for (const p of idx.projects) {
    if (!sameDir(p.root, root)) continue
    out.push(...p.uprojects)
    if (p.unity !== undefined) out.push(`${p.path}/ProjectSettings/ProjectVersion.txt`)
  }
  return out
}

export const globIndex = (idx: ProjectIndex, root: string, rel: string): string[] => {
  const re = globRegex(rel)
  const prefix = `${toSlash(root)}/`
  return markerFiles(idx, root)
    .filter(f => f.toLowerCase().startsWith(prefix.toLowerCase()) && re.test(f.slice(prefix.length)))
    .sort()
}

// Home folders and drive roots: a marker Glob over them can't finish inside the tool's 20 s.
export const isTooWide = (base: string, roots: string[]) => {
  const b = toSlash(base).toLowerCase()
  if (/^[a-z]:$/.test(b) || b === '' || b === '/' || /^\/[a-z]$/.test(b)) return true
  if (/^([a-z]:|\/[a-z])\/users\/[^/]+$/.test(b)) return true
  return roots.some(r => toSlash(r).toLowerCase().startsWith(`${b}/`))
}

// ---------- queries ----------

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

const haystack = (p: ProjectEntry) =>
  [p.name, p.pkg ?? '', p.unity ? 'unity' : '', ...p.uprojects.map(u => u.split('/').pop() ?? ''), ...p.loops].join(' ')

export const findProjects = (idx: ProjectIndex, query = '', kind = ''): ProjectEntry[] => {
  const k = kind.toLowerCase()
  const words = query.toLowerCase().split(/[\s,]+/).filter(Boolean)
  const scored = idx.projects
    .filter(p => !k || k === 'any' || p.kinds.includes(k))
    .map(p => {
      if (words.length === 0) return { p, score: 1 }
      const hay = squash(haystack(p))
      const name = squash(p.name)
      if (!words.every(w => hay.includes(squash(w)))) return { p, score: 0 }
      const q = squash(query)
      return { p, score: name === q ? 4 : name.includes(q) ? 3 : 2 }
    })
    .filter(x => x.score > 0)
  return scored.sort((a, b) => b.score - a.score || b.p.mtime - a.p.mtime).map(x => x.p)
}

const day = (ms: number) => (ms > 0 ? new Date(ms).toISOString().slice(0, 10) : '-')

export const describeProject = (p: ProjectEntry) => {
  const facts = [
    p.uprojects.length > 0 ? `unreal ${p.uprojects.map(u => u.split('/').pop()).join(', ')}` : '',
    p.unity ? `unity ${p.unity}` : '',
    p.pkg ? `node ${p.pkg}` : '',
    p.kinds.includes('android') ? 'android' : '',
    p.kinds.includes('python') ? 'python' : '',
    p.loops.length > 0 ? `loops ${p.loops.join(', ')}` : '',
  ].filter(Boolean)
  return `${p.name} · ${facts.join(' · ') || p.kinds.join(', ') || 'folder'} · active ${day(p.mtime)} · ${toWin(p.path)}`
}

export const projectsText = (list: ProjectEntry[], max = 40) =>
  list
    .slice(0, max)
    .map(p => `- ${describeProject(p)}`)
    .join('\n') + (list.length > max ? `\n- ... and ${list.length - max} more` : '')

export const findResultText = (idx: ProjectIndex, found: ProjectEntry[], query: string, kind: string) => {
  if (found.length === 0) {
    return `No project matches "${query}"${kind ? ` (kind ${kind})` : ''} under ${idx.roots.map(toWin).join(', ')}. Call again with no query to list them all.`
  }
  const head = found.slice(0, 12).map(p => {
    const lines = [`${p.name}  (${toWin(p.path)})`, `  kinds: ${p.kinds.join(', ') || 'folder'}`]
    if (p.uprojects.length > 0) lines.push(`  uproject: ${p.uprojects.map(toWin).join(', ')}`)
    if (p.unity) lines.push(`  unity editor: ${p.unity}`)
    if (p.pkg) lines.push(`  package: ${p.pkg}`)
    if (p.loops.length > 0) lines.push(`  harness loops: ${p.loops.join(', ')}`)
    lines.push(`  runs/: ${p.hasRuns ? 'yes' : 'no'} · AGENTS/CLAUDE.md: ${p.hasAgents ? 'yes' : 'no'} · active ${day(p.mtime)}`)
    return lines.join('\n')
  })
  return head.join('\n') + (found.length > 12 ? `\n... and ${found.length - 12} more; narrow the query.` : '')
}
