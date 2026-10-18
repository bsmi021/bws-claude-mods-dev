import { describe, expect, test } from 'claude-code/testing'

import { EXPLORE_LEAF, EXPLORE_NEXT } from './replies'
import { mountTree } from './tabview'
import { run, settle, treeWorld } from './treeworld'

type Mounted = { press: (t: { key: string }) => Promise<unknown>; unmount: () => Promise<void> }

async function press($: { ui: { mount: (t: never) => Promise<Mounted> } }, clock: { advance: (ms: number) => Promise<void> }, key: string) {
  const ui = await mountTree($ as never)
  await ui.press({ key })
  await settle(clock)
  await ui.unmount()
}

const LEAF_PARAGRAPH =
  'Decision from the /explain tree: for "Which would you like me to go with?" I chose 3 (Plain JSON files — simplest, but no concurrent writes). What exploring it found: Plain JSON files need no dependency at all. Writes must go through one queue, or two saves can interleave. Recommendation: fine for a prototype; move to SQLite before more than one process writes. Go ahead on that basis.'

describe('FR-DT-05: Decide sends a one-paragraph summary into the main session', () => {
  test('the Decide button: the summary is sent as the person, once the press has returned; the pane closes', async ($, on) => {
    const w = treeWorld(on, { children: [{ reply: EXPLORE_LEAF }] })
    await run($, 'explain')
    await press($, w.clock, 'opt-2')
    const ui = await mountTree($ as never)
    expect(await ui.find({ key: 'decide' })).toBeDefined()
    await ui.press({ key: 'decide' })
    await ui.unmount()
    expect(w.seen.sent).toEqual([]) // deferred
    await w.clock.advance(10)
    expect(w.seen.sent).toEqual([{ text: LEAF_PARAGRAPH, asUser: true }])
    expect(w.seen.sent[0]?.text).not.toContain('\n')
  })

  test('/explain decide: $.prompt.submit is deferred with $.clock.after, never called inside the command', async ($, on) => {
    const w = treeWorld(on, { children: [{ reply: EXPLORE_NEXT }] })
    await run($, 'explain')
    await press($, w.clock, 'opt-0')
    const r = await run($, 'explain', 'decide')
    expect(r).toEqual({})
    expect(w.seen.sent).toHaveLength(0) // the command returned first
    await w.clock.advance(9)
    expect(w.seen.sent).toHaveLength(0)
    await w.clock.advance(1)
    expect(w.seen.sent).toHaveLength(1)
    expect(w.seen.sent[0]?.text).toBe(
      'Decision from the /explain tree: for "Which would you like me to go with?" I chose 1 (SQLite — one file, no server, good enough for a single process). What exploring it found: SQLite keeps everything in one file next to the plugin, so there is nothing to install or run. The main risk is two processes writing at once; WAL mode handles that for a single machine. Still open: "Which driver should it use?". Go ahead on that basis.',
    )
  })

  test('a deeper path names every choice; a free answer is named as mine', async ($, on) => {
    const w = treeWorld(on, { children: [{ reply: EXPLORE_NEXT }, { reply: 'It is built in.' }] })
    await run($, 'explain')
    await press($, w.clock, 'opt-0')
    const ui = await mountTree($ as never)
    await (ui as unknown as { input: (t: { key: string; text: string }) => Promise<unknown> }).input({ key: 'answer-0', text: 'whatever Bun ships' })
    await settle(w.clock)
    await ui.unmount()
    await run($, 'explain', 'decide')
    await w.clock.advance(10)
    expect(w.seen.sent[0]?.text).toContain('then for "Which driver should it use?" I chose my own answer (whatever Bun ships)')
    expect(w.seen.sent[0]?.text).toContain('What exploring it found: It is built in.')
  })

  test('Enter on an option only explores: while its fork runs there is no Decide, and nothing is sent', async ($, on) => {
    const w = treeWorld(on, { children: [{ hold: true }] })
    await run($, 'explain')
    await press($, w.clock, 'opt-0')
    const ui = await mountTree($ as never)
    expect(await ui.find({ key: 'decide' })).toBeUndefined() // the focus ring falls onto it once opt-0 goes, so a second Enter would have sent it
    expect(await ui.find({ key: 'close' })).toBeDefined()
    await ui.unmount()
    expect((await run($, 'explain', 'decide')).text).toBe('Nothing to decide yet: explore an option first.')
    await w.clock.advance(100)
    expect(w.seen.sent).toEqual([])
    expect(w.seen.closed).toEqual(['dashboard']) // only the reopen that took the keys: the tree and its fork are still there
    await run($, 'explain', 'close') // ends the fork, so nothing writes after the test
    w.releaseAll()
    await settle(w.clock)
  })

  test('nothing chosen yet: nothing is sent', async ($, on) => {
    const w = treeWorld(on)
    expect((await run($, 'explain', 'decide')).text).toBe('Nothing to decide yet: explore an option first.')
    await run($, 'explain')
    expect((await run($, 'explain', 'decide')).text).toBe('Nothing to decide yet: explore an option first.')
    await w.clock.advance(100)
    expect(w.seen.sent).toEqual([])
    expect(w.seen.closed).toEqual(['dashboard']) // only the reopen that took the keys
  })
})
