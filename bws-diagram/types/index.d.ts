// A diagram spec (FR-DG-02): nodes and edges, at most 24 nodes. file = square rectangle, new = rounded rectangle,
// step = double rectangle, decision = ellipse.
export type NodeKind = 'file' | 'new' | 'step' | 'decision'
export type DiagramNode = { id: string; label: string; kind: NodeKind }
export type DiagramEdge = { from: string; to: string; label?: string }
// `now`: the id of the node where things stand (the last step of a turn); the pane marks it with a head.
export type Diagram = { title: string; nodes: DiagramNode[]; edges: DiagramEdge[]; now?: string }

// One diagram in the pane's list. `auto`: a big turn; `session`: /diagram; `pinned`: a mermaid block from a reply.
// `turn`: how many messages the person had sent when it was drawn (absent in a board kept by 0.1.0).
// A pinned block this mod cannot parse keeps its source text and has no diagram.
export type Entry = { id: number; origin: 'auto' | 'session' | 'pinned'; at: number; title: string; diagram: Diagram | null; source: string; turn?: number }

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
            now?: string
          } | null
          source: string
          turn?: number
        }[]
        shown: number
        phase: 'idle' | 'working' | 'error'
        note: string
        nextId: number
      }
      // The summary atom every mod publishes (FR-ALL-05); null draws no chip.
      summary: { state: 'idle' | 'busy' | 'ok' | 'warn' | 'bad'; label: string; detail?: string } | null
      // The dashboard tab bws-cockpit draws (bws-kit/tab.ts ModTab), read there as unknown and checked.
      tab: unknown
    }
    // bws-cockpit's last press in a mod tab (bws-kit/tab.ts TabEvent), watched for this plugin's own.
    'bws-cockpit': { tabEvent: { seq: number; plugin: string; id: string; value?: string } | null }
  }
}
