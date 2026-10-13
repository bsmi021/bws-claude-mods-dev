// The diagram spec (FR-DG-02), validated. Pure: no `$`. A spec comes from a fork's JSON reply or a parsed mermaid
// block; anything that is not a well-formed spec is refused with a reason (never thrown), and the caller fails open.
import type { Diagram, DiagramEdge, DiagramNode, NodeKind } from '../types'

export const MAX_NODES = 24
export const MAX_EDGES = 60
const MAX_ID = 40
const MAX_LABEL = 60
const MAX_TITLE = 60
export const KINDS: readonly NodeKind[] = ['file', 'new', 'step', 'decision']

export type Checked = { ok: true; diagram: Diagram } | { ok: false; error: string }

const str = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')

/** A spec from anything: nodes `{ id, label, kind }` (1 to 24, ids unique), edges `{ from, to, label? }` between them. */
export function validateDiagram(v: unknown): Checked {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return { ok: false, error: 'not an object' }
  const o = v as Record<string, unknown>
  if (!Array.isArray(o.nodes)) return { ok: false, error: 'no nodes array' }
  if (o.nodes.length === 0) return { ok: false, error: 'no nodes' }
  if (o.nodes.length > MAX_NODES) return { ok: false, error: `${o.nodes.length} nodes; at most ${MAX_NODES}` }
  const nodes: DiagramNode[] = []
  const ids = new Set<string>()
  for (const [i, raw] of o.nodes.entries()) {
    if (typeof raw !== 'object' || raw === null) return { ok: false, error: `node ${i + 1} is not an object` }
    const n = raw as Record<string, unknown>
    const id = str(n.id)
    if (!id || id.length > MAX_ID) return { ok: false, error: `node ${i + 1} has no usable id` }
    if (ids.has(id)) return { ok: false, error: `node id ${id} repeats` }
    const kind = str(n.kind) as NodeKind
    if (!KINDS.includes(kind)) return { ok: false, error: `node ${id} has kind ${str(n.kind) || '(none)'}; use file, new, step or decision` }
    ids.add(id)
    nodes.push({ id, label: (str(n.label) || id).slice(0, MAX_LABEL), kind })
  }
  const rawEdges = o.edges === undefined ? [] : o.edges
  if (!Array.isArray(rawEdges)) return { ok: false, error: 'edges is not an array' }
  if (rawEdges.length > MAX_EDGES) return { ok: false, error: `${rawEdges.length} edges; at most ${MAX_EDGES}` }
  const edges: DiagramEdge[] = []
  const seen = new Set<string>()
  for (const [i, raw] of rawEdges.entries()) {
    if (typeof raw !== 'object' || raw === null) return { ok: false, error: `edge ${i + 1} is not an object` }
    const e = raw as Record<string, unknown>
    const from = str(e.from), to = str(e.to)
    if (!ids.has(from)) return { ok: false, error: `edge ${i + 1} starts at unknown node ${from || '(none)'}` }
    if (!ids.has(to)) return { ok: false, error: `edge ${i + 1} ends at unknown node ${to || '(none)'}` }
    if (from === to) continue // a self loop has nowhere to draw
    const key = `${from}\u0000${to}`
    if (seen.has(key)) continue
    seen.add(key)
    const label = str(e.label).slice(0, MAX_LABEL)
    edges.push(label ? { from, to, label } : { from, to })
  }
  const title = (str(o.title) || 'Diagram').slice(0, MAX_TITLE)
  const now = str(o.now)
  return { ok: true, diagram: { title, nodes, edges, ...(now && ids.has(now) ? { now } : {}) } }
}

/** The JSON object in a model's reply (bare, or fenced), validated. */
export function parseDiagramReply(text: string): Checked {
  const fenced = /```(?:json)?\s*\n([\s\S]*?)```/.exec(text)
  const body = fenced ? fenced[1]! : text
  const start = body.indexOf('{'), end = body.lastIndexOf('}')
  if (start < 0 || end <= start) return { ok: false, error: 'no JSON object in the reply' }
  let parsed: unknown
  try {
    parsed = JSON.parse(body.slice(start, end + 1))
  } catch {
    return { ok: false, error: 'the reply is not valid JSON' }
  }
  return validateDiagram(parsed)
}
