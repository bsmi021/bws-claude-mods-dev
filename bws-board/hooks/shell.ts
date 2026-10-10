// Shell parsing for claims: which files a Bash or PowerShell command writes. Only command
// position counts: a tool named inside an echo, a quoted argument, a comment, a heredoc body or
// a here-string is ignored. Ported from bws-cockpit's shell.ts (the Session Bus part).

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

export const normPath = (p: string) => p.replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase()

// ---------- file writes ----------

export type WriteVia = 'redirect' | 'tee' | 'sed -i' | 'cp' | 'mv' | 'mv source' | 'cmdlet'
// `path` is as written, joined to the folder an earlier `cd` in the command moved to. `isGuess`:
// cp/mv's destination read as a folder (dest/<source name>), which may not be the file written.
export type WriteTarget = { path: string; via: WriteVia; isGuess?: true }

type Word = { text: string; isQuoted: boolean }

// The words of a segment with quotes and escapes resolved, and its output redirect targets.
// `>&2`, `2>&1` and `=>`/`->` arrows are not redirects to a file.
const lexSegment = (raw: string, dialect: Dialect): { words: Word[]; redirects: string[] } => {
  const isPs = dialect === 'powershell'
  // A line continuation (`\` or `` ` `` before a newline) is a space; a here-string body is one word.
  const s = isPs ? raw.replace(/@(['"])\r?\n[\s\S]*?\r?\n\1@/g, '@here').replace(/`\r?\n/g, ' ') : raw.replace(/\\\r?\n/g, ' ')
  const words: Word[] = []
  const redirects: string[] = []
  let i = 0
  const readWord = (): Word | undefined => {
    while (isSpace(s[i])) i++
    if (i >= s.length) return undefined
    let text = ''
    let isQuoted = false
    let quote: string | undefined
    for (; i < s.length; i++) {
      const c = s[i] ?? ''
      if (quote !== undefined) {
        if (c === quote) quote = undefined
        else if (!isPs && quote === '"' && c === '\\' && /["\\$`]/.test(s[i + 1] ?? '')) text += s[++i] ?? ''
        else if (isPs && c === '`') text += s[++i] ?? ''
        else text += c
        continue
      }
      if (c === '"' || c === "'") {
        quote = c
        isQuoted = true
        continue
      }
      if (isSpace(c) || c === '>' || (c === '<' && !isPs)) break
      if ((!isPs && c === '\\') || (isPs && c === '`')) {
        text += s[++i] ?? ''
        continue
      }
      text += c
    }
    return { text, isQuoted }
  }
  while (i < s.length) {
    while (isSpace(s[i])) i++
    if (i >= s.length) break
    const c = s[i]
    if (c === '>' || ((c === '&' || /\d/.test(c ?? '')) && s[i + 1] === '>' && (i === 0 || isSpace(s[i - 1])))) {
      // operator: [n|&]>[>|]
      if (c !== '>') i++
      i++
      if (s[i] === '>' || s[i] === '|') i++
      if (s[i] === '&') {
        i++
        readWord() // a file descriptor: 2>&1, >&2
        continue
      }
      const target = readWord()
      if (target !== undefined && target.text.length > 0) redirects.push(target.text)
      continue
    }
    if (c === '<' && !isPs) {
      i++
      if (s[i] === '<') i++
      readWord()
      continue
    }
    const w = readWord()
    if (w === undefined) break
    // An arrow glued to a word (`=>`, `->`) is not a redirect.
    if (s[i] === '>' && !w.isQuoted && /[-=]$/.test(w.text)) {
      i++
      continue
    }
    if (w.text.length > 0 || w.isQuoted) words.push(w)
    else i++
  }
  return { words, redirects }
}

// Paths a write cannot be pinned to: devices, variables, globs, substitutions, network shares.
const isConcrete = (p: string) =>
  p.length > 0 && !/^(?:\/dev\/|nul$|\$null$|con$)/i.test(p) && !/[$`*?{}()[\]<>|]/.test(p) && !p.startsWith('~') && !/^(?:\\\\|\/\/)/.test(p)

const isAbsPath = (p: string) => /^[a-z]:[\\/]/i.test(p) || p.startsWith('/') || p.startsWith('\\')
const joinTo = (base: string, p: string) => (base === '' || isAbsPath(p) ? p : `${base.replace(/[\\/]+$/, '')}/${p}`)
const lastName = (p: string) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? p

// cp and mv: the destination (and, for one source, the destination as a folder), and mv's sources.
const copyTargets = (args: string[], targetDir: string | undefined, isMove: boolean): WriteTarget[] => {
  const via: WriteVia = isMove ? 'mv' : 'cp'
  const sources = targetDir !== undefined ? args : args.slice(0, -1)
  const dest = targetDir ?? args[args.length - 1]
  if (dest === undefined || sources.length === 0) return []
  const out: WriteTarget[] = []
  // One source onto a name that is not plainly a folder: the name is the file; else dest/<name>.
  const isFolder = targetDir !== undefined || sources.length > 1 || /[\\/.]$/.test(dest)
  if (!isFolder) out.push({ path: dest, via })
  for (const src of sources) out.push(isFolder ? { path: joinTo(dest, lastName(src)), via } : { path: joinTo(dest, lastName(src)), via, isGuess: true })
  if (isMove) for (const src of sources) out.push({ path: src, via: 'mv source' })
  return out
}

const sedTargets = (args: string[]): WriteTarget[] => {
  let inPlace = false
  let hasScript = false
  const rest: string[] = []
  for (let k = 0; k < args.length; k++) {
    const a = args[k] ?? ''
    if (a === '--') {
      rest.push(...args.slice(k + 1))
      break
    }
    if (/^--in-place(?:=.*)?$/.test(a)) inPlace = true
    else if (/^--(?:expression|file)$/.test(a)) {
      hasScript = true
      k++
    } else if (/^--(?:expression|file)=/.test(a)) hasScript = true
    else if (/^-[a-zA-Z]/.test(a)) {
      // -i, -i.bak, -ni; -e and -f take the next word unless glued (-e's/x/y/')
      const flags = /^-([a-zA-Z]*)/.exec(a)?.[1] ?? ''
      const ef = flags.search(/[ef]/)
      if ((ef < 0 ? flags : flags.slice(0, ef)).includes('i')) inPlace = true
      if (ef >= 0) {
        hasScript = true
        if (a.length === ef + 2) k++
      }
    } else rest.push(a)
  }
  if (!inPlace) return []
  return (hasScript ? rest : rest.slice(1)).map(path => ({ path, via: 'sed -i' }))
}

const bashWrites = (base: string, args: string[]): WriteTarget[] => {
  const b = base.toLowerCase().replace(/\.exe$/, '')
  if (b === 'tee') return args.filter(a => !a.startsWith('-')).map(path => ({ path, via: 'tee' }))
  if (b === 'sed') return sedTargets(args)
  if (b === 'cp' || b === 'mv') {
    const plain: string[] = []
    let targetDir: string | undefined
    for (let k = 0; k < args.length; k++) {
      const a = args[k] ?? ''
      if (a === '-t' || a === '--target-directory') targetDir = args[++k]
      else if (a.startsWith('--target-directory=')) targetDir = a.slice('--target-directory='.length)
      else if (a === '-S' || a === '--suffix') k++
      else if (!a.startsWith('-')) plain.push(a)
    }
    return copyTargets(plain, targetDir, b === 'mv')
  }
  return []
}

// PowerShell parameters that take a value, so the word after them is not positional.
const PS_VALUED =
  /^-(?:value|encoding|width|inputobject|stream|delimiter|filter|include|exclude|credential|itemtype|type|name|destination|path|literalpath|filepath|pspath|lp|variable|erroraction|ea|warningaction|wa|outvariable|ov|errorvariable|ev)$/i
const PS_PATH = /^-(?:path|literalpath|filepath|pspath|lp)$/i

// Named and positional arguments of a PowerShell cmdlet call; `-Name:value` is split.
const psArgs = (args: string[]) => {
  const named = new Map<string, string>()
  const positional: string[] = []
  for (let k = 0; k < args.length; k++) {
    const a = args[k] ?? ''
    const colon = /^(-[A-Za-z]+):(.+)$/.exec(a)
    if (colon) named.set((colon[1] ?? '').toLowerCase(), colon[2] ?? '')
    else if (/^-[A-Za-z]/.test(a)) named.set(a.toLowerCase(), PS_VALUED.test(a) ? (args[++k] ?? '') : '')
    // `a, b` is one array argument: the words a trailing comma joins.
    else if (positional.length > 0 && (positional[positional.length - 1] ?? '').endsWith(',')) positional[positional.length - 1] += a
    else positional.push(a)
  }
  const path = [...named].find(([k]) => PS_PATH.test(k))?.[1]
  return { named, positional, path }
}

const psWrites = (base: string, args: string[]): WriteTarget[] => {
  const b = base.toLowerCase()
  const a = psArgs(args)
  if (/^(?:set-content|sc|add-content|ac|out-file|clear-content|clc|tee-object|tee)$/.test(b)) {
    const p = a.path ?? a.positional[0]
    return p !== undefined ? [{ path: p, via: 'cmdlet' }] : []
  }
  if (/^(?:new-item|ni)$/.test(b)) {
    if ((a.named.get('-itemtype') ?? a.named.get('-type') ?? 'file').toLowerCase() !== 'file') return []
    const p = a.path ?? a.positional[0]
    const name = a.named.get('-name')
    if (name !== undefined) return [{ path: joinTo(p ?? '', name), via: 'cmdlet' }]
    return p !== undefined ? [{ path: p, via: 'cmdlet' }] : []
  }
  if (/^(?:copy-item|copy|cpi|cp|move-item|move|mi|mv)$/.test(b)) {
    const src = a.path ?? a.positional[0]
    const dest = a.named.get('-destination') ?? (a.path !== undefined ? a.positional[0] : a.positional[1])
    if (src === undefined || dest === undefined) return []
    // `-Path a, b` is a list of sources.
    const sources = src.split(',').map(x => x.trim()).filter(Boolean)
    return copyTargets([...sources, dest], undefined, /^(?:move-item|move|mi|mv)$/.test(b))
  }
  return []
}

const CD = /^(?:cd|chdir|pushd|set-location|sl|push-location)$/i

// The files a shell command writes: output redirects, tee, sed -i, cp/mv destinations and mv
// sources, and the PowerShell write cmdlets. Command position only, as the guard reads it: a
// write named in an echo argument, a quoted string, a comment or a heredoc body is not one. A
// `cd` earlier in the command moves where later relative paths land; after one it cannot follow
// (a variable, `cd -`), relative paths are dropped. Paths built from variables or globs are skipped.
export const writeTargets = (cmd: string, dialect: Dialect): WriteTarget[] => {
  const out: WriteTarget[] = []
  let base: string | undefined = ''
  for (const seg of splitSegments(cmd, dialect)) {
    // `(( a > b ))` is arithmetic in bash, not a redirect.
    if (dialect === 'bash' && cmd[seg.start - 1] === '(' && cmd[seg.start - 2] === '(') continue
    const inv = invocationOf(cmd, seg, dialect)
    const found: WriteTarget[] = []
    if (inv !== undefined && !inv.isStartProcess) {
      const args = lexSegment(inv.args, dialect).words.map(w => w.text)
      if (CD.test(inv.base)) {
        const dir = args.find(x => !x.startsWith('-'))
        if (dir === undefined || !isConcrete(dir)) base = undefined
        else if (base !== undefined) base = joinTo(base, dir)
        else if (isAbsPath(dir)) base = dir
        continue
      }
      // `[ a > b ]` and `[[ a > b ]]` compare strings.
      if (dialect === 'bash' && /^(?:\[|\[\[|test)$/.test(inv.base)) continue
      found.push(...(dialect === 'powershell' ? psWrites(inv.base, args) : bashWrites(inv.base, args)))
    }
    found.push(...lexSegment(cmd.slice(seg.start, seg.end), dialect).redirects.map(path => ({ path, via: 'redirect' as const })))
    for (const t of found) {
      if (!isConcrete(t.path) || (base === undefined && !isAbsPath(t.path))) continue
      out.push({ ...t, path: joinTo(base ?? '', t.path) })
    }
  }
  return out
}
