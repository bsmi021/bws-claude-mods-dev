// Scratch (T03): draws sample diagrams through bws-diagram's real render.ts into Raster cell JSON for spike-render.py.
import { rasterize } from '../../../bws-diagram/hooks/kit/raster.ts'
import { rasterOf, svgOf } from '../../../bws-diagram/hooks/render.ts'
import type { Diagram } from '../../../bws-diagram/types/index.d.ts'

const d: Diagram = {
  title: 'sample',
  nodes: [
    { id: 'A', label: 'Parse request', kind: 'step' },
    { id: 'B', label: 'Valid?', kind: 'decision' },
    { id: 'C', label: 'writer.ts', kind: 'file' },
    { id: 'D', label: 'ErrorPanel', kind: 'new' },
    { id: 'E', label: 'Run tests', kind: 'step' },
    { id: 'F', label: 'report.md', kind: 'file' },
  ],
  edges: [
    { from: 'A', to: 'B' }, { from: 'B', to: 'C', label: 'yes' }, { from: 'B', to: 'D', label: 'no' },
    { from: 'A', to: 'E' }, { from: 'C', to: 'F' }, { from: 'A', to: 'F' }, { from: 'F', to: 'A', label: 'retry' },
  ],
}
for (const cols of [60, 100]) {
  const r = rasterOf(d, cols)
  if (!r) { console.log('no fit', cols); continue }
  const bytes = Uint8Array.from(atob(r.cells), c => c.charCodeAt(0))
  const words = new Uint32Array(bytes.buffer)
  Deno.writeTextFileSync(`preview-cells-${cols}.json`, JSON.stringify({ columns: r.columns, rows: r.rows, words: Array.from(words) }))
}
Deno.writeTextFileSync('preview.svg', svgOf(d).source)
