# RUNLOG: M7 decision tree (bws-sidechat)

## Session 1 (2026-10-13)

Objective: deliver M7 (FR-DT-01..06, AC-DT-01) by extending bws-sidechat, per `docs/SPEC-VIDEO-MODS.md` and TASKS.md.

Actions:
- Read AGENTS.md, the spec, M0 to M6 handoffs, bws-sidechat's `side.ts`, `register.tsx`, tests and the generated types
  (`SessionMessage`, `PromptSubmitArgs`, `ProcessSpawnRequest` has no signal, `Timer.cancel`, `UiFocusInput`). No built-in
  `/explain` exists in 2.1.296 (checked against earlier probes' `slash_commands` lists).
- T01 `90dcf18`: `hooks/tree.ts`, types, `kit.json` + vendored `summary.ts`, `tests/tree.test.ts` (17).
- T02 `dd95b0b`: `hooks/explain.ts` (parser, prompt, pane rows), register.tsx `/explain`, tree pane, Explore,
  Decide, two options in plugin.json; `tests/replies.ts`, `tests/treeworld.ts`, `tests/explain.test.ts`. Note: the
  focus-ring move is not observable in the test engine.
- T03 `28504a3` + `b5c9dd6` (the first commit went in with a tsc error in a test helper's type; fixed in the second):
  `tests/explore.test.ts`.
- T04 `a22dc79`: `tests/treepane.test.ts`. T05 `9458303`: `tests/decide.test.ts`; option text loses trailing
  punctuation in the paragraph.
- T06 `89b910f`: version 0.2.0, README. T07 `b50e54d`: probe (one `python tools/probe.py` run, $0).
- T09: MANUAL-CHECKS.md (16 checks).

Outcomes: `python tools/mods-gate.py --plugin bws-sidechat` ok after every task; `claude plugin test` 118 pass (58 before,
untouched); validate passes with the new hooks listed. Assumptions A1 to A8 recorded on the dashboard.

- T05 follow-up `6facd4f`: Decide now closes the tree (ending forks, which can take seconds) before it schedules the send, so the deferred submit cannot fire while `/explain decide` still waits (advisor review).

Gate: `python tools/mods-harness/harness.py gate` PASS at `6facd4f` (2026-10-13 10:47, all plugins: validate, plugin test, tsc strict, kit sync); receipt written. One gate run this session (a first background start failed on a bad log redirect before the gate ran).

No Chronicler consultation: purely technical work, no TMS content.
