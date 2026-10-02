// Pure helpers: parsing probe output, run files and shell commands.
// No `$` here, so tests can call them directly.

export type Proc = { name: string; pid: number; cmdline: string }

export type Probe = {
  at: number
  procs: Proc[]
  vram?: { usedMb: number; totalMb: number }
  adb?: { ready: string[]; other: string[] } // undefined when adb is missing
  ueMcp?: { url: string; isUp: boolean } // undefined when the project has no unreal-mcp
}

export type RunInfo = {
  folder: string
  next?: string
  finish?: string
  open: number
}

export const LOW_VRAM_CVARS: readonly string[] = [
  't.MaxFPS=30',
  'r.ScreenPercentage=50',
  'r.Streaming.PoolSize=768',
  'sg.ViewDistanceQuality=0',
  'sg.TextureQuality=1',
  'sg.ShadowQuality=0',
  'sg.ShadingQuality=0',
  'sg.ReflectionQuality=0',
  'sg.PostProcessQuality=0',
  'sg.GlobalIlluminationQuality=0',
  'sg.FoliageQuality=0',
  'sg.EffectsQuality=0',
]

// ---------- probe parsing ----------

// Lines of `name|pid|commandline` from the PowerShell process query.
export const parseProcs = (stdout: string): Proc[] =>
  stdout
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => {
      const [name = '', pid = '0', ...rest] = line.split('|')
      return { name: name.toLowerCase(), pid: Number(pid) || 0, cmdline: rest.join('|') }
    })
    .filter(p => p.name.length > 0)

export const parseVram = (stdout: string): Probe['vram'] => {
  const m = stdout.match(/(\d+)\s*,\s*(\d+)/)
  return m ? { usedMb: Number(m[1]), totalMb: Number(m[2]) } : undefined
}

export const parseAdb = (stdout: string): { ready: string[]; other: string[] } => {
  const ready: string[] = []
  const other: string[] = []
  for (const line of stdout.split(/\r?\n/)) {
    const m = line.trim().match(/^(\S+)\s+(device|offline|unauthorized|recovery|sideload|bootloader|no permissions.*)$/)
    if (!m) continue
    const [, serial = '', state = ''] = m
    if (state === 'device') ready.push(serial)
    else other.push(`${serial} ${state}`)
  }
  return { ready, other }
}

// The unreal-mcp endpoint from a project's .mcp.json: an http server's url, or
// the http URL a stdio proxy is handed in its args.
// With `server`, that entry only; without, the first entry whose name has "unreal".
export const parseUnrealMcpUrl = (mcpJson: string, server?: string): string | undefined => {
  let parsed: unknown
  try {
    parsed = JSON.parse(mcpJson)
  } catch {
    return undefined
  }
  const servers = (parsed as { mcpServers?: Record<string, { url?: string; args?: string[] }> })?.mcpServers
  if (!servers) return undefined
  const key = server !== undefined ? (server in servers ? server : undefined) : Object.keys(servers).find(k => /unreal/i.test(k))
  if (!key) return undefined
  const s = servers[key]
  if (!s) return undefined
  if (typeof s.url === 'string') return s.url
  return (s.args ?? []).find(a => typeof a === 'string' && /^https?:\/\//.test(a))
}

export const isUeGui = (p: Proc) => p.name === 'unrealeditor.exe'
export const isUnity = (p: Proc) => p.name === 'unity.exe'
export const isBlender = (p: Proc) => p.name === 'blender.exe'

// ---------- run folder ----------

export const countOpen = (text: string) => (text.match(/^\s*[-*]\s+\[ \]/gm) ?? []).length

const clean = (s: string) => s.replace(/\*\*/g, '').replace(/`/g, '').trim()

// The next step: an explicit "Next:" line wins (the last one, as RUNLOGs append),
// else the first bullet under a heading that names the next step.
export const parseNext = (text: string): string | undefined => {
  const lines = text.split(/\r?\n/)
  let found: string | undefined
  for (const line of lines) {
    const m = line.match(/^\s*(?:[-*]\s+)?\**next(?:\s+step)?s?\**\s*[:—-]\s*(.+)$/i)
    if (m?.[1]) found = clean(m[1])
  }
  if (found) return found
  return firstBulletUnder(lines, /^#{1,4}\s.*\bnext\b/i)
}

const firstBulletUnder = (lines: readonly string[], heading: RegExp): string | undefined => {
  for (let i = 0; i < lines.length; i++) {
    if (!heading.test(lines[i] ?? '')) continue
    for (let j = i + 1; j < lines.length && !/^#{1,4}\s/.test(lines[j] ?? ''); j++) {
      const b = (lines[j] ?? '').match(/^\s*(?:[-*]|\d+\.)\s+(.+)$/)
      if (b?.[1]) return clean(b[1])
    }
  }
  return undefined
}

export const parseFinish = (text: string): string | undefined =>
  firstBulletUnder(text.split(/\r?\n/), /^#{1,4}\s.*finish line/i)

export const shorten = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

// ---------- command classification ----------

// The end of the shell segment holding position `from`: the first separator
// (&&, ||, |, ;, newline, redirect, background &) after it, outside quotes.
// Quotes are tracked from the start of the command, since `from` can sit
// inside a quoted path.
export const segmentEnd = (cmd: string, from: number): number => {
  let quote: string | undefined
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i]
    if (quote) {
      if (c === quote) quote = undefined
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      continue
    }
    if (i < from) continue
    if (c === '\n' || c === ';' || c === '|' || c === '>') return i
    if (c === '&' && cmd[i + 1] === '&') return i
    if (c === '&' && /\s/.test(cmd[i - 1] ?? '') && /^\s?$/.test(cmd[i + 1] ?? '')) return i
    if (/\d/.test(c ?? '') && cmd[i + 1] === '>' && /\s/.test(cmd[i - 1] ?? '')) return i
  }
  return cmd.length
}

// Inserts ` text` at the end of a segment, before trailing whitespace.
const appendToSegment = (cmd: string, start: number, text: string) => {
  let end = segmentEnd(cmd, start)
  while (end > start && /\s/.test(cmd[end - 1] ?? '')) end--
  return cmd.slice(0, end) + ' ' + text + cmd.slice(end)
}

const ADB_SAFE = new Set(['devices', 'start-server', 'kill-server', 'connect', 'disconnect', 'pair', 'version', 'help', 'mdns', 'reconnect', 'wait-for-device', 'wait-for-usb-device', 'wait-for-any-device'])

// adb invocations that talk to a device. `adb -s X shell ...` counts; a device
// selector or global option before the subcommand is skipped.
export const adbNeedsDevice = (cmd: string): boolean => {
  const re = /(?:^|[\s"'&|;(\\/])adb(?:\.exe)?["']?((?:\s+-[a-zA-Z](?:\s+(?!-)\S+)?)*)\s+([a-z][\w-]*)/g
  for (const m of cmd.matchAll(re)) {
    if (!ADB_SAFE.has(m[2] ?? '')) return true
  }
  return false
}

// `unity [opts] command ...`: the Unity CLI talking to a running editor.
export const isUnityPipelineCommand = (cmd: string) =>
  /(?:^|[\s"'&|;(\\/])unity(?:\.exe)?["']?(?:\s+--?[\w-]+(?:\s+(?!-)\S+)?)*\s+command\b/i.test(cmd) &&
  !/\bunity(?:\.exe)?["']?\s+open\b/i.test(cmd)

export type Fix = { command: string; note: string } | { deny: string } | undefined

// Unity launches without -automated get it; Start-Process forms are refused
// with the shape to use, as their argument lists are not rewritten safely.
export const fixUnityLaunch = (cmd: string): Fix => {
  if (/-automated\b/.test(cmd)) return undefined
  if (/Start-Process[^\n]*(?:\bunity\b|Unity\.exe)/i.test(cmd)) {
    return {
      deny:
        'Unity must start with -automated (modal dialogs otherwise block the pipeline). Add it to the argument list, e.g. -ArgumentList "open","<project>","--args","-automated", and run again.',
    }
  }
  const open = /(?:^|[\s"'&|;(])unity(?:\.exe)?["']?\s+open\b/i.exec(cmd)
  if (open) {
    const start = open.index
    const end = segmentEnd(cmd, start)
    const seg = cmd.slice(start, end)
    const args = seg.search(/\s--args\b/)
    if (args >= 0) {
      const at = start + args + ' --args'.length
      return { command: cmd.slice(0, at) + ' -automated' + cmd.slice(at), note: 'added -automated to unity open' }
    }
    return { command: appendToSegment(cmd, start, '--args -automated'), note: 'added --args -automated to unity open' }
  }
  const exe = /Unity\.exe["']?(?=[^\n]*-projectPath)/i.exec(cmd)
  if (exe) {
    return { command: appendToSegment(cmd, exe.index, '-automated'), note: 'added -automated to the Unity launch' }
  }
  return undefined
}

export type UeLaunch = { index: number; uproject?: string; isStartProcess: boolean; hasOverrides: boolean }

// A GUI editor launch: UnrealEditor.exe (not -Cmd) without a commandlet,
// -nullrhi, -game or -server.
export const findUeGuiLaunch = (cmd: string): UeLaunch | undefined => {
  const m = /UnrealEditor\.exe/i.exec(cmd)
  if (!m) return undefined
  const end = segmentEnd(cmd, m.index)
  const seg = cmd.slice(m.index, end)
  const line = cmd.slice(cmd.lastIndexOf('\n', m.index) + 1, end)
  if (/-run=|-nullrhi\b|(?:^|\s|['"])-game\b|-server\b/i.test(seg)) return undefined
  if (/^\s*(?:Get-Process|Stop-Process|taskkill|tasklist|ls|dir|cat|Test-Path|Get-Item|grep|rg)\b/i.test(line)) return undefined
  const up = cmd.slice(m.index).match(/([A-Za-z]:[\\/][^"'\n]*?\.uproject)/i)
  return {
    index: m.index,
    uproject: up?.[1],
    isStartProcess: /Start-Process/i.test(line),
    hasOverrides: /-ExecCmds|-ini:Engine:\[SystemSettings\]/i.test(seg) || /-ExecCmds|SystemSettings/i.test(line),
  }
}

export const lowVramArg = (cvars: readonly string[]) =>
  '-ini:Engine:' + cvars.map(c => `[SystemSettings]:${c}`).join(',')

export const addLowVram = (cmd: string, launch: UeLaunch, cvars: readonly string[]) =>
  appendToSegment(cmd, launch.index, lowVramArg(cvars))

export const normPath = (p: string) => p.replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase()
