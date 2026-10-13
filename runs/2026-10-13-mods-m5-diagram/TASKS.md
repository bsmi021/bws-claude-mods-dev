# M5 — Diagram pane
Status: IN_PROGRESS
Session: 1

## Tasks
- [x] T01 [SPIKE] Run the spike this mod's first requirement describes. Record the questions, the probes (via tools/probe.py), the answers and the decision in DECISIONS.md in the run folder. If an assumption fails, raise a blocker.
- [x] T02 [FR-DG-01] Implement, with tests: Spike first (DECISIONS.md): what can be drawn in the terminal (Raster half-block, `Svg` on Desktop) within the engine's pane limits (see AGENTS.md: r…
- [~] T03 [FR-DG-02] Implement, with tests: A diagram spec (pure, validated): nodes `{id,A -- label --> B,kind: file/new/step/decision}`, edges `{from,to,label?}`, max 24 nodes. A layered layou…
- [ ] T04 [FR-DG-03] Implement, with tests: After a turn, classify `big` (the small model, given counts of tool calls, files edited, and turn length) or skip; on `big` fork once for the spec, v…
- [ ] T05 [FR-DG-04] Implement, with tests: Pinned diagrams: a fenced mermaid block in an assistant reply (flowchart / graph LR or TD with plain `A --> B` edges and labelled edges written `A --…
- [ ] T06 [FR-DG-05] Implement, with tests: Pane: legend, previous/next diagram, resize-safe, closable. State survives reload; behaviour after `/clear`, `/resume`, `/branch` defined and tested.
- [ ] T07 [FR-DG-06] Implement, with tests: README, summary atom, `kit.json`, sync passes.
- [ ] T08 [AC-DG-01] Verify, saving the receipt under the run folder's receipts/: `claude -p` probe: a reply containing a mermaid block produces a pinned spec (via a state dump or `/diagram status`). (evidence: `receipts/m5-probe.json`)
- [ ] T09 [GATE] With everything committed, `python tools/mods-harness/harness.py gate` passes. It runs `python tools/mods-gate.py` (validate, plugin test and tsc strict for ALL plugins, 35 s) and is this mod's one regression run; the harness reuses its receipt. During work, run `python tools/mods-gate.py --plugin <name>` as often as you like.
- [ ] T10 [MANUAL] Write MANUAL-CHECKS.md in the run folder: numbered checks Brian must do in a real interactive session (panes, keys, live model output), each with the exact command to run and the expected result, and the Claude Code version and surfaces you tested. Do not wait for an answer; the loop does not pause on this.
- [ ] T11 [HANDOFF] Final HANDOFF.md and RUNLOG.md written and committed.

## Needs Brian

