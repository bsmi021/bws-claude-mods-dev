# M7 — Decision tree
Status: DONE
Session: 1

## Tasks
- [x] T01 [FR-DT-01] Implement, with tests: Pure `tree.ts`: nodes (question, options, chosen option, answer text, fork session id), edges, add / go back / branch from an earlier node, depth and…
- [x] T02 [FR-DT-02] Implement, with tests: `/explain` (new command, does not clash with the built-in) parses the last assistant reply's numbered or lettered options (parser tested on real repl…
  - note: the focus-ring move onto `opt-0` is not observable in the test engine (its `ui.focus` stub never fires); the open with focus is tested; MANUAL-CHECKS covers the ring.
- [x] T03 [FR-DT-03] Implement, with tests: Explore on an option forks a side chat with the prompt to answer follow-up questions about that option and ask the next decision question if there is…
- [x] T04 [FR-DT-04] Implement, with tests: Navigation: back to an earlier question and pick another option (branches kept); a Map view of the whole tree; Close. Keys and buttons follow bws-sid…
- [x] T05 [FR-DT-05] Implement, with tests: Decide: sends a one-paragraph decision summary into the main session. Per AGENTS.md, `$.prompt.submit` inside a `command.run` hook deadlocks, so it i…
- [x] T06 [FR-DT-06] Implement, with tests: bws-sidechat README and version updated (minor); existing 58 tests untouched.
- [x] T07 [AC-DT-01] Verify, saving the receipt under the run folder's receipts/: Probe: `/explain` over a fixture reply with three options opens the root node with three options (state dump). (evidence: `receipts/m7-probe.json`)
- [x] T08 [GATE] With everything committed, `python tools/mods-harness/harness.py gate` passes. It runs `python tools/mods-gate.py` (validate, plugin test and tsc strict for ALL plugins, 35 s) and is this mod's one regression run; the harness reuses its receipt. During work, run `python tools/mods-gate.py --plugin <name>` as often as you like.
- [x] T09 [MANUAL] Write MANUAL-CHECKS.md in the run folder: numbered checks Brian must do in a real interactive session (panes, keys, live model output), each with the exact command to run and the expected result, and the Claude Code version and surfaces you tested. Do not wait for an answer; the loop does not pause on this.
- [x] T10 [HANDOFF] Final HANDOFF.md and RUNLOG.md written and committed.

## Needs Brian

