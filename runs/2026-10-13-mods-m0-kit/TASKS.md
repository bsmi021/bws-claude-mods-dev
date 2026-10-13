# M0 — Suite kit
Status: DONE
Session: 1

## Tasks
- [x] T01 [FR-KIT-01] Implement, with tests: `bws-kit/` (a folder, not a plugin) with pure modules and tests: `classify-fork.ts` (the classify-then-fork decision: gate input, yes/no parse, resul…
- [x] T02 [FR-KIT-02] Implement, with tests: `tools/sync-kit.py`: copies the kit modules a plugin lists in its `kit.json` into `<plugin>/hooks/kit/` with a "vendored from bws-kit, do not edit" h…
- [x] T03 [FR-KIT-03] Implement, with tests: bws-cockpit reads the summary atoms of a configured list of mod plugins (default: `bws-memory`, `bws-diagram`, `bws-skillgate`, `bws-secrets`) and dr…
- [x] T04 [AC-KIT-01] Verify, saving the receipt under the run folder's receipts/: Gate passes for all plugins with the kit in place; cockpit's existing 162 tests are unchanged and green. (evidence: gate receipt)
- [x] T05 [GATE] With everything committed, `python tools/mods-harness/harness.py gate` passes. It runs `python tools/mods-gate.py` (validate, plugin test and tsc strict for ALL plugins, 35 s) and is this mod's one regression run; the harness reuses its receipt. During work, run `python tools/mods-gate.py --plugin <name>` as often as you like.
- [x] T06 [MANUAL] Write MANUAL-CHECKS.md in the run folder: numbered checks Brian must do in a real interactive session (panes, keys, live model output), each with the exact command to run and the expected result, and the Claude Code version and surfaces you tested. Do not wait for an answer; the loop does not pause on this.
- [x] T07 [HANDOFF] Final HANDOFF.md and RUNLOG.md written and committed.

## Needs Brian

