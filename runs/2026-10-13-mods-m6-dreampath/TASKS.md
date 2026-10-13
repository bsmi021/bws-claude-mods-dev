# M6 — DreamPath
Status: IN_PROGRESS
Session: 1

## Tasks
- [x] T01 [FR-DP-01] Implement, with tests: `/dream` reads all memory files and `sources.json`, asks `$.model.fork` (or `$.model.complete` when fork is unavailable) for a plan: `merge`, `remove…
- [x] T02 [FR-DP-02] Implement, with tests: Preview first: the pane shows the plan; Apply or Dismiss. Apply writes the changes, after copying the folder to `<memoryDir>/.dream-backup/<timestamp…
- [~] T03 [FR-DP-03] Implement, with tests: Automatic trigger: every `dreamEveryTurns` (default 20) turns, and before a compaction if the types expose an event for it (otherwise noted in DECISI…
- [ ] T04 [FR-DP-04] Implement, with tests: Sources: each memory file lists the sessions it came from; merging unions them; the pane shows them.
- [ ] T05 [FR-DP-05] Implement, with tests: bws-memory README and version updated; summary atom shows `dream due` when the trigger fired.
- [ ] T06 [AC-DP-01] Verify, saving the receipt under the run folder's receipts/: `claude -p` probe: `/dream` on a fixture folder with two near-duplicate files proposes a merge and applies it with `--apply`-style option or a test h… (evidence: `receipts/m6-probe.json`)
- [ ] T07 [GATE] With everything committed, `python tools/mods-harness/harness.py gate` passes. It runs `python tools/mods-gate.py` (validate, plugin test and tsc strict for ALL plugins, 35 s) and is this mod's one regression run; the harness reuses its receipt. During work, run `python tools/mods-gate.py --plugin <name>` as often as you like.
- [ ] T08 [MANUAL] Write MANUAL-CHECKS.md in the run folder: numbered checks Brian must do in a real interactive session (panes, keys, live model output), each with the exact command to run and the expected result, and the Claude Code version and surfaces you tested. Do not wait for an answer; the loop does not pause on this.
- [ ] T09 [HANDOFF] Final HANDOFF.md and RUNLOG.md written and committed.

## Needs Brian

