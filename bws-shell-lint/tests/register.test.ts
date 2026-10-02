// The hook: denies what each rule catches (with the fix), lets real OK commands and other tools through untouched.
import { test, expect } from 'claude-code/testing'
import type { On } from 'claude-code'
import { FIXTURE } from './corpus-fixture.ts'

const BS = '\\'
const RAN = { stdout: 'ran', stderr: '', interrupted: false }

type Seen = { bash: string[]; other: string[]; toasts: string[] }

// The test's hooks sit beneath the plugin: they stand in for the real tools and the toast stack.
function bottom(on: On): Seen {
  const seen: Seen = { bash: [], other: [], toasts: [] }
  on('tool.call', async (_$, e) => {
    if (e.tool === 'Bash') seen.bash.push(e.command)
    else seen.other.push(e.tool)
    return { result: RAN }
  })
  on('ui.toast', async (_$, e) => {
    seen.toasts.push(e.text)
    return null as never
  })
  return seen
}

// Synthetic examples, one or more per rule, written as the model would type them.
const DQ_TRAILING = `ls -la "C:${BS}Projects${BS}bws.mods.claude-code${BS}runs${BS}" | head -20`
const PY_HEREDOC = [
  "python - <<'PY'",
  'import os',
  "for root, _, files in os.walk('.'):",
  `    print(root.replace('${BS}${BS}', '/'))`,
  'PY',
].join('\n')
const PY_DASH_C_DQ = `python -c "print('C:/x'.replace('/', '${BS.repeat(4)}'))"`
const PY_UNICODE = ["python - <<'PY'", `p = open("C:${BS}${BS}Users${BS}${BS}me${BS}${BS}notes.txt").read()`, 'PY'].join('\n')
const LONG = "python - <<'PY'\n" + 'x = 1\n'.repeat(1400) + 'PY'

// Look-alikes that work on this machine and must pass.
const OK_RAW_DQ = ["python - <<'PY'", `print(r"C:${BS}Users${BS}x".replace("${BS}${BS}", "/"))`, 'PY'].join('\n')
const OK_FORWARD = 'ls -la "C:/Projects/bws.mods.claude-code/runs/" | head -20'
const OK_ESCAPED_QUOTE = `echo "say ${BS}"hi${BS}"" && cd /c/Projects`

for (const [name, command, rule] of [
  ['trailing backslash before the closing quote', DQ_TRAILING, 'dq-trailing-backslash'],
  ["'\\\\' in a python heredoc", PY_HEREDOC, 'py-backslash'],
  ["'\\\\\\\\' in python -c \"...\"", PY_DASH_C_DQ, 'py-backslash'],
  ['doubled-backslash Windows path in a python heredoc', PY_UNICODE, 'py-backslash'],
  ['a command past the length cut', LONG, 'long-command'],
] as const) {
  test(`denies ${name}`, async ($, on) => {
    const seen = bottom(on)
    const r = await $.tool.call({ tool: 'Bash', command })
    expect(r.deny).toContain(`bws-shell-lint [${rule}]`)
    expect(r.deny).toContain('Fix:')
    expect(seen.bash).toEqual([])
    expect(seen.toasts.length).toBe(1)
  })
}

test('the trailing-backslash fix gives the forward-slash path', async ($, on) => {
  bottom(on)
  const r = await $.tool.call({ tool: 'Bash', command: DQ_TRAILING })
  expect(r.deny).toContain('"C:/Projects/bws.mods.claude-code/runs"')
})

for (const [name, command] of [
  ['a raw string and a "\\\\" literal (quote-adjacent backslashes survive)', OK_RAW_DQ],
  ['a forward-slash path', OK_FORWARD],
  ['an escaped double quote', OK_ESCAPED_QUOTE],
] as const) {
  test(`passes ${name}`, async ($, on) => {
    const seen = bottom(on)
    const r = await $.tool.call({ tool: 'Bash', command })
    expect(r.deny).toBeUndefined()
    expect(r.result).toEqual(RAN)
    expect(seen.bash).toEqual([command])
    expect(seen.toasts).toEqual([])
  })
}

test('denies every corpus command the reference flags', { timeoutMs: 60000 }, async ($, on) => {
  const seen = bottom(on)
  const flagged = FIXTURE.filter(x => x.rule !== null)
  expect(flagged.length).toBeGreaterThan(50)
  for (const x of flagged) {
    const r = await $.tool.call({ tool: 'Bash', command: x.command })
    expect(r.deny).toContain(`bws-shell-lint [${x.rule}]`)
  }
  expect(seen.bash).toEqual([])
})

test('real OK corpus commands pass through unchanged', { timeoutMs: 60000 }, async ($, on) => {
  const seen = bottom(on)
  const ok = FIXTURE.filter(x => x.ok && x.rule === null)
  expect(ok.length).toBeGreaterThan(300)
  for (const x of ok) {
    const r = await $.tool.call({ tool: 'Bash', command: x.command })
    expect(r.deny).toBeUndefined()
    expect(r.result).toEqual(RAN)
  }
  expect(seen.bash).toEqual(ok.map(x => x.command))
  expect(seen.toasts).toEqual([])
})

test('other tools pass through, PowerShell included', async ($, on) => {
  const seen = bottom(on)
  const ps = await $.tool.call({ tool: 'PowerShell', command: DQ_TRAILING })
  expect(ps.deny).toBeUndefined()
  expect(ps.result).toEqual(RAN)
  const glob = await $.tool.call({ tool: 'Glob', pattern: '**/*.ts' })
  expect(glob.deny).toBeUndefined()
  expect(glob.result).toEqual(RAN)
  expect(seen.other).toEqual(['PowerShell', 'Glob'])
  expect(seen.toasts).toEqual([])
})

test('enabled: false turns every rule off', { options: { enabled: false } }, async ($, on) => {
  const seen = bottom(on)
  await $.tool.call({ tool: 'Bash', command: DQ_TRAILING })
  await $.tool.call({ tool: 'Bash', command: LONG })
  expect(seen.bash).toEqual([DQ_TRAILING, LONG])
})

test('disabledRules skips only the named rules', { options: { disabledRules: 'long-command, py-backslash' } }, async ($, on) => {
  const seen = bottom(on)
  await $.tool.call({ tool: 'Bash', command: LONG })
  await $.tool.call({ tool: 'Bash', command: PY_HEREDOC })
  const r = await $.tool.call({ tool: 'Bash', command: DQ_TRAILING })
  expect(seen.bash).toEqual([LONG, PY_HEREDOC])
  expect(r.deny).toContain('[dq-trailing-backslash]')
})
