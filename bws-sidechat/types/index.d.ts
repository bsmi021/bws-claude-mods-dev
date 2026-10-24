// One line of the side chat as the pane draws it.
export type SideMsg = { role: 'user' | 'assistant' | 'tool' | 'note'; text: string }

export type SideChat = {
  mainId: string | null // the conversation the fork was taken from
  sideId: string | null // the fork's own session id; null until the first message
  msgs: SideMsg[]
  live: string // the answer streaming in
  isForked: boolean // the first turn has run, so the fork exists on disk
  isBusy: boolean
  asks: number // messages sent; the Ask box's key, so a send clears it
  isClosedByPerson: boolean
  model: string // the open side chat's model override; '' = the sideModel setting
  mainTurns: number // main turns completed since the mod loaded
  forkTurns: number // mainTurns when the fork was taken; the gap is how far main is ahead
  isMainBusy: boolean // the main conversation is in a turn
  pendingReplay: boolean // a refresh re-forked: the next first turn carries the earlier questions
}

// ---------- the decision tree (/explain) ----------

// One option of a decision question: its marker as written (`1`, `b`, `C`; `you` for one the person typed) and its words.
export type TreeOption = { label: string; text: string }

// One decision question. The root comes from the main conversation's last reply; every other node from the reply of a
// fork that explored one option of its parent (`viaOption`). A node with no options is a free answer (a leaf).
export type TreeNode = {
  id: string
  parentId: string | null
  viaOption: number | null // the parent's option this node explores
  question: string // '' for a free answer
  options: TreeOption[]
  chosen: number | null // the option last explored or picked here
  answer: string // what the reply said about the option before its next question
  forkId: string | null // the fork session that wrote this node; null for the root (the main conversation)
  depth: number // 0 at the root
  state: 'ready' | 'exploring' | 'failed'
  note: string // why it failed; '' otherwise
}

// An edge: the option `option` of `from` was explored into `to`.
export type TreeEdge = { from: string; to: string; option: number }

export type DecisionTree = {
  mainId: string // the main conversation the root was read from
  nodes: TreeNode[]
  edges: TreeEdge[]
  currentId: string
  nextId: number
}

// The tree pane: the tree, which view shows, and how far it is scrolled.
export type TreePane = {
  tree: DecisionTree | null
  view: 'node' | 'map'
  back: number // rows scrolled up from the bottom, as the side chat's transcript
  answers: number // free answers typed; the answer box's key, so a send clears it
}

declare module 'claude-code' {
  interface PluginState {
    'bws-sidechat': {
      chat: SideChat
      tree: TreePane
      // The summary atom every mod publishes (FR-ALL-05); null draws no chip.
      summary: { state: 'idle' | 'busy' | 'ok' | 'warn' | 'bad'; label: string; detail?: string } | null
      // The Side chat tab bws-cockpit draws (bws-kit/tab.ts ModTab), read there as unknown and checked.
      tab: unknown
    }
    // bws-cockpit's last press in a mod tab (bws-kit/tab.ts TabEvent), watched for this plugin's own.
    'bws-cockpit': { tabEvent: { seq: number; plugin: string; id: string; value?: string } | null }
  }
}
