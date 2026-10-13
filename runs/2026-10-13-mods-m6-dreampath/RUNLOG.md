# RUNLOG: M6 DreamPath (bws-memory)

## Session 1 (2026-10-13)

Objective: deliver M6 from `docs/SPEC-VIDEO-MODS.md` (FR-DP-01..05, AC-DP-01) as an extension of the `bws-memory` plugin.

Actions:
- Read AGENTS.md, the spec, TASKS.md and the M0 to M5 handoffs. One advisor call before coding settled: the 40% cap counts
  only removals, no fs delete (emptying), sessions from sources.json, `session.compact` exists, share the running guard,
  `/dream apply` for the headless path, a separate pane id.
- T01: `dream.ts` (prompt, plan parse, validation, redaction, plan text), `/dream` printing the plan, M4's `askForced`
  generalised to `askText`; tests `dream.test.ts`, `dreamcmd.test.ts`, helper `dreamworld.ts`.
- T02: `dreamapply.ts` (view, chip, fingerprints, changes, index, sources, backups), the `bws-dream` pane (Apply, Dismiss),
  `applyDream`, `/dream apply`, `/dream undo`; tests `dreamapply.test.ts`, `dreampane.test.ts`.
- T03: `dreamEveryTurns` option, the turn counter, the `session.compact` hook, `markDue` / `maybeAutoDream`; DECISIONS.md;
  tests `dreamtrigger.test.ts`.
- T04: sessions per file, union on merge, shown in the pane; tests `dreamsources.test.ts`.
- T05: README, version 0.2.0, summary atom tests.
- T06: AC-DP-01 probe (`receipts/m6-probe.*`). T08: MANUAL-CHECKS.md (15 checks).
- Late additions: /clear, /resume, /branch tests for the dream; validator showed the imported `DREAM_PANE` as `requestId=?`
  so the constant is now a literal in register.tsx.

Probes (through `tools/probe.py`): m6-probe, one headless `/dream apply` with the session model.

Results: `claude plugin test` in `bws-memory/`: 136 pass, 0 fail (was 54). `python tools/mods-gate.py --plugin bws-memory`: ok.
Assumptions A1 to A7 recorded on the dashboard.

Version bumped: bws-memory 0.1.0 -> 0.2.0. No other plugin changed.

Gate: see the final entry below.

Pending: Brian runs MANUAL-CHECKS.md. No Needs Brian items.
