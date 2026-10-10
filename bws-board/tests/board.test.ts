import { describe, expect, test } from 'claude-code/testing'

import {
  STALE_MS,
  WAKE_MS,
  actError,
  addAsk,
  addClaim,
  askTarget,
  askViews,
  boardDir,
  boardKey,
  cardPath,
  claimHolder,
  duplicateRoles,
  idFromFile,
  isForMe,
  news,
  newCard,
  nextAskId,
  normFile,
  normRole,
  parseCard,
  cardText,
  readBoard,
  redact,
  resolvePeer,
  settleAsks,
  summary,
  sweepable,
  taskFrom,
  tombstone,
  unread,
  wakeTargets,
} from '../hooks/board'
import type { Ask, Board, Card } from '../hooks/board'
import { writeTargets } from '../hooks/shell'
import type { Dialect } from '../hooks/shell'

const paths = (cmd: string, dialect: Dialect = 'bash') => writeTargets(cmd, dialect).map(t => `${t.via}:${t.path}${t.isGuess ? '?' : ''}`)

describe('shell write targets', () => {
  test('bash: redirects, tee, sed -i, cp and mv', () => {
    expect(paths('echo hi > out.txt 2>&1')).toEqual(['redirect:out.txt'])
    expect(paths('cmd >> "logs/a b.log" 2>/dev/null')).toEqual(['redirect:logs/a b.log'])
    expect(paths('make &> build.log')).toEqual(['redirect:build.log'])
    expect(paths('git diff | tee -a d.patch | head')).toEqual(['tee:d.patch'])
    expect(paths("sed -i 's/a/b/' src/x.ts src/y.ts")).toEqual(['sed -i:src/x.ts', 'sed -i:src/y.ts'])
    expect(paths("sed -i.bak -e 's/a/b/' -e 's/c/d/' f.txt")).toEqual(['sed -i:f.txt'])
    expect(paths("sed -i \\\n  -e 's/x > y/z/' \\\n  notes.md")).toEqual(['sed -i:notes.md'])
    expect(paths("sed -n 's/a/b/p' f.txt")).toEqual([])
    expect(paths('cp a/x.json b/y.json')).toEqual(['cp:b/y.json', 'cp:b/y.json/x.json?'])
    expect(paths('cp a.txt b.txt dir/')).toEqual(['cp:dir/a.txt', 'cp:dir/b.txt'])
    expect(paths('mv old.txt new.txt')).toEqual(['mv:new.txt', 'mv:new.txt/old.txt?', 'mv source:old.txt'])
  })

  test('powershell: write cmdlets, Copy-Item and Move-Item, redirects', () => {
    expect(paths('Set-Content -Path notes.txt -Value "x > y"', 'powershell')).toEqual(['cmdlet:notes.txt'])
    expect(paths("Add-Content log.md 'line'", 'powershell')).toEqual(['cmdlet:log.md'])
    expect(paths('$t | Out-File -Encoding utf8 -FilePath out\\r.txt', 'powershell')).toEqual(['cmdlet:out\\r.txt'])
    expect(paths('New-Item -ItemType Directory -Path d; New-Item -Path f.txt -Force', 'powershell')).toEqual(['cmdlet:f.txt'])
    expect(paths('Move-Item a.js, b.json -Destination dest', 'powershell')).toEqual(['mv:dest/a.js', 'mv:dest/b.json', 'mv source:a.js', 'mv source:b.json'])
    expect(paths('.\\gradlew.bat build *> runs/x/build.log', 'powershell')).toEqual(['redirect:runs/x/build.log'])
  })

  test('cd moves where relative writes land; one it cannot follow drops them', () => {
    expect(paths('cd sub && echo x > a.txt')).toEqual(['redirect:sub/a.txt'])
    expect(paths('cd /c/proj && cd src && sed -i s/a/b/ m.ts')).toEqual(['sed -i:/c/proj/src/m.ts'])
    expect(paths('cd "$R" && echo x > a.txt > /c/proj/b.txt')).toEqual(['redirect:/c/proj/b.txt'])
    expect(paths('Set-Location C:\\proj; Set-Content x.txt 1', 'powershell')).toEqual(['cmdlet:C:\\proj/x.txt'])
  })

  test('not writes: mentions, quotes, heredoc and here-string bodies, comparisons, arrows, variables, devices', () => {
    expect(paths('echo "a > b" && grep -n "tee x" f')).toEqual([])
    expect(paths("python - <<'EOF'\nopen('x','w').write('a > b')\nEOF")).toEqual([])
    expect(paths("git commit -m @'\nfix: the a > b case\n'@", 'powershell')).toEqual([])
    expect(paths('[[ "$a" > "$b" ]] && (( n > 3 )) && echo ok')).toEqual([])
    expect(paths("node -e 'const f = x => x' && awk '{print > \"o\"}' f")).toEqual([])
    expect(paths('echo x > "$R/log.txt"; cmd > /dev/null; cmd 2>$null; cp a ~/b; cmd > out*.txt')).toEqual([])
    expect(paths('Write-Output (1 -gt 0) 2>&1 | Out-Null', 'powershell')).toEqual([])
  })
})

const CWD = 'C:/proj'
const LIM = { staleMs: STALE_MS, claimMs: 30 * 60_000 }
const NOW = 10_000_000
// Neutral ids: one per simulated session.
const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const B = 'bbbbbbbb-0000-4000-8000-000000000002'
const C = 'cccccccc-0000-4000-8000-000000000003'

const card = (sessionId: string, over: Partial<Card> = {}): Card => ({ ...newCard(sessionId, CWD, NOW - 1000, null), seenAt: NOW, ...over })
const board = (...cards: Card[]): Board => ({ folder: CWD, cards: Object.fromEntries(cards.map(c => [c.sessionId, c])) })
const ask = (id: string, to: string, over: Partial<Ask> = {}): Ask => ({ id, to, text: `do ${id}`, urgent: false, at: NOW - 500, state: 'open', ...over })

describe('board files', () => {
  test('one folder per repository under the config dir, one card file per session', () => {
    expect(boardKey('C:\\Projects\\My Repo')).toBe('c-projects-my-repo')
    const dir = boardDir('C:/Users/u/.claude', 'C:/proj')
    expect(dir).toBe('C:/Users/u/.claude/bws-board/c-proj')
    expect(cardPath(dir, A)).toBe(`C:/Users/u/.claude/bws-board/c-proj/${A}.json`)
    expect(idFromFile(`${A}.json`)).toBe(A)
    expect(idFromFile('notes.txt')).toBeUndefined()
    expect(idFromFile('../x.json')).toBeUndefined()
  })

  test('a card round-trips; junk entries inside it are dropped', () => {
    const c = card(A, { role: 'api', asks: [ask('aaaaaaaa-1', 'role:tests')], acts: [{ askId: 'x-1', kind: 'take', at: 5 }] })
    expect(parseCard(cardText(c), A)).toEqual(c)
    const junk = JSON.stringify({ version: 1, seenAt: 5, claims: [{ path: 'c:/proj/x', at: 4 }, { at: 1 }], asks: [{ id: 'q' }], acts: [{ askId: 'z', kind: 'eat' }] })
    const got = parseCard(junk, A)
    expect(got?.claims).toEqual([{ path: 'c:/proj/x', since: 4, at: 4 }])
    expect(got?.asks).toEqual([])
    expect(got?.acts).toEqual([])
  })

  test('a torn or missing file keeps the last good copy of that card; a vanished file drops it', () => {
    const good = card(A, { task: 'old' })
    const prev = { [A]: good, [B]: card(B) }
    const text = cardText(card(A, { task: 'new' }))
    const torn = readBoard(CWD, [{ id: A, text: text.slice(0, 40) }], prev)
    expect(torn.cards[A]?.task).toBe('old')
    expect(torn.cards[B]).toBeUndefined()
    expect(readBoard(CWD, [{ id: A, text }], prev).cards[A]?.task).toBe('new')
    expect(readBoard(CWD, [{ id: C, text: undefined }], {}).cards[C]).toBeUndefined()
  })

  test('a tombstone holds nothing and is not live', () => {
    const t = tombstone(card(A, { claims: [{ path: 'c:/proj/x', since: 1, at: 1 }], asks: [ask('aaaaaaaa-1', 'anyone')] }), NOW)
    expect(t.gone).toBe(true)
    expect(t.claims).toEqual([])
    expect(t.asks).toEqual([])
    expect(claimHolder(board(t), B, 'c:/proj/x', NOW, LIM)).toBeUndefined()
  })

  test('the sweep picks card files older than a day, never this session or other files', () => {
    const day = 24 * 60 * 60 * 1000
    const entries = [
      { name: `${A}.json`, kind: 'file', mtimeMs: NOW - day - 1 },
      { name: `${B}.json`, kind: 'file', mtimeMs: NOW - 5 },
      { name: `${C}.json`, kind: 'file', mtimeMs: NOW - day - 1 },
      { name: 'README.md', kind: 'file', mtimeMs: 0 },
      { name: 'sub', kind: 'directory', mtimeMs: 0 },
    ]
    expect(sweepable(entries, C, NOW, day)).toEqual([`${A}.json`])
  })
})

describe('claims', () => {
  test('files compare absolute, slash-normalized and case-folded', () => {
    expect(normFile('src\\X.ts', 'C:\\Proj')).toBe('c:/proj/src/x.ts')
    expect(normFile('C:/Proj/a/../src/./x.ts', CWD)).toBe('c:/proj/src/x.ts')
    expect(normFile('/c/Proj/x.ts', CWD)).toBe('c:/proj/x.ts')
  })

  test('a claim blocks other live sessions; a stale session or a lapsed claim does not', () => {
    const file = 'c:/proj/x.ts'
    const held = board(card(A, { claims: [{ path: file, since: NOW - 5, at: NOW - 5 }] }))
    expect(claimHolder(held, B, file, NOW, LIM)?.sessionId).toBe(A)
    expect(claimHolder(held, A, file, NOW, LIM)).toBeUndefined()
    expect(claimHolder(held, B, 'c:/proj/other.ts', NOW, LIM)).toBeUndefined()
    expect(claimHolder(held, B, file, NOW + STALE_MS, LIM)).toBeUndefined()
    const lapsed = board(card(A, { claims: [{ path: file, since: 0, at: NOW - LIM.claimMs }] }))
    expect(claimHolder(lapsed, B, file, NOW, LIM)).toBeUndefined()
  })

  test('two sessions that claimed one file at once: the earlier claim holds it, exactly one goes on', () => {
    const file = 'c:/proj/x.ts'
    const a = { path: file, since: 100, at: NOW - 1000 }
    const b = { path: file, since: 200, at: NOW - 900 }
    const f = board(card(A, { claims: [a] }), card(B, { claims: [b] }))
    expect(claimHolder(f, A, file, NOW, LIM, a)).toBeUndefined()
    expect(claimHolder(f, B, file, NOW, LIM, b)?.sessionId).toBe(A)
  })

  test('re-editing keeps the first-claim time and moves the last edit', () => {
    const c1 = addClaim([], 'c:/proj/x', 100, LIM.claimMs)
    expect(addClaim(c1, 'c:/proj/x', 500, LIM.claimMs)).toEqual([{ path: 'c:/proj/x', since: 100, at: 500 }])
  })
})

describe('roles, tasks, messages', () => {
  test('role names: short, lowercase, not reserved', () => {
    expect(normRole(' Tests ')).toEqual({ role: 'tests' })
    expect('error' in normRole('anyone')).toBe(true)
    expect('error' in normRole('two words')).toBe(true)
    expect('error' in normRole('x'.repeat(25))).toBe(true)
  })

  test('duplicate roles among live sessions are reported', () => {
    const b = board(card(A, { role: 'api' }), card(B, { role: 'api' }), card(C, { role: 'tests', seenAt: 0 }))
    expect(duplicateRoles(b, NOW, STALE_MS)).toEqual(['api'])
  })

  test('the task is the first prompt line, redacted; slash commands say nothing', () => {
    expect(taskFrom('\n  Fix the parser bug\nmore')).toBe('Fix the parser bug')
    expect(taskFrom('/board')).toBeUndefined()
    expect(taskFrom('set api_key=abc123 then deploy')).toBe('set api_key=[redacted] then deploy')
  })

  test('redact hides keys but keeps run paths, session ids and plain words', () => {
    expect(redact('runs/2026-10-10-agent-blackboard')).toBe('runs/2026-10-10-agent-blackboard')
    expect(redact('C:/Users/someone/AppData/Local/Temp/claude/x1')).toBe('C:/Users/someone/AppData/Local/Temp/claude/x1')
    expect(redact(`session ${A}`)).toBe(`session ${A}`)
    expect(redact('use Zm9vYmFyQmF6UXV4MTIzNDU2Nzg5MEFCQ0RFRg now')).toBe('use [redacted] now')
    expect(redact('token sk-ant-api03-abcdefghijkl')).toBe('token [redacted]')
    expect(redact(`sha ${'ab12'.repeat(10)}`)).toBe('sha [redacted]')
    expect(redact('internationalization-of-everything')).toBe('internationalization-of-everything')
  })

  test('unread: messages to this session or all, after it joined, each once', () => {
    const b = board(
      card(B, {
        outbox: [
          { seq: 1, to: A, text: 'old', at: 50 },
          { seq: 2, to: A, text: 'hi A', at: 150 },
          { seq: 3, to: C, text: 'not yours', at: 160 },
          { seq: 4, to: 'all', text: 'everyone', at: 170 },
        ],
      }),
    )
    const first = unread(b, A, 100, {})
    expect(first.messages.map(m => m.text)).toEqual(['hi A', 'everyone'])
    expect(unread(b, A, 100, first.cursors).messages).toEqual([])
  })

  test('send targets: all, a role, a unique prefix, or a clear error', () => {
    const b = board(card(A), card(B, { role: 'tests' }), card(C, { role: 'api' }))
    expect(resolvePeer(b, A, 'tests', NOW, STALE_MS)).toEqual({ id: B })
    expect(resolvePeer(b, A, 'cccccccc', NOW, STALE_MS)).toEqual({ id: C })
    expect(resolvePeer(b, A, 'all', NOW, STALE_MS)).toEqual({ id: 'all' })
    expect('error' in resolvePeer(b, A, 'zzz', NOW, STALE_MS)).toBe(true)
    expect('error' in resolvePeer(board(card(A)), A, 'all', NOW, STALE_MS)).toBe(true)
  })
})

describe('asks', () => {
  const tests = { id: B, role: 'tests' }
  const api = { id: A, role: 'api' }

  test('targets: anyone, a live role, a waiting role, a session prefix', () => {
    const b = board(card(A, { role: 'api' }), card(B, { role: 'tests' }))
    expect(askTarget(b, A, 'anyone', NOW, STALE_MS)).toEqual({ to: 'anyone' })
    expect(askTarget(b, A, 'Tests', NOW, STALE_MS)).toEqual({ to: 'role:tests' })
    expect(askTarget(b, A, 'bbbbbbbb', NOW, STALE_MS)).toEqual({ to: `session:${B}` })
    const waiting = askTarget(b, A, 'docs', NOW, STALE_MS)
    expect('to' in waiting && waiting.to).toBe('role:docs')
    expect('to' in waiting && waiting.note).toContain('waits')
    expect(isForMe('role:tests', tests)).toBe(true)
    expect(isForMe(`session:${B}`, tests)).toBe(true)
    expect(isForMe('anyone', tests)).toBe(true)
    expect(isForMe('role:api', tests)).toBe(false)
  })

  test('open → taken → done, across two cards', () => {
    const q = ask('aaaaaaaa-1', 'role:tests')
    const asked = board(card(A, { role: 'api', asks: [q] }), card(B, { role: 'tests' }))
    expect(askViews(asked, NOW, STALE_MS)[0]?.view).toBe('open')
    const taken = board(card(A, { role: 'api', asks: [q] }), card(B, { role: 'tests', acts: [{ askId: q.id, kind: 'take', at: NOW - 100 }] }))
    expect(askViews(taken, NOW, STALE_MS)[0]).toMatchObject({ view: 'taken', taker: B })
    const done = board(
      card(A, { role: 'api', asks: [q] }),
      card(B, { role: 'tests', acts: [{ askId: q.id, kind: 'take', at: NOW - 100 }, { askId: q.id, kind: 'done', at: NOW - 50, note: 'green' }] }),
    )
    expect(askViews(done, NOW, STALE_MS)[0]).toMatchObject({ view: 'done', by: B, note: 'green' })
  })

  test('the earliest take holds the ask; a stale taker frees it', () => {
    const q = ask('aaaaaaaa-1', 'anyone')
    const b = board(
      card(A, { asks: [q] }),
      card(B, { acts: [{ askId: q.id, kind: 'take', at: NOW - 100 }] }),
      card(C, { acts: [{ askId: q.id, kind: 'take', at: NOW - 200 }] }),
    )
    expect(askViews(b, NOW, STALE_MS)[0]?.taker).toBe(C)
    const stale = board(card(A, { asks: [q] }), card(C, { seenAt: 0, acts: [{ askId: q.id, kind: 'take', at: NOW - 200 }] }))
    expect(askViews(stale, NOW, STALE_MS)[0]?.view).toBe('open')
  })

  test('a done is copied into the asker\'s card, so it stays done after the doer leaves', () => {
    const q = ask('aaaaaaaa-1', 'role:tests')
    const b = board(card(A, { asks: [q] }), card(B, { acts: [{ askId: q.id, kind: 'done', at: NOW - 50, note: 'ok' }] }))
    const settled = settleAsks([q], askViews(b, NOW, STALE_MS))
    expect(settled?.[0]).toMatchObject({ state: 'done', by: B, note: 'ok' })
    expect(settleAsks(settled ?? [], askViews(b, NOW, STALE_MS))).toBeUndefined()
    const after = board(card(A, { asks: settled ?? [] }), tombstone(card(B), NOW))
    expect(askViews(after, NOW, STALE_MS)[0]?.view).toBe('done')
  })

  test('a decline on a named ask shows; on an ask to anyone it stays open', () => {
    const named = ask('aaaaaaaa-1', 'role:tests')
    const any = ask('aaaaaaaa-2', 'anyone')
    const b = board(card(A, { asks: [named, any] }), card(B, { acts: [{ askId: named.id, kind: 'decline', at: NOW }, { askId: any.id, kind: 'decline', at: NOW }] }))
    const v = askViews(b, NOW, STALE_MS)
    expect(v.map(x => x.view)).toEqual(['declined', 'open'])
    expect(v[1]?.decliners).toEqual([B])
  })

  test('asks from a session that left are not shown', () => {
    const b = board(card(A, { seenAt: 0, asks: [ask('aaaaaaaa-1', 'anyone')] }))
    expect(askViews(b, NOW, STALE_MS)).toEqual([])
  })

  test('who may act: not on your own, not on one someone else took, only the asker withdraws', () => {
    const q = ask('aaaaaaaa-1', 'anyone')
    const b = board(card(A, { asks: [q] }), card(B, { acts: [{ askId: q.id, kind: 'take', at: NOW - 10 }] }), card(C))
    const v = askViews(b, NOW, STALE_MS)[0]
    expect(actError(v, q.id, api, 'take', b)).toContain('own')
    expect(actError(v, q.id, { id: C, role: null }, 'take', b)).toContain('taken by')
    expect(actError(v, q.id, { id: C, role: null }, 'decline', b)).toBeUndefined()
    expect(actError(v, q.id, tests, 'done', b)).toBeUndefined()
    expect(actError(v, q.id, tests, 'withdraw', b)).toContain('only its asker')
    expect(actError(v, q.id, api, 'withdraw', b)).toBeUndefined()
    expect(actError(undefined, 'nope-1', tests, 'take', b)).toContain('No ask')
  })

  test('ask ids count up; the cap drops settled asks first', () => {
    expect(nextAskId(A, [])).toBe('aaaaaaaa-1')
    expect(nextAskId(A, [ask('aaaaaaaa-1', 'anyone'), ask('aaaaaaaa-7', 'anyone')])).toBe('aaaaaaaa-8')
    const many = Array.from({ length: 50 }, (_, i) => ask(`aaaaaaaa-${i + 1}`, 'anyone', { state: i === 3 ? 'done' : 'open' }))
    const capped = addAsk(many, ask('aaaaaaaa-51', 'anyone'))
    expect(capped.length).toBe(50)
    expect(capped.some(a => a.id === 'aaaaaaaa-4')).toBe(false)
  })

  test('news: a new ask for me once; my ask taken and done once each; a withdrawn ask I took', () => {
    const q = ask('aaaaaaaa-1', 'role:tests', { urgent: true })
    let b = board(card(A, { role: 'api', asks: [q] }), card(B, { role: 'tests' }))
    const forB = news(askViews(b, NOW, STALE_MS), tests, {}, NOW, b)
    expect(forB.lines).toEqual([`- URGENT ask ${q.id} from api (aaaaaaaa) to tests: do ${q.id}`])
    expect(news(askViews(b, NOW, STALE_MS), tests, forB.seen, NOW, b).lines).toEqual([])

    b = board(card(A, { role: 'api', asks: [q] }), card(B, { role: 'tests', acts: [{ askId: q.id, kind: 'take', at: NOW }] }))
    const forA = news(askViews(b, NOW, STALE_MS), api, {}, NOW, b)
    expect(forA.lines).toEqual([`- your ask ${q.id} was taken by tests (bbbbbbbb)`])
    const bTook = news(askViews(b, NOW, STALE_MS), tests, forB.seen, NOW, b)

    b = board(card(A, { role: 'api', asks: [q] }), card(B, { role: 'tests', acts: [{ askId: q.id, kind: 'done', at: NOW + 1, note: 'green' }] }))
    const forA2 = news(askViews(b, NOW, STALE_MS), api, forA.seen, NOW, b)
    expect(forA2.lines).toEqual([`- your ask ${q.id} is done by tests (bbbbbbbb): green`])

    b = board(card(A, { role: 'api', asks: [{ ...q, state: 'withdrawn' }] }), card(B, { role: 'tests', acts: [{ askId: q.id, kind: 'take', at: NOW }] }))
    const told = news(askViews(b, NOW, STALE_MS), tests, bTook.seen, NOW, b)
    expect(told.lines).toEqual([`- ask ${q.id} you took was withdrawn by api (aaaaaaaa)`])
    expect(news(askViews(b, NOW, STALE_MS), tests, told.seen, NOW, b).lines).toEqual([])
    // Taken and withdrawn before any news pass ran for the taker: still told.
    expect(news(askViews(b, NOW, STALE_MS), tests, {}, NOW, b).lines).toContain(`- ask ${q.id} you took was withdrawn by api (aaaaaaaa)`)
  })

  test('urgent wake: named live sessions only, once per receiver per window', () => {
    const b = board(card(A, { role: 'api' }), card(B, { role: 'tests' }), card(C, { role: 'tests' }))
    const lim = { ...LIM, wakeMs: WAKE_MS }
    expect(wakeTargets(b, api, 'role:tests', {}, NOW, lim).wake.sort()).toEqual([B, C])
    expect(wakeTargets(b, api, 'role:tests', { [B]: NOW - 1000 }, NOW, lim)).toEqual({ wake: [C], held: [B] })
    expect(wakeTargets(b, api, 'role:tests', { [B]: NOW - WAKE_MS }, NOW, lim).wake).toContain(B)
    expect(wakeTargets(b, api, 'anyone', {}, NOW, lim)).toEqual({ wake: [], held: [] })
    expect(wakeTargets(b, api, `session:${B}`, {}, NOW, lim).wake).toEqual([B])
  })

  test('summary counts live agents, live asks and the ones waiting on me', () => {
    const b = board(card(A, { role: 'api', asks: [ask('aaaaaaaa-1', 'role:tests'), ask('aaaaaaaa-2', 'role:ui', { state: 'done' })] }), card(B, { role: 'tests' }))
    expect(summary(b, tests, NOW, STALE_MS)).toEqual({ agents: 2, openAsks: 1, askedOfMe: 1 })
    expect(summary(b, api, NOW, STALE_MS)).toEqual({ agents: 2, openAsks: 1, askedOfMe: 0 })
  })
})
