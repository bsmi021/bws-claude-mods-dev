import { test, expect, describe } from 'claude-code/testing'
import { memoryFile } from '../hooks/memory'
import { DIR, drain, folder, MERGE_AB, NEW, OLD, PANE, plan, PNPM, run, TABS_A, TABS_B, world } from './dreamworld'

// The clock moves 10 ms while the preview's deferred work runs.
const BK = `${DIR}/.dream-backup/20231114-221320-010`
const MEM_INDEX = '- [tabs-a](tabs-a.md) — The user wants tabs, not spaces\n- [tabs-b](tabs-b.md) — Tabs not spaces in this repo\n'
const SOURCES = JSON.stringify({
  writes: [
    { file: 'tabs-a.md', session: 'aaaa1111-x', at: 1, kind: 'new' },
    { file: 'tabs-b.md', session: 'bbbb2222-y', at: 2, kind: 'new' },
  ],
})
const TWO = { ...folder(TABS_A, TABS_B), [`${DIR}/MEMORY.md`]: MEM_INDEX, [`${DIR}/sources.json`]: SOURCES }
const surfaceOf = { terminal: 'terminal', desktop: 'desktop' } as const

// Runs /dream on a screen and lets the preview open.
async function preview($: never, w: ReturnType<typeof world>) {
  expect(await run($, 'dream')).toBe('Dreaming... the pane shows the plan.')
  await drain(w.clock)
}

describe('FR-DP-02: preview first', () => {
  test('/dream on a screen: nothing is written, the pane opens with the plan, Apply and Dismiss', async ($, on) => {
    const w = world(on, { files: TWO })
    const before = new Map(w.files)
    await preview($ as never, w)
    expect(w.seen.opened).toEqual(['bws-dream'])
    expect(w.files).toEqual(before)
    const ui = await $.ui.mount({ ...PANE, surface: surfaceOf.terminal })
    expect(await ui.find({ type: 'Text', text: /Dream plan: 1 action/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /merge tabs-a\.md \+ tabs-b\.md -> tabs-a\.md/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /near-duplicates/ })).toBeDefined()
    expect(await ui.find({ key: 'apply' })).toBeDefined()
    expect(await ui.find({ key: 'dismiss' })).toBeDefined()
    await ui.unmount()
  })

  test('while the fork plans the pane view says dreaming', async ($, on) => {
    const w = world(on, { files: TWO, fork: 'defer' })
    await run($, 'dream')
    await drain(w.clock)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /dreaming/ })).toBeDefined()
    await ui.unmount()
    w.release(plan(MERGE_AB))
    await drain(w.clock)
    expect(w.seen.opened).toEqual(['bws-dream'])
  })

  test('Dismiss: nothing is written, the pane closes, no plan is left', async ($, on) => {
    const w = world(on, { files: TWO })
    await preview($ as never, w)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'dismiss' } as never)
    await ui.unmount()
    expect(w.seen.writes).toEqual([])
    expect(w.seen.closed[w.seen.closed.length - 1]).toBe('bws-dream')
    const after = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await after.find({ type: 'Text', text: /No dream plan/ })).toBeDefined()
    await after.unmount()
  })

  test('a long plan shows its first 8 actions and says how many more', async ($, on) => {
    const many = Array.from({ length: 10 }, (_, i) => ({ action: 'rewrite', file: `f${i}.md`, body: `body ${i}`, reason: `r${i}` }))
    const files: Record<string, string> = {}
    for (let i = 0; i < 12; i++) files[`${DIR}/f${i}.md`] = memoryFile({ file: `f${i}.md`, name: `f${i}`, description: `d${i}`, type: 'user', body: `b${i}` })
    const w = world(on, { files, fork: plan(...many) })
    await preview($ as never, w)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /\+2 more/ })).toBeDefined()
    await ui.unmount()
  })
})

describe('FR-DP-02: Apply writes the changes after a backup', () => {
  test('Apply: the folder is copied first, then the merge is written, index and sources follow; the pane shows the result', async ($, on) => {
    const w = world(on, { files: TWO })
    const before = new Map(w.files)
    await preview($ as never, w)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'apply' } as never)
    await ui.unmount()
    await drain(w.clock)
    // the backup holds every file as it was
    for (const [path, text] of before) expect(w.files.get(path.replace(`${DIR}/`, `${BK}/`))).toBe(text)
    // the first write is a backup copy, before any file of the memory itself
    const firstReal = w.seen.writes.findIndex(p => !p.includes('/.dream-backup/'))
    expect(w.seen.writes.slice(0, firstReal).every(p => p.includes('/.dream-backup/'))).toBe(true)
    expect(w.seen.writes.slice(0, firstReal).length).toBe(4)
    expect(w.files.get(`${DIR}/tabs-a.md`)).toBe(memoryFile({ file: 'tabs-a.md', name: 'tabs-a', description: 'Indent with tabs, never spaces', type: 'feedback', body: 'Use tabs, always, in every file.\n\nWhy: house style.' }))
    expect(w.files.get(`${DIR}/tabs-b.md`)).toBe('')
    expect(w.files.get(`${DIR}/MEMORY.md`)).toBe('- [tabs-a](tabs-a.md) — Indent with tabs, never spaces\n')
    const sources = JSON.parse(w.files.get(`${DIR}/sources.json`) ?? '{}') as { writes: { file: string; session: string }[] }
    expect(sources.writes.map(x => `${x.file}:${x.session}`)).toEqual(['tabs-a.md:aaaa1111-x', 'tabs-a.md:bbbb2222-y'])
    const done = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await done.find({ type: 'Text', text: /Dream applied: 1 merged, 0 removed, 0 rewritten/ })).toBeDefined()
    expect(await done.find({ type: 'Text', text: /\.dream-backup\/20231114-221320-010/ })).toBeDefined()
    expect(await done.find({ key: 'close' })).toBeDefined()
    await done.press({ key: 'close' } as never)
    await done.unmount()
  })

  test('remove and rewrite: the removed file is emptied and its index line dropped; the rewrite keeps its name and type', async ($, on) => {
    const w = world(on, {
      files: { ...folder(OLD, NEW, PNPM, TABS_A, TABS_B), [`${DIR}/MEMORY.md`]: '- [old-port](old-port.md) — 3000\n- [uses-pnpm](uses-pnpm.md) — pnpm\n' },
      fork: plan({ action: 'remove', file: 'old-port.md', reason: 'contradicted by new-port.md' }, { action: 'rewrite', file: 'uses-pnpm.md', description: 'pnpm is the package manager', body: 'Use pnpm, never npm.', reason: 'clearer' }),
    })
    expect(await run($, 'dream', 'apply')).toBe('Dreaming... the pane shows the result.')
    await drain(w.clock)
    expect(w.files.get(`${DIR}/old-port.md`)).toBe('')
    expect(w.files.get(`${DIR}/uses-pnpm.md`)).toBe(memoryFile({ file: 'uses-pnpm.md', name: 'uses-pnpm', description: 'pnpm is the package manager', type: 'project', body: 'Use pnpm, never npm.' }))
    expect(w.files.get(`${DIR}/MEMORY.md`)).toBe('- [uses-pnpm](uses-pnpm.md) — pnpm is the package manager\n')
    expect(w.files.get(`${BK}/old-port.md`)).toBe(memoryFile(OLD))
  })

  test('Apply refuses when a planned file changed after the preview: nothing is written, the pane says why', async ($, on) => {
    const w = world(on, { files: TWO })
    await preview($ as never, w)
    w.files.set(`${DIR}/tabs-b.md`, `${w.files.get(`${DIR}/tabs-b.md`)}\nAnd a new line.\n`)
    w.seen.writes.length = 0
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'apply' } as never)
    await ui.unmount()
    await drain(w.clock)
    expect(w.seen.writes).toEqual([])
    const err = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await err.find({ type: 'Text', text: /memory changed since the preview \(tabs-b\.md\)/ })).toBeDefined()
    await err.unmount()
    expect(w.seen.logs.some(l => l.text.startsWith('bws-memory: dream apply failed'))).toBe(true)
  })

  test('/dream apply with a preview waiting applies that preview: no second fork', async ($, on) => {
    const w = world(on, { files: TWO })
    await preview($ as never, w)
    expect(w.seen.fork.length).toBe(1)
    const text = await run($, 'dream', 'apply')
    expect(text).toBe('Dream applied: 1 merged, 0 removed, 0 rewritten. Backup: .dream-backup/20231114-221320-010/ (restore with /dream undo).')
    expect(w.seen.fork.length).toBe(1)
    expect(w.files.get(`${DIR}/tabs-b.md`)).toBe('')
  })

  test('/dream apply headless: plans and applies in one awaited command, no pane', async ($, on) => {
    const w = world(on, { files: TWO, surfaces: [] })
    const text = await run($, 'dream', '--apply')
    expect(text).toContain('Dream applied: 1 merged, 0 removed, 0 rewritten.')
    expect(w.files.get(`${DIR}/tabs-b.md`)).toBe('')
    expect(w.seen.opened).toEqual([])
  })

  test('/dream headless without apply: the plan as text and a note that nothing changed', async ($, on) => {
    const w = world(on, { files: TWO, surfaces: [] })
    const text = await run($, 'dream')
    expect(text).toContain('Dream plan: 1 action.')
    expect(text).toContain('nothing changed')
    expect(w.seen.writes).toEqual([])
    expect(w.seen.opened).toEqual([])
  })

  test('a failed /dream on a screen opens the pane with the reason and a Close button', async ($, on) => {
    const w = world(on, { files: TWO, fork: 'throw' })
    await run($, 'dream')
    await drain(w.clock)
    expect(w.seen.opened).toEqual(['bws-dream'])
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    expect(await ui.find({ type: 'Text', text: /Dream: fork: error/ })).toBeDefined()
    await ui.press({ key: 'close' } as never)
    await ui.unmount()
  })

  test('a bad argument prints the usage', async ($, on) => {
    world(on, { files: TWO, surfaces: [] })
    expect(await run($, 'dream', 'sideways')).toBe('Usage: /dream [apply | undo | status]')
  })
})

describe('FR-DP-02: /dream undo', () => {
  test('restores every file from the latest backup, once; a second undo says it was already restored', async ($, on) => {
    const w = world(on, { files: TWO, surfaces: [] })
    const before = new Map(w.files)
    await run($, 'dream', 'apply')
    expect(w.files.get(`${DIR}/tabs-b.md`)).toBe('')
    expect(await run($, 'dream', 'undo')).toBe('Dream undone: 2 files restored from .dream-backup/20231114-221320-000/.')
    for (const [path, text] of before) expect(w.files.get(path)).toBe(text)
    expect(await run($, 'dream', 'undo')).toBe('The latest dream backup (20231114-221320-000) was already restored.')
  })

  test('with no backup: says so and writes nothing', async ($, on) => {
    const w = world(on, { files: TWO, surfaces: [] })
    expect(await run($, 'dream', 'undo')).toBe('No dream backup to restore.')
    expect(w.seen.writes).toEqual([])
  })

  test('picks the newest of several backups', async ($, on) => {
    const w = world(on, {
      files: { ...TWO, [`${DIR}/.dream-backup/20231113-000000-000/tabs-a.md`]: 'older', [`${DIR}/.dream-backup/20231115-000000-000/tabs-a.md`]: 'newest' },
      surfaces: [],
    })
    expect(await run($, 'dream', 'undo')).toContain('20231115-000000-000')
    expect(w.files.get(`${DIR}/tabs-a.md`)).toBe('newest')
  })

  test('a dream clears /memory-undo\'s record: it would undo into a folder that is gone', async ($, on) => {
    world(on, { files: { ...TWO, [`${DIR}/.undo/last.json`]: JSON.stringify({ at: 5, files: [{ file: 'tabs-a.md', before: null }], index: null, sources: null }) }, surfaces: [] })
    await run($, 'dream', 'apply')
    expect(await run($, 'memory-undo')).toBe('Nothing to undo.')
  })

  test('the backup folder and the emptied files do not show up as memory files for the next dream', async ($, on) => {
    const w = world(on, { files: TWO, surfaces: [] })
    await run($, 'dream', 'apply')
    w.seen.fork.length = 0
    await run($, 'dream')
    expect(w.seen.fork.length).toBe(0) // one live file left: nothing to consolidate, no model call
  })
})

describe('FR-DP-03: /clear, /resume, /branch', () => {
  const END = (reason: string) => ({ reason, sessionId: 'session-aaaa-1111', resume: {} }) as never

  test('/clear drops a plan that is still being made: it is never shown or applied', async ($, on) => {
    const w = world(on, { files: TWO, fork: 'defer' })
    await run($, 'dream', 'apply')
    await drain(w.clock)
    await $.session.end(END('clear'))
    w.release(plan(MERGE_AB))
    await drain(w.clock)
    expect(w.seen.opened).toEqual([])
    expect(w.seen.writes).toEqual([])
    expect(await run($, 'dream', 'status')).toContain('nothing waiting')
  })

  test('/clear closes a waiting plan; one that came from the trigger stays due, one asked for with /dream does not', { options: { dreamEveryTurns: 2 } }, async ($, on) => {
    const w = world(on, { files: TWO })
    for (let i = 0; i < 2; i++) {
      await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: `t${i}`, reason: 'answer' } as never)
      await drain(w.clock)
    }
    expect(w.seen.opened).toEqual(['bws-dream'])
    const n = w.seen.closed.length
    await $.session.end(END('clear'))
    expect(w.seen.closed.slice(n)).toContain('bws-dream')
    expect(await run($, 'dream', 'status')).toContain('due: run /dream')
    await run($, 'dream')
    await drain(w.clock)
    await $.session.end(END('resume'))
    expect(await run($, 'dream', 'status')).toContain('due: run /dream') // still due: nobody applied or dismissed it
  })

  test('a manual preview is gone after /clear and leaves nothing due', async ($, on) => {
    const w = world(on, { files: TWO })
    await preview($ as never, w)
    await $.session.end(END('clear'))
    expect(await run($, 'dream', 'status')).toBe('Dream: nothing waiting. Automatic: every 20 turns (0 so far) and before a compaction.')
  })

  test('a new session id (/branch has no event) resets the same way on the next command', async ($, on) => {
    const w = world(on, { files: TWO })
    await run($, 'dream', 'status') // the session this conversation started in
    await preview($ as never, w)
    const n = w.seen.closed.length
    w.who.session = 'session-bbbb-2222'
    expect(await run($, 'dream', 'status')).toContain('nothing waiting')
    expect(w.seen.closed.slice(n)).toContain('bws-dream')
  })
})
