import { describe, expect, test } from 'claude-code/testing'

import { reduceEvents } from '../hooks/events'
import type { Job } from '../hooks/job'
import { RESULT_MAX, duration, headline, listText, resultText, startedText, statusLine, wakeText } from '../hooks/result'

import { JOB } from './fixtures'

const DONE: Job = {
  ...JOB,
  state: 'done',
  endedAt: JOB.turnStartedAt + 52_000,
  head: 'fae165f00000000000000000000000000000000a',
  diffstat: { files: 2, insertions: 8, deletions: 1 },
  threadId: 't-1',
}
const STAT = ' src/strings.py        | 4 ++++\n tests/test_strings.py | 5 ++++-\n 2 files changed, 8 insertions(+), 1 deletion(-)'
const SUMMARY = reduceEvents(
  [
    JSON.stringify({ type: 'thread.started', thread_id: 't-1' }),
    JSON.stringify({ type: 'item.completed', item: { id: 'i', type: 'command_execution', command: 'x', exit_code: 0 } }),
    JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 91569, cached_input_tokens: 59648, output_tokens: 541 } }),
  ].join('\n'),
)
const NOW = JOB.turnStartedAt + 60_000

describe('result strings', () => {
  test('a done job: headline, branch, worktree, stat, what Codex said, next steps', () => {
    const r = resultText(DONE, SUMMARY, 'Added whisper(); tests: 3 run, 3 passed.', STAT, NOW, true)
    const lines = r.split('\n')
    expect(lines[0]).toBe('codex job fix-calc-3f2a1c "Fix calc": done in 52s (turn 1); branch codex/fix-calc-3f2a1c: 2 files +8 -1 vs base 01234567')
    expect(r).toContain('Worktree: C:/src/app.codex-worktrees/fix-calc-3f2a1c (HEAD fae165f0)')
    expect(r).toContain(' src/strings.py        | 4 ++++')
    expect(r).toContain('Codex ran 1 command(s), 0 failed; tokens 92k in (65% cached), 541 out.')
    expect(r).toContain('Codex says:\nAdded whisper(); tests: 3 run, 3 passed.')
    expect(r).toContain('git merge --no-ff codex/fix-calc-3f2a1c')
    expect(r).toContain('codex_cancel {"id": "fix-calc-3f2a1c", "drop": true}')
    expect(r).not.toContain('Carried edits')
  })

  test('stays under 3 KB with a long message and a long stat', () => {
    const stat = Array.from({ length: 40 }, (_, i) => ` src/file${i}.ts | 10 ++++++++++`).join('\n') + '\n 40 files changed, 400 insertions(+)'
    const r = resultText({ ...DONE, diffstat: { files: 40, insertions: 400, deletions: 0 } }, SUMMARY, 'x'.repeat(10_000), stat, NOW, true)
    expect(r.length <= RESULT_MAX).toBe(true)
    expect(r).toContain('… 28 more file(s)')
    expect(r).toContain('40 files changed, 400 insertions(+)')
    expect(r).toContain('git merge --no-ff')
  })

  test('a carried job warns to set the edits aside before merging', () => {
    const r = resultText({ ...DONE, carry: { stash: 's', commit: 'cafe0000000', error: null } }, SUMMARY, 'ok', STAT, NOW, true)
    expect(r).toContain('Carried edits: the branch starts with a commit (cafe0000)')
    expect(r).toContain('git stash push -m bws-codex-fix-calc-3f2a1c')
  })

  test('no changes, failed, running', () => {
    expect(resultText({ ...DONE, diffstat: { files: 0, insertions: 0, deletions: 0 } }, SUMMARY, 'Nothing to do.', '', NOW, true)).toContain('Codex made no changes on the branch; nothing to merge.')
    const failed = resultText({ ...DONE, state: 'failed', error: 'usage limit reached' }, undefined, null, '', NOW, true)
    expect(failed.split('\n')[0]).toBe('codex job fix-calc-3f2a1c "Fix calc": failed after 52s (turn 1): usage limit reached')
    expect(failed).toContain('(no final message)')
    const running = resultText(JOB, reduceEvents(JSON.stringify({ type: 'turn.started' })), null, '', NOW, true)
    expect(running).toBe(
      'codex job fix-calc-3f2a1c "Fix calc": running turn 1 for 1m00s. Now thinking.\n' +
        'Call codex_result {"id": "fix-calc-3f2a1c", "wait_s": 300} to wait for it, or carry on: you are told when it finishes.',
    )
    expect(resultText(JOB, undefined, null, '', NOW, false)).toContain('this session is not woken when it finishes')
  })

  test('started text names the job, the worktree and how the result arrives', () => {
    const s = startedText({ ...JOB, state: 'starting' }, true)
    expect(s).toContain('Started codex job fix-calc-3f2a1c "Fix calc" (effort medium, network off): worktree C:/src/app.codex-worktrees/fix-calc-3f2a1c on branch codex/fix-calc-3f2a1c from 01234567.')
    expect(s).toContain('you are told when it finishes')
    expect(startedText({ ...JOB, turn: 2 }, false)).toContain('Sent follow-up turn 2 to codex job fix-calc-3f2a1c')
  })
})

describe('wake, status line, list', () => {
  test('the wake prompt stands on its own (it can land after /clear)', () => {
    const w = wakeText([{ job: DONE, message: 'Added whisper().' }], NOW)
    expect(w).toBe(
      'bws-codex: codex job fix-calc-3f2a1c "Fix calc": done in 52s (turn 1); branch codex/fix-calc-3f2a1c: 2 files +8 -1 vs base 01234567. ' +
        'Codex: Added whisper(). Not merged; merge in C:/src/app. codex_result {"id": "fix-calc-3f2a1c"} gives the full result.',
    )
    const two = wakeText([{ job: DONE, message: null }, { job: { ...DONE, id: 'b-000001', title: 'B', state: 'failed', error: 'boom' }, message: null }], NOW)
    expect(two.split('\n')[0]).toBe('bws-codex: 2 Codex jobs finished:')
    expect(two).toContain('- codex job b-000001 "B": failed after 52s (turn 1): boom.')
  })

  test('status line: running jobs only', () => {
    expect(statusLine([JOB], NOW, { [JOB.id]: 'editing files' })).toBe('codex: fix-calc-3f2a1c 1m00s editing files')
    expect(statusLine([JOB, { ...JOB, id: 'b-1', turnStartedAt: NOW - 5000 }], NOW, {})).toBe('codex: 2 running · fix-calc-3f2a1c 1m00s · b-1 5s')
    expect(statusLine([DONE], NOW, {})).toBeUndefined()
  })

  test('list and durations', () => {
    expect(listText([], 'C:/src/app', NOW)).toBe('No Codex jobs for C:/src/app.')
    const l = listText([DONE], 'C:/src/app', NOW)
    expect(l).toContain('Codex jobs for C:/src/app (newest first):')
    expect(l).toContain('· not yet reported')
    expect(headline({ ...JOB, state: 'timed_out', endedAt: JOB.turnStartedAt + 3_600_000 }, NOW)).toBe('codex job fix-calc-3f2a1c "Fix calc": timed out after 1h00m (turn 1)')
    expect(duration(252_000)).toBe('4m12s')
  })
})
