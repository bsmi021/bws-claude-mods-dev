import { atom, read, update } from 'claude-code'
import type { Color, EngineInterface, Register } from 'claude-code'

import type { BoardAskCard, BoardSessionCard, CockpitChip, CockpitDevices, CockpitRun, CockpitState } from '../types'
import {
  LOW_VRAM_CVARS,
  countOpen,
  isBlender,
  isUeGui,
  isUnity,
  parseAdb,
  parseFinish,
  parseNext,
  parseProcs,
  parseUnrealMcpUrl,
  parseVram,
  fit,
  shorten,
} from './lib'
import type { Probe } from './lib'
import { addLowVram, adbNeedsDevice, findUeGuiLaunch, fixUnityLaunch, isUnityPipelineCommand, lowVramArg, normPath } from './shell'
import type { Dialect } from './shell'
import { ago, answerCommand, judge, loopState, loopText, money, parseAnswers, parseNeeds, parseProgress, parseState, withAnswers } from './loop'
import type { LoopConfig, LoopLimits } from './loop'
import type { LoopView } from '../types'
import { actionable, decide, missingRunlogIn, openItems, openSummary, writtenRunFolders } from './finish'
import {
  SCAN_DEPTH,
  findProjects,
  findResultText,
  globIndex,
  isMarkerGlob,
  isSkipped,
  isTooWide,
  parsePkgName,
  parseUnityVersion,
  projectsText,
  sameDir,
  splitGlob,
  toSlash,
  toWin,
} from './projects'
import type { ProjectEntry, ProjectIndex } from './projects'
import { DEFAULT_MODS, modChips, parseMods } from './modchips'
import type { KnownMod } from './modchips'
import { handoffFolder, handoffPrompt, keptName, parseTypes, pinnedModel, startPrompt, transcriptPrompt, transcriptText, words } from './handoff'
import { cacheChip, cacheStatus, liveRecord, noteHandoff, noteTurn, shouldAutoHandoff, statusText } from './cacheclock'
import type { Assumption, DashTab, DashView, ShelfView } from '../types'
import {
  GUIDE,
  TOOL_DESCRIPTION,
  TOOL_NAME,
  TOOL_SCHEMA,
  active,
  add as addAssumption,
  clip,
  listText as assumptionsText,
  markSent,
  ready,
  sent,
  setCorrection,
  setVerdict,
  summary as assumptionsSummary,
  unreviewed,
  verdictPrompt,
} from './assumptions'
import {
  addIdea,
  contextLine,
  ideaLine,
  isAllScope,
  listText as ideasText,
  openIdeas,
  parseShelf,
  projectName,
  resumePrompt as ideaPrompt,
  serializeShelf,
  setStatus,
  shelfPath,
  slash,
} from './shelf'
import type { By, Idea, Shelf, Status } from './shelf'

const dialectOf = (tool: string): Dialect => (tool === 'PowerShell' ? 'powershell' : 'bash')

const view = atom({ plugin: 'bws-cockpit', key: 'view' } as const, null)
const isHidden = atom({ plugin: 'bws-cockpit', key: 'isHidden' } as const, false)
const loops = atom({ plugin: 'bws-cockpit', key: 'loops' } as const, [])
const loopSelected = atom({ plugin: 'bws-cockpit', key: 'loopSelected' } as const, null)
const loopAction = atom({ plugin: 'bws-cockpit', key: 'loopAction' } as const, null)
const stopArmedAt = atom({ plugin: 'bws-cockpit', key: 'stopArmedAt' } as const, null)
const touched = atom({ plugin: 'bws-cockpit', key: 'touched' } as const, null)
// bws-board's own summary of the board (agents, open asks, asks for this session), when it is loaded.
const boardSummary = atom({ plugin: 'bws-board', key: 'summary' } as const, null)
// bws-board's lines for its board, drawn by the dashboard's Board tab.
const boardLines = atom({ plugin: 'bws-board', key: 'lines' } as const, [])
const boardPane = atom({ plugin: 'bws-board', key: 'pane' } as const, null)
// The video-derived mods' summaries (bws-kit/summary.ts), drawn as chips when they are loaded and not idle.
const memorySummary = atom({ plugin: 'bws-memory', key: 'summary' } as const, null)
const diagramSummary = atom({ plugin: 'bws-diagram', key: 'summary' } as const, null)
const skillgateSummary = atom({ plugin: 'bws-skillgate', key: 'summary' } as const, null)
const secretsSummary = atom({ plugin: 'bws-secrets', key: 'summary' } as const, null)
const betterSummary = atom({ plugin: 'bws-better', key: 'summary' } as const, null)
// The cache clock (hooks/cacheclock.ts): the window's last main-loop turn end, and the chip the bar draws from it.
const cacheClock = atom({ plugin: 'bws-cockpit', key: 'cacheClock' } as const, null)
const cacheBar = atom({ plugin: 'bws-cockpit', key: 'cacheBar' } as const, null)

// ---------- Dashboard: one pane with its own tabs (Assumptions, Shelf, Board, Loop while one is live) ----------

const DASH = 'dashboard'
const DASH_TITLE = 'Dashboard'
const TABS: DashTab[] = ['assumptions', 'shelf', 'board', 'loop']
const TAB_LABEL: Record<DashTab, string> = { assumptions: 'Assumptions', shelf: 'Shelf', board: 'Board', loop: 'Loop' }
const ASSUMPTION_TOOL = `mcp__bws-cockpit__${TOOL_NAME}`
const TOOL_SHELVE = 'mcp__bws-cockpit__shelve_idea'
const TOOL_LIST = 'mcp__bws-cockpit__list_ideas'
const TOOL_CLOSE = 'mcp__bws-cockpit__close_idea'
const SHELF_SHOWN = 8
const SHELF_IDLE: ShelfView = { isAll: false, root: '', ideas: [], now: 0, note: '', count: 0 }

const assumptions = atom({ plugin: 'bws-cockpit', key: 'assumptions' } as const, [] as Assumption[])
const dash = atom({ plugin: 'bws-cockpit', key: 'dash' } as const, { tab: null, isClosedByPerson: false } as DashView)
const shelf = atom({ plugin: 'bws-cockpit', key: 'shelf' } as const, SHELF_IDLE)
const handoffNudge = atom({ plugin: 'bws-cockpit', key: 'handoffNudge' } as const, null)

// Corrections typed but not yet saved with Enter, so Send still carries them. Lost on a reload, by design.
const drafts = new Map<number, string>()
// The shelf file option, read once in register.
let shelfOption = ''
// bws-board's last asks-for-this-session count, so a rise raises the Board tab (undefined until its first write).
let lastAskedOfMe: number | undefined
// Between a submitted prompt and its turn's end: a bar Enhance then waits for the turn.
let isTurnActive = false
const STOP_CONFIRM_MS = 10_000
const RECENT_MS = 24 * 60 * 60 * 1000 // a loop whose state changed in the last day counts as recent
const UNIT_COLOR: Record<string, string | undefined> = { DONE: 'success', RUNNING: 'success', PAUSED: 'warning', STOPPED: undefined, PENDING: undefined }
const UNIT_MARK: Record<string, string> = { DONE: '✓', RUNNING: '●', PAUSED: '◆', STOPPED: '■', PENDING: '○' }

// Alerts already toasted in this module's life, so each toasts once.
const toasted = new Set<string>()
let isFirstLoopScan = true

// Finish-Line Guard: stops blocked since the person's last prompt. Reset by prompt.submit, so it can never loop.
let continuesUsed = 0

// Theme keys, so the band follows the person's theme; `off` draws dim instead.
const STATE_COLOR: Record<CockpitState, string | undefined> = { good: 'success', warn: 'warning', bad: 'error', off: undefined }
const GUARD_NOTE_MS = 10 * 60 * 1000

const PS_PROCS =
  "Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('UnrealEditor.exe','Unity.exe','blender.exe') } | " +
  "ForEach-Object { '{0}|{1}|{2}' -f $_.Name, $_.ProcessId, $_.CommandLine }"

type Options = {
  guard: boolean
  lowVramMode: string
  vramThresholdMb: number
  cvars: readonly string[]
  adbPath: string
  refreshSeconds: number
  isBackgroundProbe: boolean
  loop: LoopLimits
  finish: { isOn: boolean; maxContinues: number; evidenceCheck: boolean; runlogCheck: boolean; isHeadless: boolean; owner: string }
  projects: { isOn: boolean; roots: string[] }
  pin: { model: string; types: string[] }
  isShelfNudge: boolean
  isDashboardOnStart: boolean
  handoffNudgePercent: number
  mods: KnownMod[]
  cache: { ttlMs: number; lowMs: number; isAutoHandoff: boolean }
}

// Module state: a probe cache shared by the band and the guards. A reload starts it over.
let cached: Probe | undefined
let probing: Promise<Probe> | undefined

const joinPath = (dir: string, name: string) => `${dir.replace(/[\\/]+$/, '')}/${name}`

const settle = async <T,>(p: Promise<T>): Promise<T | undefined> => {
  try {
    return await p
  } catch {
    return undefined
  }
}

async function readMcpJson($: EngineInterface): Promise<string | undefined> {
  const cwd = await $.session.cwd()
  return settle($.fs.read(joinPath(cwd, '.mcp.json')))
}

async function isPortUp($: EngineInterface, url: string): Promise<boolean> {
  // Any HTTP answer means the server listens; a refused or timed-out connect means down.
  // A JSON-RPC ping by POST: a GET can open an SSE stream that never ends on some servers.
  const ping = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'bws-cockpit-ping', method: 'ping' }),
  }
  const answered = settle($.http.fetch(url, ping)).then(r => r !== undefined)
  const timeout = $.clock.sleep(3000).then(() => false)
  return Promise.race([answered, timeout])
}

async function runProbe($: EngineInterface, o: Options, server?: string): Promise<Probe> {
  const procsRun = settle($.process.run(['powershell', '-NoProfile', '-NonInteractive', '-Command', PS_PROCS], { timeoutMs: 15000 }))
  const vramRun = settle($.process.run(['nvidia-smi', '--query-gpu=memory.used,memory.total', '--format=csv,noheader,nounits'], { timeoutMs: 10000 }))
  const adbRun = settle($.process.run([o.adbPath, 'devices'], { timeoutMs: 10000 }))
  const mcpJson = await readMcpJson($)
  const url = mcpJson === undefined ? undefined : parseUnrealMcpUrl(mcpJson, server)
  const upRun = url === undefined ? Promise.resolve(undefined) : isPortUp($, url)
  const [procs, vram, adb, isUp] = await Promise.all([procsRun, vramRun, adbRun, upRun])
  return {
    at: await $.clock.now(),
    procs: procs ? parseProcs(procs.stdout) : [],
    vram: vram && vram.exitCode === 0 ? parseVram(vram.stdout) : undefined,
    adb: adb && adb.exitCode === 0 ? parseAdb(adb.stdout) : undefined,
    ueMcp: url === undefined ? undefined : { url, isUp: isUp === true },
  }
}

// A probe no older than maxAgeMs; calls made while one runs share it.
async function probe($: EngineInterface, o: Options, maxAgeMs: number, server?: string): Promise<Probe> {
  const now = await $.clock.now()
  if (server === undefined && cached && now - cached.at <= maxAgeMs) return cached
  if (server === undefined && probing) return probing
  const p = runProbe($, o, server)
  if (server === undefined) probing = p
  try {
    const fresh = await p
    if (server === undefined) cached = fresh
    return fresh
  } finally {
    if (server === undefined) probing = undefined
  }
}

const isPressure = (p: Probe, o: Options) =>
  o.lowVramMode === 'always' ||
  (o.lowVramMode === 'auto' &&
    (p.procs.some(isUeGui) || p.procs.some(isBlender) || (p.vram !== undefined && p.vram.usedMb >= o.vramThresholdMb)))

const vramText = (p: Probe) => (p.vram ? `${(p.vram.usedMb / 1024).toFixed(1)}/${(p.vram.totalMb / 1024).toFixed(1)} GB` : 'n/a')

const describeDevices = (p: Probe, o: Options): CockpitDevices => {
  const pressure = isPressure(p, { ...o, lowVramMode: o.lowVramMode === 'off' ? 'auto' : o.lowVramMode })
  const ue = p.procs.filter(isUeGui).length
  const port = p.ueMcp?.url.match(/:(\d+)/)?.[1]
  const count = ue > 1 ? `×${ue}` : undefined
  const chips: CockpitChip[] = []
  if (ue === 0) chips.push({ label: 'UE', word: 'off', state: 'off' })
  else if (p.ueMcp && !p.ueMcp.isUp) chips.push({ label: 'UE', detail: [count, port && `:${port} down`].filter(Boolean).join(' '), word: 'mcp down', state: 'bad' })
  else chips.push({ label: 'UE', detail: [count, port && `:${port}`].filter(Boolean).join(' ') || undefined, word: 'up', state: 'good' })
  const unity = p.procs.some(isUnity)
  chips.push({ label: 'Unity', word: unity ? 'open' : 'off', state: unity ? 'good' : 'off' })
  const blender = p.procs.some(isBlender)
  chips.push({ label: 'Blender', word: blender ? 'open' : 'off', state: blender ? 'good' : 'off' })
  if (p.adb) {
    const { ready, other } = p.adb
    if (ready.length > 0) chips.push({ label: 'adb', detail: ready.length > 1 ? `×${ready.length}` : undefined, word: 'ready', state: 'good' })
    else if (other.length > 0) chips.push({ label: 'adb', detail: other[0]?.split(' ').slice(1).join(' '), word: 'not ready', state: 'warn' })
    else chips.push({ label: 'adb', word: 'none', state: 'off' })
  }
  if (p.vram) chips.push({ label: 'VRAM', detail: vramText(p), word: pressure ? 'pressure' : 'ok', state: pressure ? 'warn' : 'good' })
  return { chips, isPressure: pressure }
}

const devicesText = (d: CockpitDevices) =>
  d.chips.map(c => (c.label === 'VRAM' ? `VRAM ${c.detail}${c.state === 'warn' ? ' (pressure)' : ''}` : `${c.label} ${c.word}${c.detail ? ` ${c.detail}` : ''}`)).join(' · ')

// The newest run folder under <cwd>/runs, by its RUNLOG/PLAN/TASKS times.
type RunFolder = { folder: string; mtime: number; runlog: string; plan: string; tasks: string }

async function findRun($: EngineInterface): Promise<CockpitRun | null> {
  const r = await readRunFolder($)
  if (!r) return null
  return {
    folder: r.folder,
    next: parseNext(r.runlog) ?? parseNext(r.tasks) ?? parseNext(r.plan),
    finish: parseFinish(r.plan) ?? parseFinish(r.runlog),
    open: countOpen(r.plan) + countOpen(r.tasks),
  }
}

// The newest run folder under <cwd>/runs, by its RUNLOG/PLAN/TASKS times, with their text.
// With `only`, just among those folder names.
async function readRunFolder($: EngineInterface, only?: readonly string[]): Promise<RunFolder | null> {
  const cwd = await $.session.cwd()
  const runsDir = joinPath(cwd, 'runs')
  const entries = await settle($.fs.list(runsDir))
  if (!entries) return null
  const wanted = only === undefined ? undefined : new Set(only.map(n => n.toLowerCase()))
  const dirs = entries
    .filter(d => d.kind === 'dir' && (wanted === undefined || wanted.has(d.name.toLowerCase())))
    .map(d => d.name)
    .sort()
    .reverse()
    .slice(0, 12)
  let best: { name: string; mtime: number; files: string[] } | undefined
  for (const name of dirs) {
    const files = (await settle($.fs.list(joinPath(runsDir, name)))) ?? []
    const tracked = files.filter(f => f.kind === 'file' && /^(RUNLOG|PLAN|TASKS)\.md$/i.test(f.name))
    if (tracked.length === 0) continue
    const mtime = Math.max(...tracked.map(f => f.mtimeMs))
    if (!best || mtime > best.mtime) best = { name, mtime, files: tracked.map(f => f.name) }
  }
  if (!best) return null
  const text = async (file: string) => {
    const hit = best?.files.find(f => f.toLowerCase() === file.toLowerCase())
    return hit ? ((await settle($.fs.read(joinPath(joinPath(runsDir, best!.name), hit)))) ?? '') : ''
  }
  const [runlog, plan, tasks] = await Promise.all([text('RUNLOG.md'), text('PLAN.md'), text('TASKS.md')])
  return { folder: `runs/${best.name}`, mtime: best.mtime, runlog, plan, tasks }
}

// ---------- Finish-Line Guard ----------

// ---------- Project Locator: index ----------

const INDEX_KEY = 'bws-cockpit.projectIndex'
const INDEX_MAX_AGE_MS = 6 * 60 * 60 * 1000
let indexing: Promise<ProjectIndex> | undefined

const isHomeDir = (dir: string) => /^([a-z]:|\/[a-z])\/users\/[^/]+$/i.test(toSlash(dir))

async function scanDir($: EngineInterface, root: string, dir: string, name: string, depth: number, out: ProjectEntry[]) {
  const entries = (await settle($.fs.list(dir))) ?? []
  const files = new Set(entries.filter(f => f.kind === 'file').map(f => f.name.toLowerCase()))
  const dirs = entries.filter(d => d.kind === 'dir')
  const uprojects = entries.filter(f => f.kind === 'file' && /\.uproject$/i.test(f.name)).map(f => `${dir}/${f.name}`)
  const unity = dirs.some(d => /^ProjectSettings$/i.test(d.name))
    ? parseUnityVersion((await settle($.fs.read(`${dir}/ProjectSettings/ProjectVersion.txt`))) ?? '')
    : undefined
  if (depth === 1 || uprojects.length > 0 || unity !== undefined) {
    const pkg = files.has('package.json') ? (parsePkgName((await settle($.fs.read(`${dir}/package.json`))) ?? '') ?? '(unnamed)') : undefined
    const kinds = [
      uprojects.length > 0 ? 'unreal' : '',
      unity !== undefined ? 'unity' : '',
      pkg !== undefined ? 'node' : '',
      files.has('settings.gradle') || files.has('settings.gradle.kts') ? 'android' : '',
      files.has('pyproject.toml') ? 'python' : '',
      dirs.some(d => d.name === '.git') || files.has('.git') ? 'git' : '',
    ].filter(Boolean)
    const loops: string[] = []
    for (const t of dirs.filter(d => /^tools$/i.test(d.name))) {
      for (const h of ((await settle($.fs.list(`${dir}/${t.name}`))) ?? []).filter(d => d.kind === 'dir')) {
        if (await settle($.fs.exists(`${dir}/${t.name}/${h.name}/loop.json`))) loops.push(h.name)
      }
    }
    const hasRuns = dirs.some(d => /^runs$/i.test(d.name))
    const stamps = [
      (await settle($.fs.stat(dir)))?.mtimeMs ?? 0,
      hasRuns ? ((await settle($.fs.stat(`${dir}/runs`)))?.mtimeMs ?? 0) : 0,
      ...entries.filter(f => f.kind === 'file').map(f => f.mtimeMs),
    ]
    out.push({
      name,
      path: dir,
      root,
      kinds,
      uprojects,
      unity,
      pkg,
      loops,
      hasRuns,
      hasAgents: files.has('agents.md') || files.has('claude.md'),
      mtime: Math.max(0, ...stamps),
    })
  }
  if (depth >= SCAN_DEPTH) return
  for (const d of dirs) {
    if (isSkipped(d.name) || /^(ProjectSettings|tools)$/i.test(d.name)) continue
    await scanDir($, root, `${dir}/${d.name}`, `${name}/${d.name}`, depth + 1, out)
  }
}

async function scanProjects($: EngineInterface, roots: string[]): Promise<ProjectIndex> {
  const projects: ProjectEntry[] = []
  for (const root of roots) {
    const top = (await settle($.fs.list(root))) ?? []
    for (const d of top.filter(x => x.kind === 'dir' && !isSkipped(x.name))) {
      await scanDir($, root, `${root}/${d.name}`, d.name, 1, projects)
    }
  }
  return { at: await $.clock.now(), roots, projects }
}

// The index from $.store when it is fresh and for the same roots; otherwise one shared scan.
async function getIndex($: EngineInterface, o: Options, force = false): Promise<ProjectIndex> {
  const now = await $.clock.now()
  if (!force) {
    const stored = (await settle($.store.get(INDEX_KEY))) as ProjectIndex | undefined
    const isSameRoots = stored?.roots?.join(';').toLowerCase() === o.projects.roots.join(';').toLowerCase()
    if (stored && isSameRoots && now - stored.at < INDEX_MAX_AGE_MS) return stored
  }
  if (!indexing) {
    indexing = scanProjects($, o.projects.roots).finally(() => {
      indexing = undefined
    })
  }
  const idx = await indexing
  await settle($.store.set(INDEX_KEY, idx))
  return idx
}

// Records the run folders this conversation's own tool calls wrote to, keyed by its start, so a
// folder a harness worker writes never counts as the supervising session's.
async function noteTouched($: EngineInterface, folders: string[]) {
  const { startedAt } = await $.session.usage()
  await update($, touched, t => {
    const kept = t !== null && t.startedAt === startedAt ? t.folders : []
    return { startedAt, folders: [...new Set([...kept, ...folders])].slice(-20) }
  })
}

// This session's run folder: the newest one its own tool calls wrote to, or null.
async function sessionRunFolder($: EngineInterface): Promise<RunFolder | null> {
  const t = await read($, touched)
  const { startedAt } = await $.session.usage()
  if (t === null || t.startedAt !== startedAt || t.folders.length === 0) return null
  return readRunFolder($, t.folders)
}

// This session's run folder and its actionable open items.
async function sessionFinishLine($: EngineInterface, owner: string): Promise<{ folder: string; open: string[] } | null> {
  const r = await sessionRunFolder($)
  if (!r) return null
  return { folder: r.folder, open: actionable([...openItems(r.plan), ...openItems(r.tasks)], owner) }
}

// A run folder this session's own tool calls wrote that has no RUNLOG.md ("runs/<name>"), or null.
// Harness report folders (-harness, -sessions) are exempt; a folder that no longer exists is skipped.
async function missingRunlogFolder($: EngineInterface): Promise<string | null> {
  const t = await read($, touched)
  const { startedAt } = await $.session.usage()
  if (t === null || t.startedAt !== startedAt || t.folders.length === 0) return null
  const runsDir = joinPath(await $.session.cwd(), 'runs')
  const files: Record<string, string[] | null> = {}
  for (const name of t.folders) {
    const list = await settle($.fs.list(joinPath(runsDir, name)))
    files[name] = list ? list.filter(f => f.kind === 'file').map(f => f.name) : null
  }
  const name = missingRunlogIn(files)
  return name === null ? null : `runs/${name}`
}

async function refresh($: EngineInterface, o: Options, maxAgeMs: number) {
  const [run, p] = await Promise.all([findRun($), probe($, o, maxAgeMs), refreshLoops($, o)])
  const devices = describeDevices(p, o)
  await update($, view, v => ({ run, devices, lastGuard: v?.lastGuard ?? null, lastGuardAt: v?.lastGuardAt ?? null }))
}

// ---------- Loop Watch ----------

const parseJson = <T,>(text: string | undefined): T | undefined => {
  if (text === undefined) return undefined
  try {
    return JSON.parse(text) as T
  } catch {
    return undefined
  }
}

// Every harness-loop under <cwd>/Tools/<name>/loop.json with a state.json, newest state first.
async function findLoops($: EngineInterface, o: Options): Promise<LoopView[]> {
  const cwd = await $.session.cwd()
  const now = await $.clock.now()
  const top = (await settle($.fs.list(cwd))) ?? []
  const found: LoopView[] = []
  for (const toolsDir of top.filter(d => d.kind === 'dir' && /^tools$/i.test(d.name))) {
    const toolsPath = joinPath(cwd, toolsDir.name)
    for (const h of ((await settle($.fs.list(toolsPath))) ?? []).filter(d => d.kind === 'dir')) {
      const cfg = parseJson<LoopConfig>(await settle($.fs.read(joinPath(joinPath(toolsPath, h.name), 'loop.json'))))
      if (!cfg?.harnessDir) continue
      const statePath = joinPath(joinPath(cwd, cfg.harnessDir), 'state.json')
      const stat = await settle($.fs.stat(statePath))
      const text = stat ? await settle($.fs.read(statePath)) : undefined
      if (!stat || text === undefined) continue
      const base = parseState(text, cfg, `${toolsDir.name}/${h.name}/harness.py`, stat.mtimeMs)
      if (!base) continue
      const units = await Promise.all(
        base.units.map(async u => {
          if (!u.folder) return u
          const prog = parseProgress((await settle($.fs.read(joinPath(joinPath(cwd, u.folder), 'TASKS.md')))) ?? '')
          return prog ? { ...u, tasksDone: prog.done, tasksTotal: prog.total } : u
        }),
      )
      const cur = units.find(u => u.id === base.current)
      const isPaused = base.driver.status === 'PAUSED' || cur?.status === 'PAUSED'
      const curDir = cur?.folder ? joinPath(cwd, cur.folder) : null
      const needs =
        isPaused && curDir
          ? withAnswers(
              parseNeeds((await settle($.fs.read(joinPath(curDir, 'TASKS.md')))) ?? ''),
              parseAnswers((await settle($.fs.read(joinPath(curDir, 'ANSWERS.md')))) ?? ''),
            )
          : []
      const partial = { ...base, units, needs }
      found.push({ ...partial, alerts: judge(partial, now, o.loop) })
    }
  }
  return found.sort((a, b) => b.stateMtime - a.stateMtime)
}

async function refreshLoops($: EngineInterface, o: Options) {
  const found = await findLoops($, o)
  await update($, loops, () => found)
  const now = await $.clock.now()
  for (const lp of found) {
    if (now - lp.stateMtime > RECENT_MS) continue
    for (const a of lp.alerts) {
      if (toasted.has(a.key)) continue
      toasted.add(a.key)
      // A loop that was already complete when the session opened is old news.
      if (a.level === 'info' && isFirstLoopScan) continue
      $.ui.toast(`loop ${lp.name}: ${a.text}`, { timeoutMs: 8000 })
      // News for the person: bring the Loop tab up, on this loop.
      await update($, loopSelected, () => lp.name)
      await settle(raise($, 'loop'))
    }
  }
  isFirstLoopScan = false
}

async function selectedLoop($: EngineInterface): Promise<LoopView | null> {
  const list = await read($, loops)
  const pick = await read($, loopSelected)
  return list.find(l => l.name === pick) ?? list[0] ?? null
}

async function runLoopCommand($: EngineInterface, o: Options, lp: LoopView, kind: 'stop' | 'resume') {
  const cwd = await $.session.cwd()
  const argv = kind === 'stop' ? ['python', lp.harnessPy, 'stop'] : ['python', lp.harnessPy, 'start', '--resume']
  const at = await $.clock.now()
  const ran = await settle($.process.run(argv, { cwd, timeoutMs: 120_000 }))
  const out = ran ? `${ran.stdout}\n${ran.stderr}`.trim().split(/\r?\n/).filter(Boolean).slice(-2).join(' | ') : ''
  const isError = !ran || ran.exitCode !== 0
  const text = ran ? `${kind} ${lp.name}: exit ${ran.exitCode}${out ? `: ${out}` : ''}` : `${kind} ${lp.name}: could not run python ${lp.harnessPy}`
  await update($, loopAction, () => ({ text, at, isError }))
  await update($, stopArmedAt, () => null)
  $.ui.toast(text, { timeoutMs: 8000 })
  await refreshLoops($, o)
}

// Records the user's answer with `harness.py answer` (argv, no shell, so any quotes pass as typed), then refreshes.
async function answerNeed($: EngineInterface, o: Options, lp: LoopView, unit: string, need: string, value: string) {
  const at = await $.clock.now()
  const text = value.trim()
  if (text.length === 0) {
    await update($, loopAction, () => ({ text: `answer ${unit} ${need}: empty, nothing sent`, at, isError: true }))
    return
  }
  const cwd = await $.session.cwd()
  const ran = await settle($.process.run(['python', lp.harnessPy, 'answer', unit, need, text], { cwd, timeoutMs: 60_000 }))
  const out = ran ? `${ran.stdout}\n${ran.stderr}`.trim().split(/\r?\n/).filter(Boolean).slice(-1).join('') : ''
  const isError = !ran || ran.exitCode !== 0
  const note = ran
    ? `answer ${unit} ${need}: ${isError ? `exit ${ran.exitCode}` : 'recorded'}${out ? `: ${out}` : ''}`
    : `answer ${unit} ${need}: could not run python ${lp.harnessPy}`
  await update($, loopAction, () => ({ text: note, at, isError }))
  $.ui.toast(note, { timeoutMs: 8000 })
  await refreshLoops($, o)
}

// Stop only on a second press within STOP_CONFIRM_MS.
async function pressStop($: EngineInterface, o: Options, lp: LoopView) {
  const now = await $.clock.now()
  const armed = await read($, stopArmedAt)
  if (armed !== null && now - armed < STOP_CONFIRM_MS) {
    await runLoopCommand($, o, lp, 'stop')
    return
  }
  await update($, stopArmedAt, () => now)
}

async function noteGuard($: EngineInterface, text: string) {
  $.ui.toast(`bws-cockpit: ${text}`)
  const at = await $.clock.now()
  await update($, view, v => ({ run: v?.run ?? null, devices: v?.devices ?? null, lastGuard: text, lastGuardAt: at }))
}

const runSummary = (run: CockpitRun | null) =>
  run === null
    ? 'No run folder with RUNLOG.md, PLAN.md or TASKS.md under runs/.'
    : [
        `Run: ${run.folder}`,
        run.finish ? `Finish line: ${run.finish}` : undefined,
        `Next: ${run.next ?? '(no next step recorded in RUNLOG)'}`,
        `Open items: ${run.open}`,
      ]
        .filter(Boolean)
        .join('\n')

const resumePrompt = (run: CockpitRun) =>
  `Resume run ${run.folder}. Read RUNLOG.md, PLAN.md and TASKS.md in that folder (whichever exist), ` +
  `restate the finish line and the next step in two lines, check what is actually done against the receipts, then continue from the next step.`

async function submitResume($: EngineInterface, run: CockpitRun) {
  try {
    await $.prompt.submit({ text: resumePrompt(run), asUser: true })
  } catch {
    $.ui.toast(`bws-cockpit: could not queue the resume prompt for ${run.folder}`)
  }
}

async function resume($: EngineInterface): Promise<string | undefined> {
  const run = await findRun($)
  if (run === null) return runSummary(run)
  await submitResume($, run)
  return undefined
}

// Adds a note the model reads after the tool result, so a rewrite is never silent.
const withNote = <R extends { deny?: string; context?: readonly string[] }>(r: R, note: string): R =>
  r.deny !== undefined ? r : { ...r, context: [...(r.context ?? []), `bws-cockpit: ${note}`] }

const str = (v: unknown) => (typeof v === 'string' ? v : '')

// ---------- /handoff ----------

// Writes HANDOFF.md into this session's run folder (as the Finish-Line Guard sees it), never one a worker freshened.
const WRITTEN = 'Handoff written:' // the first words of a successful writeHandoff reply

// `isAuto`: written by the cache clock. It does not copy the start prompt, and it counts as this window's handoff.
async function writeHandoff($: EngineInterface, focus: string, how: { isAuto?: boolean } = {}): Promise<string> {
  const cwd = await $.session.cwd()
  const now = await $.clock.now()
  const run = await sessionRunFolder($)
  const folder = run !== null ? run.folder : handoffFolder(now)
  $.ui.toast(`handoff: writing ${folder}/HANDOFF.md`, { timeoutMs: 4000 })
  let r = await $.model.fork({ prompt: handoffPrompt(folder, focus) })
  // A resumed session has a transcript but nothing to fork until its first request: build from the rows instead.
  if (!r.isAnswered && r.reason === 'nothing-to-fork') {
    const rows = (await settle($.session.messages())) ?? []
    const transcript = transcriptText(rows)
    if (transcript.length === 0) return 'No handoff written: there is nothing to hand off yet: this conversation has no messages.'
    r = await $.model.complete({ model: await $.session.model(), prompt: transcriptPrompt(transcript, folder, focus), maxTokens: 3000 })
  }
  if (!r.isAnswered) return `No handoff written: the model call failed (${r.reason}).`
  const body = r.text.trim()
  if (body.length === 0) return 'No handoff written: the model returned an empty reply.'
  const path = joinPath(cwd, `${folder}/HANDOFF.md`)
  const previous = await settle($.fs.read(path))
  const kept = previous !== undefined ? keptName(now) : null
  if (kept !== null) await $.fs.write(joinPath(cwd, `${folder}/${kept}`), previous ?? '')
  await $.fs.write(path, `${body}\n`)
  await update($, handoffNudge, h => (h === null ? h : { ...h, isDone: true }))
  const startedAt = (await $.session.usage()).startedAt
  const at = await $.clock.now()
  await update($, cacheClock, rec => noteHandoff(rec, startedAt, at, how.isAuto === true))
  const start = startPrompt(folder)
  const surfaces = await $.session.surfaces()
  const copied = how.isAuto !== true && surfaces.length > 0 && (await settle($.ui.copy({ text: start })))?.isCopied === true
  return (
    `${WRITTEN} ${folder}/HANDOFF.md (${words(body)} words)` +
    (kept !== null ? `; the previous one is kept as ${folder}/${kept}` : '') +
    `.\nStart the next session with this prompt${copied ? ' (copied to the clipboard)' : ''}:\n${start}`
  )
}

// Once per session, when the context passes the threshold: a toast, and Handoff highlighted on the bar until it runs.
async function nudgeHandoff($: EngineInterface, atPercent: number) {
  if (atPercent <= 0) return
  const u = await $.session.usage()
  const percent = u.context.percent
  if (percent === undefined || percent < atPercent) return
  const h = await read($, handoffNudge)
  if (h !== null && h.startedAt === u.startedAt) return
  await update($, handoffNudge, () => ({ startedAt: u.startedAt, isDone: false }))
  $.ui.toast(`context at ${percent}%: time for a handoff (/handoff, or h on the bar)`, { timeoutMs: 10000 })
}

async function isNudged($: EngineInterface) {
  const h = await read($, handoffNudge)
  return h !== null && !h.isDone && h.startedAt === (await $.session.usage()).startedAt
}

// ---------- Cache clock (hooks/cacheclock.ts) ----------

// A main-loop turn ended: the cache was just written or read, so the window restarts here.
async function stampTurn($: EngineInterface, o: Options) {
  const startedAt = (await $.session.usage()).startedAt
  const now = await $.clock.now()
  await update($, cacheClock, rec => noteTurn(rec, startedAt, now))
  await syncCache($, o)
}

// /cacheclock: the clock as of now, its TTL and threshold, and when the last auto handoff was written.
async function cacheText($: EngineInterface, o: Options) {
  const startedAt = (await $.session.usage()).startedAt
  const rec = await read($, cacheClock)
  const status = cacheStatus(rec, startedAt, await $.clock.now(), o.cache.ttlMs, o.cache.lowMs)
  return statusText(status, o.cache.ttlMs, o.cache.lowMs, { isOn: o.cache.isAutoHandoff, at: liveRecord(rec, startedAt)?.autoHandoffAt ?? null })
}

// Redraws the chip, and only when its text changed, so the minute tick re-renders the bar about once a minute.
// Then the auto handoff: the cache has just run low, nobody is mid-turn, and a turn has happened since the last handoff.
async function syncCache($: EngineInterface, o: Options) {
  const startedAt = (await $.session.usage()).startedAt
  const now = await $.clock.now()
  const rec = await read($, cacheClock)
  const status = cacheStatus(rec, startedAt, now, o.cache.ttlMs, o.cache.lowMs)
  const chip = cacheChip(status)
  const prev = await read($, cacheBar)
  if (prev?.text !== chip?.text || prev?.state !== chip?.state) await update($, cacheBar, () => chip)
  const turns = liveRecord(rec, startedAt)?.turns ?? 0
  if (!shouldAutoHandoff({ isOn: o.cache.isAutoHandoff, status, isTurnActive, turns })) return
  // The turn count resets before the write, so a failed attempt is not retried every minute.
  await update($, cacheClock, r => noteHandoff(r, startedAt, now, false))
  const line = (await writeHandoff($, '', { isAuto: true })).split('\n')[0] ?? ''
  $.ui.toast(`cache clock: ${line}`, { timeoutMs: 8000 })
  // FR-ALL-03: a failed attempt leaves one debug line. It holds the reply's first line only, never the prompt.
  if (!line.startsWith(WRITTEN)) $.ui.log(`cache clock: ${line}`, { to: 'debug' })
}

// ---------- Shelf (moved from bws-shelf; the same shelf file) ----------

async function shelfFile($: EngineInterface) {
  const path = shelfPath(shelfOption, await $.env.get('CLAUDE_CONFIG_DIR'), (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')))
  if (path === '') throw new Error('no home folder: set the shelfPath option')
  return path
}

// Always from disk: another session may have written since.
async function loadShelf($: EngineInterface): Promise<Shelf> {
  const path = await shelfFile($)
  if (!(await $.fs.exists(path))) return parseShelf(undefined)
  return parseShelf(String(await $.fs.read(path)))
}

// Read, change, write back at once, so concurrent sessions lose nothing but a same-instant race.
async function changeShelf<T>($: EngineInterface, fn: (s: Shelf, now: number) => { shelf: Shelf; idea: T }) {
  const now = await $.clock.now()
  const r = fn(await loadShelf($), now)
  await $.fs.write(await shelfFile($), serializeShelf(r.shelf))
  return r.idea
}

async function sessionRoot($: EngineInterface) {
  return slash(await $.session.root())
}

async function shelve($: EngineInterface, text: string, detail: string | undefined, by: By) {
  const project = await sessionRoot($)
  return changeShelf($, (s, now) => addIdea(s, { text, detail, by, project, now }))
}

async function closeIdea($: EngineInterface, id: number, status: Status) {
  return changeShelf($, (s, now) => setStatus(s, id, status, now))
}

// Reloads the Shelf tab and this project's count (the bar's 💡), keeping the scope unless one is given.
async function refreshShelf($: EngineInterface, isAll?: boolean, note = '') {
  const old = await read($, shelf)
  const all = isAll ?? old.isAll
  const root = await sessionRoot($)
  const s = await loadShelf($)
  const ideas = openIdeas(s, all ? '' : root)
  const count = all ? openIdeas(s, root).length : ideas.length
  const now = await $.clock.now()
  await update($, shelf, () => ({ isAll: all, root, ideas, now, note, count }))
}

async function onCloseIdea($: EngineInterface, idea: Idea, status: Status) {
  await closeIdea($, idea.id, status)
  await refreshShelf($, undefined, `#${idea.id} ${status === 'done' ? 'done' : 'dropped'}`)
}

async function onResumeIdea($: EngineInterface, idea: Idea) {
  const box = (await $.prompt.read()).text.trim()
  if (box !== '') {
    await update($, shelf, old => ({ ...old, note: 'The prompt box has text: send or clear it first.' }))
    return
  }
  const filled = await $.prompt.fill({ text: ideaPrompt(idea) })
  if (!filled.isFilled) {
    await update($, shelf, old => ({ ...old, note: 'Could not fill the prompt box.' }))
    return
  }
  $.ui.toast(`#${idea.id} is in the prompt box. Mark it done from the Shelf tab when finished.`)
}

// ---------- Assumptions (moved from bws-assumptions) ----------

async function recordAssumption($: EngineInterface, text: string, why: string) {
  let added: Assumption | undefined
  await update($, assumptions, list => {
    const r = addAssumption(list, text, why)
    added = r.item
    return r.list
  })
  await settle(raise($, 'assumptions'))
  return added
}

async function markAssumption($: EngineInterface, n: number, verdict: 'right' | 'wrong') {
  await update($, assumptions, list => setVerdict(list, n, verdict))
}

async function saveCorrection($: EngineInterface, n: number, text: string) {
  drafts.delete(n)
  await update($, assumptions, list => setCorrection(list, n, text))
}

async function sendReview($: EngineInterface) {
  const batch = ready(await read($, assumptions))
  if (batch.length === 0) {
    $.ui.toast('Assumptions: mark one Right or Wrong first')
    return
  }
  const text = verdictPrompt(batch, drafts)
  const ns = batch.map(a => a.n)
  await update($, assumptions, list => {
    let out = list
    for (const a of batch) {
      const d = drafts.get(a.n)
      if (d !== undefined) out = setCorrection(out, a.n, d)
    }
    return markSent(out, ns)
  })
  for (const n of ns) drafts.delete(n)
  // Never submit from inside the press: defer it. The engine runs it once the session is idle.
  $.clock.after(10, () => void $.prompt.submit({ text, asUser: true }))
  $.ui.toast(`Assumptions: ${ns.length} sent to Claude`)
}

async function clearSent($: EngineInterface) {
  await update($, assumptions, list => list.filter(a => !a.isSent))
}

// ---------- Dashboard ----------

// The Board tab's card glyphs and border colours.
const STATUS_GLYPH: Record<BoardSessionCard['status'], string> = { busy: '🟢', idle: '⚪' }
const ASK_GLYPH: Record<BoardAskCard['view'], string> = { open: '❓', taken: '🙋', done: '✅', declined: '🚫', withdrawn: '🔙' }
const askColor = (a: BoardAskCard): Color =>
  a.view === 'done' ? 'success' : a.view === 'taken' ? 'suggestion' : a.view === 'withdrawn' ? 'subtle' : a.urgent ? 'error' : 'warning'

const isLoopLive = (lp: LoopView | null, now: number) =>
  lp !== null && (lp.driver.status === 'RUNNING' || lp.driver.status === 'PAUSED' || now - lp.stateMtime < RECENT_MS)

// What the Loop tab counts: its warnings and the needs still unanswered.
const loopCount = (lp: LoopView | null) =>
  lp === null ? 0 : lp.alerts.filter(a => a.level !== 'info').length + lp.needs.filter(n => n.answered === null).length

// The tab shown: the one picked while it is there, else the first with something waiting, else Assumptions.
function pickTab(picked: DashTab | null, tabs: readonly DashTab[], counts: Record<DashTab, number>): DashTab {
  if (picked !== null && tabs.includes(picked)) return picked
  return tabs.find(t => counts[t] > 0) ?? 'assumptions'
}

// Opened by the person (a command, a bar button): placed at any width. Focus is granted only to a fresh open over an
// empty box, so an open pane is closed first, as /shelf did.
async function openDash($: EngineInterface, tab: DashTab | null) {
  await update($, dash, d => ({ tab: tab ?? d.tab, isClosedByPerson: false }))
  const isEmpty = (await $.prompt.read()).text.trim() === ''
  const isOpen = (await $.ui.panes()).some(p => p.id === DASH)
  if (isEmpty && isOpen) await $.ui.close({ id: DASH })
  const r = await $.ui.open(isEmpty ? { id: DASH, title: DASH_TITLE, focus: true } : { id: DASH, title: DASH_TITLE })
  if (!r.isPlaced) $.ui.toast(`Dashboard not shown (${r.reason}). /assumptions, /shelf and /board print as text headless.`)
}

// After the command has returned, when the composer is clear.
function openDashSoon($: EngineInterface, tab: DashTab | null) {
  $.clock.after(10, () => void openDash($, tab).catch(err => $.ui.toast(`Dashboard: could not open (${String(err)})`)))
}

// News for the person: bring its tab up unless they closed the dashboard, or are using it (the tab counts tell them).
async function raise($: EngineInterface, tab: DashTab) {
  if ((await $.session.surfaces()).length === 0) return
  const d = await read($, dash)
  if (d.isClosedByPerson) return
  const pane = (await $.ui.panes()).find(p => p.id === DASH)
  if (pane?.isFocused) return
  if (d.tab !== tab) await update($, dash, old => ({ ...old, tab }))
  if (!pane || !pane.isShown) await $.ui.open({ id: DASH, title: DASH_TITLE })
}

// The bar's dash button: open it, or close it as the person's close (news then only lights the bar).
async function toggleDash($: EngineInterface) {
  if ((await $.ui.panes()).some(p => p.id === DASH)) {
    await update($, dash, d => ({ ...d, isClosedByPerson: true }))
    await $.ui.close({ id: DASH })
    return
  }
  await settle(refreshShelf($))
  await openDash($, null)
}

async function showTab($: EngineInterface, tab: DashTab) {
  if (tab === 'shelf') await settle(refreshShelf($))
  await openDash($, tab)
}

// The bar's hide button: say how to get it back, since the bar is gone once it is hidden.
async function hideBar($: EngineInterface) {
  await update($, isHidden, () => true)
  $.ui.toast('Cockpit bar hidden. /cockpit show brings it back.')
}

// The bar's idea button: the prompt box's draft goes on the shelf, and the box is cleared.
async function pressIdea($: EngineInterface) {
  const draft = (await $.prompt.read()).text.trim()
  if (draft === '') return void $.ui.toast('Idea: type the idea in the prompt box first')
  if (draft.startsWith('/')) return void $.ui.toast('Idea: the box holds a slash command')
  const idea = await shelve($, draft, undefined, 'user')
  await $.prompt.fill({ text: '' })
  await settle(refreshShelf($))
  $.ui.toast(`Shelved #${idea.id}`)
}

// The bar's enhance button: bws-enhance's /enhance on the draft. Mid-turn the engine queues it until the turn ends.
async function pressEnhance($: EngineInterface) {
  const draft = (await $.prompt.read()).text.trim()
  if (draft === '') return void $.ui.toast('Enhance: type a rough prompt first')
  if (draft.startsWith('/')) return void $.ui.toast('Enhance: the box holds a slash command')
  if (!(await $.command.list()).some(c => c.name === 'enhance')) return void $.ui.toast('Enhance: bws-enhance is not loaded')
  if (isTurnActive) $.ui.toast('Enhance: runs when Claude finishes this turn')
  await $.command.run({ command: 'enhance', args: draft })
}

async function pressHandoff($: EngineInterface) {
  const text = await writeHandoff($, '')
  $.ui.toast(text.split('\n')[0] ?? text, { timeoutMs: 8000 })
}

// Everything the dashboard shows, as text, where nothing draws a pane.
async function dashText($: EngineInterface) {
  const list = await read($, assumptions)
  const ideas = openIdeas(await loadShelf($), await sessionRoot($))
  const lines = await read($, boardLines)
  return [
    assumptionsText(list),
    ideas.length === 0 ? 'The shelf is empty.' : ideasText(ideas, await $.clock.now(), false, false),
    lines.length === 0 ? 'Board: bws-board is not loaded, or has not read the board yet.' : lines.join('\n'),
  ].join('\n\n')
}

export const register: Register = (on, options) => {
  const cvarText = String(options.lowVramCvars ?? '').trim()
  const o: Options = {
    guard: options.guard !== false,
    lowVramMode: String(options.lowVramMode ?? 'auto'),
    vramThresholdMb: Number(options.vramThresholdMb ?? 4096),
    cvars: cvarText.length > 0 ? cvarText.split(',').map(s => s.trim()).filter(Boolean) : LOW_VRAM_CVARS,
    adbPath: String(options.adbPath ?? 'adb'),
    refreshSeconds: Math.max(5, Number(options.refreshSeconds ?? 30)),
    isBackgroundProbe: options.backgroundProbe !== false,
    loop: {
      driverStaleMs: Math.max(1, Number(options.loopDriverStaleMinutes ?? 3)) * 60_000,
      idleMs: Math.max(1, Number(options.loopIdleMinutes ?? 20)) * 60_000,
      sessionAlert: Math.max(1, Number(options.loopSessionAlert ?? 6)),
    },
    finish: {
      isOn: options.finishLine !== false,
      maxContinues: Math.max(0, Number(options.finishLineMaxContinues ?? 2)),
      evidenceCheck: options.evidenceCheck === true,
      runlogCheck: options.finishLineRunlog !== false,
      isHeadless: options.finishLineHeadless === true,
      owner: String(options.ownerName ?? 'the user'),
    },
    projects: {
      isOn: options.projectLocator !== false,
      roots: String(options.projectRoots ?? 'C:/Projects')
        .split(';')
        .map(s => toSlash(s.trim()))
        .filter(Boolean),
    },
    pin: {
      model: String(options.workerModel ?? '').trim(),
      types: parseTypes(String(options.workerAgentTypes ?? 'general-purpose,claude')),
    },
    isShelfNudge: options.shelfNudge !== false,
    isDashboardOnStart: options.dashboardOnStart !== false,
    handoffNudgePercent: Number(options.handoffNudgePercent ?? 70),
    mods: parseMods(String(options.modSummaries ?? DEFAULT_MODS)),
    cache: {
      ttlMs: Math.max(1, Number(options.cacheTtlMinutes ?? 60)) * 60_000,
      lowMs: Math.max(0, Number(options.cacheLowMinutes ?? 5)) * 60_000,
      isAutoHandoff: options.autoHandoff !== false,
    },
  }
  shelfOption = String(options.shelfPath ?? '')

  // ---------- /handoff ----------

  on('command.run', { command: 'handoff' }, async ($, e, next) => ({ text: await writeHandoff($, e.args.trim()) }))

  // ---------- Cache clock ----------

  on('command.run', { command: 'cacheclock' }, async ($, e, next) => ({ text: await cacheText($, o) }))

  // ---------- worker model pin ----------

  on('agent.spawn', async ($, e, next) => {
    const model = pinnedModel(e, o.pin)
    if (model === undefined) return next(e)
    $.ui.toast(`${e.subagentType} subagent on ${model}`, { timeoutMs: 3000 })
    return next({ ...e, model })
  })

  // ---------- Project Locator ----------

  on('command.run', { command: 'projects' }, async ($, e, next) => {
    const idx = await getIndex($, o, /\brefresh\b/i.test(e.args))
    const list = findProjects(idx)
    return { text: `${list.length} projects under ${idx.roots.map(toWin).join(', ')} (newest first):\n${projectsText(list, 80)}` }
  })

  on('tool.call', { tool: 'mcp__bws-cockpit__find_project' }, async ($, e, next) => {
    const input = e as unknown as { query?: unknown; kind?: unknown }
    const query = typeof input.query === 'string' ? input.query : ''
    const kind = typeof input.kind === 'string' ? input.kind : ''
    const idx = await getIndex($, o)
    return { result: findResultText(idx, findProjects(idx, query, kind), query, kind) }
  })

  // A marker Glob under a projects root is answered from the index; over a home folder or drive it is refused at once.
  on('tool.call', { tool: 'Glob' }, async ($, e, next) => {
    if (!o.projects.isOn) return next(e)
    const cwd = await $.session.cwd()
    const { base, rel } = splitGlob(e.pattern, e.path ?? cwd)
    if (!isMarkerGlob(rel)) return next(e)
    const root = o.projects.roots.find(r => sameDir(r, base))
    if (root) {
      const t0 = await $.clock.now()
      const idx = await getIndex($, o)
      const filenames = globIndex(idx, root, rel).map(toWin)
      const durationMs = Math.max(0, (await $.clock.now()) - t0)
      return {
        result: { filenames, numFiles: filenames.length, durationMs, truncated: false },
        context: [
          `bws-cockpit answered this Glob from its project index (${toWin(root)}, ${SCAN_DEPTH} folders deep, build and content folders skipped) ` +
            'instead of a scan that times out. mcp__bws-cockpit__find_project gives more about each project.',
        ],
      }
    }
    if (isTooWide(base, o.projects.roots)) {
      return {
        deny:
          `bws-cockpit: a Glob for project files over all of ${toWin(base)} times out after 20 s. Call mcp__bws-cockpit__find_project ` +
          `(query by name, or no query for the whole list), or Glob under a projects root such as ${o.projects.roots.map(toWin).join(', ')}.`,
      }
    }
    return next(e)
  })

  // ---------- Finish-Line Guard ----------

  on('prompt.submit', async ($, e, next) => {
    continuesUsed = 0
    isTurnActive = true
    return next(e)
  })

  // Ownership: a run folder counts for this session only once its own tool calls write to it.
  // Recorded even with finishLine off, since /handoff picks its folder the same way.
  on('tool.call', { tool: ['Edit', 'Write', 'NotebookEdit', 'Bash', 'PowerShell'] }, async ($, e, next) => {
    const folders = writtenRunFolders(e.tool, e as unknown as Record<string, unknown>)
    if (folders.length > 0) await noteTouched($, folders)
    return next(e)
  })

  on('classic.Stop', async ($, e, next) => {
    if (!o.finish.isOn) return next(e)
    if (!o.finish.isHeadless && (await $.session.surfaces()).length === 0) return next(e)
    const fl = await sessionFinishLine($, o.finish.owner)
    const missing = o.finish.runlogCheck ? await missingRunlogFolder($) : null
    if (fl === null && missing === null) return next(e) // no run folder touched this session: nothing to hold to
    const decision = decide({
      open: fl?.open ?? [],
      folder: fl?.folder ?? missing,
      missingRunlog: missing,
      message: e.last_assistant_message ?? '',
      continuesUsed,
      maxContinues: o.finish.maxContinues,
      isWaiting: (e.background_tasks?.length ?? 0) > 0 || (e.session_crons?.length ?? 0) > 0,
      evidenceCheck: o.finish.evidenceCheck,
      owner: o.finish.owner,
    })
    if (decision === null) return next(e)
    continuesUsed += 1
    $.ui.toast(
      decision.kind === 'open'
        ? `finish line: ${fl?.open.length ?? 0} open, keeping Claude going`
        : decision.kind === 'runlog'
          ? `finish line: ${missing} has no RUNLOG.md`
          : 'finish line: asked Claude for evidence',
      { timeoutMs: 6000 },
    )
    return { block: decision.block }
  })

  // One turn.complete hook: refresh the band and the shelf (another session may have added ideas), nudge a handoff
  // when the context is full, then add the finish-line line under the answer.
  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) isTurnActive = false
    if (!e.agentId) void settle(stampTurn($, o))
    const surfaces = await $.session.surfaces()
    if (surfaces.length > 0 && o.isBackgroundProbe) void refresh($, o, 15000)
    if (surfaces.length > 0 && !e.agentId) {
      void settle(refreshShelf($))
      void settle(nudgeHandoff($, o.handoffNudgePercent))
    }
    const result = await next(e)
    if (!o.finish.isOn || e.isAborted || e.agentId) return result
    const fl = await sessionFinishLine($, o.finish.owner)
    if (fl === null || fl.open.length === 0) return result
    const line = `⚑ finish line: ${fl.open.length} open · ${openSummary(fl.open, 3)}`
    return { ...result, text: result.text ? `${result.text}\n${line}` : line }
  })

  // ---------- Run Cockpit ----------

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'cockpit', description: 'Show the active run and editor/device status' })
    await $.command.register({ name: 'resume-run', description: 'Resume the newest run folder (RUNLOG, PLAN, TASKS)' })
    await $.command.register({ name: 'loop-watch', description: "Watch this project's harness loop: units, sessions, cost, stalls, needs" })
    await $.command.register({ name: 'handoff', description: 'Write HANDOFF.md for a fresh agent and copy its start prompt', argumentHint: '[focus]' })
    await $.command.register({ name: 'cacheclock', description: 'Show the prompt cache clock: time left, state, and the last auto handoff', argumentHint: '[status]', immediate: true })
    if (o.projects.isOn) {
      await $.command.register({ name: 'projects', description: 'List the projects under the configured roots (/projects refresh rebuilds the index)', argumentHint: '[refresh]' })
      await $.tool.register({
        name: 'find_project',
        description:
          'Find a project on this machine by name, without searching the disk. Returns each matching project folder with its kinds ' +
          '(unreal, unity, node, android, python, git), the .uproject path, the Unity editor version, the package name, harness loops, ' +
          'and when it was last active. Use it instead of Glob/Grep over the whole projects folder or home folder, which time out.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Words from the project, package, .uproject or loop name. Empty lists every project.' },
            kind: { type: 'string', enum: ['unreal', 'unity', 'node', 'android', 'python', 'git', 'any'], description: 'Only projects of this kind.' },
          },
        },
      })
    }
    // ---------- Dashboard: its commands and the tools of the Assumptions and Shelf tabs ----------
    await $.command.register({ name: 'dashboard', description: 'Open the dashboard: Assumptions, Shelf, Board, Loop', argumentHint: '[assumptions|shelf|board|loop]', immediate: true })
    await $.command.register({ name: 'assumptions', description: 'Show the assumptions Claude made in this session, to confirm or correct them', immediate: true })
    await $.command.register({ name: 'idea', description: 'Shelve an idea for later without sending it to Claude', argumentHint: '<idea>', immediate: true })
    await $.command.register({
      name: 'shelf',
      description: "Show this project's idea shelf (Resume / Done / Drop); /shelf all for every project",
      argumentHint: '[all]',
      immediate: true,
    })
    await $.tool.register({ name: TOOL_NAME, description: TOOL_DESCRIPTION, inputSchema: TOOL_SCHEMA, isDeferred: false })
    await $.tool.register({
      name: 'shelve_idea',
      description:
        "Park an idea on the user's idea shelf instead of acting on it now. Use it for tangents that would sidetrack the " +
        'current task: an improvement you notice, a follow-up, an aside the user mentions. The shelf persists per project ' +
        'across sessions; the user resumes ideas from /shelf. After shelving, continue the current task.',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The idea in one line (under 300 characters).' },
          detail: { type: 'string', description: 'Optional context to resume it later: files, findings, why it matters.' },
        },
        required: ['text'],
      },
      isDeferred: false,
    })
    await $.tool.register({
      name: 'list_ideas',
      description: "List the open ideas on the user's idea shelf, for this project or all projects, with their ids and details.",
      inputSchema: {
        type: 'object',
        properties: { scope: { type: 'string', enum: ['project', 'all'], description: 'project (default) or all.' } },
      },
    })
    await $.tool.register({
      name: 'close_idea',
      description: 'Mark a shelved idea done (it was carried out) or dropped (no longer wanted), by its id.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'number', description: 'The idea id, as list_ideas shows it (#12 → 12).' },
          status: { type: 'string', enum: ['done', 'dropped', 'open'], description: 'done, dropped, or open to reopen it.' },
        },
        required: ['id', 'status'],
      },
    })
    const surfaces = await $.session.surfaces()
    if (surfaces.length > 0) {
      $.clock.every(60_000, () => void settle(syncCache($, o)))
      if (o.isBackgroundProbe) {
        void refresh($, o, 0)
        $.clock.every(o.refreshSeconds * 1000, () => void refresh($, o, 0))
      }
      // Something already waits on the person: open the dashboard on it (asks for this session arrive with
      // bws-board's first summary write, below).
      await settle(refreshShelf($))
      const waiting = active(await read($, assumptions)).length > 0 ? 'assumptions' : (await read($, shelf)).count > 0 ? 'shelf' : null
      // dashboardOnStart: the dashboard is there from the first prompt, on the first tab with something waiting.
      const tab = waiting ?? (o.isDashboardOnStart ? 'assumptions' : null)
      if (tab !== null) await settle(raise($, tab))
    }
    return next(e)
  })

  on('prompt.context', async ($, e, next) => {
    const result = await next(e)
    const blocks = [...result.blocks]
    // The run-folder note is for a person picking work back up. claude -p and SDK workers (no
    // surface) get their run folder in the prompt, so they skip it.
    const isAttended = (await $.session.surfaces()).length > 0
    const run = isAttended ? await findRun($) : null
    if (run !== null) {
      const text =
        `Most recently updated run folder here: ${run.folder}` +
        (run.next ? `; next step: ${shorten(run.next, 200)}` : '') +
        `; ${run.open} open items. It may belong to another task: confirm before resuming it.`
      blocks.push({ name: 'bwsCockpit', text })
    }
    // The shelf: the open count and the tool, so tangents get shelved, not followed.
    if (isAttended && o.isShelfNudge) {
      const ideas = await settle(loadShelf($).then(async s => openIdeas(s, await sessionRoot($))))
      if (ideas !== undefined) blocks.push({ name: 'ideaShelf', text: contextLine(ideas.length, TOOL_SHELVE) })
    }
    // Project Locator: a session started in the home folder or a projects root gets the project list.
    const cwd = await $.session.cwd()
    if (o.projects.isOn && (isHomeDir(cwd) || o.projects.roots.some(r => sameDir(r, cwd)))) {
      const idx = await getIndex($, o)
      const list = findProjects(idx)
      if (list.length > 0) {
        blocks.push({
          name: 'bwsProjects',
          text:
            `Projects under ${idx.roots.map(toWin).join(', ')} (newest first). For details call mcp__bws-cockpit__find_project. ` +
            `Don't Glob or Grep the whole folder: it times out after 20 s.\n${projectsText(list, 40)}`,
        })
      }
    }
    return blocks.length === result.blocks.length ? result : { ...result, blocks }
  })

  on('command.run', { command: 'cockpit' }, async ($, e, next) => {
    // The bar's hide button has no key to undo it once the bar is gone: /cockpit brings it back, /cockpit hide hides it.
    const word = e.args.trim().toLowerCase()
    if (word === 'hide') {
      await update($, isHidden, () => true)
      return { text: 'Cockpit bar hidden. /cockpit show brings it back.' }
    }
    await update($, isHidden, () => false)
    await refresh($, o, 0)
    const v = await read($, view)
    const devices = v?.devices ? devicesText(v.devices) : 'devices: n/a'
    const guard = v?.lastGuard ? `\nLast guard action: ${v.lastGuard}` : ''
    const lp = await selectedLoop($)
    const loop = lp ? `\nLoop: ${lp.name} ${loopState(lp).word}${lp.boardUrl ? ` · board ${lp.boardUrl}` : ''}` : ''
    return { text: `${runSummary(v?.run ?? null)}\n${devices}${loop}${guard}${word === 'show' ? '\nCockpit bar shown.' : ''}` }
  })

  on('command.run', { command: 'resume-run' }, async ($, e, next) => {
    const run = await findRun($)
    if (run === null) return { text: runSummary(run) }
    // A submit from inside command.run would wait on this very dispatch: queue it just after.
    $.clock.after(50, () => void submitResume($, run))
    return { text: `Resuming ${run.folder}…` }
  })

  on('command.run', { command: 'loop-watch' }, async ($, e, next) => {
    await refreshLoops($, o)
    const lp = await selectedLoop($)
    const now = await $.clock.now()
    if (lp === null) return { text: 'No harness loop here: no Tools/<name>/loop.json with a state.json under this folder.' }
    await update($, dash, (d): DashView => ({ ...d, tab: 'loop' }))
    const surfaces = await $.session.surfaces()
    if (surfaces.length === 0) return { text: loopText(lp, now) }
    openDashSoon($, 'loop')
    return { text: `Loop Watch: ${lp.name} ${loopState(lp).word}` }
  })

  // ---------- Dashboard commands ----------

  on('command.run', { command: 'dashboard' }, async ($, e) => {
    const word = e.args.trim().toLowerCase()
    const tab = word === '' ? null : (TABS.find(t => t.startsWith(word)) ?? null)
    if (word !== '' && tab === null) return { text: 'Usage: /dashboard [assumptions|shelf|board|loop]' }
    if ((await $.session.surfaces()).length === 0) return { text: await dashText($) }
    await settle(refreshShelf($))
    if (tab === 'loop') await refreshLoops($, o)
    openDashSoon($, tab)
    return {}
  })

  on('command.run', { command: 'assumptions' }, async $ => {
    if ((await $.session.surfaces()).length === 0) return { text: assumptionsText(await read($, assumptions)) }
    openDashSoon($, 'assumptions')
    return {}
  })

  on('command.run', { command: 'idea' }, async ($, e) => {
    const text = e.args.trim()
    if (text === '') return { text: "Usage: /idea <idea>. It goes on this project's shelf; /shelf shows it." }
    const isHeadless = (await $.session.surfaces()).length === 0
    try {
      const idea = await shelve($, text, undefined, 'user')
      await settle(refreshShelf($))
      if (isHeadless) return { text: `Shelved #${idea.id}: ${idea.text}` }
      $.ui.toast(`Shelved #${idea.id}`)
      return {}
    } catch (err) {
      return { text: `Shelf: could not save (${String(err)})`, exitCode: 1 }
    }
  })

  on('command.run', { command: 'shelf' }, async ($, e) => {
    const isAll = isAllScope(e.args)
    try {
      if ((await $.session.surfaces()).length === 0) {
        const ideas = openIdeas(await loadShelf($), isAll ? '' : await sessionRoot($))
        return { text: ideas.length === 0 ? 'The shelf is empty.' : ideasText(ideas, await $.clock.now(), isAll, true) }
      }
      await refreshShelf($, isAll)
      openDashSoon($, 'shelf')
      return {}
    } catch (err) {
      return { text: `Shelf: could not read (${String(err)})`, exitCode: 1 }
    }
  })

  // ---------- Assumptions and Shelf tools ----------

  // Tell the model when to record an assumption, only where the request offers the tool (not subagents without it).
  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    if (!e.tools.includes(ASSUMPTION_TOOL)) return r
    return { sections: [...r.sections, { id: 'bws-cockpit:assumptions', text: GUIDE, scope: 'session' as const }] }
  })

  on('tool.call', { tool: 'mcp__bws-cockpit__record_assumption' }, async ($, e) => {
    const input = e as unknown as { assumption?: unknown; why?: unknown }
    const text = typeof input.assumption === 'string' ? input.assumption.trim() : ''
    const why = typeof input.why === 'string' ? input.why.trim() : ''
    if (text === '') return { deny: 'record_assumption needs `assumption`: the assumption as one plain claim.' }
    const item = await recordAssumption($, text, why)
    return { result: `Recorded as A${item?.n ?? '?'}. Keep working on this assumption; the user will confirm or correct it from the dashboard.` }
  })

  on('tool.call', { tool: 'mcp__bws-cockpit__shelve_idea' }, async ($, e) => {
    const input = e as unknown as { text?: unknown; detail?: unknown }
    const text = str(input.text).trim()
    if (text === '') return { deny: 'shelve_idea needs text: the idea in one line.' }
    try {
      const idea = await shelve($, text, str(input.detail) || undefined, 'claude')
      await settle(refreshShelf($))
      $.ui.toast(`Claude shelved #${idea.id}: ${idea.text}`)
      return { result: `Shelved as #${idea.id}. Don't pursue it now; continue the current task.` }
    } catch (err) {
      return { deny: `Could not save the idea: ${String(err)}` }
    }
  })

  on('tool.call', { tool: 'mcp__bws-cockpit__list_ideas' }, async ($, e) => {
    const isAll = str((e as unknown as { scope?: unknown }).scope) === 'all'
    try {
      const ideas = openIdeas(await loadShelf($), isAll ? '' : await sessionRoot($))
      if (ideas.length === 0) return { result: isAll ? 'The shelf is empty.' : 'No open ideas for this project.' }
      return { result: ideasText(ideas, await $.clock.now(), isAll, true) }
    } catch (err) {
      return { deny: `Could not read the shelf: ${String(err)}` }
    }
  })

  on('tool.call', { tool: 'mcp__bws-cockpit__close_idea' }, async ($, e) => {
    const input = e as unknown as { id?: unknown; status?: unknown }
    const id = Number(String(input.id ?? '').replace(/^#/, ''))
    const status = str(input.status)
    if (!Number.isInteger(id) || id < 1) return { deny: 'close_idea needs the numeric id of an idea.' }
    if (status !== 'done' && status !== 'dropped' && status !== 'open') return { deny: 'status must be done, dropped or open.' }
    try {
      const idea = await closeIdea($, id, status)
      if (!idea) return { deny: `No idea #${id} on the shelf.` }
      await settle(refreshShelf($))
      return { result: `#${id} is ${status}: ${idea.text}` }
    } catch (err) {
      return { deny: `Could not update the shelf: ${String(err)}` }
    }
  })

  // ---------- Dashboard: the person's close, and bws-board news ----------

  // Closed by its mark or ctrl+x x: news stops reopening it; the bar keeps the counts. An asked open clears this.
  on('ui.close', async ($, e, next) => {
    if (e.id === DASH && e.origin.kind === 'person') await update($, dash, d => ({ ...d, isClosedByPerson: true }))
    return next(e)
  })

  // bws-board writes its summary on every heartbeat: a rise in asks for this session raises the Board tab.
  on('state.set', { plugin: 'bws-board', key: 'summary' }, async ($, e, next) => {
    const asked = e.value?.askedOfMe ?? 0
    const before = lastAskedOfMe
    lastAskedOfMe = asked
    if (asked > (before ?? 0)) void raise($, 'board').catch(() => undefined)
    return next(e)
  })

  // The dashboard: a tab strip, then the shown tab's body.
  on('ui.render', { component: 'Pane', requestId: DASH }, async ($, e, next) => {
    const table = $.ui.resolve(e)
    const { Box, Text, Button, Link } = table
    // Mobile has neither (its table may still carry the names at runtime): fall back to text there.
    const isMobile = e.surface === 'mobile'
    const Select = !isMobile && 'Select' in table ? table.Select : null
    const Input = !isMobile && 'Input' in table ? table.Input : null
    const all = await read($, loops)
    const lp = await selectedLoop($)
    const now = await $.clock.now()
    const width = Math.max(24, (e.props.bodyColumns ?? 80) - 1)
    const d = await read($, dash)
    const list = await read($, assumptions)
    const sv = await read($, shelf)
    const bs = await read($, boardSummary)
    const lines = await read($, boardLines)
    const pane = await read($, boardPane)
    const counts: Record<DashTab, number> = { assumptions: active(list).length, shelf: sv.count, board: bs?.askedOfMe ?? 0, loop: loopCount(lp) }
    // Loop: while any loop is live, or the person picked the tab (/loop-watch) for a quiet one.
    const hasLoop = lp !== null && (all.some(l => isLoopLive(l, now)) || d.tab === 'loop')
    const tabs = TABS.filter(t => t !== 'loop' || hasLoop)
    const tab = pickTab(d.tab, tabs, counts)
    const strip = (
      <Box key="tabs" flexDirection="row" columnGap={1} flexWrap="wrap">
        {tabs.map((t, i) => (
          <Button
            key={`tab-${t}`}
            label={counts[t] > 0 ? `${TAB_LABEL[t]} ${counts[t]}` : TAB_LABEL[t]}
            hotkey={String(i + 1)}
            {...(t === tab ? { variant: 'primary' as const } : { plain: true as const, dimColor: true })}
            onPress={() => update($, dash, old => ({ ...old, tab: t }))}
          />
        ))}
      </Box>
    )

    if (tab === 'assumptions') {
      const open = active(list)
      const done = sent(list)
      const toSend = ready(list).length
      return (
        <Box flexDirection="column">
          {strip}
          <Text bold>{assumptionsSummary(list)}</Text>
          {open.length === 0 && <Text dimColor>Nothing to review. Claude records assumptions here as it builds.</Text>}
          {open.map(a => (
            <Box key={`a-${a.n}`} flexDirection="column">
              <Text wrap="wrap" color={a.verdict === 'wrong' ? 'error' : a.verdict === 'right' ? 'success' : undefined}>
                {`A${a.n} ${a.text}`}
              </Text>
              {a.why !== '' && <Text dimColor wrap="wrap">{`   ${a.why}`}</Text>}
              <Box flexDirection="row" gap={1}>
                <Button key={`right-${a.n}`} label={a.verdict === 'right' ? '✓ Right' : 'Right'} onPress={() => markAssumption($, a.n, 'right')} />
                <Button key={`wrong-${a.n}`} label={a.verdict === 'wrong' ? '✗ Wrong' : 'Wrong'} onPress={() => markAssumption($, a.n, 'wrong')} />
              </Box>
              {a.verdict === 'wrong' &&
                (Input ? (
                  <Input
                    key={`fix-${a.n}`}
                    label="Instead"
                    placeholder="what it should be (empty: Claude asks you)"
                    value={drafts.get(a.n) ?? a.correction}
                    submitLabel="save"
                    onInput={(text: string) => void drafts.set(a.n, text)}
                    onSubmit={(text: string) => void saveCorrection($, a.n, text)}
                  />
                ) : (
                  <Text dimColor wrap="wrap">{'   Claude will ask you what it should be.'}</Text>
                ))}
            </Box>
          ))}
          {done.length > 0 && (
            <Text dimColor wrap="truncate-end">
              {clip(`${done.length} sent: ${done.slice(-4).map(a => `A${a.n} ${a.verdict}`).join(', ')}`, width)}
            </Text>
          )}
          <Box flexDirection="row" gap={1}>
            {open.length > 0 && <Button key="send" variant="primary" label={`Send ${toSend} to Claude`} hotkey="s" onPress={() => sendReview($)} />}
            {done.length > 0 && <Button key="clear" label="Clear sent" hotkey="c" onPress={() => clearSent($)} />}
          </Box>
        </Box>
      )
    }

    if (tab === 'shelf') {
      const shown = sv.ideas.slice(0, SHELF_SHOWN)
      const more = sv.ideas.length - shown.length
      const where = sv.isAll ? 'all projects' : projectName(sv.root)
      return (
        <Box flexDirection="column">
          {strip}
          <Text bold>
            💡 {sv.ideas.length} open idea{sv.ideas.length === 1 ? '' : 's'} · {where}
          </Text>
          {sv.ideas.length === 0 && <Text dimColor>Nothing shelved. /idea &lt;text&gt; adds one; Claude adds its own tangents.</Text>}
          {shown.map(i => (
            <Box key={`idea-${i.id}`} flexDirection="row" gap={1}>
              <Button key={`resume-${i.id}`} plain label="▶" onPress={() => onResumeIdea($, i)} />
              <Button key={`done-${i.id}`} plain label="✓" onPress={() => onCloseIdea($, i, 'done')} />
              <Button key={`drop-${i.id}`} plain label="✗" onPress={() => onCloseIdea($, i, 'dropped')} />
              <Box flexGrow={1} flexShrink={1}>
                <Text wrap="wrap">{ideaLine(i, sv.now, sv.isAll)}</Text>
              </Box>
            </Box>
          ))}
          {more > 0 && <Text dimColor>…{more} more: ask Claude to list ideas.</Text>}
          {sv.note !== '' && <Text color="warning">{sv.note}</Text>}
          <Box flexDirection="row" gap={1}>
            <Button key="scope" label={sv.isAll ? 'This project' : 'All projects'} hotkey="a" onPress={() => refreshShelf($, !sv.isAll)} />
          </Box>
          {e.props.isFocused && <Text dimColor>▶ resume (fills the prompt box) · ✓ done · ✗ drop</Text>}
        </Box>
      )
    }

    if (tab === 'board') {
      // One bordered card per session (this one first, in the accent colour), then one per ask. Each glyph opens its
      // line: a wide emoji mid-line can push a round border out of line.
      const sessionCard = (c: BoardSessionCard, isSelf: boolean) => (
        <Box
          key={`board-s-${c.id}`}
          flexDirection="column"
          width={width}
          borderStyle="round"
          borderColor={isSelf ? 'claude' : c.status === 'busy' ? 'success' : 'subtle'}
          paddingX={1}
        >
          <Text bold wrap="truncate-end">
            {`${STATUS_GLYPH[c.status]} ${c.who} · ${c.status}`}
            <Text dimColor bold={false}>{` · ${c.id}${isSelf ? ' · this session' : ` · seen ${c.seen}`}`}</Text>
          </Text>
          <Text wrap="wrap" dimColor={c.task === ''}>{`📝 ${c.task || 'no task recorded'}`}</Text>
          {c.run !== null && <Text wrap="wrap">{`📂 ${c.run}`}</Text>}
          {c.claims.length > 0 && (
            <Text wrap="wrap" dimColor>
              {`🔒 ${c.claims.join(', ')}${c.claimsMore > 0 ? ` (+${c.claimsMore} more)` : ''}`}
            </Text>
          )}
          {c.lease !== null && <Text wrap="wrap" color="warning">{`🔑 holds the git lease: ${c.lease}`}</Text>}
        </Box>
      )
      const askCard = (a: BoardAskCard) => (
        <Box key={`board-a-${a.id}`} flexDirection="column" width={width} borderStyle="round" borderColor={askColor(a)} paddingX={1}>
          <Text bold wrap="truncate-end">
            {`${a.urgent && (a.view === 'open' || a.view === 'declined') ? '🔥' : ASK_GLYPH[a.view]} ${a.id} · ${a.view}${a.actor ? ` by ${a.actor}` : ''}`}
            {a.urgent && <Text color="error">{' · urgent'}</Text>}
          </Text>
          <Text dimColor wrap="wrap">{`${a.from} → ${a.to}`}</Text>
          <Text wrap="wrap">{a.text}</Text>
          {a.note !== null && <Text dimColor wrap="wrap">{`💬 ${a.note}`}</Text>}
        </Box>
      )
      return (
        <Box flexDirection="column">
          {strip}
          {bs === null && lines.length === 0 ? (
            <Text dimColor wrap="wrap">bws-board is not loaded here, or has not read the board yet.</Text>
          ) : (
            <Text bold>
              Board · {bs?.agents ?? 0} agent{bs?.agents === 1 ? '' : 's'} · {bs?.openAsks ?? 0} open ask{bs?.openAsks === 1 ? '' : 's'}
              {bs && bs.askedOfMe > 0 ? ` · ${bs.askedOfMe} for you` : ''}
            </Text>
          )}
          {pane === null ? (
            lines.map((l, i) => (
              <Text key={`board-${i}`} wrap="wrap" dimColor={l.startsWith('  claims')}>
                {l}
              </Text>
            ))
          ) : (
            <Box flexDirection="column">
              {sessionCard(pane.self, true)}
              {pane.peers.map(c => sessionCard(c, false))}
              {pane.peers.length === 0 && <Text dimColor>No other live session.</Text>}
              <Text bold>Asks</Text>
              {pane.asks.map(askCard)}
              {pane.asks.length === 0 && <Text dimColor>No asks on the board.</Text>}
            </Box>
          )}
        </Box>
      )
    }

    if (lp === null) {
      return (
        <Box flexDirection="column">
          {strip}
          <Text dimColor>No harness loop in this folder (Tools/&lt;name&gt;/loop.json with a state.json).</Text>
        </Box>
      )
    }
    const note = await read($, loopAction)
    const armed = await read($, stopArmedAt)
    const isArmed = armed !== null && now - armed < STOP_CONFIRM_MS
    const st = loopState(lp)
    const isStale = lp.alerts.some(a => a.key.endsWith(':dead'))
    const cost = lp.units.reduce((s, u) => s + u.costUsd, 0)
    const sessions = lp.units.reduce((s, u) => s + u.sessions, 0)
    const done = lp.units.filter(u => u.status === 'DONE').length
    // Wide: one line per unit with the status word. Medium: one line without it. Narrow
    // (a docked sidebar): the name on the first line, the numbers dim on the second.
    const isWide = width >= 90
    const isNarrow = width < 60
    const idCol = Math.max(3, ...lp.units.map(u => u.id.length)) + 2
    const fixed = 2 + idCol + 2 + (isWide ? 9 : 0) + 5 + 9 + 6
    const nameCol = isNarrow ? Math.max(6, width - 2 - idCol - 2) : Math.max(6, width - fixed - (isWide ? 16 : 0))
    const rule = <Text dimColor>{'─'.repeat(Math.min(width, 120))}</Text>
    return (
      <Box flexDirection="column">
        {strip}
        <Box flexDirection="row">
          <Text bold>{fit(lp.name, Math.max(6, width - 26))}</Text>
          <Text color={STATE_COLOR[st.state]} dimColor={st.state === 'off'}>{`  ${st.state === 'off' ? '○' : '●'} ${lp.driver.status.toLowerCase()}`}</Text>
          <Text color={isStale ? 'error' : undefined} dimColor={!isStale}>{`  ${ago(lp.driver.updatedAt, now)}`}</Text>
        </Box>
        {lp.title ? <Text dimColor>{fit(lp.title, width)}</Text> : null}
        {Select && all.length > 1 ? (
          <Select
            key="loop-pick"
            label="loop "
            value={lp.name}
            options={all.map(l => ({ value: l.name, label: `${l.name} (${l.driver.status.toLowerCase()})` }))}
            onSelect={(value: string) => void update($, loopSelected, () => value)}
          />
        ) : null}
        {lp.boardUrl ? <Link href={lp.boardUrl} label={fit(`board ${lp.boardUrl}`, width)} /> : null}
        {rule}
        {lp.units.map(u => {
          const isCur = u.id === lp.current
          const color = u.status in UNIT_COLOR ? UNIT_COLOR[u.status] : 'error'
          const isOff = color === undefined
          const prog = u.tasksTotal !== null ? `${u.tasksDone}/${u.tasksTotal}` : ''
          const hb = u.status === 'RUNNING' && u.heartbeatAt !== null ? `${u.heartbeatTool ?? 'tool'} ${ago(u.heartbeatAt, now)}` : ''
          const isHot = u.status !== 'DONE' && u.sessions >= o.loop.sessionAlert
          if (isNarrow) {
            const pad = ' '.repeat(2 + idCol + 2)
            const nums = [`s${u.sessions}`, money(u.costUsd), prog, hb].filter(Boolean).join(' · ')
            return (
              <Box key={`unit-${u.id}`} flexDirection="column">
                <Box flexDirection="row">
                  <Text color={isCur ? 'claude' : undefined}>{isCur ? '▸ ' : '  '}</Text>
                  <Box width={idCol}><Text bold={isCur}>{u.id}</Text></Box>
                  <Text color={color} dimColor={isOff}>{`${UNIT_MARK[u.status] ?? '!'} `}</Text>
                  <Text dimColor={u.status === 'DONE'}>{fit(u.name, nameCol)}</Text>
                </Box>
                <Text color={isHot ? 'warning' : undefined} dimColor={!isHot}>{`${pad}${fit(nums, width - pad.length)}`}</Text>
              </Box>
            )
          }
          return (
            <Box key={`unit-${u.id}`} flexDirection="column">
              <Box flexDirection="row">
                <Text color={isCur ? 'claude' : undefined}>{isCur ? '▸ ' : '  '}</Text>
                <Box width={idCol}><Text bold={isCur}>{u.id}</Text></Box>
                <Text color={color} dimColor={isOff}>{`${UNIT_MARK[u.status] ?? '!'} `}</Text>
                {isWide ? (
                  <Box width={9}><Text color={color} dimColor={isOff}>{u.status.toLowerCase()}</Text></Box>
                ) : null}
                <Box width={5}><Text color={isHot ? 'warning' : undefined} dimColor={!isHot}>{`s${u.sessions}`}</Text></Box>
                <Box width={9}><Text dimColor>{money(u.costUsd)}</Text></Box>
                <Box width={6}><Text dimColor>{prog}</Text></Box>
                <Text dimColor={u.status === 'DONE'}>{fit(u.name, nameCol)}</Text>
                {isWide && hb ? <Text dimColor>{`  ${hb}`}</Text> : null}
              </Box>
              {!isWide && hb ? <Text dimColor>{`${' '.repeat(2 + idCol + 2)}${fit(hb, width - idCol - 4)}`}</Text> : null}
            </Box>
          )
        })}
        {rule}
        <Text dimColor>{fit(`${lp.units.length} units · ${done} done · ${sessions} sessions · ${money(cost)}`, width)}</Text>
        {lp.driver.message && lp.driver.status !== 'PAUSED' ? <Text dimColor>{fit(lp.driver.message, width)}</Text> : null}
        {lp.alerts.map(a => (
          <Box key={`alert-${a.key}`} flexDirection="row">
            <Text color={a.level === 'bad' ? 'error' : a.level === 'warn' ? 'warning' : 'success'}>{a.level === 'info' ? '✓ ' : '⚑ '}</Text>
            <Text wrap="wrap">{a.text}</Text>
          </Box>
        ))}
        {lp.needs.map(n => {
          const unit = lp.current ?? '?'
          if (n.answered !== null) {
            return (
              <Box key={`need-${n.id}`} flexDirection="column">
                <Text dimColor wrap="wrap">{`✓ ${n.id} ${n.text}`}</Text>
                <Text color="success" wrap="wrap">{`  answered: ${fit(n.answered, Math.max(10, width - 12))}`}</Text>
              </Box>
            )
          }
          return (
            <Box key={`need-${n.id}`} flexDirection="column">
              <Text color="warning" wrap="wrap">{`${n.id} ${n.text}`}</Text>
              {Input ? (
                <Input
                  key={`answer-${unit}-${n.id}`}
                  label={`${n.id} › `}
                  placeholder="type your answer, Enter sends it"
                  submitLabel="answer"
                  onSubmit={(value: string) => void answerNeed($, o, lp, unit, n.id, value)}
                />
              ) : (
                <Text dimColor wrap="wrap">{`  ${answerCommand(lp, unit, n.id)}`}</Text>
              )}
            </Box>
          )
        })}
        {lp.needs.length > 0 && lp.needs.every(n => n.answered !== null) ? (
          <Text color="success">{'all needs answered · r resumes the loop'}</Text>
        ) : null}
        {note ? <Text color={note.isError ? 'error' : undefined} dimColor={!note.isError} wrap="wrap">{`${ago(note.at, now)}: ${note.text}`}</Text> : null}
        <Box flexDirection="row" columnGap={2} flexWrap="wrap">
          <Button key="loop-resume" plain dimColor label="resume" hotkey="r" onPress={() => void runLoopCommand($, o, lp, 'resume')} />
          <Button key="loop-stop" plain dimColor={!isArmed} label={isArmed ? `press s again to stop ${lp.name}` : 'stop'} hotkey="s" onPress={() => void pressStop($, o, lp)} />
          <Button key="loop-refresh" plain dimColor label="refresh" hotkey="g" onPress={() => void refreshLoops($, o)} />
        </Box>
      </Box>
    )
  })

  // The action bar: one row of status chips, then the actions. It wraps when narrow; the guard note and another
  // mod's band go under it.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const v = await read($, view)
    if (e.props.hasSurvey || v === null || (await read($, isHidden))) return next(e)
    // The slot holds one tree: share it. Another mod's band (whatever next(e) draws) goes under
    // ours, by the prompt. Core's own node is its survey slot, empty here, so it adds nothing.
    const drawn = await settle(next(e))
    const below = drawn !== undefined && drawn.type !== 'engine' ? drawn : null
    const { Box, Text, Button } = $.ui.resolve(e)
    const cols = e.props.bodyColumns ?? 100
    const width = Math.max(40, cols - 1)
    const run = v.run
    const now = await $.clock.now()
    const showGuard = v.lastGuard !== null && v.lastGuardAt !== null && now - v.lastGuardAt < GUARD_NOTE_MS
    const lp = await selectedLoop($)
    const loopChip = lp && isLoopLive(lp, now) ? loopState(lp) : null
    const list = await read($, assumptions)
    const sv = await read($, shelf)
    const bs = await read($, boardSummary)
    const isHandoffDue = await isNudged($)
    // The scan wants a literal source at every read, so one read per mod, and only for the ones the option names.
    const raw: Partial<Record<KnownMod, unknown>> = {
      'bws-memory': o.mods.includes('bws-memory') ? await read($, memorySummary) : null,
      'bws-diagram': o.mods.includes('bws-diagram') ? await read($, diagramSummary) : null,
      'bws-skillgate': o.mods.includes('bws-skillgate') ? await read($, skillgateSummary) : null,
      'bws-secrets': o.mods.includes('bws-secrets') ? await read($, secretsSummary) : null,
      'bws-better': o.mods.includes('bws-better') ? await read($, betterSummary) : null,
    }
    const modBoxes = modChips(o.mods, raw).map(c => (
      <Box key={`chip-mod-${c.name}`} flexDirection="row">
        <Text color={c.color} dimColor={c.isDim}>{'● '}</Text>
        <Text dimColor={c.isDim}>{c.label}</Text>
      </Box>
    ))
    // The cache clock: plain while fresh, warning once under cacheLowMinutes or cold; hidden before the first turn.
    const cache = await read($, cacheBar)
    const cacheBox =
      cache !== null ? (
        <Box key="chip-cache" flexDirection="row">
          <Text color={cache.state === 'fresh' ? undefined : 'warning'}>{cache.text}</Text>
        </Box>
      ) : null

    const runName = run ? run.folder.replace(/^runs\//, '').replace(/^\d{4}-\d{2}-\d{2}-/, '') : ''
    const runChip = run ? (
      <Box key="chip-run" flexDirection="row">
        <Text bold>{fit(runName, Math.max(12, Math.min(28, width - 30)))}</Text>
        <Text color={run.open > 0 ? 'warning' : 'success'}>{run.open > 0 ? ` ${run.open} open` : ' done'}</Text>
      </Box>
    ) : (
      <Text key="chip-run" dimColor>
        no run
      </Text>
    )
    // Devices that are up or in trouble; the ones off say nothing.
    const deviceChips = (v.devices?.chips ?? [])
      .filter(c => c.state !== 'off')
      .map(c => (
        <Box key={`chip-${c.label}`} flexDirection="row">
          <Text color={STATE_COLOR[c.state]}>{'● '}</Text>
          <Text>{c.label}</Text>
          {c.detail ? <Text dimColor>{` ${c.detail}`}</Text> : null}
        </Box>
      ))
    const loopBox = loopChip ? (
      <Box key="chip-loop" flexDirection="row">
        <Text color={STATE_COLOR[loopChip.state]} dimColor={loopChip.state === 'off'}>
          {loopChip.state === 'off' ? '○ ' : '● '}
        </Text>
        <Text dimColor={loopChip.state === 'off'}>{`loop ${loopChip.word}`}</Text>
      </Box>
    ) : null
    // bws-board: shown once another session is live or an ask is open; warning while one waits on us.
    const boardChip =
      bs !== null && (bs.agents > 1 || bs.openAsks > 0) ? (
        <Box key="chip-board" flexDirection="row">
          <Text color={bs.askedOfMe > 0 ? 'warning' : 'success'}>{'● '}</Text>
          <Text dimColor={bs.askedOfMe === 0}>
            {`board ${bs.agents} · ${bs.openAsks} open${bs.askedOfMe > 0 ? ` · ${bs.askedOfMe} for you` : ''}`}
          </Text>
        </Box>
      ) : null
    const toReview = unreviewed(list).length
    const asmChip =
      active(list).length > 0 ? (
        <Text key="chip-assumptions" color={toReview > 0 ? 'warning' : undefined} dimColor={toReview === 0}>
          {`⚑ ${active(list).length} assumptions`}
        </Text>
      ) : null
    const shelfChip =
      sv.count > 0 ? (
        <Text key="chip-shelf" dimColor>
          {`💡 ${sv.count} ${sv.count === 1 ? 'idea' : 'ideas'}`}
        </Text>
      ) : null

    // Actions in three groups, each led by a dim word: do (act on this session), open (a dashboard tab), and hide.
    const doButtons = [
      run ? <Button key="resume" plain dimColor label="resume" hotkey="1" onPress={() => void resume($)} /> : null,
      isHandoffDue ? (
        <Button key="handoff" variant="primary" label="handoff" hotkey="h" onPress={() => void pressHandoff($)} />
      ) : (
        <Button key="handoff" plain dimColor label="handoff" hotkey="h" onPress={() => void pressHandoff($)} />
      ),
      <Button key="idea" plain dimColor label="idea" hotkey="i" onPress={() => void pressIdea($)} />,
      <Button key="enhance" plain dimColor label="enhance" hotkey="e" onPress={() => void pressEnhance($)} />,
    ]
    const openButtons = [
      <Button key="dash" plain dimColor label="dash" hotkey="2" onPress={() => void toggleDash($)} />,
      <Button key="tab-assumptions" plain dimColor label="asm" hotkey="a" onPress={() => void showTab($, 'assumptions')} />,
      <Button key="tab-shelf" plain dimColor label="shelf" hotkey="s" onPress={() => void showTab($, 'shelf')} />,
      bs !== null ? <Button key="tab-board" plain dimColor label="board" hotkey="b" onPress={() => void showTab($, 'board')} /> : null,
      lp ? <Button key="loop" plain dimColor label="loop" hotkey="4" onPress={() => void showTab($, 'loop')} /> : null,
    ]
    const hasSignals = boardChip !== null || modBoxes.length > 0 || asmChip !== null || shelfChip !== null
    const guardRow = showGuard ? (
      <Box flexDirection="row">
        <Text color="warning">{'⚑ '}</Text>
        <Text dimColor wrap="truncate-end">
          {fit(`guard ${v.lastGuard}`, width - 2)}
        </Text>
      </Box>
    ) : null
    const belowBox = below ? <Box key="band-below" flexDirection="column">{below}</Box> : null
    return (
      <Box flexDirection="column">
        <Box key="bar" flexDirection="row" columnGap={2} flexWrap="wrap">
          {runChip}
          {deviceChips}
          {loopBox}
          {cacheBox}
        </Box>
        {hasSignals ? (
          <Box key="signals" flexDirection="row" columnGap={2} flexWrap="wrap">
            {boardChip}
            {modBoxes}
            {asmChip}
            {shelfChip}
          </Box>
        ) : null}
        <Box key="actions" flexDirection="row" columnGap={1} flexWrap="wrap">
          <Text dimColor>do</Text>
          {doButtons}
          <Text dimColor>{'  open'}</Text>
          {openButtons}
          <Text dimColor>{'  '}</Text>
          <Button key="hide" plain dimColor label="hide" hotkey="3" onPress={() => void hideBar($)} />
        </Box>
        {guardRow}
        {belowBox}
      </Box>
    )
  })

  // ---------- Editor & Device Guard ----------

  on('tool.call', { tool: /^mcp__unreal[\w-]*__/ }, async ($, e, next) => {
    if (!o.guard) return next(e)
    const server = String(e.tool).split('__')[1]
    const p = await probe($, o, 10000, server)
    if (p.ueMcp === undefined || p.ueMcp.isUp) return next(e)
    const ue = p.procs.filter(isUeGui)
    const why = ue.length > 0 ? 'an editor is running but its MCP port does not answer (still loading, or MCP not started)' : 'no Unreal editor is running'
    await noteGuard($, `blocked ${e.tool}: ${p.ueMcp.url} down`)
    return {
      deny:
        `bws-cockpit: Unreal MCP at ${p.ueMcp.url} is not reachable: ${why}. ` +
        `Start or wait for the editor (if other editors or Blender are open, launch with low-VRAM flags), then retry. Ask the user if you cannot.`,
    }
  })

  on('tool.call', { tool: ['Bash', 'PowerShell'], command: /adb/i }, async ($, e, next) => {
    if (!o.guard || !adbNeedsDevice(e.command, dialectOf(e.tool))) return next(e)
    const p = await probe($, o, 5000)
    if (p.adb === undefined || p.adb.ready.length > 0) return next(e)
    const seen = p.adb.other.length > 0 ? p.adb.other.join(', ') : 'none attached'
    await noteGuard($, `blocked adb: no ready device (${seen})`)
    return {
      deny: `bws-cockpit: no Android device is ready (adb devices: ${seen}). Ask the user to connect and unlock the device, then retry.`,
    }
  })

  on('tool.call', { tool: ['Bash', 'PowerShell'], command: /unity/i }, async ($, e, next) => {
    if (!o.guard) return next(e)
    const fix = fixUnityLaunch(e.command, dialectOf(e.tool))
    if (fix && 'deny' in fix) {
      await noteGuard($, 'blocked a Unity launch without -automated')
      return { deny: `bws-cockpit: ${fix.deny}` }
    }
    if (fix) {
      await noteGuard($, fix.note)
      return withNote(await next({ ...e, command: fix.command }), `${fix.note}; the command ran as: ${shorten(fix.command, 400)}`)
    }
    if (isUnityPipelineCommand(e.command, dialectOf(e.tool))) {
      const p = await probe($, o, 5000)
      if (!p.procs.some(isUnity)) {
        await noteGuard($, 'blocked a unity CLI command: no editor running')
        return {
          deny:
            'bws-cockpit: no Unity editor is running, so the unity CLI pipeline has nothing to talk to. ' +
            'Launch it first (unity open <project> --args -automated) and wait for the pipeline to come up, or ask the user.',
        }
      }
    }
    return next(e)
  })

  on('tool.call', { tool: ['Bash', 'PowerShell'], command: /UnrealEditor\.exe/i }, async ($, e, next) => {
    if (!o.guard) return next(e)
    const launch = findUeGuiLaunch(e.command, dialectOf(e.tool))
    if (!launch) return next(e)
    const p = await probe($, o, 3000)
    const open = p.procs.filter(isUeGui)
    if (launch.uproject) {
      const target = normPath(launch.uproject)
      const dupe = open.find(proc => normPath(proc.cmdline).includes(target))
      if (dupe) {
        await noteGuard($, `blocked a second editor for ${launch.uproject}`)
        return {
          deny:
            `bws-cockpit: ${launch.uproject} is already open in UnrealEditor (pid ${dupe.pid}). ` +
            'Use the running editor (unreal-mcp), or close it first. A second instance fights over assets and VRAM.',
        }
      }
    }
    if (o.lowVramMode === 'off' || launch.hasOverrides || launch.isRender || !isPressure(p, o)) return next(e)
    const arg = lowVramArg(o.cvars)
    if (launch.isStartProcess) {
      await noteGuard($, 'blocked a UE launch without low-VRAM flags')
      return {
        deny:
          `bws-cockpit: other GPU apps are running (VRAM ${vramText(p)}), so UE must launch with the low-VRAM overrides. ` +
          `Add this element to -ArgumentList and run again: '${arg}'`,
      }
    }
    const command = addLowVram(e.command, launch, o.cvars)
    await noteGuard($, 'added low-VRAM overrides to the UE launch')
    return withNote(await next({ ...e, command }), `added low-VRAM -ini overrides to the UE launch (GPU pressure); the command ran as: ${shorten(command, 400)}`)
  })
}
