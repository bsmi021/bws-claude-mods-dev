import { describe, expect, test } from 'claude-code/testing'

import { lastReply, parseOptions, parseReply } from '../hooks/explain'
import { sideArgs } from '../hooks/side'
import {
  BOLD_HEADLINES,
  EXPLORE_LEAF,
  EXPLORE_NEXT,
  IN_CODE,
  LETTERED,
  NESTED,
  NUMBERED_BOLD,
  ONE_ITEM,
  OPTION_HEADINGS,
  OPTION_PARAGRAPHS,
  PAREN,
  STEPS,
  STEPS_THEN_CHOICE,
} from './replies'
import { mountChat, mountTree } from './tabview'
import { DUMP, resumeOf, run, settle, sideIdOf, treeWorld } from './treeworld'

const labels = (r: ReturnType<typeof parseOptions>) => r?.options.map(o => `${o.label}|${o.text}`)

describe('FR-DT-02: the parser, on replies as Claude Code writes them', () => {
  test('numbered options with a bold name and a closing question', () => {
    const r = parseOptions(NUMBERED_BOLD)
    expect(r?.question).toBe('Which would you like me to go with?')
    expect(labels(r)).toEqual([
      '1|SQLite — one file, no server, good enough for a single process.',
      '2|Postgres — the team already runs it; more setup for local dev.',
      '3|Plain JSON files — simplest, but no concurrent writes.',
    ])
  })

  test('`### Option A:` headings with bullets; a yes/no question at the end is not the decision', () => {
    const r = parseOptions(OPTION_HEADINGS)
    expect(labels(r)).toEqual(['A|Fake the clock', 'B|Raise the timeout'])
    expect(r?.question).toBe('I see two ways to fix the flaky test.')
  })

  test('bold numbered headlines with bullets between them; the introducing line is the question', () => {
    const r = parseOptions(BOLD_HEADLINES)
    expect(labels(r)).toEqual(['1|Big bang', '2|Strangler', '3|Dual-write'])
    expect(r?.question).toBe("Here's how I'd approach the auth migration")
  })

  test('lettered options after the question; `1)` markers', () => {
    const l = parseOptions(LETTERED)
    expect(l?.question).toBe('Before I change the parser, one question: which format should win when both are present?')
    expect(labels(l)).toEqual(['a|The YAML front matter', 'b|The inline `@tags`', 'c|Whichever comes last in the file'])
    const p = parseOptions(PAREN)
    expect(p?.question).toBe('Which test runner should the kit use?')
    expect(labels(p)).toEqual(['1|bun test, which `claude plugin test` already wraps', '2|vitest'])
  })

  test('nested sub-points stay out: the shallowest list is the choice', () => {
    const r = parseOptions(NESTED)
    expect(labels(r)).toEqual(['1|Keep the cache in memory', '2|Persist it with `$.store`'])
    expect(r?.question).toBe('Which should I build?')
  })

  test('`**Option 1: ...**` paragraphs with no question: a default question', () => {
    const r = parseOptions(OPTION_PARAGRAPHS)
    expect(labels(r)).toEqual(['1|Rewrite the listing every turn. Simple, but it breaks the cache.', '2|Add a context block. Keeps the cache; the list only grows.'])
    expect(r?.question).toBe('Which option?')
  })

  test('the last set of options wins over numbered findings before it', () => {
    const r = parseOptions(STEPS_THEN_CHOICE)
    expect(labels(r)).toEqual(['A|Normalize them in the stub', 'B|Normalize them in the module'])
    expect(r?.question).toBe('How should I fix the paths?')
  })

  test('not a choice: numbered steps, one item, a list in a code block, plain text', () => {
    expect(parseOptions(STEPS)).toBeNull()
    expect(parseOptions(ONE_ITEM)).toBeNull()
    expect(parseOptions(IN_CODE)).toBeNull()
    expect(parseOptions('Done: the tests pass.')).toBeNull()
    expect(parseOptions('')).toBeNull()
  })

  test("an Explore reply: its next decision, the text before it as the answer; or a free answer", () => {
    const next = parseReply(EXPLORE_NEXT)
    expect(next.question).toBe('Which driver should it use?')
    expect(next.options.map(o => o.label)).toEqual(['1', '2'])
    expect(next.answer).toContain('SQLite keeps everything in one file')
    expect(next.answer).not.toContain('Which driver')
    const leaf = parseReply(EXPLORE_LEAF)
    expect(leaf).toEqual({ question: '', options: [], answer: EXPLORE_LEAF })
  })

  test('the last reply is the last assistant message with text', () => {
    expect(lastReply([{ role: 'user', text: 'q' }, { role: 'assistant', text: 'a1' }, { role: 'assistant', text: '' }, { role: 'user', text: 'x' }])).toBe('a1')
    expect(lastReply([])).toBe('')
  })
})

describe('FR-DT-02: /explain opens the tree at its root', () => {
  test('registered as /explain, a name no built-in command uses', async ($, on) => {
    const w = treeWorld(on)
    await $.session.start({ cwd: 'C:/proj' } as never)
    expect(w.seen.commands).toContain('explain')
    expect(w.seen.commands).toContain('side') // the side chat's own command is still registered
  })

  test("the last reply's three options open the pane at the root, with one Explore button each", async ($, on) => {
    const w = treeWorld(on)
    const r = await run($, 'explain')
    expect(r).toEqual({})
    const ui = await mountTree($ as never)
    await w.clock.advance(900)
    expect(w.seen.opened[0]).toEqual({ id: 'dashboard', focus: true }) // asked inside the command: placed at any width, with the keys
    expect(w.seen.opened.some(o => o.id === 'dashboard' && o.focus === true)).toBe(true)
    expect(w.seen.spawns).toHaveLength(0) // nothing explored until asked
    expect(await ui.find({ type: 'Text', text: 'Which would you like me to go with?' })).toBeDefined()
    expect((await ui.find({ key: 'opt-0' }))?.text).toContain('1. SQLite')
    expect((await ui.find({ key: 'opt-2' }))?.text).toContain('3. Plain JSON files')
    expect(await ui.find({ key: 'opt-3' })).toBeUndefined()
    expect(await ui.find({ key: 'back' })).toBeUndefined() // at the root
    expect(await ui.find({ key: 'decide' })).toBeUndefined() // nothing chosen yet
    expect(await ui.find({ type: 'Input' })).toBeDefined() // a free answer
    await ui.unmount()
  })

  test('/explain <text> reads the text given instead of the last reply', async ($, on) => {
    treeWorld(on, { rows: [] })
    await run($, 'explain', LETTERED)
    const ui = await mountTree($ as never)
    expect((await ui.find({ key: 'opt-1' }))?.text).toContain('b. The inline `@tags`')
    await ui.unmount()
  })

  test('no options: says so, opens nothing', async ($, on) => {
    const w = treeWorld(on, { rows: [{ role: 'assistant', text: STEPS }] })
    const r = await run($, 'explain')
    expect(r.text).toContain('No options found in the last reply')
    expect(w.seen.opened).toHaveLength(0)
    const t = await run($, 'explain', 'just some words')
    expect(t.text).toContain('No options found in that text')
  })

  test('headless: the root and its options as text', { options: { treeDumpFile: DUMP } }, async ($, on) => {
    const w = treeWorld(on, { surfaces: [] })
    const r = await run($, 'explain')
    expect(r.text).toBe(
      [
        'Decision tree: 1 node.',
        '> Which would you like me to go with?',
        '    1. SQLite — one file, no server, good enough for a single process.',
        '    2. Postgres — the team already runs it; more setup for local dev.',
        '    3. Plain JSON files — simplest, but no concurrent writes.',
      ].join('\n'),
    )
    expect(w.seen.opened).toHaveLength(0)
    const dump = JSON.parse(w.seen.files.get(DUMP) ?? 'null') as { tree: { nodes: { question: string; options: unknown[] }[]; mainId: string } }
    expect(dump.tree.mainId).toBe('main-session-id')
    expect(dump.tree.nodes).toHaveLength(1)
    expect(dump.tree.nodes[0]?.options).toHaveLength(3)
  })

  test('the header counts the nodes against the cap', async ($, on) => {
    treeWorld(on)
    await run($, 'explain')
    const ui = await mountTree($ as never)
    expect((await ui.find({ type: 'Text', text: 'Decision tree · 1/30' }))?.text).toBe('Decision tree · 1/30')
    await ui.unmount()
  })

  test('does not intercept other commands', async ($, on) => {
    const w = treeWorld(on)
    on('command.run', () => ({ text: 'built-in' }))
    expect((await run($, 'compact')).text).toBe('built-in')
    expect(w.seen.opened).toHaveLength(0)
  })
})

describe("FR-DT-02: Explore reuses the side chat's fork child; at most two at once", () => {
  test("an Explore runs the side chat's own `claude -p` fork of the main conversation, with no mods in it", async ($, on) => {
    const w = treeWorld(on, { children: [{ reply: 'SQLite is fine here.' }] })
    await run($, 'explain')
    const ui = await mountTree($ as never)
    await ui.press({ key: 'opt-0' })
    await settle(w.clock)
    await ui.unmount()
    expect(w.seen.spawns).toHaveLength(1)
    const argv = w.seen.spawns[0]?.argv ?? []
    const sideId = sideIdOf(argv) ?? ''
    expect(resumeOf(argv)).toBe('main-session-id')
    const message = argv[2] ?? ''
    expect(argv).toEqual(['claude', ...sideArgs({ message, mainId: 'main-session-id', sideId, isFirst: true }, { tools: 'Read,Glob,Grep,WebFetch,WebSearch', isMcpOff: true, model: '' })])
    expect(w.seen.spawns[0]?.env).toEqual({ CLAUDE_CODE_PLUGIN_DIRS: '' })
  })

  test('a third Explore while two run is refused with a toast; one finishing frees a slot', async ($, on) => {
    const w = treeWorld(on, { children: [{ hold: true }, { hold: true }, { reply: 'ok' }] })
    await run($, 'explain')
    for (const opt of [0, 1, 2]) {
      const ui = await mountTree($ as never)
      await ui.press({ key: 'back' }).catch(() => undefined)
      await ui.unmount()
      const root = await mountTree($ as never)
      await root.press({ key: `opt-${opt}` })
      await settle(w.clock, 5)
      await root.unmount()
    }
    expect(w.seen.spawns).toHaveLength(2)
    expect(w.seen.toasts).toContain('Decision tree: 2 explorations are running. Wait for one to finish.')
    w.releaseAll()
    await settle(w.clock)
    const ui = await mountTree($ as never)
    await ui.press({ key: 'back' }).catch(() => undefined)
    await ui.unmount()
    const root = await mountTree($ as never)
    await root.press({ key: 'opt-2' })
    await settle(w.clock)
    await root.unmount()
    expect(w.seen.spawns).toHaveLength(3)
  })

  test('an Explore does not stop a side chat answer, nor the other way round', async ($, on) => {
    const w = treeWorld(on, { children: [{ hold: true }, { reply: 'It is the side chat.' }] })
    await run($, 'explain')
    const ui = await mountTree($ as never)
    await ui.press({ key: 'opt-0' })
    await settle(w.clock, 5)
    await ui.unmount()
    await run($, 'btw', 'what is this?')
    await w.clock.advance(100)
    await settle(w.clock)
    expect(w.seen.spawns).toHaveLength(2)
    expect(w.seen.kills).toHaveLength(0) // neither killed the other
    const side = await mountChat($ as never) // /btw showed the chat view of the tab
    expect(await side.find({ type: 'Text', text: 'It is the side chat.' })).toBeDefined()
    await side.unmount()
    await run($, 'side', '--tree') // the tab's Decision tree button
    const tree = await mountTree($ as never)
    expect(await tree.find({ type: 'Text', text: 'exploring…' })).toBeDefined()
    await tree.unmount()
  })
})
