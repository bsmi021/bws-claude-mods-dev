import { test, expect, describe } from 'claude-code/testing'
import { DIR, drain, folder, MERGE_AB, NEW, OLD, plan, run, TABS_A, TABS_B, turn, world } from './dreamworld'

const TWO = folder(TABS_A, TABS_B)

describe('FR-DP-01: /dream asks for a plan', () => {
  test('it reads every memory file and sources.json, forks once and prints the plan; nothing is written', async ($, on) => {
    const sources = JSON.stringify({ writes: [{ file: 'tabs-a.md', session: 'aaaa1111-zz', at: 1, kind: 'new' }] })
    const w = world(on, { files: { ...TWO, [`${DIR}/MEMORY.md`]: '- [tabs-a](tabs-a.md) — x\n', [`${DIR}/sources.json`]: sources } })
    const before = new Map(w.files)
    const text = await run($, 'dream')
    expect(text).toContain('Dream plan: 1 action.')
    expect(text).toContain('- merge tabs-a.md + tabs-b.md into tabs-a.md: near-duplicates')
    expect(w.seen.fork.length).toBe(1)
    expect(w.seen.fork[0]).toContain('=== tabs-a.md (sessions: aaaa1111)')
    expect(w.seen.fork[0]).toContain('Always indent with tabs.')
    expect(w.seen.fork[0]).not.toContain('MEMORY.md')
    expect(w.seen.complete.length).toBe(0)
    expect(w.seen.writes).toEqual([])
    expect(w.files).toEqual(before)
  })

  test('fork unavailable (nothing to fork): the same prompt goes to $.model.complete', async ($, on) => {
    const w = world(on, { files: TWO, fork: { isAnswered: false, reason: 'nothing-to-fork' }, surfaces: [] })
    const text = await run($, 'dream')
    expect(text).toContain('Dream plan: 1 action.')
    expect(w.seen.complete.length).toBe(1)
    expect(w.seen.complete[0]?.model).toBe('claude-sonnet-5-5')
    expect(w.seen.complete[0]?.prompt).toContain('=== tabs-b.md')
  })

  test('fewer than two memory files, or none: no model call, "tidy"', async ($, on) => {
    const w = world(on, { files: folder(TABS_A) })
    expect(await run($, 'dream')).toBe('Nothing to consolidate: the memory is already tidy.')
    expect(w.seen.fork.length + w.seen.complete.length).toBe(0)
  })

  test('an empty plan from the fork is "tidy"', async ($, on) => {
    world(on, { files: TWO, fork: plan() })
    expect(await run($, 'dream')).toBe('Nothing to consolidate: the memory is already tidy.')
  })

  test('a plan that deletes more than 40% of the files is rejected: nothing changes, one debug line', async ($, on) => {
    const w = world(on, {
      files: folder(TABS_A, TABS_B, OLD, NEW),
      fork: plan({ action: 'remove', file: 'tabs-a.md', reason: 'r' }, { action: 'remove', file: 'tabs-b.md', reason: 'r' }),
    })
    const text = await run($, 'dream')
    expect(text).toBe('Dream failed. (validate: the plan removes 2 of 4 files (more than 40%)) Nothing changed.')
    expect(w.seen.writes).toEqual([])
    expect(w.seen.logs.filter(l => l.text.startsWith('bws-memory: dream')).length).toBe(1)
  })

  test('a plan naming an unknown file is rejected', async ($, on) => {
    const w = world(on, { files: TWO, fork: plan({ action: 'remove', file: 'ghost.md', reason: 'r' }) })
    expect(await run($, 'dream')).toContain('unknown file: ghost.md')
    expect(w.seen.writes).toEqual([])
  })

  test('fails open: a fork error leaves the files and logs one line without memory text', async ($, on) => {
    const w = world(on, { files: TWO, fork: 'throw' })
    expect(await run($, 'dream')).toContain('Dream failed. (fork: error)')
    expect(w.seen.logs.some(l => l.text === 'bws-memory: dream fork failed (error); nothing changed')).toBe(true)
    expect(w.seen.writes).toEqual([])
  })

  test('fails open: an unreadable reply', async ($, on) => {
    const w = world(on, { files: TWO, fork: 'I would merge them.' })
    expect(await run($, 'dream')).toContain('Dream failed. (parse:')
    expect(JSON.stringify(w.seen.logs)).not.toContain('Always indent')
  })

  test('fails open: the model answers with an api error', async ($, on) => {
    world(on, { files: TWO, fork: { isAnswered: false, reason: 'api-error' } })
    expect(await run($, 'dream')).toContain('Dream failed. (fork: api-error)')
  })

  test('a secret in the plan is redacted before it is shown', async ($, on) => {
    world(on, { files: TWO, fork: plan({ ...MERGE_AB, body: 'Use tabs. API_KEY=abc12345xyz here' }) })
    expect(await run($, 'dream')).not.toContain('abc12345xyz')
  })

  test('refused while a memory update is running: no dream fork is started', async ($, on) => {
    const w = world(on, { files: TWO, fork: 'defer', classify: 'yes' })
    await turn($)
    await drain(w.clock)
    expect(w.seen.fork.length).toBe(1) // the memory fork, still waiting
    expect(await run($, 'dream')).toBe('A memory update is already running; try again in a moment.')
    expect(w.seen.fork.length).toBe(1)
  })

  test('does not intercept other commands', async ($, on) => {
    const w = world(on, { files: TWO })
    expect(await run($, 'memories')).toBe('No memories written yet.')
    expect(w.seen.fork.length + w.seen.complete.length).toBe(0)
  })
})
