import { describe, expect, test } from 'claude-code/testing'

import {
  MAX_DEPTH,
  MAX_NODES,
  addChild,
  addOption,
  branch,
  cannotAdd,
  childVia,
  childrenOf,
  currentOf,
  decisionParagraph,
  fillNode,
  goBack,
  goTo,
  mapRows,
  mapText,
  newTree,
  nodeOf,
  pathTo,
  treeSummary,
} from '../hooks/tree'
import type { DecisionTree } from '../types'

const DB = [
  { label: '1', text: 'Postgres' },
  { label: '2', text: 'SQLite' },
  { label: '3', text: 'DuckDB' },
]
const DRIVERS = [
  { label: 'a', text: 'better-sqlite3' },
  { label: 'b', text: 'node:sqlite' },
]
const root = () => newTree('main-1', 'Which database should the cache use?', DB)

function grown(): DecisionTree {
  const a = addChild(root(), 'n1', 1, { question: 'Which driver?', options: DRIVERS, answer: 'SQLite is one file.', forkId: 'f-2', state: 'ready' })
  if (!a.ok) throw new Error(a.reason)
  return a.tree
}

describe('FR-DT-01: nodes and edges', () => {
  test('a new tree is one root node: question, options, nothing chosen, the main conversation, current', () => {
    const t = root()
    expect(t.nodes).toHaveLength(1)
    expect(t.edges).toEqual([])
    expect(t.currentId).toBe('n1')
    expect(t.mainId).toBe('main-1')
    expect(nodeOf(t, 'n1')).toEqual({
      id: 'n1',
      parentId: null,
      viaOption: null,
      question: 'Which database should the cache use?',
      options: DB,
      chosen: null,
      answer: '',
      forkId: null,
      depth: 0,
      state: 'ready',
      note: '',
    })
  })

  test('adding a child: an edge labelled by the option, the parent marks it chosen, the child is current', () => {
    const a = addChild(root(), 'n1', 1)
    expect(a.ok).toBe(true)
    if (!a.ok) return
    expect(a.id).toBe('n2')
    expect(a.tree.edges).toEqual([{ from: 'n1', to: 'n2', option: 1 }])
    expect(nodeOf(a.tree, 'n1')?.chosen).toBe(1)
    const child = nodeOf(a.tree, 'n2')
    expect(child?.parentId).toBe('n1')
    expect(child?.viaOption).toBe(1)
    expect(child?.depth).toBe(1)
    expect(child?.state).toBe('exploring') // until its fork answers
    expect(a.tree.currentId).toBe('n2')
    expect(childVia(a.tree, 'n1', 1)?.id).toBe('n2')
    expect(childVia(a.tree, 'n1', 0)).toBeUndefined()
  })

  test('filling a node once its fork answered: question, options, answer text, fork session id', () => {
    const a = addChild(root(), 'n1', 0)
    if (!a.ok) throw new Error(a.reason)
    const t = fillNode(a.tree, 'n2', { question: 'Which host?', options: DRIVERS, answer: 'Postgres needs a server.', forkId: 'fork-9', state: 'ready' })
    expect(nodeOf(t, 'n2')).toMatchObject({ question: 'Which host?', options: DRIVERS, answer: 'Postgres needs a server.', forkId: 'fork-9', state: 'ready' })
    expect(fillNode(t, 'n99', { state: 'failed' })).toBe(t)
  })

  test('refused: an unknown node or option', () => {
    expect(addChild(root(), 'n7', 0)).toEqual({ ok: false, reason: 'unknown-node' })
    expect(addChild(root(), 'n1', 3)).toEqual({ ok: false, reason: 'unknown-option' })
    expect(addChild(root(), 'n1', -1)).toEqual({ ok: false, reason: 'unknown-option' })
  })
})

describe('FR-DT-01: go back and branch from an earlier node', () => {
  test('back goes to the parent question; the root stays; the branch is kept', () => {
    const t = goBack(grown())
    expect(t.currentId).toBe('n1')
    expect(t.nodes).toHaveLength(2)
    expect(goBack(t).currentId).toBe('n1')
  })

  test('branching another option of an earlier node keeps the first branch', () => {
    const back = goBack(grown())
    const b = branch(back, 'n1', 2, { question: 'Embedded or server?', options: DRIVERS, state: 'ready' })
    expect(b.ok).toBe(true)
    if (!b.ok) return
    expect(b.tree.nodes.map(n => n.id)).toEqual(['n1', 'n2', 'n3'])
    expect(childrenOf(b.tree, 'n1').map(n => n.viaOption)).toEqual([1, 2])
    expect(nodeOf(b.tree, 'n1')?.chosen).toBe(2)
    expect(b.tree.currentId).toBe('n3')
  })

  test('branching an option already explored goes to its child, adding nothing', () => {
    const t = grown()
    const b = branch(goBack(t), 'n1', 1)
    expect(b.ok).toBe(true)
    if (!b.ok) return
    expect(b.id).toBe('n2')
    expect(b.tree.nodes).toHaveLength(2)
    expect(b.tree.currentId).toBe('n2')
  })

  test('goTo jumps anywhere; an unknown id changes nothing', () => {
    const t = grown()
    expect(goTo(t, 'n1').currentId).toBe('n1')
    expect(goTo(t, 'nope')).toBe(t)
    expect(currentOf(t)?.question).toBe('Which driver?')
  })

  test('the path from the root, and a free answer typed by the person becomes an option to explore', () => {
    const t = grown()
    expect(pathTo(t, 'n2').map(n => n.id)).toEqual(['n1', 'n2'])
    expect(pathTo(t, 'x')).toEqual([])
    const added = addOption(t, 'n2', '  use the  built-in one ')
    expect(added?.option).toBe(2)
    expect(nodeOf(added?.tree as DecisionTree, 'n2')?.options[2]).toEqual({ label: 'you', text: 'use the built-in one' })
    expect(addOption(added?.tree as DecisionTree, 'n2', 'use the built-in one')?.option).toBe(2) // not twice
    expect(addOption(t, 'n2', '   ')).toBeNull()
  })
})

describe('FR-DT-01: depth and node caps', () => {
  test('at most 30 nodes', () => {
    let t = newTree('m', 'Q', Array.from({ length: 40 }, (_, i) => ({ label: String(i + 1), text: `o${i + 1}` })))
    for (let i = 0; i < MAX_NODES - 1; i++) {
      const a = addChild(t, 'n1', i)
      if (!a.ok) throw new Error(a.reason)
      t = a.tree
    }
    expect(MAX_NODES).toBe(30)
    expect(t.nodes).toHaveLength(30)
    expect(cannotAdd(t, 'n1', 35)).toBe('node-cap')
    expect(addChild(t, 'n1', 35)).toEqual({ ok: false, reason: 'node-cap' })
  })

  test('at most MAX_DEPTH questions below the root', () => {
    let t = newTree('m', 'Q', DRIVERS)
    let at = 'n1'
    for (let d = 1; d <= MAX_DEPTH; d++) {
      const a = addChild(t, at, 0, { question: `Q${d}`, options: DRIVERS, state: 'ready' })
      if (!a.ok) throw new Error(a.reason)
      t = a.tree
      at = a.id
    }
    expect(nodeOf(t, at)?.depth).toBe(MAX_DEPTH)
    expect(addChild(t, at, 0)).toEqual({ ok: false, reason: 'depth-cap' })
  })
})

describe('FR-DT-01: the map as text', () => {
  test('every option, an explored one followed by its own options; the current node marked', () => {
    const t = grown()
    expect(mapText(t)).toBe(
      [
        '  Which database should the cache use?',
        '    1. Postgres',
        '>   2. SQLite → Which driver?',
        '      a. better-sqlite3',
        '      b. node:sqlite',
        '    3. DuckDB',
      ].join('\n'),
    )
    const rows = mapRows(t)
    expect(rows.map(r => r.nodeId)).toEqual(['n1', null, 'n2', null, null, null])
    expect(rows.filter(r => r.isCurrent).map(r => r.nodeId)).toEqual(['n2'])
  })

  test('exploring, failed and answered children are tagged; the root marked when current', () => {
    let t = goBack(grown())
    const a = addChild(t, 'n1', 0)
    if (!a.ok) throw new Error(a.reason)
    t = fillNode(a.tree, a.id, { state: 'failed', note: 'exit 1' })
    const c = addChild(goBack(t), 'n1', 2, { answer: 'DuckDB is for analytics.', state: 'ready' })
    if (!c.ok) throw new Error(c.reason)
    const text = mapText(goTo(c.tree, 'n1'))
    expect(text.split('\n')[0]).toBe('> Which database should the cache use?')
    expect(text).toContain('1. Postgres failed')
    expect(text).toContain('3. DuckDB → answered')
    const busy = addChild(goBack(c.tree), 'n2', 1)
    if (!busy.ok) throw new Error(busy.reason)
    expect(mapText(busy.tree)).toContain('b. node:sqlite exploring…')
  })
})

describe('FR-DT-01: the decision paragraph and the summary atom', () => {
  test('nothing chosen at the root: no paragraph', () => {
    expect(decisionParagraph(root())).toBeNull()
  })

  test('one paragraph: each question and the option taken, what exploring found, a question left open', () => {
    const p = decisionParagraph(grown()) ?? ''
    expect(p).toBe(
      'Decision from the /explain tree: for "Which database should the cache use?" I chose 2 (SQLite). What exploring it found: SQLite is one file. Still open: "Which driver?". Go ahead on that basis.',
    )
    expect(p).not.toContain('\n')
  })

  test('a deeper path, a free answer, and a leaf with no open question', () => {
    const added = addOption(grown(), 'n2', 'use whatever Bun ships')
    if (added === null) throw new Error('no option')
    const a = addChild(added.tree, 'n2', added.option, { answer: 'Bun has bun:sqlite.\nIt is fast.', state: 'ready' })
    if (!a.ok) throw new Error(a.reason)
    expect(decisionParagraph(a.tree)).toBe(
      'Decision from the /explain tree: for "Which database should the cache use?" I chose 2 (SQLite); then for "Which driver?" I chose my own answer (use whatever Bun ships). What exploring it found: Bun has bun:sqlite. It is fast. Go ahead on that basis.',
    )
  })

  test('summary atom: null with no tree, busy while exploring, ok with the node count', () => {
    expect(treeSummary(null, 0)).toBeNull()
    expect(treeSummary(grown(), 1)).toEqual({ state: 'busy', label: 'tree exploring 1', detail: '2/30 nodes' })
    expect(treeSummary(root(), 0)).toEqual({ state: 'ok', label: 'tree 1 node', detail: 'Which database should the cache use?' })
  })
})
