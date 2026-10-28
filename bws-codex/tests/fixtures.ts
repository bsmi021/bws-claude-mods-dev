// A job record the tests start from: running turn 1 of a job in C:/src/app.
import { NO_DIFF } from '../hooks/job'
import type { Job } from '../hooks/job'

export const JOB: Job = {
  version: 1,
  id: 'fix-calc-3f2a1c',
  title: 'Fix calc',
  repo: 'C:/src/app',
  top: 'C:/src/app',
  worktree: 'C:/src/app.codex-worktrees/fix-calc-3f2a1c',
  branch: 'codex/fix-calc-3f2a1c',
  base: '0123456789abcdef0123456789abcdef01234567',
  dir: 'C:/src/app/.git/bws-codex/jobs/fix-calc-3f2a1c',
  model: 'gpt-6.1-sol',
  effort: 'medium',
  network: false,
  carry: null,
  owner: 'session-1',
  createdAt: 1_000_000,
  updatedAt: 1_000_000,
  turn: 1,
  state: 'running',
  turnStartedAt: 1_000_000,
  endedAt: null,
  threadId: null,
  head: '0123456789abcdef0123456789abcdef01234567',
  diffstat: NO_DIFF,
  error: null,
  delivered: 0,
}
