import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { CockpitDevices, CockpitRun, CockpitView } from '../types'
import {
  LOW_VRAM_CVARS,
  addLowVram,
  adbNeedsDevice,
  countOpen,
  findUeGuiLaunch,
  fixUnityLaunch,
  isBlender,
  isUeGui,
  isUnity,
  isUnityPipelineCommand,
  lowVramArg,
  normPath,
  parseAdb,
  parseFinish,
  parseNext,
  parseProcs,
  parseUnrealMcpUrl,
  parseVram,
  shorten,
} from './lib'
import type { Probe } from './lib'

const view = atom({ plugin: 'bws-cockpit', key: 'view' } as const, null)
const isHidden = atom({ plugin: 'bws-cockpit', key: 'isHidden' } as const, false)

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
  const answered = settle($.http.fetch(url, { method: 'GET' })).then(r => r !== undefined)
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

const describeDevices = (p: Probe, o: Options): CockpitDevices => {
  const ue = p.procs.filter(isUeGui)
  const port = p.ueMcp ? p.ueMcp.url.replace(/^https?:\/\/[^:/]+/, '').replace(/\/.*$/, '') : ''
  const ueState = ue.length === 0 ? 'off' : `${ue.length} open`
  const mcpState = p.ueMcp ? ` · mcp${port} ${p.ueMcp.isUp ? 'up' : 'down'}` : ''
  return {
    ue: `UE ${ueState}${mcpState}`,
    unity: `Unity ${p.procs.some(isUnity) ? 'open' : 'off'}`,
    blender: `Blender ${p.procs.some(isBlender) ? 'open' : 'off'}`,
    adb: p.adb === undefined ? 'adb n/a' : p.adb.ready.length > 0 ? `adb ${p.adb.ready.length} ready` : `adb ${p.adb.other.length > 0 ? 'not ready' : 'none'}`,
    vram: p.vram ? `VRAM ${(p.vram.usedMb / 1024).toFixed(1)}/${(p.vram.totalMb / 1024).toFixed(1)} GB` : 'VRAM n/a',
    isPressure: isPressure(p, { ...o, lowVramMode: o.lowVramMode === 'off' ? 'auto' : o.lowVramMode }),
  }
}

// The newest run folder under <cwd>/runs, by its RUNLOG/PLAN/TASKS times.
async function findRun($: EngineInterface): Promise<CockpitRun | null> {
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
  return {
    folder: `runs/${best.name}`,
    next: parseNext(runlog) ?? parseNext(tasks) ?? parseNext(plan),
    finish: parseFinish(plan) ?? parseFinish(runlog),
    open: countOpen(plan) + countOpen(tasks),
  }
}

async function refresh($: EngineInterface, o: Options, maxAgeMs: number) {
  const [run, p] = await Promise.all([findRun($), probe($, o, maxAgeMs)])
  const devices = describeDevices(p, o)
  await update($, view, v => ({ run, devices, lastGuard: v?.lastGuard ?? null }))
}

function noteGuard($: EngineInterface, text: string) {
  $.ui.toast(`bws-cockpit: ${text}`)
  void update($, view, v => ({ run: v?.run ?? null, devices: v?.devices ?? null, lastGuard: text }))
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
  }

  // ---------- Run Cockpit ----------

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'cockpit', description: 'Show the active run and editor/device status' })
    await $.command.register({ name: 'resume-run', description: 'Resume the newest run folder (RUNLOG, PLAN, TASKS)' })
    const surfaces = await $.session.surfaces()
    if (surfaces.length > 0) {
      void refresh($, o, 0)
      $.clock.every(o.refreshSeconds * 1000, () => void refresh($, o, 0))
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const surfaces = await $.session.surfaces()
    if (surfaces.length > 0) void refresh($, o, 15000)
    return next(e)
  })

  on('prompt.context', async ($, e, next) => {
    const result = await next(e)
    const run = await findRun($)
    if (run === null) return result
    const text =
      `Most recently updated run folder here: ${run.folder}` +
      (run.next ? `; next step: ${shorten(run.next, 200)}` : '') +
      `; ${run.open} open items. It may belong to another task: confirm before resuming it.`
    return { ...result, blocks: [...result.blocks, { name: 'bwsCockpit', text }] }
  })

  on('command.run', { command: 'cockpit' }, async ($, e, next) => {
    await refresh($, o, 0)
    const v = await read($, view)
    const d = v?.devices
    const devices = d ? [d.ue, d.unity, d.blender, d.adb, d.vram].join(' · ') + (d.isPressure ? ' · VRAM pressure' : '') : 'devices: n/a'
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

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const v = await read($, view)
    if (e.props.hasSurvey || v === null || (await read($, isHidden))) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const width = Math.max(30, (e.props.bodyColumns ?? 100) - 2)
    const run = v.run
    const d = v.devices
    const runLine = run
      ? `RUN ${run.folder.replace(/^runs\//, '')}  ·  ${run.open} open  ·  next: ${run.next ?? '–'}`
      : 'RUN none under runs/'
    return (
      <Box flexDirection="column">
        <Text wrap="truncate-end">{shorten(runLine, width)}</Text>
        {d ? (
          <Text dimColor wrap="truncate-end">
            {shorten(`${d.ue}  ·  ${d.unity}  ·  ${d.blender}  ·  ${d.adb}  ·  ${d.vram}${d.isPressure ? ' (pressure)' : ''}`, width)}
          </Text>
        ) : null}
        {v.lastGuard ? (
          <Text color="yellow" wrap="truncate-end">
            {shorten(`guard: ${v.lastGuard}`, width)}
          </Text>
        ) : null}
        <Box flexDirection="row" gap={1}>
          {run ? <Button key="resume" label="Resume run" hotkey="1" onPress={() => void resume($)} /> : null}
          <Button key="refresh" label="Refresh" hotkey="2" onPress={() => void refresh($, o, 0)} />
          <Button key="hide" label="Hide" hotkey="3" onPress={() => update($, isHidden, () => true)} />
        </Box>
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
    noteGuard($, `blocked ${e.tool}: ${p.ueMcp.url} down`)
    return {
      deny:
        `bws-cockpit: Unreal MCP at ${p.ueMcp.url} is not reachable: ${why}. ` +
        `Start or wait for the editor (if other editors or Blender are open, launch with low-VRAM flags), then retry. Ask Brian if you cannot.`,
    }
  })

  on('tool.call', { tool: ['Bash', 'PowerShell'], command: /adb/i }, async ($, e, next) => {
    if (!o.guard || !adbNeedsDevice(e.command)) return next(e)
    const p = await probe($, o, 5000)
    if (p.adb === undefined || p.adb.ready.length > 0) return next(e)
    const seen = p.adb.other.length > 0 ? p.adb.other.join(', ') : 'none attached'
    noteGuard($, `blocked adb: no ready device (${seen})`)
    return {
      deny: `bws-cockpit: no Android device is ready (adb devices: ${seen}). Ask Brian to connect and unlock the device, then retry.`,
    }
  })

  on('tool.call', { tool: ['Bash', 'PowerShell'], command: /unity/i }, async ($, e, next) => {
    if (!o.guard) return next(e)
    const fix = fixUnityLaunch(e.command)
    if (fix && 'deny' in fix) {
      noteGuard($, 'blocked a Unity launch without -automated')
      return { deny: `bws-cockpit: ${fix.deny}` }
    }
    if (fix) {
      noteGuard($, fix.note)
      return withNote(await next({ ...e, command: fix.command }), `${fix.note}; the command ran as: ${shorten(fix.command, 400)}`)
    }
    if (isUnityPipelineCommand(e.command)) {
      const p = await probe($, o, 5000)
      if (!p.procs.some(isUnity)) {
        noteGuard($, 'blocked a unity CLI command: no editor running')
        return {
          deny:
            'bws-cockpit: no Unity editor is running, so the unity CLI pipeline has nothing to talk to. ' +
            'Launch it first (unity open <project> --args -automated) and wait for the pipeline to come up, or ask Brian.',
        }
      }
    }
    return next(e)
  })

  on('tool.call', { tool: ['Bash', 'PowerShell'], command: /UnrealEditor\.exe/i }, async ($, e, next) => {
    if (!o.guard) return next(e)
    const launch = findUeGuiLaunch(e.command)
    if (!launch) return next(e)
    const p = await probe($, o, 3000)
    const open = p.procs.filter(isUeGui)
    if (launch.uproject) {
      const target = normPath(launch.uproject)
      const dupe = open.find(proc => normPath(proc.cmdline).includes(target))
      if (dupe) {
        noteGuard($, `blocked a second editor for ${launch.uproject}`)
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
      noteGuard($, 'blocked a UE launch without low-VRAM flags')
      return {
        deny:
          `bws-cockpit: other GPU apps are running (${describeDevices(p, o).vram}), so UE must launch with the low-VRAM overrides. ` +
          `Add this element to -ArgumentList and run again: '${arg}'`,
      }
    }
    const command = addLowVram(e.command, launch, o.cvars)
    noteGuard($, 'added low-VRAM overrides to the UE launch')
    return withNote(await next({ ...e, command }), `added low-VRAM -ini overrides to the UE launch (GPU pressure); the command ran as: ${shorten(command, 400)}`)
  })
}
