import { describe, expect, test } from 'claude-code/testing'

import { EXPLORE_LEAF, EXPLORE_NEXT } from './replies'
import { mountTree } from './tabview'
import { run, settle, treeWorld } from './treeworld'

type Mounted = { press: (t: { key: string }) => Promise<unknown>; unmount: () => Promise<void> }

async function press($: { ui: { mount: (t: never) => Promise<Mounted> } }, clock: { advance: (ms: number) => Promise<void> }, key: string, rows = 30) {
  const ui = await mountTree($ as never)
  await ui.press({ key })
  await settle(clock)
  await ui.unmount()
}

const NL = String.fromCharCode(10)
const LONG = Array.from({ length: 30 }, (_, i) => `Point ${i + 1}: the driver choice changes how writes are queued.`).join(NL + NL) + NL + NL + 'Which driver?' + NL + NL + '1. one' + NL + '2. two'

describe('FR-DT-04: back to an earlier question, another option, branches kept', () => {
  test('Back, then another option: both branches stay, each tagged on the root', async ($, on) => {
    const w = treeWorld(on, { children: [{ reply: EXPLORE_NEXT }, { reply: EXPLORE_LEAF }] })
    await run($, 'explain')
    await press($, w.clock, 'opt-0')
    await press($, w.clock, 'back')
    await press($, w.clock, 'opt-2')
    await press($, w.clock, 'back')
    const ui = await mountTree($ as never)
    expect((await ui.find({ key: 'opt-0' }))?.text).toContain('1. SQLite')
    expect((await ui.find({ key: 'opt-0' }))?.text).toContain('→ Which driver should it use?')
    expect((await ui.find({ key: 'opt-1' }))?.text).not.toContain('→')
    expect((await ui.find({ key: 'opt-2' }))?.text).toContain('→ answered')
    expect(await ui.find({ key: 'back' })).toBeUndefined() // at the root
    await ui.unmount()
    expect(w.seen.spawns).toHaveLength(2)
  })

  test('the line under the header names the options taken to the node shown', async ($, on) => {
    const w = treeWorld(on, { children: [{ reply: EXPLORE_NEXT }] })
    await run($, 'explain')
    const root = await mountTree($ as never)
    expect(await root.find({ type: 'Text', text: 'the question of the last reply' })).toBeDefined()
    await root.unmount()
    await press($, w.clock, 'opt-0')
    const ui = await mountTree($ as never)
    expect(await ui.find({ type: 'Text', text: '1. SQLite — one file, no serv…' })).toBeDefined()
    await ui.unmount()
  })
})

describe('FR-DT-04: the Map view', () => {
  test('Map shows the whole tree; a node row jumps there; Node goes back to the node view', async ($, on) => {
    const w = treeWorld(on, { children: [{ reply: EXPLORE_NEXT }, { reply: EXPLORE_LEAF }] })
    await run($, 'explain')
    await press($, w.clock, 'opt-0')
    await press($, w.clock, 'back')
    await press($, w.clock, 'opt-2')
    await press($, w.clock, 'map')
    const map = await mountTree($ as never)
    expect((await map.find({ key: 'map' }))?.text).toBe('Node')
    expect(await map.find({ type: 'Text', text: 'the whole tree; pick a node to go there' })).toBeDefined()
    expect((await map.find({ key: 'node-n1' }))?.text).toContain('Which would you like me to go with?')
    expect((await map.find({ key: 'node-n2' }))?.text).toContain('1. SQLite')
    expect((await map.find({ key: 'node-n3' }))?.text).toMatch(/^>/) // the current node
    expect((await map.findAll({ type: 'Text' })).some(t => (t.text ?? '').includes('1. better-sqlite3 (synchronous, the most used)'))).toBe(true) // an unexplored option of n2, as text
    expect(await map.find({ key: 'back' })).toBeUndefined()
    await map.press({ key: 'node-n2' })
    await map.unmount()
    const node = await mountTree($ as never)
    expect((await node.find({ key: 'map' }))?.text).toBe('Map')
    expect(await node.find({ type: 'Text', text: 'Which driver should it use?' })).toBeDefined()
    await node.press({ key: 'map' })
    await node.press({ key: 'map' })
    await node.unmount()
  })
})

describe('FR-DT-04: Close, and keys and scrolling as the side chat', () => {
  test('Close ends a running fork and clears the tree', async ($, on) => {
    const w = treeWorld(on, { children: [{ hold: true }] })
    await run($, 'explain')
    await press($, w.clock, 'opt-0')
    await press($, w.clock, 'close')
    expect(w.seen.kills).toHaveLength(1)
    await run($, 'side', '--tree') // Close went back to the chat view; the tree view now says there is none
    const ui = await mountTree($ as never)
    expect(await ui.find({ type: 'Text', text: 'Type /explain after a reply that lists options.' })).toBeDefined()
    await ui.unmount()
    expect(w.seen.logs).toEqual([])
  })

  test('/explain close does the same from the prompt', async ($, on) => {
    const w = treeWorld(on)
    await run($, 'explain')
    expect(await run($, 'explain', 'close')).toEqual({})
  })

  test('a long answer scrolls in half-pane steps; the options and buttons stay in view', async ($, on) => {
    const w = treeWorld(on, { children: [{ reply: LONG }] })
    await run($, 'explain')
    await press($, w.clock, 'opt-0')
    const ui = await mountTree($ as never)
    expect(await ui.find({ key: 'opt-1' })).toBeDefined() // the bottom: the options
    expect(await ui.find({ key: 'back' })).toBeDefined()
    expect(await ui.find({ key: 'older' })).toBeDefined()
    expect(await ui.find({ key: 'newer' })).toBeUndefined()
    await ui.press({ key: 'older' })
    await ui.unmount()
    const up = await mountTree($ as never)
    expect(await up.find({ key: 'newer' })).toBeDefined()
    expect(await up.find({ key: 'back' })).toBeDefined() // the header stays
    await up.press({ key: 'newer' })
    await up.unmount()
    const down = await mountTree($ as never)
    expect(await down.find({ key: 'newer' })).toBeUndefined()
    await down.unmount()
  })

  test('the tree is drawn on the desktop too', async ($, on) => {
    treeWorld(on, { surfaces: ['desktop'] })
    await run($, 'explain')
    const ui = await mountTree($ as never)
    expect((await ui.find({ key: 'opt-0' }))?.text).toContain('1. SQLite')
    expect(await ui.find({ type: 'Input' })).toBeDefined()
    await ui.unmount()
  })

  test('closing the tree closes no pane: the dashboard stays', async ($, on) => {
    const w = treeWorld(on)
    await run($, 'explain')
    await press($, w.clock, 'close')
    expect(w.seen.closed).toEqual([])
    expect(w.seen.opened.every(o => o.id === 'dashboard')).toBe(true)
  })
})
