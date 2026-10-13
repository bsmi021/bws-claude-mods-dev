# RUNLOG: M5 diagram pane (bws-diagram)

## Session 1 (2026-10-13)

Objective: deliver M5 from `docs/SPEC-VIDEO-MODS.md` (FR-DG-01..06, AC-DG-01) as the new plugin `bws-diagram`.

Actions:
- T01 spike: read the pane, Raster and Svg contracts in the generated types; one headless probe with a throwaway
  `turn.complete` hook (`receipts/spike-probe-1.json`, `spike-log.json`): `e.answer` carries the mermaid block, an
  `fs.write` inside the hook lands before `claude -p` exits, `$.ui.open` answers `isPlaced: true` headless. Drew a
  sample through the kit's `rasterize` and painted the cells to PNG (`spike-*.png`). Decisions in DECISIONS.md.
- T02: plugin skeleton 0.1.0, `kit.json` (classify-fork, summary, raster), `draw.ts` budget and surface choice.
- T03: `spec.ts`, `layout.ts`, `render.ts`; previews from the real code (`preview-60.png`, `preview-100.png`,
  `preview-svg.png` via headless Edge; scratch `receipts/preview.ts`, run with deno).
- T04: classify-then-fork after a turn, `/diagram`, fail-open paths, `dumpFile`.
- T05: `mermaid.ts`, pinning inline in `turn.complete`.
- T06: the pane (heading, legend, Prev/Next/Close, resize), `$.store` per conversation, `/clear` `/resume` `/branch`.
- T07: README. T08: AC-DG-01 probe (`receipts/m5-probe.*`). T10: MANUAL-CHECKS.md (16 checks).

Probes (each through `tools/probe.py`, haiku): spike-probe-1 ($0.003), m5-probe ($0.003).

Results: `claude plugin test` in `bws-diagram/`: 59 pass, 0 fail. `python tools/mods-gate.py --plugin bws-diagram`: ok.
Assumptions A1 to A9 recorded on the dashboard (listed in HANDOFF.md).

Commits: 435106b (T01), a1e5b4a (T02), 1617d44 (T03), 73d7ff2 (T04), d29daa2 (T05), 625086f (T06), f750e6b (T07),
3e8f76b (T08), 69bd992 (T10), 07abf59 (T09 started).

Version bumped: bws-diagram 0.1.0 (new). No other plugin changed.

Gate: `python tools/mods-harness/harness.py gate` PASSED at 07abf59 (2026-10-13 09:57; `python tools/mods-gate.py`
for all plugins, the kit and the sync check); receipt written by the harness. One gate run this session.

Pending: Brian runs MANUAL-CHECKS.md. No Needs Brian items. Status DONE.
