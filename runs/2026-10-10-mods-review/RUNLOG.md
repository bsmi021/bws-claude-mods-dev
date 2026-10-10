# RUNLOG: 2026-10-10 mods review

## Objective
Measure the current mods against the last 7 days of sessions, then decide which to improve, drop or build new. This run is analysis only: nothing gets built until Brian picks.

## Actions
- `analyze.py` covers 2026-10-03 00:00 EDT to 2026-10-10:
  - 571 jsonl files (1.5 GB), including 119 subagent logs.
  - Output: `usage.json`, `prompts.jsonl`, `corrections.jsonl`.
- Probes:
  - `probe1.py`: mod slash commands, run as `local_command`.
  - `probe2.py`: Finish-Line attribution, and Guard blocks taken from `<tool_use_error>` only. Output: `receipts/finish_guard_detail.json`.
  - `probe3.py`: the wait chain (sleep blocks, Monitor schema errors, 10-minute cap) and long-command shapes. Output: `receipts/probe3.txt`.
  - `probe4.py`: Glob timeout inputs.
  - `probe5.py` and `probe6.py`: lint misses, and the tms-heim low-VRAM retry trace.
  - `probe7.py`: lint metric alternatives. Output: `receipts/lint-threshold.txt`.
- Read all 426 interactive prompts and grouped them into themes.

## Key results
- Sessions: 493 top-level. 408 were headless and 37 interactive.
- Totals: 834 prompts, 35.8k tool calls, 1,262 tool errors.
- **Shell Lint:** 197 refusals (183 long-command, 12 py-backslash, 2 dq-trailing-backslash). The next shell call succeeded in 187 of 194.
  - It missed 5 heredocs sized 7725–7843, under the 7850 limit.
  - Proposed metric: length + 3×' + " + \, limit 7800. It catches 5/5 and refuses 1 passing command in the sample.
- **Guard:** 6 blocks: adb, Unity not running, unreal-mcp down, -automated, and low-VRAM twice.
  - Bug: on 10-06 the retry already carried the `-ini` overrides inside `$args` and was blocked again.
  - Low-VRAM also degrades a HighResShot promo render.
- **Finish-Line:** 30 blocks (17 open-items, 13 evidence) across 10 sessions. One led to real work: the motion-capture block on 10-06 (`probe8.py`) was followed by 30 tool calls on items that didn't need Brian, then a commit.
  - 13 of 17 open-item blocks were in loop-supervisor sessions that never touched the folder. The worker wrote it after the session started.
  - 3 of the remaining 4 were hand-backs the regex missed. Widen the hand-back list to imperative asks only ("tell me when", "say go"), so the motion-capture kind of block still fires.
  - All 13 evidence blocks hit "holding" or status replies, 10 of them in agent-team sessions.
- **Usage:**

| Feature | This week |
|---|---|
| /loop-watch | 10 |
| /handoff | 2 (both written) |
| /cockpit | 1 |
| /resume-run | 2 (via button) |
| /repo-sessions | 0 |
| /projects | 0 |
| find_project | 0 |
| Worker pin | 34 spawns pinned |
| First-message context | 471 injections (about 408 headless) |

- **Wait chain in headless workers:** 174 built-in sleep blocks, 79 Monitor "schema was not sent" errors, and 77 shell calls that hit the 10-minute cap (38 of them wait loops). The route is the harness template, not a mod.
- **Biggest pain no mod covers yet:** editor contention. About 15 prompts, plus "taking"/"free" messages traded by hand to take turns pushing.

## Output
- Report: `report.html`, published at https://claude.ai/artifact/Mnhj2aa4FxHTT7GPNTvh61

## Next step
Brian picks from the ranked list:
1. Finish-Line fixes
2. Guard VRAM fix
3. Lint metric
4. Drop Repo Sessions
5. Context off in `-p`, and the board URL in the loop chip
6. Editor lease (interview first)
7. A Monitor line in the harness template

Items 1–5 fit in one release. Each gets a run folder with PLAN.md before any code changes.
