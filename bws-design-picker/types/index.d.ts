export type Shape = 'rect' | 'pill' | 'circle'
export type Block = { x: number; y: number; w: number; h: number; fill?: string; text?: string; ink?: string; shape: Shape }
export type Font = 'sans' | 'serif' | 'mono'
export type Spec = { bg: string; font: Font; palette: string[]; blocks: Block[] }
export type Card = { number: number; label: string; spec: Spec }
export type Gallery = { header: string; cards: Card[] }

declare module 'claude-code' {
  interface PluginState {
    /** By tool_use_id: the gallery each AskUserQuestion dialog draws (specs lifted from the previews or generated), and whether a model is still drawing it. */
    'bws-design-picker': { galleries: StateFamily<Gallery>; pending: StateFamily<boolean> }
  }
}
