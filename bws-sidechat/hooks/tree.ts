// The decision tree /explain draws, pure. The root is the question of the main conversation's last reply; exploring
// one of a node's options adds a child (an edge from the node, labelled by the option). Going back keeps every branch,
// so another option of an earlier node grows a sibling. No `$` here; register.tsx keeps the tree in the `tree` atom.

import type { DecisionTree, TreeNode, TreeOption } from '../types'
import { makeSummary } from './kit/summary'
import type { ModSummary } from './kit/summary'

export const MAX_NODES = 30
export const MAX_DEPTH = 6 // questions below the root; deeper explorations are refused

export type AddResult = { ok: true; tree: DecisionTree; id: string } | { ok: false; reason: 'unknown-node' | 'unknown-option' | 'node-cap' | 'depth-cap' }

export type NodeFill = { question?: string; options?: TreeOption[]; answer?: string; forkId?: string | null; state?: TreeNode['state']; note?: string }

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()
export const clip = (s: string, n: number) => {
  const t = oneLine(s)
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}

export function newTree(mainId: string, question: string, options: TreeOption[], answer = ''): DecisionTree {
  const root: TreeNode = {
    id: 'n1',
    parentId: null,
    viaOption: null,
    question,
    options,
    chosen: null,
    answer,
    forkId: null,
    depth: 0,
    state: 'ready',
    note: '',
  }
  return { mainId, nodes: [root], edges: [], currentId: root.id, nextId: 2 }
}

export const nodeOf = (t: DecisionTree, id: string): TreeNode | undefined => t.nodes.find(n => n.id === id)

export const currentOf = (t: DecisionTree): TreeNode | undefined => nodeOf(t, t.currentId)

// The node an option of `id` was explored into, if it was.
export function childVia(t: DecisionTree, id: string, option: number): TreeNode | undefined {
  const edge = t.edges.find(e => e.from === id && e.option === option)
  return edge === undefined ? undefined : nodeOf(t, edge.to)
}

export const childrenOf = (t: DecisionTree, id: string): TreeNode[] =>
  t.edges.filter(e => e.from === id).flatMap(e => nodeOf(t, e.to) ?? [])

// Why a child of `id` through `option` cannot be added; null when it can.
export function cannotAdd(t: DecisionTree, id: string, option: number): Exclude<AddResult, { ok: true }>['reason'] | null {
  const parent = nodeOf(t, id)
  if (parent === undefined) return 'unknown-node'
  if (!Number.isInteger(option) || option < 0 || option >= parent.options.length) return 'unknown-option'
  if (t.nodes.length >= MAX_NODES) return 'node-cap'
  if (parent.depth + 1 > MAX_DEPTH) return 'depth-cap'
  return null
}

// Explores `option` of `id` into a new child, which becomes the current node. An option already explored is not
// explored twice: use `branch`, which goes to the child there is.
export function addChild(t: DecisionTree, id: string, option: number, fill: NodeFill = {}): AddResult {
  const reason = cannotAdd(t, id, option)
  if (reason !== null) return { ok: false, reason }
  const parent = nodeOf(t, id) as TreeNode
  const child: TreeNode = {
    id: `n${t.nextId}`,
    parentId: id,
    viaOption: option,
    question: fill.question ?? '',
    options: fill.options ?? [],
    chosen: null,
    answer: fill.answer ?? '',
    forkId: fill.forkId ?? null,
    depth: parent.depth + 1,
    state: fill.state ?? 'exploring',
    note: fill.note ?? '',
  }
  const nodes = t.nodes.map(n => (n.id === id ? { ...n, chosen: option } : n))
  return {
    ok: true,
    id: child.id,
    tree: { ...t, nodes: [...nodes, child], edges: [...t.edges.filter(e => !(e.from === id && e.option === option)), { from: id, to: child.id, option }], currentId: child.id, nextId: t.nextId + 1 },
  }
}

// Fills in a node once its fork has answered (or failed). An unknown id leaves the tree as it is.
export function fillNode(t: DecisionTree, id: string, fill: NodeFill): DecisionTree {
  if (nodeOf(t, id) === undefined) return t
  return { ...t, nodes: t.nodes.map(n => (n.id === id ? { ...n, ...fill } : n)) }
}

// A free answer the person typed at a node: one more option (labelled `you`), so it can be explored like the others.
export function addOption(t: DecisionTree, id: string, text: string): { tree: DecisionTree; option: number } | null {
  const node = nodeOf(t, id)
  const words = oneLine(text)
  if (node === undefined || words === '') return null
  const same = node.options.findIndex(o => o.label === 'you' && o.text === words)
  if (same >= 0) return { tree: t, option: same }
  return { tree: { ...t, nodes: t.nodes.map(n => (n.id === id ? { ...n, options: [...n.options, { label: 'you', text: words }] } : n)) }, option: node.options.length }
}

export const goTo = (t: DecisionTree, id: string): DecisionTree => (nodeOf(t, id) === undefined ? t : { ...t, currentId: id })

// Up to the parent question (the root stays where it is). Its branches are all kept.
export function goBack(t: DecisionTree): DecisionTree {
  const parentId = currentOf(t)?.parentId ?? null
  return parentId === null ? t : { ...t, currentId: parentId }
}

// Takes `option` of an earlier node `id`: to the child it already has (marking it chosen there), or a new child.
export function branch(t: DecisionTree, id: string, option: number, fill: NodeFill = {}): AddResult {
  const there = childVia(t, id, option)
  if (there === undefined) return addChild(t, id, option, fill)
  const nodes = t.nodes.map(n => (n.id === id ? { ...n, chosen: option } : n))
  return { ok: true, id: there.id, tree: { ...t, nodes, currentId: there.id } }
}

// The nodes from the root down to `id`, root first; [] for an unknown id.
export function pathTo(t: DecisionTree, id: string): TreeNode[] {
  const out: TreeNode[] = []
  let at = nodeOf(t, id)
  while (at !== undefined && out.length <= MAX_NODES) {
    out.unshift(at)
    at = at.parentId === null ? undefined : nodeOf(t, at.parentId)
  }
  return out
}

export const optionText = (o: TreeOption) => (o.label === 'you' ? `your answer: ${o.text}` : `${o.label}. ${o.text}`)

// What a child shows after its option in the map and on the node view.
export function childTag(child: TreeNode | undefined): string {
  if (child === undefined) return ''
  if (child.state === 'exploring') return 'exploring…'
  if (child.state === 'failed') return 'failed'
  return child.options.length > 0 ? `→ ${clip(child.question, 48)}` : '→ answered'
}

export type MapRow = { text: string; nodeId: string | null; isCurrent: boolean }

// The whole tree as indented rows: the root question, then every option, an explored one followed by its own options.
// A row that leads to a node carries its id (the map's buttons jump there); the current node is marked `>`.
export function mapRows(t: DecisionTree, optionWidth = 56): MapRow[] {
  const root = nodeOf(t, 'n1') ?? t.nodes[0]
  if (root === undefined) return []
  const rows: MapRow[] = [{ text: `${t.currentId === root.id ? '>' : ' '} ${clip(root.question || 'Decision', 70)}`, nodeId: root.id, isCurrent: t.currentId === root.id }]
  const walk = (node: TreeNode, indent: number) => {
    node.options.forEach((o, i) => {
      const child = childVia(t, node.id, i)
      const isCurrent = child !== undefined && child.id === t.currentId
      const tag = childTag(child)
      rows.push({ text: `${isCurrent ? '>' : ' '} ${'  '.repeat(indent)}${clip(optionText(o), optionWidth)}${tag === '' ? '' : ` ${tag}`}`, nodeId: child?.id ?? null, isCurrent })
      if (child !== undefined && rows.length < 200) walk(child, indent + 1)
    })
  }
  walk(root, 1)
  return rows
}

export const mapText = (t: DecisionTree, optionWidth = 56) => mapRows(t, optionWidth).map(r => r.text.trimEnd()).join('\n')

// The one paragraph Decide sends into the main session: each question on the path to `id` and the option taken there,
// what the last exploration said, and a question it left open. Null at the root, where nothing was chosen yet.
export function decisionParagraph(t: DecisionTree, id = t.currentId): string | null {
  const path = pathTo(t, id)
  if (path.length < 2) return null
  const steps: string[] = []
  for (let i = 1; i < path.length; i++) {
    const parent = path[i - 1]
    const child = path[i]
    if (parent === undefined || child === undefined || child.viaOption === null) continue
    const o = parent.options[child.viaOption]
    if (o === undefined) continue
    const words = clip(o.text, 160).replace(/[.;:,]+$/, '')
    const picked = o.label === 'you' ? `my own answer (${words})` : `${o.label} (${words})`
    steps.push(`${steps.length === 0 ? 'for' : 'then for'} "${clip(parent.question || 'the decision', 120)}" I chose ${picked}`)
  }
  if (steps.length === 0) return null
  const last = path[path.length - 1] as TreeNode
  // Exploring makes the new node current while it has found nothing, and the option button the focus ring sat on goes.
  // A Decide offered then would catch the next Enter and send a choice that was only meant to be explored.
  if (last.state === 'exploring') return null
  let text = `Decision from the /explain tree: ${steps.join('; ')}.`
  if (last.answer.trim() !== '') text += ` What exploring it found: ${clip(last.answer, 400)}`
  if (!/[.!?…]$/.test(text)) text += '.'
  if (last.options.length > 0 && last.question.trim() !== '') text += ` Still open: "${clip(last.question, 160)}".`
  text += ' Go ahead on that basis.'
  return clip(text, 1400)
}

// The summary atom (FR-ALL-05): null with no tree; busy while forks explore; ok with the node count.
export function treeSummary(t: DecisionTree | null, running: number): ModSummary | null {
  if (t === null) return null
  if (running > 0) return makeSummary('busy', `tree exploring ${running}`, `${t.nodes.length}/${MAX_NODES} nodes`)
  return makeSummary('ok', `tree ${t.nodes.length} node${t.nodes.length === 1 ? '' : 's'}`, nodeOf(t, 'n1')?.question ?? '')
}
