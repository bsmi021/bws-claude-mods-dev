// Pure pieces of the read guard (FR-SB-03, no `$`): does a Read, Grep, Glob or Bash call reach the secrets folder?
// Paths are compared lower-cased with forward slashes (Windows paths are case-insensitive; on other systems this errs
// toward refusing). A Bash command is matched on the folder's path in any of the forms a shell accepts, anywhere in
// the command (a script in a heredoc can read it too), never on the bare folder name (DECISIONS.md D8).
import { slashes } from './secrets'

function key(p: string): string {
  return slashes(p).toLowerCase().replace(/\/+/g, '/').replace(/(.)\/$/, '$1')
}

// `.` and `..` resolved; a relative path joined to cwd; `~` expanded.
export function resolvePath(p: string, cwd: string, home: string): string {
  let s = slashes(p.trim())
  if (s === '~' || s.startsWith('~/')) s = slashes(home) + s.slice(1)
  else if (/^\/[a-zA-Z]\//.test(s) || /^\/[a-zA-Z]$/.test(s)) s = `${s[1]}:${s.slice(2) || '/'}` // Git Bash's /c/...
  const isAbs = /^[a-zA-Z]:\//.test(s) || /^[a-zA-Z]:$/.test(s) || s.startsWith('/')
  if (!isAbs) s = `${slashes(cwd)}/${s}`
  const head = /^[a-zA-Z]:/.test(s) ? s.slice(0, 2) : ''
  const parts: string[] = []
  for (const part of s.slice(head.length).split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return `${head}/${parts.join('/')}`
}

export function isInside(target: string, dir: string): boolean {
  const t = key(target)
  const d = key(dir)
  return t === d || t.startsWith(`${d}/`)
}

// True when a search rooted at `target` would walk into `dir`: the folder itself, inside it, or a parent of it.
export function reaches(target: string, dir: string): boolean {
  const t = key(target)
  const d = key(dir)
  return isInside(t, d) || d.startsWith(t === '/' || /^[a-z]:$/.test(t) ? `${t.replace(/\/$/, '')}/` : `${t}/`)
}

// The forms a shell command may name the folder by, lower-cased, forward slashes.
export function dirForms(dir: string, home: string, cwd: string): string[] {
  const d = key(dir)
  const forms = new Set<string>([d])
  const drive = /^([a-z]):\/(.*)$/.exec(d)
  if (drive) forms.add(`/${drive[1]}/${drive[2]}`)
  const h = key(home)
  if (h !== '' && d.startsWith(`${h}/`)) {
    const rel = d.slice(h.length + 1)
    for (const base of ['~', '$home', '${home}', '%userprofile%', '$env:userprofile', '${env:userprofile}']) forms.add(`${base}/${rel}`)
  }
  const c = key(cwd)
  if (c !== '' && d.startsWith(`${c}/`)) forms.add(d.slice(c.length + 1))
  return [...forms]
}

// A command as matched: lower case, forward slashes, quotes dropped (so `"$HOME"/.claude/...` still matches).
function flat(command: string): string {
  return slashes(command).toLowerCase().replace(/["'`]/g, '').replace(/\/+/g, '/')
}

export function bashTouches(command: string, forms: readonly string[]): boolean {
  const c = flat(command)
  return forms.some(f => {
    let i = c.indexOf(f)
    while (i >= 0) {
      const after = c[i + f.length] ?? ''
      // the folder itself or something in it, not a longer name that starts the same (bws-secrets-old)
      if (after === '' || after === '/' || !/[a-z0-9_.-]/.test(after)) return true
      i = c.indexOf(f, i + 1)
    }
    return false
  })
}

export type GuardInput = { tool: string; file_path?: unknown; path?: unknown; pattern?: unknown; command?: unknown }

// Whether this call would read the secrets folder.
export function touchesSecrets(e: GuardInput, dir: string, cwd: string, home: string): boolean {
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  if (e.tool === 'Read') return str(e.file_path) !== '' && isInside(resolvePath(str(e.file_path), cwd, home), dir)
  if (e.tool === 'Grep' || e.tool === 'Glob') {
    const root = resolvePath(str(e.path) || '.', cwd, home)
    if (reaches(root, dir)) return true
    // A Glob pattern can carry its own absolute path.
    const pattern = str(e.pattern)
    if (e.tool === 'Glob' && /^(~|[a-zA-Z]:|\/)/.test(pattern)) {
      const fixed = pattern.split(/[*?[{]/)[0] ?? ''
      return reaches(resolvePath(fixed.replace(/\/[^/]*$/, '') || fixed, cwd, home), dir)
    }
    return false
  }
  if (e.tool === 'Bash') return bashTouches(str(e.command), dirForms(dir, home, cwd))
  return false
}

export function denyText(tool: string, dir: string): string {
  return (
    `bws-secrets: ${tool} refused: it would read the secrets folder (${dir}). Saved secrets are never read directly. ` +
    'Write {{secret:NAME}} in a Bash command where the value goes (it is filled in when the command runs), or call ' +
    'request_secret to ask the user for a new one.'
  )
}
