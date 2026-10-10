import { describe, expect, test } from 'claude-code/testing'

import { buildDigest, coverage, digestHtml, durText, esc } from '../hooks/digest'
import { HIST_MAX, addEvent, expiredHistory, historyText, parseHistory } from '../hooks/history'
import type { HistEvent, History } from '../hooks/history'

const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const B = 'bbbbbbbb-0000-4000-8000-000000000002'
const FOLDER = 'C:/proj'
const MIN = 60_000
const T0 = 1_800_000_000_000
const CLAIM = 30 * MIN

const hist = (sessionId: string, events: (Omit<HistEvent, 'role' | 'at'> & { m: number; role?: string | null })[]): History => ({
  version: 1,
  sessionId,
  folder: FOLDER,
  events: events.map(({ m, role, ...e }) => ({ ...e, at: T0 + m * MIN, role: role === undefined ? null : role })),
})

// api (A) works 0-40 min and holds notes.txt; tests (B) joins at 10, is refused notes.txt at 12,
// takes A's urgent ask at 15 and finishes it at 20, then leaves at 30.
const team = () => [
  hist(A, [
    { m: 0, kind: 'start', role: 'api' },
    { m: 0, kind: 'busy', task: 'Build the login endpoint', role: 'api' },
    { m: 1, kind: 'claim', file: 'c:/proj/notes.txt', role: 'api' },
    { m: 5, kind: 'edit', file: 'c:/proj/notes.txt', role: 'api' },
    { m: 14, kind: 'ask', askId: 'aaaaaaaa-1', to: 'role:tests', urgent: true, text: 'Run the auth suite', role: 'api' },
    { m: 14, kind: 'wake', askId: 'aaaaaaaa-1', to: B, delivered: true, role: 'api' },
    { m: 16, kind: 'wakeHeld', askId: 'aaaaaaaa-2', to: B, role: 'api' },
    { m: 25, kind: 'idle', role: 'api' },
    { m: 40, kind: 'end', reason: 'prompt_input_exit', role: 'api' },
  ]),
  hist(B, [
    { m: 10, kind: 'start', role: 'tests' },
    { m: 10, kind: 'busy', task: 'Write the auth tests', role: 'tests' },
    { m: 12, kind: 'deny', file: 'c:/proj/notes.txt', holder: A, holderRole: 'api', role: 'tests' },
    { m: 15, kind: 'take', askId: 'aaaaaaaa-1', from: A, role: 'tests' },
    { m: 20, kind: 'done', askId: 'aaaaaaaa-1', from: A, note: '12 passed', role: 'tests' },
    { m: 22, kind: 'idle', role: 'tests' },
    { m: 30, kind: 'end', reason: 'other', role: 'tests' },
  ]),
]

const digestOf = (hs: History[], o: Partial<{ from: number; to: number; live: Set<string> }> = {}) =>
  buildDigest(hs, { folder: FOLDER, from: o.from ?? T0 - 24 * 60 * MIN, to: o.to ?? T0 + 60 * MIN, now: T0 + 60 * MIN, claimMs: CLAIM, live: o.live ?? new Set() })

describe('history file', () => {
  test('round-trips, drops bad events, caps its length', () => {
    const h = hist(A, [{ m: 0, kind: 'start' }, { m: 1, kind: 'claim', file: 'c:/proj/x.ts' }])
    expect(parseHistory(historyText(h), A)).toEqual(h)
    const text = JSON.stringify({ version: 1, folder: FOLDER, events: [{ at: 1, kind: 'start', role: null }, { at: 'x', kind: 'start' }, { at: 2, kind: 'nope' }, 7] })
    expect(parseHistory(text, A)?.events).toEqual([{ at: 1, kind: 'start', role: null }])
    expect(parseHistory('{"version":1,"events":[', A)).toBeUndefined()
    let big: History = { version: 1, sessionId: A, folder: FOLDER, events: [] }
    for (let i = 0; i < HIST_MAX + 3; i++) big = addEvent(big, { at: i, kind: 'edit', role: null })
    expect(big.events.length).toBe(HIST_MAX)
    expect(big.events[0]?.at).toBe(3)
  })

  test('expired history: older than the days, never this session, only session files', () => {
    const day = 24 * 60 * MIN
    const now = T0
    const entries = [
      { name: `${A}.json`, kind: 'file', mtimeMs: now - 20 * day },
      { name: `${B}.json`, kind: 'file', mtimeMs: now - 20 * day },
      { name: 'cccccccc-0000-4000-8000-000000000003.json', kind: 'file', mtimeMs: now - 2 * day },
      { name: 'notes.txt', kind: 'file', mtimeMs: 0 },
    ]
    expect(expiredHistory(entries, A, now, 14)).toEqual([`${B}.json`])
  })
})

describe('digest model', () => {
  test('coverage counts time with at least k spans', () => {
    const spans = [{ start: 0, end: 10 }, { start: 5, end: 20 }, { start: 30, end: 40 }]
    expect(coverage(spans, 1)).toBe(30)
    expect(coverage(spans, 2)).toBe(5)
  })

  test('lanes, busy spans, held files, asks, refused edits and wakes from a team run', () => {
    const d = digestOf(team())
    // The window narrows to the time the sessions were on the board.
    expect([d.from, d.to]).toEqual([T0, T0 + 40 * MIN])
    expect(d.lanes.map(l => l.name)).toEqual(['api (aaaaaaaa)', 'tests (bbbbbbbb)'])
    const [api, tests] = d.lanes
    expect(api?.busy).toEqual([{ start: T0, end: T0 + 25 * MIN }])
    expect(tests?.busy).toEqual([{ start: T0 + 10 * MIN, end: T0 + 22 * MIN }])
    // notes.txt: claimed at 1, last edit at 5, lapses 30 min later (35), before A's exit at 40.
    expect(api?.holds).toEqual([{ file: 'c:/proj/notes.txt', start: T0 + MIN, end: T0 + 35 * MIN, edits: 2 }])
    expect(tests?.marks.map(m => m.kind)).toEqual(['deny', 'take', 'done'])
    expect(d.asks).toEqual([
      {
        id: 'aaaaaaaa-1',
        from: 'api (aaaaaaaa)',
        to: 'tests',
        text: 'Run the auth suite',
        urgent: true,
        at: T0 + 14 * MIN,
        outcome: 'done',
        decliners: [],
        taker: 'tests (bbbbbbbb)',
        takeAt: T0 + 15 * MIN,
        doer: 'tests (bbbbbbbb)',
        doneAt: T0 + 20 * MIN,
        note: '12 passed',
      },
    ])
    expect(d.blocks).toEqual([{ at: T0 + 12 * MIN, who: 'tests (bbbbbbbb)', file: 'notes.txt', holder: 'api (aaaaaaaa)' }])
    expect(d.files).toEqual([{ file: 'notes.txt', holds: [{ name: 'api (aaaaaaaa)', start: T0 + MIN, end: T0 + 35 * MIN, edits: 2 }], isContested: true, denies: 1 }])
    expect(d.wakes).toEqual([{ from: 'api (aaaaaaaa)', to: 'tests (bbbbbbbb)', sent: 1, failed: 0, held: 1 }])
    expect(d.totals).toMatchObject({ agents: 2, busyMs: 37 * MIN, activeMs: 25 * MIN, overlapMs: 12 * MIN, asks: 1, done: 1, medianTakeMs: MIN, medianDoneMs: 6 * MIN, denies: 1, wakes: 1 })
  })

  test('a release ends a hold; an edit after the claim lapsed starts a new one', () => {
    const d = digestOf([
      hist(A, [
        { m: 0, kind: 'claim', file: 'c:/proj/a.ts' },
        { m: 2, kind: 'claim', file: 'c:/proj/b.ts' },
        { m: 4, kind: 'release', files: ['c:/proj/a.ts'] },
        { m: 50, kind: 'claim', file: 'c:/proj/b.ts' },
        { m: 60, kind: 'end' },
      ]),
    ])
    expect(d.lanes[0]?.holds.map(h => [h.file, (h.start - T0) / MIN, (h.end - T0) / MIN])).toEqual([
      ['c:/proj/a.ts', 0, 4],
      ['c:/proj/b.ts', 2, 32],
      ['c:/proj/b.ts', 50, 60],
    ])
  })

  test('a live session runs to now; one out of the window, or one that did nothing, is left out', () => {
    const quiet = hist('cccccccc-0000-4000-8000-000000000003', [{ m: 1, kind: 'start' }, { m: 2, kind: 'end' }])
    const hs = [hist(A, [{ m: 0, kind: 'busy' }]), hist(B, [{ m: -3000, kind: 'busy' }, { m: -2990, kind: 'end' }]), quiet]
    const d = digestOf(hs, { live: new Set([A]) })
    expect(d.lanes.map(l => [l.id, l.isOpen, (l.end - T0) / MIN])).toEqual([[A, true, 60]])
    expect(d.lanes[0]?.busy).toEqual([{ start: T0, end: T0 + 60 * MIN }])
  })

  test('asks: taken, declined, withdrawn, open', () => {
    const d = digestOf([
      hist(A, [
        { m: 0, kind: 'ask', askId: 'aaaaaaaa-1', to: 'anyone', text: 'one' },
        { m: 0, kind: 'ask', askId: 'aaaaaaaa-2', to: `session:${B}`, text: 'two' },
        { m: 0, kind: 'ask', askId: 'aaaaaaaa-3', to: 'role:ui', text: 'three' },
        { m: 0, kind: 'ask', askId: 'aaaaaaaa-4', to: 'anyone', text: 'four' },
        { m: 3, kind: 'withdraw', askId: 'aaaaaaaa-3' },
        { m: 9, kind: 'end' },
      ]),
      hist(B, [
        { m: 1, kind: 'take', askId: 'aaaaaaaa-1', role: 'tests' },
        { m: 2, kind: 'decline', askId: 'aaaaaaaa-2', note: 'not mine', role: 'tests' },
        { m: 9, kind: 'end', role: 'tests' },
      ]),
    ])
    expect(d.asks.map(a => [a.id, a.to, a.outcome, a.decliners.join()])).toEqual([
      ['aaaaaaaa-1', 'anyone', 'taken', ''],
      ['aaaaaaaa-2', 'tests (bbbbbbbb)', 'declined', 'tests (bbbbbbbb)'],
      ['aaaaaaaa-3', 'ui', 'withdrawn', ''],
      ['aaaaaaaa-4', 'anyone', 'open', ''],
    ])
  })
})

describe('digest page', () => {
  test('draws the run: totals, lanes, the held file, the ask, the refused edit, the wake', () => {
    const html = digestHtml(digestOf(team()))
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<code>C:/proj</code>')
    expect(html).toContain('<div class="v">12m 0s</div>') // parallel time
    expect(html).toContain('<div class="v">1/1</div>')
    expect(html).toContain('<b>api (aaaaaaaa)</b>')
    expect(html).toContain('<code>notes.txt</code> <span class="tag">contested</span>')
    expect(html).toContain('Run the auth suite<br><small>note: 12 passed</small>')
    expect(html).toContain('<span class="o-done">done</span>')
    expect(html).toContain('<td>tests (bbbbbbbb)</td><td><code>notes.txt</code></td><td>api (aaaaaaaa)</td>')
    expect(html).toContain('<td>api (aaaaaaaa)</td><td>tests (bbbbbbbb)</td><td>1</td><td>1</td><td>0</td>')
    expect(html).toContain('Write the auth tests')
    // The page's one script only rewrites times; no other script.
    expect(html.match(/<script>/g)?.length).toBe(1)
  })

  test('text from sessions is escaped', () => {
    const evil = '<script>alert(1)</script>" onmouseover="x'
    const hs = [hist(A, [{ m: 0, kind: 'busy', task: evil }, { m: 1, kind: 'ask', askId: 'aaaaaaaa-1', to: 'anyone', text: evil }, { m: 2, kind: 'claim', file: `c:/proj/${evil}` }, { m: 3, kind: 'end' }])]
    const html = digestHtml(digestOf(hs))
    expect(html.includes('<script>alert')).toBe(false)
    expect(html.includes('" onmouseover')).toBe(false)
    expect(html).toContain(esc(evil))
    expect(html.match(/<script>/g)?.length).toBe(1)
  })

  test('no history: says so', () => {
    expect(digestHtml(digestOf([]))).toContain('No board history in this window.')
  })

  test('durations read plainly', () => {
    expect([durText(undefined), durText(42_000), durText(125_000), durText(2 * 3600_000 + 5 * MIN)]).toEqual(['–', '42s', '2m 5s', '2h 5m'])
  })
})
