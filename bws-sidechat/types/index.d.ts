// One line of the side chat as the pane draws it.
export type SideMsg = { role: 'user' | 'assistant' | 'tool' | 'note'; text: string }

export type SideChat = {
  mainId: string | null // the conversation the fork was taken from
  sideId: string | null // the fork's own session id; null until the first message
  msgs: SideMsg[]
  live: string // the answer streaming in
  isForked: boolean // the first turn has run, so the fork exists on disk
  isBusy: boolean
  back: number // messages scrolled up from the newest
  isClosedByPerson: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'bws-sidechat': { chat: SideChat }
  }
}
