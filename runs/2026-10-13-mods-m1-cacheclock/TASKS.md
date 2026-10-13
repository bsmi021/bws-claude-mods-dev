# M1 — Cache clock
Status: DONE
Session: 1

## Tasks
- [x] T01 [FR-CC-01] Implement, with tests: Pure `cacheclock.ts`: from the time of the main thread's last model request and a TTL, the remaining time and a state (`fresh`, `low` under the thres…
- [x] T02 [FR-CC-02] Implement, with tests: A chip in cockpit's action bar: `cache 42m`, warning style under `cacheLowMinutes` (default 5), `cache cold` after expiry. It refreshes about once a…
- [x] T03 [FR-CC-03] Implement, with tests: Auto handoff: when remaining time first drops under the threshold and the session is idle and has at least one turn since the last handoff, write the…
- [x] T04 [FR-CC-04] Implement, with tests: `/cacheclock [status]` prints remaining time, TTL, state, and when the last auto handoff was written. Headless prints text.
- [x] T05 [FR-CC-05] Implement, with tests: cockpit README documents the feature and options; cockpit version bumped (minor).
- [x] T06 [AC-CC-01] Verify, saving the receipt under the run folder's receipts/: `claude -p` probe with `--plugin-dir ./bws-cockpit` runs `/cacheclock status` and saves its stream-json output. (evidence: `receipts/m1-probe.json`)
- [x] T07 [GATE] With everything committed, `python tools/mods-harness/harness.py gate` passes. It runs `python tools/mods-gate.py` (validate, plugin test and tsc strict for ALL plugins, 35 s) and is this mod's one regression run; the harness reuses its receipt. During work, run `python tools/mods-gate.py --plugin <name>` as often as you like.
- [x] T08 [MANUAL] Write MANUAL-CHECKS.md in the run folder: numbered checks Brian must do in a real interactive session (panes, keys, live model output), each with the exact command to run and the expected result, and the Claude Code version and surfaces you tested. Do not wait for an answer; the loop does not pause on this.
- [x] T09 [HANDOFF] Final HANDOFF.md and RUNLOG.md written and committed.

## Needs Brian

