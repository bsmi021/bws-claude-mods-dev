// Pure pieces of bws-secrets (no `$`): names, the secrets file, the placeholder rewrite that makes the shell read a
// value at execution time, and the scrub that takes a value (and its encodings) out of a tool's result. The spike
// behind the rewrite is runs/2026-10-13-mods-m8-secrets/DECISIONS.md (D1).

export type Secret = { name: string; value: string }

// `{{secret:NAME}}` as Claude writes it in a Bash command.
const PLACEHOLDER = /\{\{secret:([A-Za-z_][A-Za-z0-9_]*)\}\}/g
const PLACEHOLDER_AT = /\{\{secret:([A-Za-z_][A-Za-z0-9_]*)\}\}/y

export const NAME_RULE = 'an upper-case letter, then upper-case letters, digits or _ (at most 64)'
const NAME_RE = /^[A-Z][A-Z0-9_]{0,63}$/
// Variables the export in front of a command would clobber.
const RESERVED = new Set([
  'PATH', 'HOME', 'SHELL', 'PWD', 'OLDPWD', 'USER', 'USERNAME', 'LOGNAME', 'HOSTNAME', 'TMP', 'TEMP', 'TMPDIR', 'IFS',
  'PS1', 'PS2', 'PS4', 'LANG', 'TERM', 'ENV', 'BASH_ENV', 'CDPATH', 'SHELLOPTS', 'BASHOPTS', 'PROMPT_COMMAND',
  'LD_PRELOAD', 'LD_LIBRARY_PATH', 'DYLD_INSERT_LIBRARIES', 'PATHEXT', 'COMSPEC', 'SYSTEMROOT', 'APPDATA',
  'LOCALAPPDATA', 'USERPROFILE', 'PROGRAMFILES',
])
export const MIN_VALUE = 4
export const MAX_VALUE = 8192

// Why a name cannot be used, or null.
export function nameError(name: string): string | null {
  if (!NAME_RE.test(name)) return `"${name}" is not a usable name: use ${NAME_RULE}.`
  if (RESERVED.has(name)) return `"${name}" is a shell or system variable; pick another name.`
  return null
}

// Why a value cannot be saved, or null. One line, so the dotenv file and the shell read it whole.
export function valueError(value: string): string | null {
  if (value.length === 0) return 'Nothing was typed.'
  if (/[\r\n]/.test(value)) return 'A value must be one line.'
  if (value.length < MIN_VALUE) return `A value must be at least ${MIN_VALUE} characters, or it cannot be redacted safely.`
  if (value.length > MAX_VALUE) return `A value can be at most ${MAX_VALUE} characters.`
  return null
}

// ---------- The secrets file ----------

export function slashes(p: string): string {
  return p.replace(/\\/g, '/')
}

function trimEnd(p: string): string {
  return p.length > 1 ? p.replace(/\/+$/, '') : p
}

// The secrets folder: the option, `~` expanded, or `<home>/.claude/bws-secrets`. Forward slashes, no trailing slash.
export function secretsDir(option: string, home: string): string {
  const o = slashes(option.trim())
  const h = trimEnd(slashes(home))
  if (o === '') return `${h}/.claude/bws-secrets`
  if (o === '~') return h
  if (o.startsWith('~/')) return trimEnd(`${h}/${o.slice(2)}`)
  return trimEnd(o)
}

// The working directory as a file name, the way Claude Code names its project folders.
export function projectSlug(cwd: string): string {
  return slashes(cwd).replace(/[^A-Za-z0-9]/g, '-')
}

export function secretsFile(dir: string, cwd: string): string {
  return `${dir}/${projectSlug(cwd)}.env`
}

// Reads `NAME=value` lines. Blank lines, `#` comments and lines that are not a usable name are skipped; the first of a
// repeated name wins (that is the one the shell's sed would also print first).
export function parseEnv(text: string): Secret[] {
  const out: Secret[] = []
  const seen = new Set<string>()
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '')
    const eq = line.indexOf('=')
    if (eq < 1 || line.startsWith('#')) continue
    const name = line.slice(0, eq)
    if (!NAME_RE.test(name) || seen.has(name)) continue
    seen.add(name)
    out.push({ name, value: line.slice(eq + 1) })
  }
  return out
}

export function formatEnv(secrets: readonly Secret[]): string {
  return secrets.map(s => `${s.name}=${s.value}\n`).join('')
}

// Adds a name or replaces its value in place.
export function setSecret(secrets: readonly Secret[], name: string, value: string): Secret[] {
  return secrets.some(s => s.name === name)
    ? secrets.map(s => (s.name === name ? { name, value } : s))
    : [...secrets, { name, value }]
}

export function removeSecret(secrets: readonly Secret[], name: string): Secret[] {
  return secrets.filter(s => s.name !== name)
}

// ---------- The placeholder rewrite ----------

// The names a command's placeholders use, each once, in order of first use.
export function placeholders(command: string): string[] {
  const names: string[] = []
  for (const m of command.matchAll(PLACEHOLDER)) {
    const n = m[1] ?? ''
    if (!names.includes(n)) names.push(n)
  }
  return names
}

// Replaces every placeholder with a shell expansion of its variable that works where it stands: `${NAME}` inside
// double quotes, `"${NAME}"` outside quotes (no word splitting), `'"${NAME}"'` inside single quotes (close, expand,
// reopen). Quote state is tracked over the plain command text; a heredoc body is read like any other text.
export function replacePlaceholders(command: string): string {
  let out = ''
  let quote: '' | "'" | '"' = ''
  let i = 0
  while (i < command.length) {
    const ch = command[i] ?? ''
    if (ch === '{' && command.startsWith('{{secret:', i)) {
      PLACEHOLDER_AT.lastIndex = i
      const m = PLACEHOLDER_AT.exec(command)
      if (m) {
        const v = `\${${m[1] ?? ''}}`
        out += quote === '"' ? v : quote === "'" ? `'"${v}"'` : `"${v}"`
        i += m[0].length
        continue
      }
    }
    if (ch === '\\' && quote !== "'") {
      out += command.slice(i, i + 2)
      i += 2
      continue
    }
    if (quote === '' && (ch === "'" || ch === '"')) quote = ch
    else if (quote !== '' && ch === quote) quote = ''
    out += ch
    i++
  }
  return out
}

// Single-quotes a word for the shell.
export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

// The command the Bash tool runs instead: each name read from the secrets file by the shell itself, exported, then
// the command with its placeholders rewritten. The value is never in this text (DECISIONS.md D1).
export function injectCommand(command: string, names: readonly string[], file: string): string {
  const f = shellQuote(slashes(file))
  const reads = names.map(n => `export ${n}="$(sed -n 's/^${n}=//p' ${f} | head -n 1 | tr -d '\\r')"; `)
  return reads.join('') + replacePlaceholders(command)
}

// ---------- The scrub ----------

function utf8(s: string): number[] {
  const out: number[] = []
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0
    if (c < 0x80) out.push(c)
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63))
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
  }
  return out
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function base64(bytes: readonly number[]): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1]
    const c = bytes[i + 2]
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0)
    out += B64[(n >> 18) & 63]
    out += B64[(n >> 12) & 63]
    out += b === undefined ? '=' : B64[(n >> 6) & 63]
    out += c === undefined ? '=' : B64[n & 63]
  }
  return out
}

// The forms of a value the scrub looks for: the value, its JSON-escaped form, base64 and base64url (padded and not,
// also of the value plus a newline, as `echo ... | base64` makes), percent-encoding, and hex in both cases.
export function encodings(value: string): string[] {
  const bytes = utf8(value)
  const b64 = base64(bytes)
  const b64nl = base64([...bytes, 10])
  const url = (s: string) => s.replace(/\+/g, '-').replace(/\//g, '_')
  const hex = bytes.map(b => b.toString(16).padStart(2, '0')).join('')
  const forms = [
    value,
    JSON.stringify(value).slice(1, -1),
    b64,
    b64.replace(/=+$/, ''),
    url(b64),
    url(b64).replace(/=+$/, ''),
    b64nl,
    b64nl.replace(/=+$/, ''),
    encodeURIComponent(value),
    hex,
    hex.toUpperCase(),
  ]
  return [...new Set(forms)].filter(f => f.length >= MIN_VALUE)
}

// Every occurrence of a saved value or one of its encodings becomes `{{secret:NAME}}`. Longer forms go first, so a
// value that contains another value is replaced whole.
export function scrub(text: string, secrets: readonly Secret[]): string {
  const pairs: { form: string; name: string }[] = []
  for (const s of secrets) {
    if (s.value.length < MIN_VALUE) continue
    for (const form of encodings(s.value)) pairs.push({ form, name: s.name })
  }
  pairs.sort((a, b) => b.form.length - a.form.length)
  let out = text
  for (const p of pairs) if (out.includes(p.form)) out = out.split(p.form).join(`{{secret:${p.name}}}`)
  return out
}

// Whether a text holds any saved value or encoding (what the scrub would change).
export function holdsSecret(text: string, secrets: readonly Secret[]): boolean {
  return scrub(text, secrets) !== text
}

// Every string in a JSON-like value scrubbed; the shape kept.
export function scrubValue(v: unknown, secrets: readonly Secret[]): unknown {
  if (typeof v === 'string') return scrub(v, secrets)
  if (Array.isArray(v)) return v.map(x => scrubValue(x, secrets))
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v)) out[k] = scrubValue(x, secrets)
    return out
  }
  return v
}

// Why a Bash command with placeholders cannot run, or null (FR-SB-04).
export function injectionError(names: readonly string[], saved: readonly Secret[], isBackground: boolean): string | null {
  for (const n of names) {
    const bad = nameError(n)
    if (bad) return `bws-secrets: {{secret:${n}}}: ${bad}`
  }
  const missing = names.filter(n => !saved.some(s => s.name === n))
  if (missing.length > 0) {
    const list = missing.map(n => `{{secret:${n}}}`).join(', ')
    return `bws-secrets: no saved secret for ${list}. Call request_secret with that name first; the user types the value.`
  }
  if (isBackground) {
    return 'bws-secrets: a command that uses {{secret:...}} cannot run in the background (its later output would not be redacted). Run it in the foreground.'
  }
  return null
}
