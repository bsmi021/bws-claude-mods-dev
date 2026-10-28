import { describe, expect, test } from 'claude-code/testing'

import { CAPSULE_MAX, branchOf, capsuleArgv, capsuleText, partnerBrief } from '../hooks/capsule'
import { LOG, SHORTSTAT, STATUS } from './world'

describe('the git capsule', () => {
  test('reads git status, the uncommitted diff stat and the last commit in Claude\'s tree', () => {
    expect(capsuleArgv('C:/src/app')).toEqual([
      ['git', '-C', 'C:/src/app', 'status', '--porcelain=v1', '--branch'],
      ['git', '-C', 'C:/src/app', 'diff', 'HEAD', '--shortstat'],
      ['git', '-C', 'C:/src/app', 'log', '-1', '--format=%h %s (%cr)'],
    ])
  })

  test('the branch line: tracking, ahead and behind, detached, no commits', () => {
    expect(branchOf('## main...origin/main [ahead 1, behind 2]')).toBe('main, ahead 1, behind 2 of origin/main')
    expect(branchOf('## main...origin/main')).toBe('main, up to date with origin/main')
    expect(branchOf('## feature/x')).toBe('feature/x')
    expect(branchOf('## HEAD (no branch)')).toBe('detached HEAD')
    expect(branchOf('## No commits yet on main')).toBe('main (no commits yet)')
  })

  test('the <workspace> block: branch, last commit, diff stat, dirty files', () => {
    expect(capsuleText('C:/src/app', { status: STATUS, shortstat: SHORTSTAT, log: LOG })).toBe(
      [
        '<workspace path="C:/src/app" note="Claude\'s working tree">',
        'branch: main, ahead 1 of origin/main',
        'last commit: 0123456 add calc (2 hours ago)',
        'uncommitted vs HEAD: 1 file changed, 2 insertions(+), 1 deletion(-)',
        'dirty files (2): M src/calc.py · ?? notes.md',
        '</workspace>',
      ].join('\n'),
    )
  })

  test('a clean tree, a repo with no commits, and no repo at all', () => {
    const clean = capsuleText('C:/src/app', { status: '## main\n', shortstat: '', log: LOG })
    expect(clean).toContain('uncommitted vs HEAD: no tracked changes')
    expect(clean).toContain('dirty files: none')
    expect(capsuleText('C:/new', { status: '## No commits yet on main\n?? a.txt\n', shortstat: '', log: '' })).toContain('last commit: none')
    expect(capsuleText('C:/tmp', null)).toBe('<workspace path="C:/tmp">\nnot a git repository (or git did not run)\n</workspace>')
  })

  test('many dirty files: twenty listed, the rest counted, the block stays small', () => {
    const status = ['## main', ...Array.from({ length: 60 }, (_, i) => ` M src/very/long/folder/name/for/file-number-${i}.ts`)].join('\n')
    const out = capsuleText('C:/src/app', { status, shortstat: ' 60 files changed', log: LOG })
    expect(out).toContain('dirty files (60):')
    expect(out.length).toBeLessThanOrEqual(CAPSULE_MAX)
    expect(out.endsWith('</workspace>')).toBe(true)
  })
})

describe('the partner brief', () => {
  test('both engines are told who they are pairing with and what the <workspace> block is', () => {
    for (const engine of ['api', 'codex'] as const) {
      const b = partnerBrief(engine, 'codex/chat-3f2a1c')
      expect(b).toContain('beside Claude Code')
      expect(b).toContain('<workspace> block')
      expect(b).toContain('sent back to Claude')
    }
  })

  test('the api engine cannot touch files; the codex engine works in its own worktree and never commits', () => {
    expect(partnerBrief('api')).toContain('You cannot read files or run commands')
    const codex = partnerBrief('codex', 'codex/chat-3f2a1c')
    expect(codex).toContain('own git worktree on branch codex/chat-3f2a1c')
    expect(codex).toContain('Never run git add, commit')
    expect(codex).not.toContain('You cannot read files')
  })
})
