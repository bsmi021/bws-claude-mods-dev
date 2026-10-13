// /explain, pure: reading a reply's numbered or lettered options, the prompt an Explore fork is sent, and the rows the
// tree pane draws. No `$` here; register.tsx does the effects.

import type { DecisionTree, TreeNode, TreeOption } from '../types'
import { wrapLines } from './side'
import { childTag, childVia, clip, mapRows, optionText, pathTo } from './tree'

export const MAX_FORKS = 2 // Explore forks running at once
export const MAX_OPTIONS = 12

export type Parsed = { question: string; options: TreeOption[]; answer: string }

type Kind = 'word' | 'num' | 'lower' | 'upper'
type Item = { line: number; kind: Kind; value: number; indent: number; label: string; text: string }

// `Option A:`, `### Option 2 -`, `**Approach B.**`: the strongest sign of a set of options.
const WORD = /^(#{1,6}\s*)?(\*\*|__)?\s*(?:option|choice|approach|alternative|path)\s+(\d{1,2}|[A-Ha-h])\b\s*[:.)\-–—]?\s*(.*)$/i
// `1.`, `1)`, `(1)`, `**1.** x`, `**1. x**`, `### 2) x`, `- 1. x`
const NUM = /^(#{1,6}\s*)?(?:[-*]\s+)?(\*\*|__)?\(?(\d{1,2})[.)](?:\*\*|__)?\s+(.*)$/
// `a)`, `B.`, `(c)`, `**a)** x`
const LETTER = /^(#{1,6}\s*)?(?:[-*]\s+)?(\*\*|__)?\(?([A-Ha-h])[.)](?:\*\*|__)?\s+(.*)$/

// A reply that offers a choice says so somewhere: a question, or a word about options. Numbered steps say neither.
const DECISION_HINT = /\?|\b(options?|approach(es)?|alternatives?|choose|choices?|pick|prefer(ence)?|recommend\w*|which|either|trade-?offs?|ways?|direction)\b/i

const cleanText = (s: string) =>
  s
    .replace(/\*\*|__/g, '')
    .replace(/^[\s:.)\-–—]+/, '')
    .replace(/[\s:]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()

const valueOf = (marker: string, kind: Kind) => (kind === 'num' || /^\d+$/.test(marker) ? Number(marker) : marker.toLowerCase().charCodeAt(0) - 96)

function itemOf(raw: string, line: number): Item | null {
  const indent = raw.length - raw.trimStart().length
  const s = raw.trim()
  if (s === '') return null
  const w = WORD.exec(s)
  if (w !== null) {
    const marker = w[3] ?? ''
    return { line, kind: 'word', value: valueOf(marker, 'word'), indent, label: marker, text: cleanText(w[4] ?? '') }
  }
  const n = NUM.exec(s)
  if (n !== null) {
    const marker = n[3] ?? ''
    return { line, kind: 'num', value: Number(marker), indent, label: marker, text: cleanText(n[4] ?? '') }
  }
  const l = LETTER.exec(s)
  if (l !== null) {
    const marker = l[3] ?? ''
    const kind: Kind = marker === marker.toLowerCase() ? 'lower' : 'upper'
    return { line, kind, value: valueOf(marker, kind), indent, label: marker, text: cleanText(l[4] ?? '') }
  }
  return null
}

// Runs of items that count 1, 2, 3 (or a, b, c) at one indent. Lines between items (descriptions, sub-bullets, blank
// lines) do not break a run; an item that does not continue a run starts a new one when it is the first (1 or a).
function runsOf(items: Item[]): Item[][] {
  const runs: Item[][] = []
  for (const it of items) {
    let latest: Item[] | undefined
    for (const r of runs) if (r[0]?.kind === it.kind && r[0]?.indent === it.indent) latest = r
    const tail = latest?.[latest.length - 1]
    if (latest !== undefined && tail !== undefined && tail.value + 1 === it.value) latest.push(it)
    else if (it.value === 1 && it.text !== '') runs.push([it])
  }
  return runs.filter(r => r.length >= 2 && r.every(i => i.text !== ''))
}

const isQuestion = (s: string) => /\?\s*$/.test(s)
// The last sentence of a line that asks something: "I'd go with A. Which do you prefer?" -> "Which do you prefer?"
const askedIn = (line: string) => line.split(/(?<=[.!])\s+/).filter(isQuestion).at(-1) ?? ''
const ABOUT_CHOICE = /\b(which|prefer|choose|pick|go with|rather|option)\b/i

// The decision a reply ends on: its last set of options (the shallowest; `Option A` headings before plain lists), and
// the question it asks about them. Null when the reply offers no choice (fewer than two options, or numbered steps with no question or option word).
export function parseOptions(reply: string): Parsed | null {
  const lines = reply.replace(/\r/g, '').replace(/```[\s\S]*?```/g, m => m.replace(/[^\n]/g, '')).split('\n')
  const items = lines.flatMap((l, i) => itemOf(l, i) ?? [])
  const runs = runsOf(items)
  if (runs.length === 0 || !DECISION_HINT.test(reply)) return null
  const words = runs.filter(r => r[0]?.kind === 'word')
  const pool = words.length > 0 ? words : runs
  const shallowest = Math.min(...pool.map(r => r[0]?.indent ?? 0))
  const run = pool.filter(r => (r[0]?.indent ?? 0) === shallowest).at(-1) as Item[]
  const first = (run[0] as Item).line
  const last = (run[run.length - 1] as Item).line
  const options = run.slice(0, MAX_OPTIONS).map(i => ({ label: i.label, text: clip(i.text, 200) }))

  const before = lines.slice(0, first).map(l => l.trim())
  let introAt = before.length - 1
  while (introAt >= 0 && before[introAt] === '') introAt--
  const intro = introAt >= 0 ? cleanText(before[introAt] ?? '') : ''
  // after the list: the lines past the last item's own description (the first blank line ends it)
  const tail = lines.slice(last + 1)
  const gap = tail.findIndex(l => l.trim() === '')
  const after = (gap < 0 ? [] : tail.slice(gap)).map(l => cleanText(l)).filter(l => l !== '' && itemOf(l, 0) === null)
  // a question just before the list; else one after it about the choice; else the line that introduces the list
  const asked = after.map(askedIn).filter(q => q !== '')
  const aboutChoice = asked.find(q => ABOUT_CHOICE.test(q)) ?? ''
  const question = clip(isQuestion(intro) ? intro : aboutChoice !== '' ? aboutChoice : intro !== '' ? intro : (asked[0] ?? 'Which option?'), 200)
  const answer = before.slice(0, Math.max(0, introAt)).join('\n').trim()
  return { question, options, answer }
}

// An Explore fork's reply: its next decision (options again) or, with none, a free answer (no question, no options).
export function parseReply(reply: string): Parsed {
  const p = parseOptions(reply)
  if (p !== null) return p
  return { question: '', options: [], answer: reply.trim() }
}

// The last thing the main conversation's assistant said, '' with none.
export function lastReply(msgs: readonly { role: string; text: string }[]): string {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i]
    if (m !== undefined && m.role === 'assistant' && m.text.trim() !== '') return m.text
  }
  return ''
}

// What a fork exploring `option` of `node` is asked. It is a fork of the conversation (or of the fork that wrote the
// node), so it has the context; the path of earlier choices is repeated so a fork of the main conversation knows them.
export function explorePrompt(t: DecisionTree, node: TreeNode, option: TreeOption): string {
  const earlier = pathTo(t, node.id)
    .slice(1)
    .flatMap(n => {
      const parent = t.nodes.find(p => p.id === n.parentId)
      const o = n.viaOption === null ? undefined : parent?.options[n.viaOption]
      return parent === undefined || o === undefined ? [] : [`"${clip(parent.question, 120)}": ${clip(optionText(o), 120)}`]
    })
  const chosen = option.label === 'you' ? `the person's own answer: "${clip(option.text, 300)}"` : `option ${option.label}: "${clip(option.text, 300)}"`
  return [
    'This is a side session exploring a decision; the main conversation is not touched, and you must not change any files.',
    earlier.length > 0 ? `Choices made so far: ${earlier.join('; ')}.` : '',
    `The question: "${clip(node.question || 'Which option?', 300)}". Explore ${chosen}.`,
    'Briefly answer the follow-up questions someone weighing it would ask (what it involves, what it needs, its main risks).',
    'If taking it leads to a further decision, end with that one question on its own line, then its options as a numbered list (1., 2., ...).',
    'If there is no further decision, end with a one-line recommendation and no list.',
  ]
    .filter(s => s !== '')
    .join('\n')
}

// One row of the tree pane: text, or a button (an option to explore, a node to jump to on the map).
export type PaneRow =
  | { kind: 'text' | 'bold' | 'dim' | 'warn'; text: string }
  | { kind: 'option'; text: string; option: number }
  | { kind: 'node'; text: string; nodeId: string }

const wrapped = (kind: 'text' | 'bold' | 'dim' | 'warn', text: string, width: number): PaneRow[] => wrapLines(text, width).map(t => ({ kind, text: t }))

// The node view: what the exploration found, the state of its fork, then its question and one button per option.
export function nodeRows(t: DecisionTree, node: TreeNode, width: number): PaneRow[] {
  const rows: PaneRow[] = []
  if (node.answer.trim() !== '') rows.push(...wrapped('text', node.answer, width), { kind: 'text', text: '' })
  if (node.state === 'exploring') rows.push({ kind: 'dim', text: 'exploring…' })
  if (node.state === 'failed') rows.push(...wrapped('warn', `Explore failed: ${node.note || 'no answer'}`, width))
  if (node.state === 'ready' && node.options.length === 0 && node.answer.trim() === '') rows.push({ kind: 'dim', text: 'No answer.' })
  if (node.options.length > 0) {
    rows.push(...wrapped('bold', node.question || 'Which option?', width))
    node.options.forEach((o, i) => {
      const tag = childTag(childVia(t, node.id, i))
      rows.push({ kind: 'option', option: i, text: clip(`${optionText(o)}${tag === '' ? '' : ` ${tag}`}`, width) })
    })
  }
  return rows
}

// The map view: the whole tree, a row that leads to a node being a button that jumps there.
export function mapPaneRows(t: DecisionTree, width: number): PaneRow[] {
  return mapRows(t).map(r => (r.nodeId === null ? { kind: 'dim' as const, text: clip(r.text, width) } : { kind: 'node' as const, nodeId: r.nodeId, text: clip(r.text, width) }))
}

// "2. SQLite › a. better-sqlite3": the options taken from the root down to `node`.
export function crumbOf(t: DecisionTree, node: TreeNode): string {
  const steps = pathTo(t, node.id)
    .slice(1)
    .flatMap(n => {
      const o = n.viaOption === null ? undefined : t.nodes.find(p => p.id === n.parentId)?.options[n.viaOption]
      return o === undefined ? [] : [clip(optionText(o), 30)]
    })
  return steps.join(' › ')
}

// What headless /explain answers: the root and its options, as the map shows them.
export function treeText(t: DecisionTree, map: string): string {
  return `Decision tree: ${t.nodes.length} node${t.nodes.length === 1 ? '' : 's'}.\n${map}`
}

// The one debug line a failed exploration writes (FR-ALL-03): never the prompt or the reply.
export const failLine = (step: string, reason: string) => `bws-sidechat explain: ${step} failed (${clip(reason, 160)})`
