// Spike scratch (T01): hand-placed sample diagram drawn through the kit's rasterize, at the two typical pane rooms.
// Run: deno run --sloppy-imports --allow-write spike-draw.ts  -> spike-cells-*.json, rendered to PNG by spike-render.py
import { rasterize, type Block, type Spec } from '../../../bws-kit/raster.ts'

const BG = '#1b1d23', EDGE = '#9ca3af'
const COLOR = { file: '#3b82f6', new: '#10b981', step: '#f59e0b', decision: '#a855f7' } as const
type Kind = keyof typeof COLOR
type N = { id: string; label: string; kind: Kind; col: number; row: number }

function draw(nodes: N[], edges: [string, string][], W: number, R: number, nodeW: number, file: string) {
  const H = R * 2
  const blocks: Block[] = []
  const px = (x: number, y: number, w: number, h: number) => ({ x: (x / W) * 100, y: (y / H) * 100, w: (w / W) * 100, h: (h / H) * 100 })
  const ch = (c: number, r: number, t: string) => blocks.push({ ...px(c, r * 2, 1, 2), fill: BG, ink: EDGE, text: t, shape: 'rect' })
  const label = (n: N) => n.label.slice(0, nodeW - 2)
  for (const n of nodes) {
    const y = n.row * 2
    const c = COLOR[n.kind]
    if (n.kind === 'step') {
      blocks.push({ ...px(n.col, y, nodeW, 6), fill: c, shape: 'rect' })
      blocks.push({ ...px(n.col + 1, y + 1, nodeW - 2, 4), fill: BG, shape: 'rect' })
      blocks.push({ ...px(n.col + 2, y + 2, nodeW - 4, 2), fill: c, text: n.label.slice(0, nodeW - 6), shape: 'rect' })
    } else {
      blocks.push({ ...px(n.col, y, nodeW, 6), fill: c, text: label(n), shape: n.kind === 'file' ? 'rect' : n.kind === 'new' ? 'pill' : 'circle' })
    }
  }
  const at = new Map(nodes.map(n => [n.id, n]))
  for (const [a, b] of edges) {
    const s = at.get(a)!, t = at.get(b)!
    const r0 = s.row + 1, r1 = t.row + 1
    const x0 = s.col + nodeW, x1 = t.col - 1
    const mid = x0 + Math.floor((x1 - x0) / 2)
    for (let c = x0; c < mid; c++) ch(c, r0, '-')
    if (r0 !== r1) {
      ch(mid, r0, '+')
      for (let r = Math.min(r0, r1) + 1; r < Math.max(r0, r1); r++) ch(mid, r, '|')
      ch(mid, r1, '+')
    } else ch(mid, r0, '-')
    for (let c = mid + 1; c < x1; c++) ch(c, r1, '-')
    ch(x1, r1, '>')
  }
  const spec: Spec = { bg: BG, font: 'mono', palette: [], blocks }
  const words = rasterize(spec, { columns: W, rows: R })
  Deno.writeTextFileSync(file, JSON.stringify({ columns: W, rows: R, words: Array.from(words) }))
}

const sample = (nodeW: number, gap: number): N[] => {
  const L = (k: number) => 1 + k * (nodeW + gap)
  return [
    { id: 'A', label: 'Parse request', kind: 'step', col: L(0), row: 1 },
    { id: 'B', label: 'Valid?', kind: 'decision', col: L(1), row: 1 },
    { id: 'C', label: 'writer.ts', kind: 'file', col: L(2), row: 1 },
    { id: 'D', label: 'ErrorPanel', kind: 'new', col: L(2), row: 5 },
    { id: 'E', label: 'Run tests', kind: 'step', col: L(1), row: 9 },
  ]
}
const E: [string, string][] = [['A', 'B'], ['B', 'C'], ['B', 'D'], ['A', 'E']]
draw(sample(16, 5), E, 60, 14, 16, 'spike-cells-dock60.json')
draw(sample(14, 5), E, 80, 14, 14, 'spike-cells-inline80.json')
draw(sample(10, 4), E, 40, 14, 10, 'spike-cells-narrow40.json')
