import { describe, expect, test } from 'claude-code/testing'

import { parseDelegate, parseResult, titleOf, waitOf } from '../hooks/args'
import { LOST_MS, NO_DIFF, applyStatus, jobDirOf, jobId, mainRootOf, parseShortstat, parseStatus, slugOf, worktreeOf } from '../hooks/job'
import type { SupervisorStatus } from '../hooks/job'

import { JOB } from './fixtures'

const ST: SupervisorStatus = { turn: 1, state: 'running', supervisorPid: 10, codexPid: 11, startedAt: 1_000_000, beatAt: 1_000_000 }

describe('ids and paths', () => {
  test('ids are a title slug plus 6 hex', () => {
    expect(slugOf('Fix the add() bug in calc.py!')).toBe('fix-the-add-bug-in-calc')
    expect(slugOf('  ')).toBe('job')
    expect(slugOf('a very long title that goes on and on')).toBe('a-very-long-title-that-g')
    expect(jobId('Fix calc', () => 0.25)).toBe('fix-calc-400000')
    expect(jobId('', () => 0)).toBe('job-000000')
  })

  test('the worktree sits beside the main checkout, the job folder under the git common dir', () => {
    expect(mainRootOf('C:/src/app/.git', 'C:/src/app/.claude/worktrees/w1')).toBe('C:/src/app')
    expect(mainRootOf('C:\\src\\app\\.git', 'C:\\src\\app')).toBe('C:/src/app')
    expect(mainRootOf('C:/src/super/.git/modules/sub', 'C:/src/super/sub')).toBe('C:/src/super/sub')
    expect(worktreeOf('C:/src/app', 'j-1')).toBe('C:/src/app.codex-worktrees/j-1')
    expect(jobDirOf('C:/src/app/.git/', 'j-1')).toBe('C:/src/app/.git/bws-codex/jobs/j-1')
  })

  test('git --shortstat parses with either count missing', () => {
    expect(parseShortstat(' 3 files changed, 41 insertions(+), 2 deletions(-)')).toEqual({ files: 3, insertions: 41, deletions: 2 })
    expect(parseShortstat(' 1 file changed, 1 insertion(+)')).toEqual({ files: 1, insertions: 1, deletions: 0 })
    expect(parseShortstat(' 1 file changed, 4 deletions(-)')).toEqual({ files: 1, insertions: 0, deletions: 4 })
    expect(parseShortstat('')).toEqual(NO_DIFF)
  })
})

describe('status.json into the job', () => {
  test('a running status keeps the job running; another turn\'s status changes nothing', () => {
    expect(applyStatus({ ...JOB, state: 'starting' }, ST, 1_005_000).state).toBe('running')
    const old = { ...ST, turn: 1, state: 'done' as const }
    const second = { ...JOB, turn: 2, state: 'starting' as const }
    expect(applyStatus(second, old, 1_005_000)).toBe(second)
    expect(applyStatus(JOB, undefined, 1_005_000)).toBe(JOB)
  })

  test('a finished turn takes the state, head, diff stat and errors', () => {
    const done = applyStatus(JOB, { ...ST, state: 'done', endedAt: 1_052_000, head: 'abc', shortstat: ' 2 files changed, 4 insertions(+), 1 deletion(-)' }, 1_053_000)
    expect(done).toEqual({ ...JOB, state: 'done', endedAt: 1_052_000, updatedAt: 1_053_000, head: 'abc', diffstat: { files: 2, insertions: 4, deletions: 1 }, error: null })
    const failed = applyStatus(JOB, { ...ST, state: 'failed', error: 'usage limit reached', commitError: 'nothing' }, 1_053_000)
    expect(failed.error).toBe('usage limit reached; commit failed: nothing')
  })

  test('a supervisor silent past LOST_MS fails the job', () => {
    expect(applyStatus(JOB, ST, 1_000_000 + LOST_MS - 1).state).toBe('running')
    const lost = applyStatus(JOB, ST, 1_000_000 + LOST_MS + 1000)
    expect(lost.state).toBe('failed')
    expect(lost.error).toContain('the supervisor stopped answering')
    expect(applyStatus({ ...JOB, state: 'starting' }, { ...ST, state: 'starting', supervisorPid: null }, 1_000_000 + LOST_MS + 1).error).toContain('never started')
  })

  test('status.json parses, or is undefined', () => {
    expect(parseStatus(JSON.stringify(ST))).toEqual(ST)
    expect(parseStatus('{"turn": 1')).toBeUndefined()
    expect(parseStatus('{}')).toBeUndefined()
    expect(parseStatus(undefined)).toBeUndefined()
  })
})

describe('tool arguments', () => {
  test('delegate: defaults, title from the prompt, wait clamped', () => {
    expect(parseDelegate({ prompt: 'Fix add() in src/calc.py\nThen run tests.' }, 'medium')).toEqual({
      prompt: 'Fix add() in src/calc.py\nThen run tests.',
      title: 'Fix add() in src/calc.py',
      effort: 'medium',
      network: false,
      carry: false,
      waitS: 0,
    })
    const a = parseDelegate({ prompt: 'x', title: 'T', effort: 'xhigh', network: true, carry: true, wait: 9999 }, 'low')
    expect(a).toEqual({ prompt: 'x', title: 'T', effort: 'xhigh', network: true, carry: true, waitS: 540 })
  })

  test('delegate: refuses an empty prompt and an unknown effort', () => {
    expect(parseDelegate({ prompt: '  ' }, 'low')).toEqual({ error: 'prompt is required: the complete task for Codex' })
    expect(parseDelegate({ prompt: 'x', effort: 'max' }, 'low')).toEqual({ error: 'effort must be one of low, medium, high, xhigh' })
  })

  test('ids are checked; waits are whole seconds 0-540', () => {
    expect(parseResult({ id: 'fix-calc-3f2a1c', wait_s: 30.4 })).toEqual({ id: 'fix-calc-3f2a1c', waitS: 30 })
    expect('error' in parseResult({ id: '../etc' })).toBe(true)
    expect(waitOf(-5)).toBe(0)
    expect(waitOf('60')).toBe(60)
    expect(waitOf(undefined)).toBe(0)
    expect(titleOf(undefined, '')).toBe('Codex job')
  })
})
