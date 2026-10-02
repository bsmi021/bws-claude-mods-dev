import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { CockpitChip, CockpitDevices, CockpitRun, CockpitState } from '../types'
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
import { actionable, decide, openItems, openSummary } from './finish'
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
import { handoffFolder, handoffPrompt, keptName, parseTypes, pinnedModel, startPrompt, transcriptPrompt, transcriptText, words } from './handoff'

const dialectOf = (tool: string): Dialect => (tool === 'PowerShell' ? 'powershell' : 'bash')

const view = atom({ plugin: 'bws-cockpit', key: 'view' } as const, null)
const isHidden = atom({ plugin: 'bws-cockpit', key: 'isHidden' } as const, false)
const loops = atom({ plugin: 'bws-cockpit', key: 'loops' } as const, [])
const loopSelected = atom({ plugin: 'bws-cockpit', key: 'loopSelected' } as const, null)
const loopAction = atom({ plugin: 'bws-cockpit', key: 'loopAction' } as const, null)
const stopArmedAt = atom({ plugin: 'bws-cockpit', key: 'stopArmedAt' } as const, null)

const LOOP_PANE = 'loop-watch'
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
  loop: LoopLimits
  finish: { isOn: boolean; maxContinues: number; evidenceCheck: boolean; isHeadless: boolean; owner: string }
  projects: { isOn: boolean; roots: string[] }
  pin: { model: string; types: string[] }
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
async function readRunFolder($: EngineInterface): Promise<RunFolder | null> {
  const cwd = await $.session.cwd()
  const runsDir = joinPath(cwd, 'runs')
  const entries = await settle($.fs.list(runsDir))
  if (!entries) return null
  const dirs = entries
    .filter(d => d.kind === 'dir')
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

// This session's run folder (written since the session started) and its actionable open items.
async function sessionFinishLine($: EngineInterface): Promise<{ folder: string; open: string[] } | null> {
  const r = await readRunFolder($)
  if (!r) return null
  const { startedAt } = await $.session.usage()
  if (r.mtime < startedAt) return null
  return { folder: r.folder, open: actionable([...openItems(r.plan), ...openItems(r.tasks)]) }
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

export const register: Register = (on, options) => {
  const cvarText = String(options.lowVramCvars ?? '').trim()
  const o: Options = {
    guard: options.guard !== false,
    lowVramMode: String(options.lowVramMode ?? 'auto'),
    vramThresholdMb: Number(options.vramThresholdMb ?? 4096),
    cvars: cvarText.length > 0 ? cvarText.split(',').map(s => s.trim()).filter(Boolean) : LOW_VRAM_CVARS,
    adbPath: String(options.adbPath ?? 'adb'),
    refreshSeconds: Math.max(5, Number(options.refreshSeconds ?? 30)),
    loop: {
      driverStaleMs: Math.max(1, Number(options.loopDriverStaleMinutes ?? 3)) * 60_000,
      idleMs: Math.max(1, Number(options.loopIdleMinutes ?? 20)) * 60_000,
      sessionAlert: Math.max(1, Number(options.loopSessionAlert ?? 6)),
    },
    finish: {
      isOn: options.finishLine !== false,
      maxContinues: Math.max(0, Number(options.finishLineMaxContinues ?? 2)),
      evidenceCheck: options.evidenceCheck !== false,
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
  }

  // ---------- /handoff ----------

  on('command.run', { command: 'handoff' }, async ($, e, next) => {
    const cwd = await $.session.cwd()
    const now = await $.clock.now()
    const run = await readRunFolder($)
    const { startedAt } = await $.session.usage()
    const folder = run !== null && run.mtime >= startedAt ? run.folder : handoffFolder(now)
    $.ui.toast(`handoff: writing ${folder}/HANDOFF.md`, { timeoutMs: 4000 })
    const focus = e.args.trim()
    let r = await $.model.fork({ prompt: handoffPrompt(folder, focus) })
    // A resumed session has a transcript but nothing to fork until its first request: build from the rows instead.
    if (!r.isAnswered && r.reason === 'nothing-to-fork') {
      const rows = (await settle($.session.messages())) ?? []
      const transcript = transcriptText(rows)
      if (transcript.length === 0) return { text: 'No handoff written: there is nothing to hand off yet: this conversation has no messages.' }
      r = await $.model.complete({ model: await $.session.model(), prompt: transcriptPrompt(transcript, folder, focus), maxTokens: 3000 })
    }
    if (!r.isAnswered) return { text: `No handoff written: the model call failed (${r.reason}).` }
    const body = r.text.trim()
    if (body.length === 0) return { text: 'No handoff written: the model returned an empty reply.' }
    const path = joinPath(cwd, `${folder}/HANDOFF.md`)
    const previous = await settle($.fs.read(path))
    const kept = previous !== undefined ? keptName(now) : null
    if (kept !== null) await $.fs.write(joinPath(cwd, `${folder}/${kept}`), previous ?? '')
    await $.fs.write(path, `${body}\n`)
    const start = startPrompt(folder)
    const surfaces = await $.session.surfaces()
    const copied = surfaces.length > 0 && (await settle($.ui.copy({ text: start })))?.isCopied === true
    return {
      text:
        `Handoff written: ${folder}/HANDOFF.md (${words(body)} words)` +
        (kept !== null ? `; the previous one is kept as ${folder}/${kept}` : '') +
        `.\nStart the next session with this prompt${copied ? ' (copied to the clipboard)' : ''}:\n${start}`,
    }
  })

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
    return next(e)
  })

  on('classic.Stop', async ($, e, next) => {
    if (!o.finish.isOn) return next(e)
    if (!o.finish.isHeadless && (await $.session.surfaces()).length === 0) return next(e)
    const fl = await sessionFinishLine($)
    if (fl === null) return next(e) // no run folder touched this session: nothing to hold to
    const decision = decide({
      open: fl.open,
      folder: fl.folder,
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
      decision.kind === 'open' ? `finish line: ${fl.open.length} open, keeping Claude going` : 'finish line: asked Claude for evidence',
      { timeoutMs: 6000 },
    )
    return { block: decision.block }
  })

  // One turn.complete hook: refresh the band, then add the finish-line line under the answer.
  on('turn.complete', async ($, e, next) => {
    const surfaces = await $.session.surfaces()
    if (surfaces.length > 0) void refresh($, o, 15000)
    const result = await next(e)
    if (!o.finish.isOn || e.isAborted || e.agentId) return result
    const fl = await sessionFinishLine($)
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
    const surfaces = await $.session.surfaces()
    if (surfaces.length > 0) {
      void refresh($, o, 0)
      $.clock.every(o.refreshSeconds * 1000, () => void refresh($, o, 0))
    }
    return next(e)
  })

  on('prompt.context', async ($, e, next) => {
    const result = await next(e)
    const blocks = [...result.blocks]
    const run = await findRun($)
    if (run !== null) {
      const text =
        `Most recently updated run folder here: ${run.folder}` +
        (run.next ? `; next step: ${shorten(run.next, 200)}` : '') +
        `; ${run.open} open items. It may belong to another task: confirm before resuming it.`
      blocks.push({ name: 'bwsCockpit', text })
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
    await refresh($, o, 0)
    const v = await read($, view)
    const devices = v?.devices ? devicesText(v.devices) : 'devices: n/a'
    const guard = v?.lastGuard ? `\nLast guard action: ${v.lastGuard}` : ''
    return { text: `${runSummary(v?.run ?? null)}\n${devices}${guard}` }
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
    const surfaces = await $.session.surfaces()
    if (surfaces.length === 0) return { text: loopText(lp, now) }
    const opened = await $.ui.open({ id: LOOP_PANE, title: `Loop · ${lp.name}` })
    const st = loopState(lp)
    return opened.isPlaced ? { text: `Loop Watch: ${lp.name} ${st.word}` } : { text: loopText(lp, now) }
  })

  on('ui.render', { component: 'Pane', requestId: LOOP_PANE }, async ($, e, next) => {
    const table = $.ui.resolve(e)
    const { Box, Text, Button, Link } = table
    const Select = 'Select' in table ? table.Select : null // mobile has none
    const Input = 'Input' in table ? table.Input : null
    const all = await read($, loops)
    const lp = await selectedLoop($)
    const now = await $.clock.now()
    const width = Math.max(24, (e.props.bodyColumns ?? 80) - 1)
    if (lp === null) return <Text dimColor>No harness loop in this folder (Tools/&lt;name&gt;/loop.json with a state.json).</Text>
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

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const v = await read($, view)
    if (e.props.hasSurvey || v === null || (await read($, isHidden))) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const width = Math.max(40, (e.props.bodyColumns ?? 100) - 1)
    const run = v.run
    const d = v.devices
    const now = await $.clock.now()
    const showGuard = v.lastGuard !== null && v.lastGuardAt !== null && now - v.lastGuardAt < GUARD_NOTE_MS
    const lp = await selectedLoop($)
    const isLoopLive = lp !== null && (lp.driver.status === 'RUNNING' || lp.driver.status === 'PAUSED' || now - lp.stateMtime < RECENT_MS)
    const loopChip = lp && isLoopLive ? { ...loopState(lp), detail: [lp.name, lp.current].filter(Boolean).join(' ') } : null

    // Run row: name (bold) · date · open count › next step, cut to the width with plain dots.
    const runRow = (() => {
      if (!run) return null
      const base = run.folder.replace(/^runs\//, '')
      const m = base.match(/^(\d{4})-(\d{2})-(\d{2})-(.+)$/)
      const name = m?.[4] ?? base
      const date = m ? `${m[2]}-${m[3]}` : ''
      const openText = run.open > 0 ? `${run.open} open` : 'no open items'
      const head = `${name}  ${date}  ${openText}  › `
      const nextStep = run.next ?? 'no next step in RUNLOG'
      return (
        <Box flexDirection="row">
          <Text bold>{name}</Text>
          <Text dimColor>{date ? `  ${date}` : ''}</Text>
          <Text color={run.open > 0 ? 'warning' : 'success'}>{`  ${openText}`}</Text>
          <Text dimColor>{'  › '}</Text>
          <Text wrap="truncate-end">{fit(nextStep, width - head.length)}</Text>
        </Box>
      )
    })()

    return (
      <Box flexDirection="column">
        {runRow}
        <Box flexDirection="row" justifyContent="space-between" flexWrap="wrap" columnGap={2}>
          <Box flexDirection="row" columnGap={2} flexWrap="wrap">
            {(d?.chips ?? []).map(c => (
              <Box key={`chip-${c.label}`} flexDirection="row">
                <Text color={STATE_COLOR[c.state]} dimColor={c.state === 'off'}>
                  {c.state === 'off' ? '○ ' : '● '}
                </Text>
                <Text dimColor={c.state === 'off'}>{c.label}</Text>
                {c.detail ? <Text dimColor>{` ${c.detail}`}</Text> : null}
              </Box>
            ))}
            {loopChip ? (
              <Box key="chip-loop" flexDirection="row">
                <Text color={STATE_COLOR[loopChip.state]} dimColor={loopChip.state === 'off'}>
                  {loopChip.state === 'off' ? '○ ' : '● '}
                </Text>
                <Text dimColor={loopChip.state === 'off'}>loop</Text>
                <Text dimColor>{` ${loopChip.detail} ${loopChip.word}`}</Text>
              </Box>
            ) : null}
          </Box>
          <Box flexDirection="row" columnGap={2}>
            {run ? <Button key="resume" plain dimColor label="resume" hotkey="1" onPress={() => void resume($)} /> : null}
            <Button key="refresh" plain dimColor label="refresh" hotkey="2" onPress={() => void refresh($, o, 0)} />
            <Button key="hide" plain dimColor label="hide" hotkey="3" onPress={() => update($, isHidden, () => true)} />
            {lp ? <Button key="loop" plain dimColor label="loop" hotkey="4" onPress={() => void $.ui.open({ id: LOOP_PANE, title: `Loop · ${lp.name}` })} /> : null}
          </Box>
        </Box>
        {showGuard ? (
          <Box flexDirection="row">
            <Text color="warning">{'⚑ '}</Text>
            <Text dimColor wrap="truncate-end">
              {fit(`guard ${v.lastGuard}`, width - 2)}
            </Text>
          </Box>
        ) : null}
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
    if (o.lowVramMode === 'off' || launch.hasOverrides || !isPressure(p, o)) return next(e)
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
