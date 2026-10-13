# M3 — Skill gating
Status: IN_PROGRESS
Session: 1

## Tasks
- [x] T01 [SPIKE] Run the spike this mod's first requirement describes. Record the questions, the probes (via tools/probe.py), the answers and the decision in DECISIONS.md in the run folder. If an assumption fails, raise a blocker.
- [x] T02 [FR-SG-01] Implement, with tests: Spike first (DECISIONS.md): confirm from the generated types and a live probe whether rewriting the `skill_listing` attachment (`prompt.attachment`,…
  - note: tests "FR-SG-01: the first prompt cuts the engine listing" (skillgate.test.ts) and "FR-SG-01: the listing, parsed and cut" (gate.test.ts).
- [x] T03 [FR-SG-02] Implement, with tests: Modes `off` (default), `on`: when a prompt is submitted, one small-model call receives the user's prompt and the skill names with descriptions and re…
  - note: tests "FR-SG-02: picks, /name, topK, later prompts and /skillgate" and "FR-SG-02: modes, the classifier call and its answer". Later prompts add a context block (DECISIONS.md).
- [x] T04 [FR-SG-03] Implement, with tests: Cache safety: identical prompt + skills gives byte-identical listing text; the listing is not changed on turns where it need not be (per the spike).…
  - note: tests "FR-SG-03: cache safety" (incl. "a later prompt whose picks are all shown returns next(e) untouched") and "FR-SG-03: the same input gives the same bytes".
- [x] T05 [FR-SG-04] Implement, with tests: Fail open: a classifier error, a timeout (4 s) or an unparsable answer leaves the full listing.
  - note: tests "FR-SG-04: fail open" (error, unparsable, unanswered, 4 s timeout, later-prompt failure, no entries).
- [x] T06 [FR-SG-05] Implement, with tests: `/skillgate explain` and the summary atom show the last picks and the tokens the cut saved (estimate: characters / 4).
  - note: tests "FR-SG-05: explain shows the last picks and the tokens saved" and the pure "summary atom shape" test.
- [x] T07 [FR-SG-06] Implement, with tests: README, version, `kit.json`, kit sync passes.
  - note: bws-skillgate/README.md; version 0.1.0 (new plugin); kit.json lists classify-fork and summary; `python tools/sync-kit.py --check` passes.
- [ ] T08 [AC-SG-01] Verify, saving the receipt under the run folder's receipts/: `claude -p` probe with `--plugin-dir ./bws-skillgate`: the model's reported available skills match the cut for a fixed prompt. (evidence: `receipts/m3-probe.json`)
- [ ] T09 [GATE] With everything committed, `python tools/mods-harness/harness.py gate` passes. It runs `python tools/mods-gate.py` (validate, plugin test and tsc strict for ALL plugins, 35 s) and is this mod's one regression run; the harness reuses its receipt. During work, run `python tools/mods-gate.py --plugin <name>` as often as you like.
- [ ] T10 [MANUAL] Write MANUAL-CHECKS.md in the run folder: numbered checks Brian must do in a real interactive session (panes, keys, live model output), each with the exact command to run and the expected result, and the Claude Code version and surfaces you tested. Do not wait for an answer; the loop does not pause on this.
- [ ] T11 [HANDOFF] Final HANDOFF.md and RUNLOG.md written and committed.

## Needs Brian

