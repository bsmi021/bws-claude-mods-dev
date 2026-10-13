// A diagram spec (FR-DG-02): nodes and edges, at most 24 nodes. file = square rectangle, new = rounded rectangle,
// step = double rectangle, decision = ellipse.
export type NodeKind = 'file' | 'new' | 'step' | 'decision'
export type DiagramNode = { id: string; label: string; kind: NodeKind }
export type DiagramEdge = { from: string; to: string; label?: string }
export type Diagram = { title: string; nodes: DiagramNode[]; edges: DiagramEdge[] }

// One diagram in the pane's list. `auto`: a big turn; `session`: /diagram; `pinned`: a mermaid block from a reply.
// A pinned block this mod cannot parse keeps its source text and has no diagram.
export type Entry = { id: number; origin: 'auto' | 'session' | 'pinned'; at: number; title: string; diagram: Diagram | null; source: string }

// The pane's state for this conversation. `shown` indexes `entries`; `phase` is the fork in flight or its failure.
export type Board = { entries: Entry[]; shown: number; phase: 'idle' | 'working' | 'error'; note: string; nextId: number }

declare module 'claude-code' {
  interface PluginState {
    'bws-diagram': {
      board: {
        entries: {
          id: number
          origin: 'auto' | 'session' | 'pinned'
          at: number
          title: string
          diagram: {
            title: string
            nodes: { id: string; label: string; kind: 'file' | 'new' | 'step' | 'decision' }[]
            edges: { from: string; to: string; label?: string }[]
          } | null
          source: string
        }[]
        shown: number
        phase: 'idle' | 'working' | 'error'
        note: string
        nextId: number
      }
      // The summary atom every mod publishes (FR-ALL-05); null draws no chip.
      summary: { state: 'idle' | 'busy' | 'ok' | 'warn' | 'bad'; label: string; detail?: string } | null
    }
  }
}
