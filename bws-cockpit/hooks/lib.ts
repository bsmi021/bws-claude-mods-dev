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
