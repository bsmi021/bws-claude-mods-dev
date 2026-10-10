// The shell-lint rules: pure functions over a Bash command as the model wrote it.
// Ported 1:1 from runs/2026-10-02-shell-lint-mod/lint.py; tests/agreement.test.ts holds the two to the same verdicts.
//
// Two facts measured on this machine (Windows, Git Bash, Claude Code 2.1.287) drive the rules:
// - Bash receives the command after one more round of backslash parsing: a run of n backslashes
//   NOT followed by a double quote arrives as ceil(n/2); a run followed by a double quote arrives
//   untouched. It holds inside single quotes and quoted heredocs, where bash itself keeps them.
// - A Bash command longer than about 7.8k (each ' counting 4, each double quote and backslash 2, the
//   cost of escaping them) reaches bash cut short, and bash fails with "unexpected EOF".

export type RuleName = 'long-command' | 'dq-trailing-backslash' | 'py-backslash'

export type Finding = {
  rule: RuleName
  detail: string
  why?: string
  where?: string
}

export const RULE_NAMES: readonly RuleName[] = ['long-command', 'dq-trailing-backslash', 'py-backslash']

const BS = '\\'

// The size counts each ' as 4 and each " and \ as 2 (what escaping them costs on the way to bash).
// Replayed over 73,857 real Bash commands: at 7800 it catches 152 of
// 154 cut-off failures and refuses 10 of 73,470 commands that ran (the old len + 3' at 7850: 142, 4).
export const LONG_LIMIT = 7800

export const commandSize = (cmd: string) =>
  cmd.length + 3 * (cmd.split("'").length - 1) + (cmd.split('"').length - 1) + (cmd.split(BS).length - 1)

const HEREDOC_OPEN = /<<(-?)[ \t]*(['"]?)([A-Za-z_][A-Za-z0-9_.-]*)\2/g
const PY_HEREDOC_LINE = /(^|[\s;&|(])(python[0-9.]*|py)(\.exe)?([ \t][^\n<]*)?<<|>[ \t]*['"]?[^\s'"]+\.py['"]?[ \t]*<<|<<[^\n]*>[ \t]*['"]?[^\s'"]+\.py/
const PY_DASH_C = /(^|[\s;&|(])(python[0-9.]*|py)(\.exe)?[ \t]+(-[A-Za-z]+[ \t]+)*-c[ \t]+(['"])/g
const WIN_PATH_DQ = /(^|[\s=(])"([A-Za-z]:\\[^"\n]*?)(\\+)"([\s|;&)<>]|$)/g
const BS_RUN = /(\\+)("?)/g
const HEX = /[0-9A-Fa-f]/
const WORD_CHAR = /[\p{L}\p{N}_]/u

/** What bash receives: each backslash run not followed by a double quote is halved (rounded up). */
export function collapse(s: string): string {
  return s.replace(BS_RUN, (all: string, run: string, quote: string) =>
    quote ? all : BS.repeat(Math.floor((run.length + 1) / 2)),
  )
}

type Heredoc = { opener: string; quoted: boolean; body: string; terminated: boolean }

/** The command with heredoc bodies removed (opener and terminator lines kept), and the bodies. */
export function splitHeredocs(cmd: string): { shell: string; bodies: Heredoc[] } {
  const lines = cmd.split('\n')
  const shell: string[] = []
  const bodies: Heredoc[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i] ?? ''
    shell.push(line)
    i += 1
    const pending: { dash: boolean; quoted: boolean; tag: string }[] = []
    for (const m of line.matchAll(HEREDOC_OPEN)) {
      const at = m.index ?? 0
      if (at > 0 && line[at - 1] === '<') continue // here-string <<<
      pending.push({ dash: m[1] === '-', quoted: m[2] !== '', tag: m[3] ?? '' })
    }
    for (const p of pending) {
      const body: string[] = []
      let terminated = false
      while (i < lines.length) {
        const ln = lines[i] ?? ''
        i += 1
        const probe = p.dash ? ln.replace(/^\t+/, '') : ln
        if (probe === p.tag || probe.replace(/\r+$/, '') === p.tag) {
          terminated = true
          shell.push(ln)
          break
        }
        body.push(ln)
      }
      bodies.push({ opener: line, quoted: p.quoted, body: body.join('\n'), terminated })
    }
  }
  return { shell: shell.join('\n'), bodies }
}

/** True when a non-raw str literal body holds a \x, \u, \U or \N escape Python rejects. */
function badEscape(lit: string): boolean {
  const n = lit.length
  let i = 0
  while (i < n) {
    if (lit[i] === BS && i + 1 < n) {
      const c = lit[i + 1]
      const need = c === 'x' ? 2 : c === 'u' ? 4 : c === 'U' ? 8 : 0
      if (need) {
        const hex = lit.slice(i + 2, i + 2 + need)
        if (hex.length < need || ![...hex].every(h => HEX.test(h))) return true
      } else if (c === 'N') {
        if (i + 2 >= n || lit[i + 2] !== '{') return true
      }
      i += 2
      continue
    }
    i += 1
  }
  return false
}

type PyFault = { line: string; why: string }

/** Null when every string literal closes and has valid escapes, else the first offending line. */
export function scanPython(code: string): PyFault | null {
  const n = code.length
  const lineOf = (at: number): string => {
    const start = code.lastIndexOf('\n', at - 1) + 1
    const end = code.indexOf('\n', at)
    return code.slice(start, end < 0 ? n : end)
  }
  let i = 0
  while (i < n) {
    const ch = code[i]
    if (ch === '#') {
      const j = code.indexOf('\n', i)
      i = j < 0 ? n : j + 1
      continue
    }
    if (ch === "'" || ch === '"') {
      let k = i
      while (k > 0 && 'rRbBuUfF'.includes(code[k - 1] ?? '')) k -= 1
      let prefix = code.slice(k, i).toLowerCase()
      if (k > 0 && WORD_CHAR.test(code[k - 1] ?? '')) prefix = '' // the letters belong to an identifier
      const raw = prefix.includes('r')
      const isBytes = prefix.includes('b')
      const triple = code.startsWith(ch + ch + ch, i)
      const close = triple ? ch + ch + ch : ch
      let j = i + close.length
      const start = j
      let ok = false
      while (j < n) {
        const c = code[j]
        if (c === BS) {
          j += 2
          continue
        }
        if (!triple && c === '\n') break
        if (code.startsWith(close, j)) {
          ok = true
          break
        }
        j += 1
      }
      if (!ok) return { line: lineOf(i), why: 'unterminated string literal' }
      if (!raw && !isBytes && !prefix.includes('f') && badEscape(code.slice(start, j))) {
        return { line: lineOf(i), why: 'bad \\x/\\u/\\U/\\N escape' }
      }
      i = j + close.length
      continue
    }
    i += 1
  }
  return null
}

/** What bash does to backslashes inside double quotes. */
function dqUnescape(s: string): string {
  let out = ''
  let i = 0
  while (i < s.length) {
    if (s[i] === BS && i + 1 < s.length && '\\"$`'.includes(s[i + 1] ?? '')) {
      out += s[i + 1]
      i += 2
      continue
    }
    out += s[i]
    i += 1
  }
  return out
}

type PyRegion = { where: string; meant: string; effective: string }

/** Python code inside the command: quoted heredocs fed to python or a .py file, and python -c arguments. */
function pythonRegions(cmd: string): PyRegion[] {
  const { shell, bodies } = splitHeredocs(cmd)
  const out: PyRegion[] = []
  for (const b of bodies) {
    if (b.quoted && PY_HEREDOC_LINE.test(b.opener)) {
      out.push({ where: 'heredoc', meant: b.body, effective: collapse(b.body) })
    }
  }
  for (const m of shell.matchAll(PY_DASH_C)) {
    const q = m[5]
    const start = (m.index ?? 0) + m[0].length
    if (q === "'") {
      const end = shell.indexOf("'", start)
      if (end < 0) continue
      const raw = shell.slice(start, end)
      out.push({ where: '-c', meant: raw, effective: collapse(raw) })
    } else {
      let j = start
      while (j < shell.length) {
        if (shell[j] === BS) {
          j += 2
          continue
        }
        if (shell[j] === '"') break
        j += 1
      }
      if (j >= shell.length) continue
      const raw = shell.slice(start, j)
      // what the model meant (bash rules only) against what python gets (the extra round, then bash)
      out.push({ where: '-c', meant: dqUnescape(raw), effective: dqUnescape(collapse(raw)) })
    }
  }
  return out
}

export function ruleLongCommand(cmd: string): Finding | null {
  const size = commandSize(cmd)
  return size >= LONG_LIMIT ? { rule: 'long-command', detail: String(size) } : null
}

export function ruleDqTrailingBackslash(cmd: string): Finding | null {
  const eff = collapse(splitHeredocs(cmd).shell)
  for (const m of eff.matchAll(WIN_PATH_DQ)) {
    const run = m[3] ?? ''
    if (run.length % 2 === 1) return { rule: 'dq-trailing-backslash', detail: (m[2] ?? '') + run }
  }
  return null
}

export function rulePyBackslash(cmd: string): Finding | null {
  for (const r of pythonRegions(cmd)) {
    if (scanPython(r.meant) !== null) continue // already broken as written: not the shell's doing
    const hit = scanPython(r.effective)
    if (hit !== null) {
      return { rule: 'py-backslash', detail: hit.line.trim().slice(0, 120), why: hit.why, where: r.where }
    }
  }
  return null
}

const RULES: readonly [RuleName, (cmd: string) => Finding | null][] = [
  ['long-command', ruleLongCommand],
  ['dq-trailing-backslash', ruleDqTrailingBackslash],
  ['py-backslash', rulePyBackslash],
]

/** The first rule the command breaks, skipping disabled ones; null when it looks fine. */
export function lint(cmd: string, disabled: readonly string[] = []): Finding | null {
  for (const [name, fn] of RULES) {
    if (disabled.includes(name)) continue
    const f = fn(cmd)
    if (f) return f
  }
  return null
}

/** The text the model gets back in place of the tool's result. */
export function denyText(f: Finding): string {
  const tag = `bws-shell-lint [${f.rule}]`
  if (f.rule === 'long-command') {
    return `${tag}: this Bash command is ${f.detail} units long (each ' counts 4, each double quote and backslash 2) and the Windows Bash tool cuts commands past ~7.8k, ` +
      'so bash would fail with "unexpected EOF". Fix: write the script to a file with the Write tool (the scratchpad is fine), ' +
      'then run the file (python <file> / bash <file>), or split the command.'
  }
  if (f.rule === 'dq-trailing-backslash') {
    const fwd = f.detail.replace(/\\+/g, '/').replace(/\/+$/, '')
    return `${tag}: "${f.detail}" ends in a backslash that escapes its closing quote, so bash would fail with "unexpected EOF". ` +
      `Fix: use forward slashes and no trailing slash: "${fwd}".`
  }
  return `${tag}: on this machine a backslash run not followed by " is halved before bash runs, so Python would get ` +
    `\`${f.detail}\` (${f.why}). Fix: keep backslashes out of inline Python (use '/' paths, os.sep or chr(92)), ` +
    'or write the script with the Write tool and run the file.'
}

/** The toast: one short line. */
export function toastText(f: Finding): string {
  if (f.rule === 'long-command') return `shell-lint: blocked a ${f.detail}-char Bash command (would be cut off)`
  if (f.rule === 'dq-trailing-backslash') return 'shell-lint: blocked a trailing \\" path (would break quoting)'
  return 'shell-lint: blocked inline Python whose backslashes the shell would halve'
}
