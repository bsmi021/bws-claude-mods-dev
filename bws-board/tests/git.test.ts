import { describe, expect, test } from 'claude-code/testing'

import { STALE_MS, cardText, gitDenyText, gitHolder, newCard, parseCard, peerLines, readBoard, stagedDenyText, takeLease } from '../hooks/board'
import type { Card } from '../hooks/board'
import { gitOps } from '../hooks/shell'
import type { Dialect } from '../hooks/shell'

const ops = (cmd: string, dialect: Dialect = 'bash') =>
  gitOps(cmd, dialect).map(o => `${o.verb}${o.dir ? `@${o.dir}` : o.dir === undefined ? '@?' : ''}${o.isAll ? ' all' : ''}${o.paths.length ? ` ${o.paths.join(',')}` : ''}${o.unstage ? ` -${o.unstage.isAll ? 'all' : o.unstage.paths.join(',')}` : ''}` +
      (o.staged ? ` [staged${o.staged.isReset ? ' reset' : ''}${o.staged.isAll ? ' all' : ''} ${o.staged.paths.join(',')}${o.staged.dropped.length ? ` -${o.staged.dropped.join(',')}` : ''}]` : ''))

describe('git commands that take the lease', () => {
  test('index- and ref-changing subcommands, at command position only', () => {
    expect(ops('git commit -m "x"')).toEqual(['commit'])
    expect(ops('git push origin main')).toEqual(['push'])
    expect(ops('git status && git diff --cached && git log -3 && git fetch && git branch -a && git show HEAD')).toEqual([])
    expect(ops('echo "git commit -m x" && grep -n "git push" notes.md')).toEqual([])
    expect(ops('# git commit\necho hi')).toEqual([])
    expect(ops('git stash list; git stash show -p; git stash')).toEqual(['stash'])
    expect(ops('GIT_AUTHOR_NAME=x git commit -m y')).toEqual(['commit'])
    expect(ops('git.exe rebase -i HEAD~2')).toEqual(['rebase'])
    expect(ops('& git checkout main', 'powershell')).toEqual(['checkout'])
    expect(ops('git add a.txt; git commit -m "a"; git push', 'powershell')).toEqual(['add a.txt', 'commit [staged a.txt]', 'push'])
  })

  test('global options are skipped; -C and cd move the folder; another git dir is left alone', () => {
    expect(ops('git -c user.name=x -C sub --no-pager commit -m y')).toEqual(['commit@sub'])
    expect(ops('cd C:/other && git commit -m y')).toEqual(['commit@C:/other'])
    expect(ops('cd "$X" && git commit -m y')).toEqual(['commit@?'])
    expect(ops('git --git-dir=/x/.git commit -m y')).toEqual([])
    expect(ops('git --work-tree /x commit -m y')).toEqual([])
  })

  test('commit -a and what an earlier add in the same command stages', () => {
    expect(ops('git commit -am "fix"')).toEqual(['commit all'])
    expect(ops('git commit --all -m x')).toEqual(['commit all'])
    expect(ops('git commit -m "a message"')).toEqual(['commit'])
    expect(ops('git commit -ma')).toEqual(['commit'])
    expect(ops('git add -A && git commit -m x')).toEqual(['add all', 'commit [staged all ]'])
    expect(ops('git add . && git commit -m x')).toEqual(['add all', 'commit [staged all ]'])
    expect(ops('git add -u && git commit -m x')).toEqual(['add all', 'commit [staged all ]'])
    expect(ops('git add src/*.ts && git commit -m x')).toEqual(['add all', 'commit [staged all ]'])
    expect(ops('git add -- a.txt b/c.txt && git commit -m x')).toEqual(['add a.txt,b/c.txt', 'commit [staged a.txt,b/c.txt]'])
    expect(ops('cd sub && git add a.txt && git commit -m x')).toEqual(['add@sub sub/a.txt', 'commit@sub [staged sub/a.txt]'])
    // An add in another folder stages nothing for this commit.
    expect(ops('git -C other add a.txt && git commit -m x')).toEqual(['add@other other/a.txt', 'commit'])
  })

  test('restore --staged and a mixed reset earlier in the command take files out of the commit', () => {
    // Seen live: the check ran before the restore, so a.txt still looked staged.
    expect(ops('git restore --staged -- a.txt && git add -- b.txt && git commit -m x')).toEqual(['restore -a.txt', 'add b.txt', 'commit [staged b.txt -a.txt]'])
    expect(ops('git restore -S a.txt; git commit -m x')).toEqual(['restore -a.txt', 'commit [staged  -a.txt]'])
    expect(ops('git restore --staged --source=HEAD -- src && git commit -m x')).toEqual(['restore -src', 'commit [staged  -src]'])
    expect(ops('git reset HEAD a.txt && git commit -m x')).toEqual(['reset -a.txt', 'commit [staged  -a.txt]'])
    expect(ops('git reset -q -- a.txt && git commit -m x')).toEqual(['reset -a.txt', 'commit [staged  -a.txt]'])
    expect(ops('git reset && git add b.txt && git commit -m x')).toEqual(['reset -all', 'add b.txt', 'commit [staged reset b.txt]'])
    // Added again after the unstage: back in.
    expect(ops('git restore --staged a.txt && git add a.txt && git commit -m x')).toEqual(['restore -a.txt', 'add a.txt', 'commit [staged a.txt]'])
    // Not unstages: a worktree restore, a hard reset, a reset to a commit.
    expect(ops('git restore a.txt && git commit -m x')).toEqual(['restore', 'commit'])
    expect(ops('git reset --hard && git commit -m x')).toEqual(['reset', 'commit'])
    expect(ops('git reset abc123 && git commit -m x')).toEqual(['reset', 'commit'])
  })
})

const T = 'c:/proj'
const lim = { staleMs: STALE_MS, claimMs: 30 * 60_000, leaseMs: 2 * 60_000 }
const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const B = 'bbbbbbbb-0000-4000-8000-000000000002'
const card = (id: string, role: string, at: number, git?: Card['git']): Card => ({ ...newCard(id, 'C:/proj', at, role), ...(git ? { git } : {}) })

describe('the git lease', () => {
  test('a peer with a fresh lease in the same tree holds it; stale, lapsed or another tree does not', () => {
    const now = 1_000_000
    const held = card(A, 'api', now - 1000, { since: now - 5000, at: now - 1000, verb: 'add', tree: T })
    const b = { folder: 'C:/proj', cards: { [A]: held } }
    expect(gitHolder(b, B, T, now, lim)?.sessionId).toBe(A)
    expect(gitHolder(b, A, T, now, lim)).toBeUndefined()
    expect(gitHolder(b, B, 'c:/proj-wt', now, lim)).toBeUndefined()
    expect(gitHolder(b, B, T, now + lim.leaseMs, lim)).toBeUndefined()
    expect(gitHolder({ ...b, cards: { [A]: { ...held, seenAt: now - STALE_MS - 1 } } }, B, T, now, lim)).toBeUndefined()
    expect(gitHolder({ ...b, cards: { [A]: { ...held, gone: true } } }, B, T, now, lim)).toBeUndefined()
  })

  test('two leases taken at once: the earlier holds, then the smaller id', () => {
    const now = 1_000_000
    const a = card(A, 'api', now, { since: now - 10, at: now, verb: 'add', tree: T })
    const mine = { since: now - 10, at: now, verb: 'commit', tree: T }
    expect(gitHolder({ folder: 'C:/proj', cards: { [A]: a } }, B, T, now, lim, mine)?.sessionId).toBe(A)
    // From A's side, B's equal lease does not beat A.
    const bCard = card(B, 'tests', now, { ...mine })
    expect(gitHolder({ folder: 'C:/proj', cards: { [B]: bCard } }, A, T, now, lim, { since: now - 10, at: now, verb: 'add', tree: T })).toBeUndefined()
    // A later lease of B's does not beat A's earlier one.
    expect(gitHolder({ folder: 'C:/proj', cards: { [B]: card(B, 'tests', now, { ...mine, since: now - 5 }) } }, A, T, now, lim, { since: now - 10, at: now, verb: 'add', tree: T })).toBeUndefined()
  })

  test('takeLease keeps `since` while fresh, restarts after a lapse or in another tree', () => {
    const l = takeLease(undefined, 'add', T, 100, 1000)
    expect(l).toEqual({ since: 100, at: 100, verb: 'add', tree: T })
    expect(takeLease(l, 'commit', T, 600, 1000)).toEqual({ since: 100, at: 600, verb: 'commit', tree: T })
    expect(takeLease(l, 'commit', T, 1200, 1000).since).toBe(1200)
    expect(takeLease(l, 'commit', 'c:/other', 600, 1000).since).toBe(600)
  })

  test('the card keeps the lease through a write and a read; a tombstone drops it', () => {
    const c = card(A, 'api', 5, { since: 1, at: 5, verb: 'push', tree: T })
    expect(parseCard(cardText(c), A)?.git).toEqual({ since: 1, at: 5, verb: 'push', tree: T })
    expect(parseCard(cardText(newCard(A, 'C:/proj', 5, null)), A)?.git).toBeUndefined()
    expect(readBoard('C:/proj', [{ id: A, text: '{"version":1,"git":{"verb":1}}' }], {}).cards[A]?.git).toBeUndefined()
  })

  test('peer lines and the refusals say who holds what, and how to get out of it', () => {
    const now = 1_000_000
    const a = { ...card(A, 'api', now, { since: now - 30_000, at: now - 20_000, verb: 'commit', tree: T }), task: 'Login endpoint' }
    const b = { folder: 'C:/proj', cards: { [A]: a } }
    expect(peerLines(b, B, now, lim)).toContain('  holds the git lease (git commit 20s ago)')
    expect(peerLines(b, B, now, { staleMs: lim.staleMs, claimMs: lim.claimMs })).not.toContain('  holds the git lease (git commit 20s ago)')
    const deny = gitDenyText(a, 'push', now, lim.leaseMs)
    expect(deny).toContain('git push refused')
    expect(deny).toContain('api (aaaaaaaa) (Login endpoint), which ran git commit 20s ago')
    expect(deny).toContain("when that session's turn ends, or about 2 min after its last git command")
    expect(deny).toContain('Do not re-run this command in a loop')
    const staged = stagedDenyText([{ file: 'c:/proj/src/a.ts', holder: a }], 'C:/proj')
    expect(staged).toContain('a file another live session claims: src/a.ts (held by api (aaaaaaaa))')
    expect(staged).toContain('git restore --staged -- src/a.ts')
  })
})
