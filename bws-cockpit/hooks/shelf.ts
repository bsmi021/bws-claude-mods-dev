// Pure helpers for the dashboard's Shelf tab (moved from bws-shelf): the shelf file, adding and closing ideas, the per-project filter and the text views.

export type By = 'user' | 'claude'
export type Status = 'open' | 'done' | 'dropped'

export type Idea = {
  id: number
  text: string
  detail?: string
  by: By
  // The session root the idea was shelved from, forward slashes, no trailing slash.
  project: string
  createdAt: number
  status: Status
  closedAt?: number
}

export type Shelf = { version: 1; nextId: number; ideas: Idea[] }

export const EMPTY: Shelf = { version: 1, nextId: 1, ideas: [] }
export const SHELF_FILE = 'idea-shelf/shelf.json'
export const TEXT_MAX = 300
export const DETAIL_MAX = 2000

export const slash = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')

// Windows paths compare without case.
export const sameProject = (a: string, b: string) => slash(a).toLowerCase() === slash(b).toLowerCase()

export const projectName = (root: string) => slash(root).split('/').pop() || root

// Where the shelf lives: an explicit option, else CLAUDE_CONFIG_DIR, else <home>/.claude.
export function shelfPath(option: string, configDir: string | undefined, home: string | undefined) {
  if (option.trim() !== '') return slash(option.trim())
  if (configDir && configDir.trim() !== '') return `${slash(configDir.trim())}/${SHELF_FILE}`
  if (home && home.trim() !== '') return `${slash(home.trim())}/.claude/${SHELF_FILE}`
  return ''
}

const isIdea = (v: unknown): v is Idea => {
  const i = v as Idea
  return !!i && typeof i.id === 'number' && typeof i.text === 'string' && typeof i.project === 'string'
}

// A missing, empty or damaged file reads as an empty shelf; ideas that don't parse are dropped.
export function parseShelf(text: string | undefined): Shelf {
  if (!text || text.trim() === '') return { ...EMPTY, ideas: [] }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ...EMPTY, ideas: [] }
  }
  const r = raw as Partial<Shelf>
  const ideas = Array.isArray(r.ideas)
    ? r.ideas.filter(isIdea).map(i => ({
        ...i,
        by: i.by === 'claude' ? ('claude' as const) : ('user' as const),
        status: i.status === 'done' || i.status === 'dropped' ? i.status : ('open' as const),
      }))
    : []
  const top = ideas.reduce((m, i) => Math.max(m, i.id), 0)
  const nextId = typeof r.nextId === 'number' && r.nextId > top ? r.nextId : top + 1
  return { version: 1, nextId, ideas }
}

export const serializeShelf = (s: Shelf) => `${JSON.stringify(s, null, 2)}\n`

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s)

export function addIdea(s: Shelf, input: { text: string; detail?: string; by: By; project: string; now: number }) {
  const text = clip(input.text.trim().replace(/\s+/g, ' '), TEXT_MAX)
  const detail = input.detail?.trim() ? clip(input.detail.trim(), DETAIL_MAX) : undefined
  const idea: Idea = { id: s.nextId, text, by: input.by, project: slash(input.project), createdAt: input.now, status: 'open' }
  if (detail) idea.detail = detail
  return { shelf: { ...s, nextId: s.nextId + 1, ideas: [...s.ideas, idea] }, idea }
}

export function setStatus(s: Shelf, id: number, status: Status, now: number) {
  const found = s.ideas.find(i => i.id === id)
  if (!found) return { shelf: s, idea: undefined }
  const { closedAt: _, ...rest } = found
  const idea: Idea = status === 'open' ? { ...rest, status } : { ...rest, status, closedAt: now }
  return { shelf: { ...s, ideas: s.ideas.map(i => (i.id === id ? idea : i)) }, idea }
}

// Open ideas, newest first; one project's, or every project's when `project` is empty.
export function openIdeas(s: Shelf, project: string) {
  return s.ideas.filter(i => i.status === 'open' && (project === '' || sameProject(i.project, project))).sort((a, b) => b.id - a.id)
}

export function age(then: number, now: number) {
  const m = Math.max(0, Math.round((now - then) / 60000))
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  if (h < 48) return `${h}h`
  return `${Math.round(h / 24)}d`
}

export const ideaLine = (i: Idea, now: number, showProject: boolean) =>
  `#${i.id} ${i.text}  (${i.by === 'claude' ? 'Claude' : 'you'}, ${age(i.createdAt, now)}${showProject ? `, ${projectName(i.project)}` : ''})`

export function listText(ideas: Idea[], now: number, showProject: boolean, withDetail: boolean) {
  return ideas
    .map(i => {
      const line = ideaLine(i, now, showProject)
      return withDetail && i.detail ? `${line}\n    ${i.detail.replace(/\n/g, '\n    ')}` : line
    })
    .join('\n')
}

// The Shelf tab's all-projects view: one group per project, this project first, then the project with the newest
// idea. Each group shows at most `perProject` ideas (newest first). Two projects with the same folder name are told
// apart by their full path.
export type IdeaGroup = { project: string; label: string; isHere: boolean; total: number; ideas: Idea[] }

export function groupByProject(ideas: readonly Idea[], here: string, perProject: number): IdeaGroup[] {
  const byKey = new Map<string, Idea[]>()
  for (const i of ideas) {
    const k = slash(i.project).toLowerCase()
    byKey.set(k, [...(byKey.get(k) ?? []), i])
  }
  const groups = [...byKey.values()].map(list => {
    const sorted = [...list].sort((a, b) => b.id - a.id)
    const project = slash(sorted[0]?.project ?? '')
    return { project, isHere: here !== '' && sameProject(project, here), total: sorted.length, ideas: sorted.slice(0, perProject), top: sorted[0]?.id ?? 0 }
  })
  groups.sort((a, b) => Number(b.isHere) - Number(a.isHere) || b.top - a.top)
  const names = groups.map(g => projectName(g.project).toLowerCase())
  return groups.map(({ top: _, ...g }) => ({
    ...g,
    label: names.filter(n => n === projectName(g.project).toLowerCase()).length > 1 ? g.project : projectName(g.project),
  }))
}

// The first line of an idea's detail, for its card.
export const detailLine = (i: Idea) => i.detail?.split('\n').find(l => l.trim() !== '')?.trim() ?? ''

// What Resume puts in the prompt box.
export const resumePrompt = (i: Idea) => `Pick up shelved idea #${i.id}: ${i.text}${i.detail ? `\n\n${i.detail}` : ''}`

// `/shelf all`, `/shelf` → scope; anything else is not a scope word.
export const isAllScope = (args: string) => /^\s*(all|-a|--all)\s*$/i.test(args)

export function contextLine(count: number, tool: string) {
  const ideas = count === 0 ? 'The idea shelf for this project is empty' : `${count} open idea${count === 1 ? '' : 's'} on this project's idea shelf (/shelf)`
  return (
    `${ideas}. When a tangent comes up that would sidetrack the current task (your own idea, or an aside from the user), ` +
    `call ${tool} with it instead of following it, then carry on with the task.`
  )
}
