// What the pane draws on each surface, and the size budget that keeps a diagram legible (FR-DG-01, the spike's
// decision in runs/2026-10-13-mods-m5-diagram/DECISIONS.md). Pure: no `$`.
//
// Terminal: a Raster from the kit's `rasterize`. Desktop and the other remote surfaces: an Svg from the kit's `toSvg`
// of the same blocks. A surface with neither, or a pane too narrow for the layers, gets the text outline.

export const NODE_ROWS = 3 // a node is 3 cell rows (6 half-block pixels): enough for the double rectangle's frame
export const ROW_GAP = 1 // rows between two nodes of a layer
export const MIN_GAP = 5 // columns between two layers, for the edge stubs and one vertical track
export const MARGIN = 1 // a column left of the first layer
export const MIN_NODE_W = 10 // narrower, a label shows under 8 characters
export const MAX_NODE_W = 20
export const STEP_EXTRA = 4 // the double rectangle's inner label sits 3 cells in on each side, not 1

export type DrawKind = 'raster' | 'svg' | 'text'

/** Which element the surface draws: the Raster on the terminal, the Svg where it exists, else text. */
export function drawKind(surface: string, has: { raster: boolean; svg: boolean }): DrawKind {
  if (surface === 'terminal' && has.raster) return 'raster'
  if (surface !== 'terminal' && has.svg) return 'svg'
  return 'text'
}

/** The node width a diagram wants: its longest label plus padding (more with a step), clamped to 10..20 cells. */
export function wantedNodeWidth(labels: readonly string[], hasStep: boolean): number {
  const longest = labels.reduce((n, l) => Math.max(n, l.length), 0)
  return Math.max(MIN_NODE_W, Math.min(MAX_NODE_W, longest + 2 + (hasStep ? STEP_EXTRA : 0)))
}

/** Columns a layout takes: the margin, the layers, and the gaps between them (each gap its own width). */
export function layoutWidth(layers: number, nodeW: number, gaps: readonly number[]): number {
  if (layers <= 0) return MARGIN
  let w = MARGIN + layers * nodeW
  for (let i = 0; i < layers - 1; i++) w += gaps[i] ?? MIN_GAP
  return w
}

/** How many layers fit `columns` at this node width with the minimum gaps. */
export function fitLayers(columns: number, nodeW: number): number {
  let n = 0
  while (layoutWidth(n + 1, nodeW, []) <= columns) n++
  return n
}

/**
 * The widest node width from `wanted` down to the minimum that fits `columns`; null when even the minimum does not
 * (the pane then draws the text outline).
 */
export function fitNodeWidth(columns: number, layers: number, gaps: readonly number[], wanted: number): number | null {
  for (let w = Math.max(MIN_NODE_W, wanted); w >= MIN_NODE_W; w--) if (layoutWidth(layers, w, gaps) <= columns) return w
  return null
}

/** Rows a layout takes: `slots` node slots in its tallest layer, a row above and below. */
export const layoutRows = (slots: number): number => 2 + Math.max(1, slots) * (NODE_ROWS + ROW_GAP) - ROW_GAP
