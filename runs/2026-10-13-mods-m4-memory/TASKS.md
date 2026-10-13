# M4 — Memory
Status: IN_PROGRESS
Session: 1

## Tasks
- [x] T01 [FR-MEM-01] Implement, with tests: On `turn.complete` (merged), classify the last exchange `remember` or `none` with the small model through the kit's classify-then-fork helper. Skip w…
- [x] T02 [FR-MEM-02] Implement, with tests: On `remember`: `$.model.fork` is asked for memory entries as JSON (file name, frontmatter name/description/type, body), de-duplicated against the exi…
- [x] T03 [FR-MEM-03] Implement, with tests: Redaction: any key, token or password-shaped string is replaced with `[redacted]` before writing; a fork reply that is mostly secrets is dropped.
- [x] T04 [FR-MEM-04] Implement, with tests: UI: while working, a chip `memory updating`; when done a closable pane lists the files changed and the lines added and removed. Pane open/close follo…
- [x] T05 [FR-MEM-05] Implement, with tests: `/remember <text>` forces an entry (no classifier); `/memories` lists the last 20 writes with the session each came from (a `sources.json` beside the…
- [x] T06 [FR-MEM-06] Implement, with tests: A -- label --> Behaviour after `/clear`, `/resume`, `/branch` is defined and tested: no work starts on `/clear`; the running-fork guard resets.
- [x] T07 [FR-MEM-07] Implement, with tests: README, summary atom, `kit.json`, sync passes.
- [ ] T08 [AC-MEM-01] Verify, saving the receipt under the run folder's receipts/: `claude -p` probe: "remember that X" writes a file under a temp `memoryDir`; the receipt shows the file. (evidence: `receipts/m4-probe.json`)
- [ ] T09 [GATE] With everything committed, `python tools/mods-harness/harness.py gate` passes. It runs `python tools/mods-gate.py` (validate, plugin test and tsc strict for ALL plugins, 35 s) and is this mod's one regression run; the harness reuses its receipt. During work, run `python tools/mods-gate.py --plugin <name>` as often as you like.
- [ ] T10 [MANUAL] Write MANUAL-CHECKS.md in the run folder: numbered checks Brian must do in a real interactive session (panes, keys, live model output), each with the exact command to run and the expected result, and the Claude Code version and surfaces you tested. Do not wait for an answer; the loop does not pause on this.
- [ ] T11 [HANDOFF] Final HANDOFF.md and RUNLOG.md written and committed.

## Needs Brian

