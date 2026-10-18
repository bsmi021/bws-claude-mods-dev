import { describe, expect, test } from 'claude-code/testing'

import { EXPLORE_LEAF, EXPLORE_NEXT } from './replies'
import { mountTree } from './tabview'
import { DUMP, resumeOf, run, settle, sideIdOf, treeWorld } from './treeworld'

type Mounted = { press: (t: { key: string }) => Promise<unknown>; unmount: () => Promise<void> }

// Presses one button on a fresh mount of the tree pane, then lets the child's lines be read.
async function press($: { ui: { mount: (t: never) => Promise<Mounted> } }, clock: { advance: (ms: number) => Promise<void> }, key: string) {
  const ui = await mountTree($ as never)
  await ui.press({ key })
  await settle(clock)
  await ui.unmount()
}

const promptOf = (argv: readonly string[]) => argv[2] ?? ''

describe('FR-DT-03: Explore forks a side chat about one option', () => {
  test('the fork is asked about that option and for the next decision; its reply becomes the next node', async ($, on) => {
    const w = treeWorld(on, { children: [{ reply: EXPLORE_NEXT }] })
    await run($, 'explain')
    await press($, w.clock, 'opt-0')
    const prompt = promptOf(w.seen.spawns[0]?.argv ?? [])
    expect(prompt).toContain('The question: "Which would you like me to go with?". Explore option 1: "SQLite — one file')
    expect(prompt).toContain('then its options as a numbered list')
    expect(prompt).toContain('must not change any files')
    const ui = await mountTree($ as never)
    expect(await ui.find({ type: 'Text', text: 'Which driver should it use?' })).toBeDefined()
    expect((await ui.find({ key: 'opt-0' }))?.text).toContain('1. better-sqlite3')
    expect((await ui.find({ key: 'opt-1' }))?.text).toContain('2. node:sqlite')
    expect(await ui.find({ type: 'Text', text: 'SQLite keeps everything in one file next to the plugin, so there is nothing to install or run.' })).toBeDefined()
    expect(await ui.find({ key: 'back' })).toBeDefined()
    await ui.unmount()
  })

  test('a reply with no further decision is a free answer: shown, with nothing to explore', async ($, on) => {
    const w = treeWorld(on, { children: [{ reply: EXPLORE_LEAF }] })
    await run($, 'explain')
    await press($, w.clock, 'opt-2')
    const ui = await mountTree($ as never)
    expect(await ui.find({ type: 'Text', text: 'Recommendation: fine for a prototype; move to SQLite before more than one process writes.' })).toBeDefined()
    expect(await ui.find({ key: 'opt-0' })).toBeUndefined()
    expect(await ui.find({ type: 'Input' })).toBeUndefined()
    await ui.press({ key: 'back' })
    await ui.unmount()
    const root = await mountTree($ as never)
    expect((await root.find({ key: 'opt-2' }))?.text).toContain('→ answered')
    await root.unmount()
  })

  test("an option of a node below the root forks that node's fork, not the main conversation", async ($, on) => {
    const w = treeWorld(on, { children: [{ reply: EXPLORE_NEXT }, { reply: EXPLORE_LEAF }] })
    await run($, 'explain')
    await press($, w.clock, 'opt-0')
    await press($, w.clock, 'opt-1')
    const first = w.seen.spawns[0]?.argv ?? []
    const second = w.seen.spawns[1]?.argv ?? []
    expect(resumeOf(second)).toBe(sideIdOf(first))
    expect(second.join(' ')).toContain('--fork-session')
    expect(sideIdOf(second)).not.toBe(sideIdOf(first))
    expect(promptOf(second)).toContain('Choices made so far: "Which would you like me to go with?": 1. SQLite')
    expect(promptOf(second)).toContain('Explore option 2: "node:sqlite')
  })

  test('a free-text answer is accepted: it becomes an option and is explored', async ($, on) => {
    const w = treeWorld(on, { children: [{ reply: 'Redis needs a server too.' }] })
    await run($, 'explain')
    const ui = await mountTree($ as never)
    await ui.input({ key: 'answer-0', text: 'keep it in Redis' })
    await settle(w.clock)
    await ui.unmount()
    expect(promptOf(w.seen.spawns[0]?.argv ?? [])).toContain(`Explore the person's own answer: "keep it in Redis"`)
    const leaf = await mountTree($ as never)
    expect(await leaf.find({ type: 'Text', text: 'Redis needs a server too.' })).toBeDefined()
    await leaf.press({ key: 'back' })
    await leaf.unmount()
    const root = await mountTree($ as never)
    expect((await root.find({ key: 'opt-3' }))?.text).toContain('your answer: keep it in Redis')
    expect(await root.find({ key: 'answer-1' })).toBeDefined() // the box was cleared by its new key
    await root.unmount()
  })

  test('an option already explored is shown, not explored again', async ($, on) => {
    const w = treeWorld(on, { children: [{ reply: EXPLORE_LEAF }] })
    await run($, 'explain')
    await press($, w.clock, 'opt-0')
    await press($, w.clock, 'back')
    await press($, w.clock, 'opt-0')
    expect(w.seen.spawns).toHaveLength(1)
    const ui = await mountTree($ as never)
    expect(await ui.find({ key: 'back' })).toBeDefined() // on the child again
    await ui.unmount()
  })

  test('the state dump follows the tree as it grows', { options: { treeDumpFile: DUMP } }, async ($, on) => {
    const w = treeWorld(on, { children: [{ reply: EXPLORE_NEXT }] })
    await run($, 'explain')
    await press($, w.clock, 'opt-0')
    const dump = JSON.parse(w.seen.files.get(DUMP) ?? 'null') as { tree: { nodes: { state: string; forkId: string | null; options: unknown[] }[] }; exploring: string[] }
    expect(dump.tree.nodes).toHaveLength(2)
    expect(dump.tree.nodes[1]?.state).toBe('ready')
    expect(dump.tree.nodes[1]?.forkId).toBe(sideIdOf(w.seen.spawns[0]?.argv ?? []))
    expect(dump.tree.nodes[1]?.options).toHaveLength(2)
    expect(dump.exploring).toEqual([])
  })
})

describe('FR-DT-03 / FR-ALL-03: a failed Explore never blocks: the node says why, one debug line', () => {
  test('an error result marks the node failed; the line names no prompt or reply', async ($, on) => {
    const w = treeWorld(on, { children: [{ isError: true }] })
    await run($, 'explain')
    await press($, w.clock, 'opt-0')
    const ui = await mountTree($ as never)
    expect(await ui.find({ type: 'Text', text: 'Explore failed: Error: API Error: overloaded' })).toBeDefined()
    await ui.unmount()
    expect(w.seen.logs).toEqual([{ text: 'bws-sidechat explain: explore failed (error result)', to: 'debug' }])
  })

  test('a child that exits with no answer: the exit and its stderr', async ($, on) => {
    const w = treeWorld(on, { children: [{ exit: 2, stderr: 'unknown option --bogus' }] })
    await run($, 'explain')
    await press($, w.clock, 'opt-1')
    const ui = await mountTree($ as never)
    expect(await ui.find({ type: 'Text', text: 'Explore failed: The side chat process ended (exit 2): unknown option --bogus' })).toBeDefined()
    await ui.unmount()
    expect(w.seen.logs).toEqual([{ text: 'bws-sidechat explain: explore failed (exit 2)', to: 'debug' }])
  })

  test('no answer within the time limit: the child is ended and the node failed', { options: { exploreTimeoutSeconds: 5 } }, async ($, on) => {
    const w = treeWorld(on, { children: [{ hold: true }] })
    await run($, 'explain')
    await press($, w.clock, 'opt-0')
    const sideId = sideIdOf(w.seen.spawns[0]?.argv ?? []) ?? ''
    expect(w.seen.kills).toHaveLength(0)
    await w.clock.advance(5000)
    await settle(w.clock)
    expect(w.seen.kills.some(k => k.join(' ').includes(sideId))).toBe(true)
    const ui = await mountTree($ as never)
    expect(await ui.find({ type: 'Text', text: 'Explore failed: no answer within 5 s' })).toBeDefined()
    await ui.unmount()
    expect(w.seen.logs).toEqual([{ text: 'bws-sidechat explain: explore failed (timeout)', to: 'debug' }])
  })

  test('a failed option can be explored again', async ($, on) => {
    const w = treeWorld(on, { children: [{ isError: true }, { reply: EXPLORE_LEAF }] })
    await run($, 'explain')
    await press($, w.clock, 'opt-0')
    await press($, w.clock, 'back')
    const root = await mountTree($ as never)
    expect((await root.find({ key: 'opt-0' }))?.text).toContain('failed')
    await root.unmount()
    await press($, w.clock, 'opt-0')
    expect(w.seen.spawns).toHaveLength(2)
    const ui = await mountTree($ as never)
    expect(await ui.find({ type: 'Text', text: 'Recommendation: fine for a prototype; move to SQLite before more than one process writes.' })).toBeDefined()
    await ui.unmount()
  })

  test('a new /explain ends the forks of the old tree; their late reply is not written', async ($, on) => {
    const w = treeWorld(on, { children: [{ hold: true }] })
    await run($, 'explain')
    await press($, w.clock, 'opt-0')
    await run($, 'explain')
    await settle(w.clock)
    expect(w.seen.kills).toHaveLength(1)
    const ui = await mountTree($ as never)
    expect(await ui.find({ key: 'back' })).toBeUndefined() // a fresh root
    expect((await ui.find({ key: 'opt-0' }))?.text).not.toContain('failed')
    await ui.unmount()
    expect(w.seen.logs).toEqual([])
  })
})
