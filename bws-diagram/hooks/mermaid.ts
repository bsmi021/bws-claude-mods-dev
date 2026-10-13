// Pinned diagrams (FR-DG-04): the fenced mermaid blocks in an assistant reply, parsed to a diagram spec. Pure: no `$`.
//
// Supported: `graph` or `flowchart` (LR, TD, TB, RL, BT; drawn left to right either way), node shapes `A[..]` square
// (file), `A(..)` / `A([..])` rounded (new), `A[[..]]` double (step), `A{..}` / `A{{..}}` / `A((..))` (decision), a
// bare `A` square; edges `-->`, `---`, `==>`, `-.->`, `A -- label --> B` and `A -->|label| B`, chained on one line.
// Styling lines (style, classDef, class, linkStyle, click, subgraph, end, direction) are ignored. Anything else, or
// another diagram type, is not drawable: the pin keeps the source text.
import type { Diagram, DiagramEdge, NodeKind } from '../types'
import { validateDiagram } from './spec'

export const MAX_PINS_PER_REPLY = 5

/** The fenced mermaid blocks of a reply, in order (```mermaid or ~~~mermaid). */
export function mermaidBlocks(text: string): string[] {
  const out: string[] = []
  const re = /^[ \t]*(```|~~~)[ \t]*mermaid[^\n]*\n([\s\S]*?)^[ \t]*\1[ \t]*$/gm
  for (let m = re.exec(text); m; m = re.exec(text)) out.push(m[2]!.replace(/\s+$/, ''))
  return out
}

export type Parsed = { ok: true; diagram: Diagram } | { ok: false; kind: string; error: string }

const SHAPES: { open: string; close: string; kind: NodeKind }[] = [
  { open: '[[', close: ']]', kind: 'step' },
  { open: '((', close: '))', kind: 'decision' },
  { open: '([', close: '])', kind: 'new' },
  { open: '[(', close: ')]', kind: 'file' },
  { open: '{{', close: '}}', kind: 'decision' },
  { open: '[', close: ']', kind: 'file' },
  { open: '(', close: ')', kind: 'new' },
  { open: '{', close: '}', kind: 'decision' },
  { open: '>', close: ']', kind: 'file' },
]

const IGNORED = /^(style|classDef|class|linkStyle|click|subgraph|end|direction)\b/

// Edge operators, plain first: `-->` must win over `-- label -->`, whose label never starts with `-` or `>`.
const EDGES: RegExp[] = [/^-->/, /^---/, /^==>/, /^-\.->/, /^--(?![->])\s*(.+?)\s*-->/, /^==(?![=>])\s*(.+?)\s*==>/, /^-\.(?!-)\s*(.+?)\s*\.->/]

const cleanLabel = (s: string) => s.trim().replace(/^"(.*)"$/, '$1').replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim()

type Node = { id: string; label: string; kind: NodeKind; isShaped: boolean }

/** A mermaid block's source to a spec; `kind` names the diagram type on a refusal. */
export function parseMermaid(src: string): Parsed {
  const lines = src.split('\n').flatMap(l => l.split(';')).map(l => l.trim()).filter(l => l !== '' && !l.startsWith('%%'))
  const head = lines[0] ?? ''
  const type = head.split(/\s+/)[0] ?? ''
  if (!/^(graph|flowchart)$/i.test(type)) return { ok: false, kind: type || 'empty', error: `${type || 'an empty block'} is not a flowchart` }
  if (!/^(graph|flowchart)(\s+(LR|RL|TD|TB|BT))?$/i.test(head)) return { ok: false, kind: type, error: `unsupported header: ${head.slice(0, 40)}` }

  const nodes = new Map<string, Node>()
  const edges: DiagramEdge[] = []
  const see = (n: Node) => {
    const was = nodes.get(n.id)
    if (!was || (!was.isShaped && n.isShaped)) nodes.set(n.id, n)
  }

  for (const [i, line] of lines.slice(1).entries()) {
    if (IGNORED.test(line)) continue
    let pos = 0
    const fail = (why: string): Parsed => ({ ok: false, kind: type, error: `line ${i + 2}: ${why}` })
    const skip = () => {
      while (pos < line.length && /\s/.test(line[pos]!)) pos++
    }
    const node = (): Node | null => {
      skip()
      const m = /^[A-Za-z0-9_]+/.exec(line.slice(pos))
      if (!m) return null
      const id = m[0]
      pos += id.length
      for (const s of SHAPES) {
        if (!line.startsWith(s.open, pos)) continue
        const end = line.indexOf(s.close, pos + s.open.length)
        if (end < 0) return null
        const label = cleanLabel(line.slice(pos + s.open.length, end))
        pos = end + s.close.length
        return { id, label: label || id, kind: s.kind, isShaped: true }
      }
      return { id, label: id, kind: 'file', isShaped: false }
    }
    let from = node()
    if (!from) return fail('expected a node')
    see(from)
    for (;;) {
      skip()
      if (pos >= line.length) break
      let label = ''
      let matched = false
      for (const re of EDGES) {
        const m = re.exec(line.slice(pos))
        if (!m) continue
        pos += m[0].length
        label = m[1] ? cleanLabel(m[1]) : ''
        matched = true
        break
      }
      if (!matched) return fail('expected an edge')
      skip()
      const pipe = /^\|([^|]*)\|/.exec(line.slice(pos))
      if (pipe) {
        label = cleanLabel(pipe[1]!)
        pos += pipe[0].length
      }
      const to = node()
      if (!to) return fail('expected a node after the edge')
      see(to)
      edges.push(label ? { from: from.id, to: to.id, label } : { from: from.id, to: to.id })
      from = to
    }
  }
  if (nodes.size === 0) return { ok: false, kind: type, error: 'no nodes' }
  const first = [...nodes.values()][0]!
  const checked = validateDiagram({ title: `Pinned: ${first.label}`.slice(0, 40), nodes: [...nodes.values()].map(n => ({ id: n.id, label: n.label, kind: n.kind })), edges })
  return checked.ok ? checked : { ok: false, kind: type, error: checked.error }
}
