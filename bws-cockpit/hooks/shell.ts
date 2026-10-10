// Finds the programs a shell command actually runs, and classifies the ones the
// guard cares about. Only command position counts: a tool named inside an echo,
// a quoted argument, a comment, a heredoc body or a here-string is ignored.

export type Dialect = 'bash' | 'powershell'

export type Segment = { start: number; end: number }

export type Invocation = {
  program: string // the program as written, quotes removed
  base: string // its file name
  args: string // the rest of the segment
  argsStart: number // index of args in the command
  insertAt: number // where an appended argument goes: after the last argument, before any redirect
  isStartProcess: boolean // PowerShell Start-Process: args are its own parameters
}

const isSpace = (c: string | undefined) => c !== undefined && /\s/.test(c)

// Top-level segments of a command: split on ; | || && newlines (and & in bash,
// subshell parentheses in bash, braces in PowerShell), outside quotes, comments,
// heredoc bodies and here-strings.
export const splitSegments = (cmd: string, dialect: Dialect): Segment[] => {
  const isPs = dialect === 'powershell'
  const segs: Segment[] = []
  const heredocs: { word: string; strip: boolean }[] = []
  let start = 0
  let quote: string | undefined
  let i = 0
  const close = (end: number, next: number) => {
    if (end > start) segs.push({ start, end })
    start = next
  }
  while (i < cmd.length) {
    const c = cmd[i]
    if (quote !== undefined) {
      if (!isPs && quote === '"' && c === '\\') i += 2
      else if (isPs && c === '`') i += 2
      else {
        if (c === quote) quote = undefined
        i++
      }
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      i++
      continue
    }
    if ((!isPs && c === '\\') || (isPs && c === '`')) {
      i += 2
      continue
    }
    if (isPs && c === '@' && (cmd[i + 1] === "'" || cmd[i + 1] === '"') && /^\r?\n/.test(cmd.slice(i + 2, i + 4))) {
      const end = cmd.indexOf(`\n${cmd[i + 1]}@`, i + 2)
      i = end < 0 ? cmd.length : end + 3
      continue
    }
    if (c === '#' && (i === 0 || /[\s;|&()]/.test(cmd[i - 1] ?? '')) && !(isPs && cmd[i - 1] === '<')) {
      const nl = cmd.indexOf('\n', i)
      close(i, nl < 0 ? cmd.length : nl)
      i = nl < 0 ? cmd.length : nl
      continue
    }
    if (!isPs && c === '<' && cmd[i + 1] === '<' && cmd[i + 2] !== '<') {
      const m = /^<<(-?)\s*(["']?)([A-Za-z_][\w.-]*)\2/.exec(cmd.slice(i))
      if (m) {
        heredocs.push({ word: m[3] ?? '', strip: m[1] === '-' })
        i += m[0].length
        continue
      }
    }
    if (c === '\n') {
      close(i, i + 1)
      i++
      while (heredocs.length > 0) {
        const h = heredocs.shift()
        while (h && i < cmd.length) {
          const nl = cmd.indexOf('\n', i)
          const line = cmd.slice(i, nl < 0 ? cmd.length : nl).replace(/\r$/, '')
          i = nl < 0 ? cmd.length : nl + 1
          if ((h.strip ? line.replace(/^\t+/, '') : line) === h.word) break
        }
      }
      start = i
      continue
    }
    if (c === ';') {
      close(i, i + 1)
    } else if (c === '|') {
      const width = cmd[i + 1] === '|' ? 2 : 1
      close(i, i + width)
      i += width - 1
    } else if (c === '&') {
      if (cmd[i + 1] === '&') {
        close(i, i + 2)
        i++
      } else if (!isPs && cmd[i - 1] !== '>' && cmd[i - 1] !== '<' && cmd[i + 1] !== '>') {
        close(i, i + 1)
      }
    } else if (!isPs && (c === '(' || c === ')')) {
      close(i, i + 1)
    } else if (isPs && (c === '{' || c === '}')) {
      close(i, i + 1)
    }
    i++
  }
  close(cmd.length, cmd.length)
  return segs
}

type Token = { token: string; start: number; end: number }

const readToken = (s: string, from: number): Token => {
  let i = from
  while (isSpace(s[i])) i++
  const start = i
  let token = ''
  let quote: string | undefined
  for (; i < s.length; i++) {
    const c = s[i] ?? ''
    if (quote !== undefined) {
      if (c === quote) quote = undefined
      else token += c
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      continue
    }
    if (isSpace(c)) break
    token += c
  }
  return { token, start, end: i }
}

const tokens = (s: string): string[] => {
  const out: string[] = []
  for (let t = readToken(s, 0); t.token.length > 0 || t.end < s.length; t = readToken(s, t.end)) {
    if (t.token.length === 0) break
    out.push(t.token)
  }
  return out
}

const baseName = (p: string) => p.slice(Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')) + 1)

// Where an appended argument belongs: after the last argument, before a redirect.
const insertPoint = (cmd: string, from: number, to: number): number => {
  let quote: string | undefined
  let end = to
  for (let i = from; i < to; i++) {
    const c = cmd[i]
    if (quote !== undefined) {
      if (c === quote) quote = undefined
      continue
    }
    if (c === '"' || c === "'") quote = c
    else if ((c === '>' || c === '<') && (isSpace(cmd[i - 1]) || /\d|&/.test(cmd[i - 1] ?? ''))) {
      end = /\d|&/.test(cmd[i - 1] ?? '') ? i - 1 : i
      break
    }
  }
  // Step back over trailing whitespace and line continuations (`\` or `` ` `` before a newline).
  for (;;) {
    while (end > from && isSpace(cmd[end - 1])) end--
    if (end > from && (cmd[end - 1] === '\\' || cmd[end - 1] === '`') && /^[ \t]*\r?\n/.test(cmd.slice(end))) end--
    else break
  }
  return end
}

const WRAPPERS = /^(?:nohup|exec|command|time|sudo|!|&|\.|env)$/i

export const invocationOf = (cmd: string, seg: Segment, dialect: Dialect): Invocation | undefined => {
  const text = cmd.slice(seg.start, seg.end)
  const isPs = dialect === 'powershell'
  let at = 0
  let isCalled = false // PowerShell `&`: the next token is run even when quoted
  for (let guard = 0; guard < 16; guard++) {
    const t = readToken(text, at)
    if (t.token.length === 0) return undefined
    if (!isPs && /^[A-Za-z_]\w*=/.test(t.token)) {
      at = t.end
      continue
    }
    if (isPs && /^\$[\w:]+$/.test(t.token) && readToken(text, t.end).token === '=') {
      at = readToken(text, t.end).end
      continue
    }
    // PowerShell `$x=value` in one token assigns a value; it runs nothing.
    if (isPs && /^\$[\w:]+=./.test(t.token)) return undefined
    if (t.token === '&') isCalled = true
    if (WRAPPERS.test(t.token)) {
      at = t.end
      continue
    }
    // PowerShell: a quoted string at statement start is a value, not a command, unless called with `&`.
    if (isPs && !isCalled && (text[t.start] === '"' || text[t.start] === "'")) return undefined
    if (/^timeout$/i.test(t.token)) {
      let j = t.end
      for (let k = 0; k < 6; k++) {
        const r = readToken(text, j)
        if (/^-[sk]$/.test(r.token)) j = readToken(text, r.end).end
        else if (/^-/.test(r.token)) j = r.end
        else if (/^\d+(?:\.\d+)?[smhd]?$/.test(r.token)) {
          j = r.end
          break
        } else break
      }
      at = j
      continue
    }
    const make = (program: Token, argsFrom: number, isStartProcess: boolean): Invocation => ({
      program: program.token,
      base: baseName(program.token),
      args: text.slice(argsFrom),
      argsStart: seg.start + argsFrom,
      insertAt: insertPoint(cmd, seg.start + argsFrom, seg.end),
      isStartProcess,
    })
    if (/^(?:Start-Process|saps)$/i.test(t.token) || (dialect === 'powershell' && /^start$/i.test(t.token))) {
      const first = readToken(text, t.end)
      if (first.token.length > 0 && !first.token.startsWith('-')) return make(first, first.end, true)
      const fp = /\s-FilePath\s+/i.exec(text)
      if (!fp) return undefined
      const value = readToken(text, fp.index + fp[0].length)
      return make(value, value.end, true)
    }
    return make(t, t.end, false)
  }
  return undefined
}

export const invocations = (cmd: string, dialect: Dialect): Invocation[] =>
  splitSegments(cmd, dialect)
    .map(seg => invocationOf(cmd, seg, dialect))
    .filter((inv): inv is Invocation => inv !== undefined)

// The first word of args that is not an option (skipping the values of `valued` options).
const subcommand = (args: string, valued: ReadonlySet<string>): string | undefined => {
  const ts = tokens(args)
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i] ?? ''
    if (t === '--') continue
    if (t.startsWith('-')) {
      if (valued.has(t) && !t.includes('=')) i++
      continue
    }
    return t.toLowerCase()
  }
  return undefined
}

// ---------- adb ----------

const ADB_SAFE = new Set(['devices', 'start-server', 'kill-server', 'connect', 'disconnect', 'pair', 'version', 'help', 'mdns', 'reconnect', 'keygen', 'wait-for-device', 'wait-for-usb-device', 'wait-for-any-device'])
const ADB_VALUED = new Set(['-s', '-t', '-H', '-P', '-L'])

const isAdb = (inv: Invocation) => /^adb(?:\.exe)?$/i.test(inv.base) || /^\$\{?adb\}?$/i.test(inv.program)

// An adb call that talks to a device.
export const adbNeedsDevice = (cmd: string, dialect: Dialect = 'bash'): boolean =>
  invocations(cmd, dialect).some(inv => {
    if (inv.isStartProcess || !isAdb(inv)) return false
    const sub = subcommand(inv.args, ADB_VALUED)
    return sub !== undefined && !ADB_SAFE.has(sub)
  })

// ---------- Unity ----------

const UNITY_VALUED = new Set(['--format', '--project-path', '--timeout', '--log-level', '--query', '--detail', '--version'])

const isUnityEditorExe = (inv: Invocation) => /^unity\.exe$/i.test(inv.base) && /[\\/]Editor[\\/]Unity\.exe$/i.test(inv.program)
const isUnityCli = (inv: Invocation) => /^unity(?:\.exe)?$/i.test(inv.base) && !isUnityEditorExe(inv)

// `unity [opts] command ...`: the Unity CLI talking to a running editor's pipeline.
export const isUnityPipelineCommand = (cmd: string, dialect: Dialect = 'bash'): boolean =>
  invocations(cmd, dialect).some(inv => !inv.isStartProcess && isUnityCli(inv) && subcommand(inv.args, UNITY_VALUED) === 'command')

export type Fix = { command: string; note: string } | { deny: string } | undefined

const applyEdits = (cmd: string, edits: { at: number; text: string }[]) =>
  [...edits].sort((a, b) => b.at - a.at).reduce((s, e) => s.slice(0, e.at) + e.text + s.slice(e.at), cmd)

// Unity editor launches without -automated get it. A Start-Process launch is
// refused with the argument to add: its -ArgumentList is not rewritten.
export const fixUnityLaunch = (cmd: string, dialect: Dialect = 'bash'): Fix => {
  const edits: { at: number; text: string }[] = []
  const notes: string[] = []
  for (const inv of invocations(cmd, dialect)) {
    const isOpen =
      isUnityCli(inv) &&
      (inv.isStartProcess ? /-ArgumentList\s+[@('"\s]*open\b/i.test(inv.args) : subcommand(inv.args, UNITY_VALUED) === 'open')
    const isEditor = isUnityEditorExe(inv) && /-projectPath\b/i.test(inv.args)
    if (!isOpen && !isEditor) continue
    if (/(?:^|[\s'",])-automated\b/.test(inv.args) || /-batchmode\b/i.test(inv.args) || /(?:^|\s)(?:--help|-h)\b/.test(inv.args)) continue
    if (inv.isStartProcess) {
      return {
        deny:
          'Unity must start with -automated (modal dialogs otherwise block the pipeline). Add it to -ArgumentList ' +
          '(e.g. "open","<project>","--args","-automated" for the unity CLI, or "-projectPath","<project>","-automated" for Unity.exe) and run again.',
      }
    }
    if (isOpen) {
      const m = /(?:^|\s)--args(?=\s|$)/.exec(inv.args)
      if (m) edits.push({ at: inv.argsStart + m.index + m[0].length, text: ' -automated' })
      else edits.push({ at: inv.insertAt, text: ' --args -automated' })
      notes.push('added -automated to unity open')
    } else {
      edits.push({ at: inv.insertAt, text: ' -automated' })
      notes.push('added -automated to the Unity editor launch')
    }
  }
  return edits.length > 0 ? { command: applyEdits(cmd, edits), note: [...new Set(notes)].join('; ') } : undefined
}

// ---------- Unreal ----------

export type UeLaunch = { insertAt: number; uproject?: string; isStartProcess: boolean; hasOverrides: boolean; isRender: boolean }

// Render settings the command already sets, anywhere in it: the arguments can sit in a variable
// (PowerShell `$args = @(...)` then `-ArgumentList $args`), so the launch's own args are not enough.
const HAS_RENDER_SETTINGS = /\[SystemSettings\]:|-ExecCmds|\br\.ScreenPercentage\b|\bt\.MaxFPS\b|\bsg\.\w+Quality\b/i
// An unattended capture or render run, where halving the screen percentage ruins the output.
const IS_RENDER_RUN = /(?:^|[\s'",(@])-unattended\b|\bHighResShot\b|-RenderOffscreen\b|MoviePipeline|-MovieSceneCaptureType\b/i

// A GUI editor launch: UnrealEditor.exe in command position, not a commandlet,
// -nullrhi, -game or -server run.
export const findUeGuiLaunch = (cmd: string, dialect: Dialect = 'bash'): UeLaunch | undefined => {
  for (const inv of invocations(cmd, dialect)) {
    if (!/^UnrealEditor(?:\.exe)?$/i.test(inv.base)) continue
    if (/-run=|-nullrhi\b|(?:^|[\s'",])-game\b|-server\b/i.test(inv.args)) continue
    const up = inv.args.match(/([A-Za-z]:[\\/][^"'\n,]*?\.uproject)/i)
    return {
      insertAt: inv.insertAt,
      uproject: up?.[1],
      isStartProcess: inv.isStartProcess,
      hasOverrides: HAS_RENDER_SETTINGS.test(cmd),
      isRender: IS_RENDER_RUN.test(cmd),
    }
  }
  return undefined
}

export const lowVramArg = (cvars: readonly string[]) => '-ini:Engine:' + cvars.map(c => `[SystemSettings]:${c}`).join(',')

export const addLowVram = (cmd: string, launch: UeLaunch, cvars: readonly string[]) =>
  applyEdits(cmd, [{ at: launch.insertAt, text: ' ' + lowVramArg(cvars) }])

export const normPath = (p: string) => p.replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase()
