# RUNLOG: M4 memory (bws-memory)

## Session 1 (2026-10-13)

Objective: deliver M4 from docs/SPEC-VIDEO-MODS.md (FR-MEM-01..07, AC-MEM-01) as the new plugin `bws-memory`.

What was done:
- Read AGENTS.md, the spec and the M0-M3 handoffs; used bws-skillgate as the template (layout, kit vendoring, test
  world). Checked the generated types for `turn.complete`, `session.end` (`clear` / `resume`; no `/branch` event),
  `$.fs` (no delete), `$.model.fork`, `SessionMessage.toolUses`.
- T01-T06: `hooks/memory.ts` (pure), `hooks/register.tsx`; 54 tests in `tests/memory.test.ts` and `tests/mem.test.ts`.
  The first test run had 7 failures (a missing `session.start` stub in the test world, the `at` timestamp advanced 10 ms
  by the deferred start, a line count wrong in two tests, a duplicate-file comparison bug in `parseEntries`, a URL
  credential expectation, a test that mounted a pane nothing renders); fixed in two passes, then green.
  `tools/mods-gate.py --plugin bws-memory` passes (receipts `gate1..3.txt`, `test1..2.txt`).
- T07: README, `kit.json` (classify-fork, summary; transcript comes as a sibling), sync check passes.
- T08: AC-MEM-01 headless probe with `/remember` (one run): two files written. Receipts `receipts/m4-probe*`.
- T10: MANUAL-CHECKS.md (15 checks, plus `receipts/manual-settings.json`).
- Assumptions recorded on the dashboard: A1 (probe via /remember), A2 (undo empties a created file), A3 (/branch via
  session id; stale replies dropped), A4 (chip is the summary atom; minWords counts the user's words).

Probes: 1 live run for T08 (budget 4 per task).
Commits: see `git log` (T01-T07 931f362; the rest follow it).

Remaining: Brian's manual checks (MANUAL-CHECKS.md). No Needs Brian items. No Chronicler consultation (not TMS work).

Gate (T09): `python tools/mods-harness/harness.py gate` PASS at 6accf29 (2026-10-13 09:26:09 to 09:27:04, all plugins, kit
and kit sync). Gate runs this session: 1 of 3. After it, only run-folder files changed.
Note: headless `/remember` also calls `openPane` (the `ui_panes` line in the probe stream); the pane is not drawn headless.
