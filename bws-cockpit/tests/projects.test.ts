import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { findProjects, globRegex, isMarkerGlob, isTooWide, splitGlob } from '../hooks/projects'
import type { ProjectIndex } from '../hooks/projects'

const ROOT = 'C:/Projects'
const BS = String.fromCharCode(92)
const norm = (p: unknown) => String(p).split(BS).join('/').replace(/\/+$/, '')
const win = (p: string) => p.split('/').join(BS)

type Node = { [name: string]: Node | string } // a folder, or a file's text

const TREE: Node = {
  'arena-game': {
    'ArenaGame.uproject': '{}',
    'AGENTS.md': '# rules',
    '.git': {},
    Tools: { 'build-harness': { 'loop.json': '{}' } },
    runs: { '2026-10-01-x': {} },
    Content: { 'Stray.uproject': '{}' }, // skipped folder
  },
  'game.critter': { game: { Critter: { 'Critter.uproject': '{}' } } }, // 3 deep
  'castle-unity': { ProjectSettings: { 'ProjectVersion.txt': 'm_EditorVersion: 6000.6.0f1\n' }, Assets: { deep: {} } },
  portfolio: { 'package.json': '{"name":"portfolio-site"}' },
  'notes-app': { 'settings.gradle.kts': '' },
  'old-drive': { 'RPG Project': { ProjectSettings: { 'ProjectVersion.txt': 'm_EditorVersion: 2021.3.4f1\n' } } },
  deep: { a: { b: { c: { 'TooDeep.uproject': '{}' } } } }, // 4 deep: not indexed
}

const lookup = (path: string): Node | string | undefined => {
  const p = norm(path)
  if (p.toLowerCase() === ROOT.toLowerCase()) return TREE
  if (!p.toLowerCase().startsWith(`${ROOT.toLowerCase()}/`)) return undefined
  let cur: Node | string | undefined = TREE
  for (const seg of p.slice(ROOT.length + 1).split('/')) {
    if (typeof cur !== 'object') return undefined
    const key: string | undefined = Object.keys(cur).find(k => k.toLowerCase() === seg.toLowerCase())
    cur = key === undefined ? undefined : cur[key]
  }
  return cur
}

function world(on: On, cwd = 'C:/Users/dev') {
  mock.clock(on, { now: 50_000_000 })
  mock.store(on)
  const lists: string[] = []
  const bottom: string[] = []
  on('session.cwd', () => ({ value: cwd }))
  on('session.surfaces', () => ({ value: [] as never }))
  on('fs.list', ($, e) => {
    lists.push(norm(e.path))
    const n = lookup(String(e.path))
    if (typeof n !== 'object') throw new Error(`ENOENT ${e.path}`)
    return {
      value: Object.entries(n).map(([name, v]) => ({ name, kind: typeof v === 'object' ? ('dir' as const) : ('file' as const), size: 1, mtimeMs: 1000, isLink: false })),
    }
  })
  on('fs.read', ($, e) => {
    const n = lookup(String(e.path))
    if (typeof n !== 'string') throw new Error(`ENOENT ${e.path}`)
    return { value: n as never }
  })
  on('fs.exists', ($, e) => ({ value: lookup(String(e.path)) !== undefined }))
  on('fs.stat', ($, e) => {
    const n = lookup(String(e.path))
    if (n === undefined) throw new Error(`ENOENT ${e.path}`)
    return { value: { kind: typeof n === 'object' ? 'dir' : 'file', size: 1, mtimeMs: norm(e.path).includes('arena-game') ? 9000 : 2000, isLink: false } as never }
  })
  on('tool.call', ($, e) => {
    bottom.push(String(e.tool))
    return { result: { filenames: ['bottom'], numFiles: 1, durationMs: 20000, truncated: false } as never }
  })
  return { lists, bottom }
}

// ---------- pure ----------

describe('glob rules', () => {
  test('marker globs and their regexes', () => {
    expect(isMarkerGlob('**/*.uproject')).toBe(true)
    expect(isMarkerGlob('*/*.uproject')).toBe(true)
    expect(isMarkerGlob('*.uproject')).toBe(true)
    expect(isMarkerGlob('**/ProjectSettings/ProjectVersion.txt')).toBe(true)
    expect(isMarkerGlob('**/*.ts')).toBe(false)
    expect(isMarkerGlob('Source/**/*.uproject')).toBe(false)
    expect(globRegex('**/*.uproject').test('a/b/c/X.uproject')).toBe(true)
    expect(globRegex('*/*.uproject').test('arena-game/ArenaGame.uproject')).toBe(true)
    expect(globRegex('*/*.uproject').test('game.critter/game/Critter/Critter.uproject')).toBe(false)
  })

  test('splitGlob takes the literal base from an absolute pattern or the path', () => {
    expect(splitGlob('**/*.uproject', 'C:/Projects')).toEqual({ base: 'C:/Projects', rel: '**/*.uproject' })
    expect(splitGlob(`C:${BS}Projects${BS}*${BS}*.uproject`, 'C:/Users/dev')).toEqual({ base: 'C:/Projects', rel: '*/*.uproject' })
  })

  test('home folders, drive roots and parents of a root are too wide', () => {
    expect(isTooWide('C:/Users/dev', [ROOT])).toBe(true)
    expect(isTooWide('C:', [ROOT])).toBe(true)
    expect(isTooWide('/c/Users/dev', [ROOT])).toBe(true)
    expect(isTooWide('C:/Projects/arena-game', [ROOT])).toBe(false)
  })

  test('findProjects matches names loosely and filters by kind', () => {
    const idx: ProjectIndex = {
      at: 0,
      roots: [ROOT],
      projects: [
        { name: 'arena-game', path: `${ROOT}/arena-game`, root: ROOT, kinds: ['unreal'], uprojects: [`${ROOT}/arena-game/ArenaGame.uproject`], loops: [], hasRuns: false, hasAgents: false, mtime: 2 },
        { name: 'castle-unity', path: `${ROOT}/castle-unity`, root: ROOT, kinds: ['unity'], uprojects: [], unity: '6000.6.0f1', loops: [], hasRuns: false, hasAgents: false, mtime: 3 },
      ],
    }
    expect(findProjects(idx, 'arena game').map(p => p.name)).toEqual(['arena-game'])
    expect(findProjects(idx, 'ArenaGame').map(p => p.name)).toEqual(['arena-game'])
    expect(findProjects(idx, '', 'unity').map(p => p.name)).toEqual(['castle-unity'])
    expect(findProjects(idx).map(p => p.name)).toEqual(['castle-unity', 'arena-game'])
  })
})

// ---------- hooks ----------

describe('project locator', () => {
  test('/projects lists the index: kinds, uproject, unity version, package, loops; skip list and depth hold', async ($, on) => {
    world(on)
    const r = await $.command.run({ command: 'projects', args: '' } as never)
    const text = r.text ?? ''
    expect(text).toContain('arena-game · unreal ArenaGame.uproject · loops build-harness')
    expect(text).toContain('game.critter/game/Critter · unreal Critter.uproject')
    expect(text).toContain('castle-unity · unity 6000.6.0f1')
    expect(text).toContain('old-drive/RPG Project · unity 2021.3.4f1')
    expect(text).toContain('portfolio · node portfolio-site')
    expect(text).toContain('notes-app · android')
    expect(text).not.toContain('Stray.uproject')
    expect(text).not.toContain('TooDeep')
    expect(text.indexOf('arena-game')).toBeLessThan(text.indexOf('castle-unity')) // newest first
  })

  test('find_project answers by name and by kind', async ($, on) => {
    world(on)
    const r = await $.tool.call({ tool: 'mcp__bws-cockpit__find_project', query: 'arena game' } as never)
    const text = String(r.result)
    expect(text).toContain(`uproject: ${win(`${ROOT}/arena-game/ArenaGame.uproject`)}`)
    expect(text).toContain('harness loops: build-harness')
    expect(text).toContain('AGENTS/CLAUDE.md: yes')
    const unity = String((await $.tool.call({ tool: 'mcp__bws-cockpit__find_project', kind: 'unity' } as never)).result)
    expect(unity).toContain('castle-unity')
    expect(unity).toContain('old-drive/RPG Project')
    expect(unity).not.toContain('arena-game')
    const none = String((await $.tool.call({ tool: 'mcp__bws-cockpit__find_project', query: 'zzz' } as never)).result)
    expect(none).toMatch(/No project matches "zzz"/)
  })

  test('a uproject Glob under the root is answered from the index, in Glob form', async ($, on) => {
    const w = world(on)
    const r = await $.tool.call({ tool: 'Glob', pattern: '**/*.uproject', path: win(ROOT) })
    expect(r.result).toEqual({
      filenames: [win(`${ROOT}/arena-game/ArenaGame.uproject`), win(`${ROOT}/game.critter/game/Critter/Critter.uproject`)],
      numFiles: 2,
      durationMs: 0,
      truncated: false,
    })
    expect((r.context ?? []).join(' ')).toMatch(/answered this Glob from its project index/)
    const one = await $.tool.call({ tool: 'Glob', pattern: `C:${BS}Projects${BS}*${BS}*.uproject` })
    expect((one.result as { filenames: string[] }).filenames).toEqual([win(`${ROOT}/arena-game/ArenaGame.uproject`)])
    const unity = await $.tool.call({ tool: 'Glob', pattern: '**/ProjectSettings/ProjectVersion.txt', path: ROOT })
    expect((unity.result as { numFiles: number }).numFiles).toBe(2)
    expect(w.bottom).toEqual([])
  })

  test('a marker Glob over the home folder or a drive is refused at once', async ($, on) => {
    const w = world(on)
    const home = await $.tool.call({ tool: 'Glob', pattern: '**/*.uproject', path: 'C:/Users/dev' })
    expect(home.deny ?? home.text ?? '').toMatch(/times out after 20 s.*find_project/)
    const drive = await $.tool.call({ tool: 'Glob', pattern: '*/*.uproject', path: 'C:/' })
    expect(drive.deny ?? drive.text ?? '').toMatch(/find_project/)
    expect(w.bottom).toEqual([])
  })

  test('other Globs, and marker Globs inside a project, run as usual', async ($, on) => {
    const w = world(on)
    await $.tool.call({ tool: 'Glob', pattern: '**/*.ts', path: ROOT })
    await $.tool.call({ tool: 'Glob', pattern: '**/*.uproject', path: `${ROOT}/arena-game` })
    await $.tool.call({ tool: 'Grep', pattern: 'x', path: ROOT } as never)
    expect(w.bottom).toEqual(['Glob', 'Glob', 'Grep'])
  })

  test('the index is cached; /projects refresh rescans', async ($, on) => {
    const w = world(on)
    await $.command.run({ command: 'projects', args: '' } as never)
    const first = w.lists.length
    expect(first).toBeGreaterThan(5)
    await $.tool.call({ tool: 'Glob', pattern: '**/*.uproject', path: ROOT })
    await $.tool.call({ tool: 'mcp__bws-cockpit__find_project', query: 'castle-unity' } as never)
    expect(w.lists.length).toBe(first)
    await $.command.run({ command: 'projects', args: 'refresh' } as never)
    expect(w.lists.length).toBe(first * 2)
  })

  test('a home-folder session gets the project list; a project session does not', async ($, on) => {
    world(on, 'C:/Users/dev')
    on('prompt.context', ($, e) => ({ blocks: e.blocks }))
    const r = await $.prompt.context({ blocks: [] } as never)
    const block = r.blocks.find(b => b.name === 'bwsProjects')
    expect(block?.text).toMatch(/Projects under C:.Projects \(newest first\)/)
    expect(block?.text).toContain('arena-game · unreal ArenaGame.uproject')
  })

  test('a session inside a project gets no project list', async ($, on) => {
    world(on, `${ROOT}/arena-game`)
    on('prompt.context', ($, e) => ({ blocks: e.blocks }))
    const r = await $.prompt.context({ blocks: [] } as never)
    expect(r.blocks.find(b => b.name === 'bwsProjects')).toBeUndefined()
  })

  test('projectLocator: false leaves Globs alone', { options: { projectLocator: false } }, async ($, on) => {
    const w = world(on)
    await $.tool.call({ tool: 'Glob', pattern: '**/*.uproject', path: ROOT })
    await $.tool.call({ tool: 'Glob', pattern: '**/*.uproject', path: 'C:/Users/dev' })
    expect(w.bottom).toEqual(['Glob', 'Glob'])
  })
})
