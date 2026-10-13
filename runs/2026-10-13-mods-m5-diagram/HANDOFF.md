# Handoff: M5 diagram pane (bws-diagram 0.1.0, new plugin)

Status: DONE. All tasks committed on `feat/video-mods`; the harness gate passed at 07abf59 (RUNLOG.md). Brian's interactive
checks are in MANUAL-CHECKS.md (16 checks; the worker only ran headless).

## What exists (later mods: read this)
- `bws-diagram/` is a new plugin (0.1.0). Files: `.claude-plugin/plugin.json` (options `autoDiagram` true, `model`
  haiku, `dumpFile` empty), `hooks/register.tsx` (the only file with `$`), pure modules `hooks/draw.ts` (surface choice
  and the size budget), `hooks/spec.ts` (spec validation, reply parsing), `hooks/layout.ts` (layered layout, edge
  routing), `hooks/render.ts` (kit `Spec` blocks -> Raster / Svg, text outline), `hooks/mermaid.ts` (pins),
  `hooks/diagram.ts` (turn counts, skips, prompts, the board, summary, status, store helpers), `hooks/kit/` (generated
  from bws-kit via `kit.json`: classify-fork, summary, raster, transcript), `types/index.d.ts` (atoms `board`,
  `summary`, shapes inline), tests `draw.test.ts`, `layout.test.ts`, `turn.test.ts`, `mermaid.test.ts`,
  `pane.test.ts`, helper `tests/world.ts` (stubbed engine), `README.md`.
- Hooks (validator inventory): `session.start` (registers `/diagram`, loads a kept board into an empty atom),
  `command.run{diagram}`, one `turn.complete`, `session.end`, `ui.render{Pane, bws-diagram}`, `ui.close`.
- Flow: `turn.complete` pins the reply's mermaid blocks inline (main loop, reason `answer`; works headless), then
  defers `afterTurn` with `$.clock.after(10)` and returns `next(e)`. `afterTurn` skips (`skipReason`: option off,
  headless, subagent, not an answer, running, zero tool calls) then `draw('turn')`: `classifyGate` (counts only, 15 s)
  -> `runFork` (90 s, kit fallback to `complete` on `nothing-to-fork`) -> `parseDiagramReply` -> `addEntry` -> open
  the pane. `/diagram` = `draw('session')` without the classifier (headless awaited inline; else deferred).
- Board (`$.state` atom `board`): `{ entries (max 20; origin auto|session|pinned; diagram or null + source), shown,
  phase idle|working|error, note, nextId }`. Kept per conversation in `$.store` key `boards` (newest 10 session ids).
- Sessions: module `generation`, `running`, `lastSession`, `pendingResume`. `/clear`: drop work, close pane, board
  emptied without overwriting the ended conversation's kept copy. `/resume`: drop work, close pane, `pendingResume`;
  the next session id seen loads its kept board. A new id with no `session.end` (`/branch`) carries the board over.
- Drawing: nodes 3 rows, node width 10..20 (shrinks to fit `bodyColumns`; under 10 -> text outline), gaps >= 5
  columns (one vertical track per bending source). Terminal: kit `rasterize` of blocks (`rect` file, `pill` new,
  three nested `rect` step, `circle` decision) plus one-cell ASCII edge blocks. Svg: kit `toSvg` of the same blocks in
  a 16:10 frame, wrapped in an outer svg whose view box crops the unused part; thin line blocks for edges, square heads.
- Summary atom `{ plugin: 'bws-diagram', key: 'summary' }`: null empty, `diagram drawing` busy, `N diagrams, M
  pinned` ok, `diagram failed` warn. bws-cockpit already lists `bws-diagram` in `modSummaries`.

## Tests that prove each requirement (`claude plugin test`: 59 pass, 0 fail)
- FR-DG-01: `draw.test.ts` "FR-DG-01: what each surface draws, and the legible budget" (surface choice, the
  DECISIONS.md budget table, node width, shrink-to-fit, rows). Spike: DECISIONS.md, `receipts/spike-probe-1.json`,
  `spike-log.json`, rendered `spike-*.png`.
- FR-DG-02: `layout.test.ts` "FR-DG-02: the spec, validated", "the layered layout, left to right by dependency",
  "drawn with the kit's raster.ts" (Raster cells hold the labels and edges; narrow -> null; 24 nodes inside the Raster
  and Svg limits; Svg structure; outline).
- FR-DG-03: `turn.test.ts` "FR-DG-03: the turn, counted" and "FR-DG-03: classify big, fork once, show" (big turn,
  classifier no, skips, headless, `autoDiagram` off, model option, `/diagram` headless, running guard, unplaced open
  toast, `dumpFile`); "FR-ALL-03: fails open" (classifier error / unreadable, fork error / unanswered, invalid spec,
  90 s timeout with the late reply ignored; one debug line each, no prompt text).
- FR-DG-04: `mermaid.test.ts` "FR-DG-04: mermaid blocks parsed to a spec" (probe reply, shapes, pipes, chains,
  comments, styling, unsupported types, fences, pins de-duplicated) and "pinned from the reply when the turn ends"
  (headless pin before the turn returns, unsupported kept as source, subagent / aborted / no-mermaid not pinned).
- FR-DG-05: `pane.test.ts` "FR-DG-05: the pane" (heading, legend, Raster, notes, pinned list, Prev/Next/Close;
  resize; Desktop Svg; unsupported source; Close acknowledges a failure; empty pane) and "state across reload, /clear,
  /resume, /branch".
- FR-DG-06 / FR-ALL-04/05: README, version 0.1.0, `kit.json`, `python tools/sync-kit.py --check` passes; summary
  shape: `turn.test.ts` "summary atom shape".
- FR-ALL-02 (does not intercept unrelated events): `mermaid.test.ts` "not pinned: a subagent's report, an aborted turn,
  a reply without mermaid..." and `turn.test.ts` "no call at all: a chat turn with no tools, headless, a subagent, an
  aborted turn". Known gap: no test closes another plugin's pane, because the test `$` has no `ui.close`; the
  `ui.close` hook matches only `id === 'bws-diagram'` with a person origin.
- AC-DG-01: `receipts/m5-probe.json`, `receipts/m5-probe-dump.json`, `receipts/m5-probe.md` (headless `claude -p`,
  a mermaid reply pinned; exit 0).

## Decisions you must know (assumptions A1 to A9 on the dashboard)
- A1 spike "screenshots" are rendered from Raster cells / the Svg (PIL, headless Edge), not live captures.
- A2 decision = oval (the kit's circle). A3 AC-DG-01 evidence via the `dumpFile` option. A4 edge labels listed under
  the drawing, not on the lines.
- A5 `/diagram` draws the whole session (no classifier). A6 a turn with no tool calls costs no classifier call.
  A7 `/diagram status` and `/diagram show` subcommands.
- A8 `/clear` empties the list (kept copy stays); `/resume` loads the resumed conversation's; `/branch` carries over.
- A9 mermaid shapes map by shape (`[..]`/bare = file); TD/BT/RL flowcharts are drawn left to right.
- The spec's `{id,A -- label --> B,kind}` is a paste corruption of `{id, label, kind}` (DECISIONS.md).
- The kit is unchanged; drawing composes kit blocks.

## Watch out for
- Unverified live: everything drawn (MANUAL-CHECKS 2 to 16). In particular whether the Raster palette (dark slate
  background) reads on a light terminal theme, and whether unasked opens are placed as the types say.
- `claude plugin validate` reports `gating hook without .catch: ui.close`; its handler catches its own errors.
- A test world must be created once per test; `tests/world.ts` is not a test file.
- Heredoc Python edits on Git Bash halve backslashes: a `\\u0000` became a NUL byte once (fixed). Use Edit/Write for
  any string with backslashes.
- `hooks/kit/` is generated; never edit it.

## Next step
Brian runs MANUAL-CHECKS.md (checks 1 to 15 in Windows Terminal, 16 in Desktop). The next mod in the order is M6
(DreamPath, extends bws-memory).
