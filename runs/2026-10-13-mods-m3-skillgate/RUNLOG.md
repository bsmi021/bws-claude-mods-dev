# RUNLOG: M3 skill gating (bws-skillgate)

## Session 1 (2026-10-13)

Objective: deliver M3 from docs/SPEC-VIDEO-MODS.md (FR-SG-01..06, AC-SG-01) as the new plugin `bws-skillgate`.

What was done:
- T01 spike: read the generated types for `prompt.attachment` / `skill_listing`, `$.ui.invalidate`, `prompt.submit`
  `context`, `$.store`. Three live probes via `tools/probe.py` with a throwaway spike hook (`receipts/spike-*`):
  the listing fires once in the first request and a rewrite is honored; an invalidate does not re-ask it within a turn;
  `claude -p` cannot run a second turn; a `prompt.submit` context block is read as more skills. Decision recorded in
  DECISIONS.md: cut on the first prompt, only add (context block) on later prompts, store the cut per row for the same
  bytes on a re-ask. Probe count: 3 of 4 for T01.
- T02-T06: `bws-skillgate` 0.1.0 (`hooks/gate.ts` pure, `hooks/register.tsx`), 42 tests, all passing on the first run;
  a mutation check (answering with the full listing) made 5 tests fail, so the hook tests bite.
- T07: README, `kit.json` (classify-fork, summary), sync check passes.
- T08: AC-SG-01 probe (2 runs: gate on topK 1 -> `dataviz, simplify`; off -> all 15). Probe count: 2 of 4 for T08.
- T10: MANUAL-CHECKS.md (14 checks) and two settings files for them.
- Assumptions recorded on the dashboard: A1 (later prompts only add), A2 (classify inside the attachment hook).

Commits: effb245 (T01), 4454fe4 (T02), 73d8790 (T03-T06), c197ef4 (T07), 62f26c9 (T08), then T10/T11 and the gate
(below).

Gate (T09): see the entry below once it has run.

Cost: probes about $0.016 in all (haiku).

Remaining: Brian's manual checks (MANUAL-CHECKS.md). No Needs Brian items. No Chronicler consultation (not TMS work).
