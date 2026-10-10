// An idea on the shelf, as hooks/lib.ts writes it to the shelf file.
export type ShelfIdea = {
  id: number
  text: string
  detail?: string
  by: 'user' | 'claude'
  project: string
  createdAt: number
  status: 'open' | 'done' | 'dropped'
  closedAt?: number
}

// What the /shelf pane draws: the open ideas as last loaded from the shelf file.
export type ShelfView = {
  isAll: boolean
  root: string
  ideas: ShelfIdea[]
  now: number
  note: string
}

declare module 'claude-code' {
  interface PluginState {
    'bws-shelf': { view: ShelfView }
  }
}
