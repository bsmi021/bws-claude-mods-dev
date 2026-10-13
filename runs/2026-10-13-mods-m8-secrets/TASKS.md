# M8 — Secret box
Status: IN_PROGRESS
Session: 1

## Tasks
- [x] T01 [SPIKE] Run the spike this mod's first requirement describes. Record the questions, the probes (via tools/probe.py), the answers and the decision in DECISIONS.md in the run folder. If an assumption fails, raise a blocker.
- [x] T02 [FR-SB-01] Implement, with tests: Spike first (DECISIONS.md, with a threat note): can a `tool.call` rewrite put the real value into aA -- label --> Bash command's environment without…
- [x] T03 [FR-SB-02] Implement, with tests: Tool `request_secret` (`mcp__bws-secrets__request_secret`, args `name`, `purpose`): opens a pane with a masked input (never echoed); the value is wri…
- [x] T04 [FR-SB-03] Implement, with tests: A -- label --> Blocking reads: a `tool.call` denial for Read, Grep, Glob and Bash commands (command position only; replay the rule over a corpus of r…
- [x] T05 [FR-SB-04] Implement, with tests: Use: aA -- label --> Bash command containing `{{secret:NAME}}` gets the value injected as an environment variable at execution time per the spike's m…
- [x] T06 [FR-SB-05] Implement, with tests: `/secrets` lists names only (never values) and removes one; the pane never shows a saved value.
- [~] T07 [FR-SB-06] Implement, with tests: README with the threat model and what it does not protect (a command that sends the value somewhere, a file the user points it at). Summary atom show…
- [ ] T08 [AC-SB-01] Verify, saving the receipt under the run folder's receipts/: Probe: Claude is asked to call `request_secret` then run a command using the placeholder; the receipt shows the transcript contains no value. (evidence: `receipts/m8-probe.json`)
- [ ] T09 [GATE] With everything committed, `python tools/mods-harness/harness.py gate` passes. It runs `python tools/mods-gate.py` (validate, plugin test and tsc strict for ALL plugins, 35 s) and is this mod's one regression run; the harness reuses its receipt. During work, run `python tools/mods-gate.py --plugin <name>` as often as you like.
- [ ] T10 [MANUAL] Write MANUAL-CHECKS.md in the run folder: numbered checks Brian must do in a real interactive session (panes, keys, live model output), each with the exact command to run and the expected result, and the Claude Code version and surfaces you tested. Do not wait for an answer; the loop does not pause on this.
- [ ] T11 [HANDOFF] Final HANDOFF.md and RUNLOG.md written and committed.

## Needs Brian

