export type Shape = 'rect' | 'pill' | 'circle'
export type Block = { x: number; y: number; w: number; h: number; fill?: string; text?: string; ink?: string; shape: Shape }
export type Font = 'sans' | 'serif' | 'mono'
export type Spec = { bg: string; font: Font; palette: string[]; blocks: Block[] }
export type Card = { number: number; label: string; spec: Spec }
export type Gallery = { header: string; cards: Card[] }

declare module 'claude-code' {
  interface PluginState {
    /** The gallery each AskUserQuestion call's dialog draws, by tool_use_id: specs lifted out of the previews. */
    'bws-design-picker': { galleries: StateFamily<Gallery> }
  }
}
