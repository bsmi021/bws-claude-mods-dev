import { test, expect, describe } from 'claude-code/testing'
import { DIR, drain, folder, MERGE_AB, PANE, plan, PNPM, run, TABS_A, TABS_B, world } from './dreamworld'

const row = (file: string, session: string, at: number) => ({ file, session, at, kind: 'new' })
const SOURCES = JSON.stringify({ writes: [row('tabs-a.md', 'aaaa1111-x', 1), row('tabs-b.md', 'bbbb2222-y', 2), row('uses-pnpm.md', 'cccc3333-z', 3), row('tabs-b.md', 'aaaa1111-x', 4)] })
const WITH_SOURCES = (...e: Parameters<typeof folder>) => ({ ...folder(...e), [`${DIR}/sources.json`]: SOURCES })

type Rows = { writes: { file: string; session: string }[] }
const rowsOf = (text: string | undefined): string[] => ((JSON.parse(text ?? '{"writes":[]}') as Rows).writes ?? []).map(w => `${w.file}:${w.session}`)

describe('FR-DP-04: sources', () => {
  test('the pane shows each action\'s sessions: for a merge, the union of its files\' sessions without repeats', async ($, on) => {
    const w = world(on, { files: WITH_SOURCES(TABS_A, TABS_B) })
    await run($, 'dream')
    await drain(w.clock)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /from: aaaa1111, bbbb2222$/ })).toBeDefined()
    await ui.unmount()
  })

  test('a file with no recorded session says so (written by hand, or before sources.json)', async ($, on) => {
    const w = world(on, { files: folder(TABS_A, TABS_B) })
    await run($, 'dream')
    await drain(w.clock)
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    expect(await ui.find({ type: 'Text', text: /from: unknown session/ })).toBeDefined()
    await ui.unmount()
  })

  test('the fork is told each file\'s sessions', async ($, on) => {
    const w = world(on, { files: WITH_SOURCES(TABS_A, TABS_B), surfaces: [] })
    await run($, 'dream')
    expect(w.seen.fork[0]).toContain('=== tabs-a.md (sessions: aaaa1111)')
    expect(w.seen.fork[0]).toContain('=== tabs-b.md (sessions: bbbb2222, aaaa1111)')
  })

  test('applying a merge moves the merged-away file\'s sessions to the target: the next dream sees the union', async ($, on) => {
    const w = world(on, { files: WITH_SOURCES(TABS_A, TABS_B, PNPM), surfaces: [] })
    await run($, 'dream', 'apply')
    expect(rowsOf(w.files.get(`${DIR}/sources.json`))).toEqual(['tabs-a.md:aaaa1111-x', 'tabs-a.md:bbbb2222-y', 'uses-pnpm.md:cccc3333-z', 'tabs-a.md:aaaa1111-x'])
    w.seen.fork.length = 0
    await run($, 'dream')
    expect(w.seen.fork[0]).toContain('=== tabs-a.md (sessions: aaaa1111, bbbb2222)')
    expect(w.seen.fork[0]).not.toContain('=== tabs-b.md')
  })

  test('removing a file drops its rows; a rewrite keeps them', async ($, on) => {
    const w = world(on, {
      files: WITH_SOURCES(TABS_A, TABS_B, PNPM, { ...TABS_A, file: 'x.md', name: 'x', description: 'x', body: 'x' }, { ...TABS_A, file: 'y.md', name: 'y', description: 'y', body: 'y' }),
      fork: plan({ action: 'remove', file: 'tabs-b.md', reason: 'stale' }, { action: 'rewrite', file: 'uses-pnpm.md', body: 'Use pnpm.', reason: 'clearer' }),
      surfaces: [],
    })
    await run($, 'dream', 'apply')
    expect(rowsOf(w.files.get(`${DIR}/sources.json`))).toEqual(['tabs-a.md:aaaa1111-x', 'uses-pnpm.md:cccc3333-z'])
  })

  test('/dream undo brings the sources back with the files', async ($, on) => {
    const w = world(on, { files: WITH_SOURCES(TABS_A, TABS_B), surfaces: [] })
    await run($, 'dream', 'apply')
    expect(rowsOf(w.files.get(`${DIR}/sources.json`)).some(r => r.startsWith('tabs-b.md:'))).toBe(false)
    await run($, 'dream', 'undo')
    expect(w.files.get(`${DIR}/sources.json`)).toBe(SOURCES)
  })

  test('after a merge in the pane the result lists the same sessions', async ($, on) => {
    const w = world(on, { files: WITH_SOURCES(TABS_A, TABS_B), fork: plan(MERGE_AB) })
    await run($, 'dream', 'apply')
    await drain(w.clock)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /Dream applied: 1 merged/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /from: aaaa1111, bbbb2222/ })).toBeDefined()
    await ui.unmount()
  })
})
