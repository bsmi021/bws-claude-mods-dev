import { describe, expect, test } from 'claude-code/testing'

import { codexCandidates, execArgv, firstPrompt, followupPrompt, resumeArgv, turnSpec } from '../hooks/argv'
import type { CodexRun } from '../hooks/argv'

const RUN: CodexRun = {
  codex: 'C:/npm/codex.exe',
  model: 'gpt-6.1-sol',
  effort: 'low',
  network: false,
  worktree: 'C:/src/app.codex-worktrees/fix-calc-3f2a1c',
  lastFile: 'C:/src/app/.git/bws-codex/jobs/fix-calc-3f2a1c/turn-1.last.txt',
}

const LEAN = [
  '-c', 'approval_policy="never"',
  '-c', 'model_reasoning_effort=low',
  '-c', 'windows.sandbox="elevated"',
  '-c', 'shell_environment_policy.inherit="core"',
  '-c', 'project_doc_fallback_filenames=["CLAUDE.md"]',
]

describe('codex argv', () => {
  test('first turn: lean config, workspace-write, pinned approvals and effort, prompt on stdin', () => {
    expect(execArgv(RUN)).toEqual([
      'C:/npm/codex.exe', 'exec', '--json', '--ignore-user-config', '--strict-config',
      '-m', 'gpt-6.1-sol',
      '-C', RUN.worktree,
      '-s', 'workspace-write',
      ...LEAN,
      '-o', RUN.lastFile,
      '-',
    ])
  })

  test('follow-up: exec resume <thread>, sandbox pinned with -c (resume has no -s or -C), same flags', () => {
    const argv = resumeArgv({ ...RUN, effort: 'high', lastFile: 'L2' }, 'thread-1')
    expect(argv.slice(0, 5)).toEqual(['C:/npm/codex.exe', 'exec', 'resume', 'thread-1', '--json'])
    expect(argv).toContain('--ignore-user-config')
    expect(argv).toContain('sandbox_mode="workspace-write"')
    expect(argv).toContain('model_reasoning_effort=high')
    expect(argv).toContain('approval_policy="never"')
    expect(argv.includes('-s') || argv.includes('-C')).toBe(false)
    expect(argv.slice(-3)).toEqual(['-o', 'L2', '-'])
  })

  test('network is opt-in, and nothing wider than workspace-write is ever passed', () => {
    expect(execArgv(RUN).join(' ')).not.toContain('network_access')
    const on = execArgv({ ...RUN, network: true })
    expect(on).toContain('sandbox_workspace_write.network_access=true')
    for (const argv of [on, resumeArgv({ ...RUN, network: true }, 't')]) {
      const text = argv.join(' ')
      expect(text).not.toContain('danger-full-access')
      expect(text).not.toContain('--approve-for-me')
      expect(text).not.toContain('--add-dir')
      expect(text).not.toContain('--worktree')
      expect(text).not.toContain('--dangerously')
    }
  })

  test('codex.exe candidates are the native binaries under %APPDATA%, never the .cmd shim', () => {
    const c = codexCandidates('C:\\Users\\you\\AppData\\Roaming')
    expect(c[0]).toBe('C:/Users/you/AppData/Roaming/npm/node_modules/@openai/codex/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe')
    expect(c.every(p => p.endsWith('/codex.exe'))).toBe(true)
    expect(codexCandidates(undefined)).toEqual([])
  })
})

describe('codex prompts and turn spec', () => {
  const job = { id: 'fix-calc-3f2a1c', title: 'Fix calc', branch: 'codex/fix-calc-3f2a1c', base: '0123456789abcdef', head: 'fedcba9876543210', worktree: RUN.worktree, dir: 'C:/src/app/.git/bws-codex/jobs/fix-calc-3f2a1c' }

  test('the first prompt names the job, the branch and the rules, then the task', () => {
    const p = firstPrompt(job, '  Fix add() in src/calc.py and run the tests.  ')
    expect(p).toContain('Job fix-calc-3f2a1c')
    expect(p).toContain('branch codex/fix-calc-3f2a1c, based on commit 01234567')
    expect(p).toContain('Do not run git add, commit')
    expect(p.trimEnd().endsWith('Task:\nFix add() in src/calc.py and run the tests.')).toBe(true)
  })

  test('a follow-up says which turn and that the host committed the last one', () => {
    const p = followupPrompt(job, 2, 'Now rename add to add_numbers.')
    expect(p).toContain('Follow-up turn 2 for job fix-calc-3f2a1c')
    expect(p).toContain('(HEAD fedcba98)')
    expect(p).toContain('Task:\nNow rename add to add_numbers.')
  })

  test('the spec runs in the worktree with TEMP and TMP moved into the job folder', () => {
    const spec = turnSpec(job, 3, ['codex.exe'], 1800)
    expect(spec.cwd).toBe(RUN.worktree)
    expect(spec.env).toEqual({ TEMP: `${job.dir}/tmp`, TMP: `${job.dir}/tmp` })
    expect(spec.base).toBe(job.base)
    expect(spec.commitMessage).toBe('codex: Fix calc (job fix-calc-3f2a1c, turn 3)')
    expect(spec.timeoutS).toBe(1800)
  })
})
