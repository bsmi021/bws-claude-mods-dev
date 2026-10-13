import { test, expect, describe } from 'claude-code/testing'
import { dreamOnCompact, parseEveryTurns } from '../hooks/dreamapply'
import { DIR, drain, folder, MERGE_AB, PANE, plan, run, SESSION_END, TABS_A, TABS_B, turn, world } from './dreamworld'

const TWO = folder(TABS_A, TABS_B)
const COMPACT = { trigger: 'manual', messages: [{ role: 'user', text: 'hello there', toolUses: [] }] }
const EVERY3 = { options: { dreamEveryTurns: 3 } }

async function turns($: never, w: ReturnType<typeof world>, n: number, o: object = {}) {
  for (let i = 0; i < n; i++) {
    await turn($, o)
    await drain(w.clock)
  }
}

describe('FR-DP-03: every N turns', () => {
  test('parseEveryTurns: the default is 20; 0 is off; text and junk', () => {
    expect(parseEveryTurns(undefined)).toBe(20)
    expect(parseEveryTurns(5)).toBe(5)
    expect(parseEveryTurns('7')).toBe(7)
    expect(parseEveryTurns(0)).toBe(0)
    expect(parseEveryTurns(-1)).toBe(20)
    expect(parseEveryTurns('soon')).toBe(20)
    expect(parseEveryTurns(2.9)).toBe(2)
  })

  test('the Nth answered turn makes the dream due and a preview opens; before it nothing happens; nothing is applied', EVERY3, async ($, on) => {
    const w = world(on, { files: TWO })
    const before = new Map(w.files)
    await turns($ as never, w, 2)
    expect(w.seen.fork.length).toBe(0)
    expect(w.seen.opened).toEqual([])
    await turns($ as never, w, 1)
    expect(w.seen.fork.length).toBe(1)
    expect(w.seen.fork[0]).toContain('=== tabs-a.md')
    expect(w.seen.opened).toEqual(['bws-dream'])
    expect(w.files).toEqual(before) // an automatic dream only previews
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /Dream plan: 1 action \(due\)/ })).toBeDefined()
    expect(await ui.find({ key: 'apply' })).toBeDefined()
    await ui.unmount()
  })

  test('the default is 20 turns', async ($, on) => {
    const w = world(on, { files: TWO })
    await turns($ as never, w, 19)
    expect(w.seen.fork.length).toBe(0)
    await turns($ as never, w, 1)
    expect(w.seen.fork.length).toBe(1)
  })

  test('/dream status counts the turns so far', EVERY3, async ($, on) => {
    const w = world(on, { files: TWO })
    await turns($ as never, w, 2)
    expect(await run($, 'dream', 'status')).toBe('Dream: nothing waiting. Automatic: every 3 turns (2 so far) and before a compaction.')
  })

  test('a plan that is waiting is not replaced; after Dismiss another N turns bring a new one', EVERY3, async ($, on) => {
    const w = world(on, { files: TWO })
    await turns($ as never, w, 6)
    expect(w.seen.fork.length).toBe(1)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'dismiss' } as never)
    await ui.unmount()
    await turns($ as never, w, 2)
    expect(w.seen.fork.length).toBe(1)
    await turns($ as never, w, 1)
    expect(w.seen.fork.length).toBe(2)
  })

  test('only the user\'s answered turns on a screen count: a subagent, an interrupted turn and a headless run do not', EVERY3, async ($, on) => {
    const w = world(on, { files: TWO })
    await turns($ as never, w, 2)
    await turns($ as never, w, 3, { agentId: 'sub-1' })
    await turns($ as never, w, 3, { reason: 'interrupt', isAborted: true })
    expect(w.seen.fork.length).toBe(0)
    await turns($ as never, w, 1)
    expect(w.seen.fork.length).toBe(1)
  })

  test('headless: turns are not counted and nothing is forked', EVERY3, async ($, on) => {
    const w = world(on, { files: TWO, surfaces: [] })
    await turns($ as never, w, 6)
    expect(w.seen.fork.length).toBe(0)
    expect(w.seen.opened).toEqual([])
  })

  test('dreamEveryTurns 0 turns it off, for turns and for compactions', { options: { dreamEveryTurns: 0 } }, async ($, on) => {
    const w = world(on, { files: TWO })
    await turns($ as never, w, 25)
    await $.session.compact(COMPACT as never)
    await drain(w.clock)
    expect(w.seen.fork.length).toBe(0)
    expect(await run($, 'dream', 'status')).toContain('Automatic: off.')
  })

  test('with fewer than two memory files nothing is due: no model call, no pane', EVERY3, async ($, on) => {
    const w = world(on, { files: folder(TABS_A) })
    await turns($ as never, w, 6)
    expect(w.seen.fork.length).toBe(0)
    expect(w.seen.opened).toEqual([])
  })

  test('an automatic dream that fails stays quiet (no pane), logs one line, and leaves the dream due', EVERY3, async ($, on) => {
    const w = world(on, { files: TWO, fork: 'throw' })
    await turns($ as never, w, 3)
    expect(w.seen.opened).toEqual([])
    expect(w.seen.logs.filter(l => l.text.startsWith('bws-memory: dream')).map(l => l.text)).toEqual(['bws-memory: dream fork failed (error); nothing changed'])
    expect(await run($, 'dream', 'status')).toContain('due: run /dream')
    expect(w.seen.writes).toEqual([])
  })

  test('a trigger that finds a memory update running starts its preview once that has finished', { options: { dreamEveryTurns: 2 } }, async ($, on) => {
    const w = world(on, { files: TWO, fork: 'defer', classify: 'yes' })
    await turn($)
    await drain(w.clock)
    expect(w.seen.fork.length).toBe(1) // the memory fork, waiting
    await turn($)
    await drain(w.clock)
    expect(w.seen.fork.length).toBe(1) // the second turn made the dream due, but the folder is busy
    w.release('{"entries":[]}')
    await drain(w.clock)
    expect(w.seen.fork.length).toBe(2) // the dream's own fork
    expect(w.seen.fork[1]).toContain('Consolidate the user')
  })

  test('/clear resets the counter and drops a trigger that was waiting', EVERY3, async ($, on) => {
    const w = world(on, { files: TWO })
    await turns($ as never, w, 2)
    await $.session.end(SESSION_END('clear'))
    await turns($ as never, w, 2)
    expect(w.seen.fork.length).toBe(0)
    await turns($ as never, w, 1)
    expect(w.seen.fork.length).toBe(1)
  })
})

describe('FR-DP-03: before a compaction', () => {
  test('dreamOnCompact: the main conversation\'s manual, automatic and plugin compactions; not precompute, not a subagent', () => {
    expect(dreamOnCompact('manual', undefined)).toBe(true)
    expect(dreamOnCompact('auto', undefined)).toBe(true)
    expect(dreamOnCompact('plugin', undefined)).toBe(true)
    expect(dreamOnCompact('precompute', undefined)).toBe(false)
    expect(dreamOnCompact('manual', 'agent-1')).toBe(false)
  })

  test('a compaction makes the dream due and previews it behind: the compaction is not held up and returns its own result', async ($, on) => {
    const w = world(on, { files: TWO, fork: 'defer' })
    const r = (await $.session.compact(COMPACT as never)) as { messages?: unknown }
    expect(r.messages).toBeDefined()
    await drain(w.clock)
    expect(w.seen.fork.length).toBe(1) // the fork is still planning; the compaction already returned
    w.release(plan(MERGE_AB))
    await drain(w.clock)
    expect(w.seen.opened).toEqual(['bws-dream'])
    expect(w.seen.writes).toEqual([])
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /Dream plan: 1 action \(due\)/ })).toBeDefined()
    await ui.unmount()
  })

  test('a compaction with fewer than two memory files starts nothing', async ($, on) => {
    const w = world(on, { files: folder(TABS_A) })
    await $.session.compact(COMPACT as never)
    await drain(w.clock)
    expect(w.seen.fork.length).toBe(0)
  })

  test('a compaction while a plan already waits starts nothing new', async ($, on) => {
    const w = world(on, { files: TWO })
    await $.session.compact(COMPACT as never)
    await drain(w.clock)
    expect(w.seen.fork.length).toBe(1)
    await $.session.compact(COMPACT as never)
    await drain(w.clock)
    expect(w.seen.fork.length).toBe(1)
  })

  test('headless compaction: no dream', async ($, on) => {
    const w = world(on, { files: TWO, surfaces: [] })
    await $.session.compact(COMPACT as never)
    await drain(w.clock)
    expect(w.seen.fork.length).toBe(0)
  })
})
