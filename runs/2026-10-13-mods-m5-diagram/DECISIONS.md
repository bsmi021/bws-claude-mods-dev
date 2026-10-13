# M5 diagram pane: spike decisions (FR-DG-01)

Claude Code 2.1.296. One live probe through `python tools/probe.py --plugin bws-diagram` (headless `claude -p`, haiku,
`CLAUDE_CODE_PLUGIN_DIRS` empty, `--setting-sources project,local`). The spike hook was a throwaway `register.tsx`
(saved as `receipts/spike-register.tsx.txt`); T02 replaced it.

## Questions

1. What can be drawn: Raster (terminal) and Svg (Desktop), and within which pane limits?
2. What node and edge budget stays legible at the pane sizes a person actually has?
3. Does the pane dock right of the transcript?
4. Headless facts the mod depends on: does `turn.complete` carry the reply's mermaid block, does an `fs.write` made in
   that hook land before `claude -p` exits, and what does `$.ui.open` answer with no screen?

## What the generated types say (`.claude-plugin/types/claude-code/index.d.ts`)

- **Raster** (`RasterProps`): terminal only (a fragment elsewhere); 1 to 512 columns, 1 to 256 rows; each cell one
  printable width-1 BMP character (blocks and box drawing are allowed by the engine) with a foreground and background,
  1024 distinct colour pairs at once. A bad code point refuses the whole tree. The kit's `printable` keeps labels to
  ASCII 0x20-0x7e, which is stricter than the engine; labels stay ASCII.
- **Svg** (`SvgProps`): remote surfaces (desktop, mobile, vscode); `source` at most 131,072 characters, `alt` required.
- **Pane** (`ui.render { component: 'Pane' }` props): `placement` is `dock` (beside the transcript, the terminal's
  fullscreen layout from 110 columns) or `inline` (above the prompt). Read-only. `bodyColumns` and `scroll.bodyRows`
  give the room; the body scrolls with the arrows while focused. Inline, the frame fits the tree (up to `rows`
  requested, else a third of the screen); docked it is floor to ceiling, `columns` requested (a request only: a width
  the person dragged wins).
- **The 12-row limit in AGENTS.md** applies to a render that wraps the AskUserQuestion dialog only. A Pane has no such
  cap: its room is `scroll.bodyRows`, and taller content scrolls.
- **Unasked opens** (`PaneOpenArgs`): an open the plugin makes on its own waits undrawn below 144 terminal columns (110
  once the person asked for that id), resolving `{ isPlaced: false, reason }`. An open answering the person's input (a
  command) is placed at any width. The auto diagram and the pinned-from-reply opens are unasked; `/diagram` is asked.

## Probe

| Probe | What it did | Result |
|---|---|---|
| `receipts/spike-probe-1.json`, log `receipts/spike-log.json`, prompt `receipts/spike-prompt.txt`, settings `receipts/spike-settings.json` | Asked the model to reply with one fenced mermaid block (`graph LR`, `A[..] --> B{..}`, two labelled edges). The spike `turn.complete` hook read `e.answer`, `$.session.surfaces()`, `$.session.messages()`, called `$.ui.open`, and wrote the facts with `$.fs.write` before returning `next(e)`. | `turn.complete` fired once, main loop, reason `answer`; `e.answer` held the whole fenced block (113 chars); `surfaces: []`; the last message (assistant) also held it; the file was written before the process exited; `$.ui.open` answered `{ isPlaced: true }` and the stream carries a `system/ui_panes` line with the pane's id and title. Cost $0.003. |

## Drawing (screenshots)

`receipts/spike-draw.ts` (scratch, run with `deno run --allow-write`) lays a five-node sample (all four kinds, a
fan-out, a skip edge) out by hand and draws it through the kit's `rasterize` as a `Spec` of blocks: a node is a filled
block with its label, edges are one-cell ASCII text blocks (`-`, `|`, `+`, `>`) over the background.
`receipts/spike-render.py` paints the Raster cell words to a PNG the way a terminal does (glyph in fg over bg; the upper
half block as two colours). **These PNGs are rendered from the Raster cells, not screenshots of a live terminal**: this
worker session cannot drive an interactive terminal. MANUAL-CHECKS.md asks Brian to confirm in a real one.

- `receipts/spike-dock60.png`: 60 x 14 cells, node width 16.
- `receipts/spike-inline80.png`: 80 x 14 cells, node width 14.
- `receipts/spike-narrow40.png`: 40 x 14 cells, node width 10 (labels cut to 8; the double rectangle's inner label to 4).

Shapes that read at 3 cell rows (6 pixels) a node:
- file: square rectangle (`rect`, blue).
- new component: rounded rectangle (`pill`, green; the corner pixels are cut).
- step: double rectangle: three nested blocks (outer fill, a one-pixel / one-cell inset in the background colour, inner
  fill with the label). Its label room is the node width less 6.
- decision: the kit's `circle` (an ellipse, purple). The video's legend has three shapes; decision is this mod's pick
  and the pane's legend says so.
- edges: ASCII `-` `|` `+` and a `>` head, grey. Box drawing would also pass the engine, but the kit's text path keeps
  ASCII, and ASCII stays legible on every terminal font.

## Answers

1. **Terminal: a Raster** built with the kit's `rasterize` (blocks plus ASCII text), sized to the pane's
   `bodyColumns`. **Desktop (and the other remote surfaces): an Svg** from the kit's `toSvg` of the same `Spec`, laid
   out in a 16:10 frame so the kit's fixed 320 x 200 view box does not stretch it. Every surface also gets a text line
   per node and labelled edge under the drawing (legible fallback, and the `alt`).
2. **Budget.** A node is 3 rows plus 1 row gap; a layer is the node width plus an edge gap of at least 5 columns (one
   more per extra vertical track in that gap). Node width is the longest label plus 2 (plus 4 more when a step is in
   the diagram), clamped to 10..20 cells; under 10 a label is too short to read (8 characters), so the budget is set
   there:

   | Pane body columns | Layers that fit at node width 10 | at node width 16 |
   |---|---|---|
   | 40 | 2 | 2 |
   | 60 (a typical dock) | 4 | 3 |
   | 80 (a typical inline pane) | 5 | 4 |
   | 120 | 8 | 5 |

   (Width = 1 margin column + layers x node width + (layers - 1) x gap; `fitLayers` in `hooks/draw.ts`, tested.)

   Rows are not the limit: a Raster may be 256 rows (63 node slots) and the pane scrolls. The spec's 24-node cap holds.
   The layout shrinks the node width toward 10 to fit; when the layers still do not fit, the pane draws the text
   outline (layer by layer) with a note to widen the pane. Edge labels are not drawn on the lines (the gaps are 5
   columns); they are listed under the drawing as `A -> B: label`.
3. **Docking: yes, in the fullscreen layout** from 110 terminal columns the pane docks right of the transcript (floor
   to ceiling); on the main screen, or narrower, it sits inline above the prompt. The mod asks `columns` for the
   drawing's width when it opens the pane. Because the mod's own opens are unasked, they are not drawn under 144
   columns until the person has opened the pane once; the mod then shows a toast and `/diagram` opens it (asked).
4. **Headless:** yes to all three. Pinning (parse the reply, store the spec) is pure and cheap, so it runs inline in
   `turn.complete` before `next(e)` and works headless. The classify-then-fork path is deferred with
   `$.clock.after(10, ...)` after `next(e)` returns and skips headless, subagent and non-`answer` turns (as bws-memory).
   For AC-DG-01, `/diagram status` cannot run after a reply in one `claude -p` run, so an option `dumpFile` (empty by
   default, a diagnostic) writes the diagram state as JSON after each change; the `ui_panes` title also names the count.

## Decision

- Plugin `bws-diagram` vendors `classify-fork`, `summary`, `transcript` and `raster` from bws-kit (`kit.json`). The kit
  is not changed.
- Spec: nodes `{ id, label, kind: file | new | step | decision }`, edges `{ from, to, label? }`, at most 24 nodes
  (the spec text's `{id,A -- label --> B,kind}` is a paste corruption of `{id, label, kind}`).
- Layered layout, left to right by dependency (longest path; cycles broken by reversing back edges; long edges pass
  through dummy slots; order by barycentre), drawn as above. Pane re-draws from `bodyColumns` on every render.
- Mermaid pins accept `graph|flowchart LR|TD|RL|BT`, node shapes `[ ]` file, `( )` new, `{ }` decision, `[[ ]]` step,
  edges `-->` and `-- label -->` (also `-->|label|`); anything else is kept as source text.

## Ruled out

- Box-drawing borders: allowed by the engine, but the kit's text path is ASCII-only and the kit is shared; blocks read
  well at 3 rows.
- Drawing edge labels on the lines: they need gaps of 10+ columns, halving the layers that fit.
- An Svg with its own geometry: the spec says draw with the kit's `raster.ts`; `toSvg` of the same `Spec` is enough.
