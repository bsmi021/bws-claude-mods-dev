import { describe, expect, test } from 'claude-code/testing'

import { isAliveIn, isRecordFile, livenessKey, normPipe, parseRecord, parseTasklist, repoKey, whereIn } from '../hooks/peers'

// The engine's session registry, shaped like the real <pid>.json files.
const T0 = Date.parse('2026-10-02T14:00:00')
const BS = String.fromCharCode(92)
const pipeOf = (pid: number) => `${BS}${BS}.${BS}pipe${BS}LOCAL${BS}cc-msg-p${pid}`

const recJson = (pid: number, name: string, statusAt: number) =>
  JSON.stringify({
    pid,
    sessionId: `s-${pid}`,
    cwd: ['C:', 'repo'].join(BS),
    startedAt: T0 - 2 * 3600_000,
    procStart: `ps${pid}`,
    version: '2.1.288',
    kind: 'interactive',
    entrypoint: 'cli',
    name,
    status: 'busy',
    updatedAt: statusAt,
    statusUpdatedAt: statusAt,
    messagingSocketPath: pipeOf(pid),
  })

describe('session registry parsing', () => {
  test('registry records parse; junk and partial records do not', () => {
    const r = parseRecord(recJson(20, 'refactor', T0 - 3 * 60_000))
    expect(r?.pid).toBe(20)
    expect(r?.name).toBe('refactor')
    expect(r?.statusSince).toBe(T0 - 3 * 60_000)
    expect(r?.pipe).toBe(normPipe(pipeOf(20)))
    expect(parseRecord('{"pid":1}')).toBeUndefined()
    expect(parseRecord('not json')).toBeUndefined()
    expect(parseRecord('null')).toBeUndefined()
  })

  test('only <pid>.json files are records', () => {
    expect(isRecordFile('12345.json')).toBe(true)
    expect(isRecordFile('12345.abcdef01.key')).toBe(false)
    expect(isRecordFile('notes.json')).toBe(false)
  })

  test('repo key: the .git folder, a worktree resolves to its main checkout', () => {
    expect(repoKey('C:/Repo')).toBe('c:/repo/.git')
    expect(repoKey('C:/wt/feat', 'gitdir: C:/Repo/.git/worktrees/feat\n')).toBe('c:/repo/.git')
    expect(repoKey('C:/wt/feat', 'gitdir: C:\\Repo\\.git\\worktrees\\feat\r\n')).toBe('c:/repo/.git')
    expect(repoKey('C:/Repo/.claude/worktrees/x', 'gitdir: ../../../.git/worktrees/x')).toBe('c:/repo/.git')
    expect(repoKey('C:/sub', 'gitdir: C:/Repo/.git/modules/sub')).toBe('c:/repo/.git/modules/sub')
  })

  test('where a session runs, relative to the repo root', () => {
    expect(whereIn('C:\\Repo', 'C:/repo')).toBe('')
    expect(whereIn('C:\\Repo\\tools\\x', 'C:/repo')).toBe('tools/x')
    expect(whereIn('D:/wt/feat', 'C:/repo')).toBe('D:/wt/feat')
  })

  test('tasklist CSV pids, and liveness by pid and image', () => {
    const images = parseTasklist('"claude.exe","12345","Console","1","300,000 K"\r\n"System","4","Services","0","1 K"\r\n')
    expect([...images]).toEqual([[12345, 'claude.exe'], [4, 'System']])
    expect(parseTasklist('INFO: No tasks are running').size).toBe(0)
    expect(isAliveIn(images, 12345, 'CLAUDE.EXE')).toBe(true)
    expect(isAliveIn(images, 4, 'claude.exe')).toBe(false) // a reused pid running another program
    expect(isAliveIn(images, 999, undefined)).toBe(false)
    expect(livenessKey({ pid: 7, procStart: 'x' })).toBe('7:x')
  })
})
