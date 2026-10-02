# RUNLOG: Finish-Line Guard

## Objective
Build mod #4 from the usage review inside `bws-cockpit` (version 0.3.0): keep Claude going while this session's checklist has open items, and ask for evidence when it claims done without any. The finish line is in [PLAN.md](PLAN.md).

## Actions
- **Mechanism, checked in the 2.1.287 types:**
  - A `classic.Stop` hook returning `{ block }` makes Claude continue with that reason. Its input has `last_assistant_message`, `background_tasks` and `session_crons`.
  - `turn.complete` can return `{ text }` to show a line under the answer.
  - `$.session.usage().startedAt` gives the session start, which decides whether a run folder was touched this session.
- **`hooks/finish.ts`** (pure): open items; parked items (blocked, waiting, needs the user, parked, deferred, follow-up, later, out of scope); hand-back (a question or explicit phrasing); done claims; evidence (test counts, file and receipt paths, exit 0, commit hash, URL); the block decision.
- **`hooks/register.tsx`:**
  - `findRun` is split into `readRunFolder`, which adds the mtime and raw text, and `sessionFinishLine`.
  - `prompt.submit` resets the continue counter.
  - `classic.Stop` makes the guard's decision and toasts.
  - The `turn.complete` hook is merged: it refreshes the band, then adds the `⚑ finish line` line. Validate refused two unmatched `turn.complete` hooks.
- **`plugin.json`:** settings `finishLine`, `finishLineMaxContinues`, `evidenceCheck` and `finishLineHeadless`; version 0.3.0.
- **Tests:** 16 new in `tests/finish.test.ts`, 64 total, all passing. Validate clean, tsc strict clean.
- **Live** (`receipts/live-headless.txt`, `claude -p` in a scratch repo with `finishLineHeadless` on through `--settings`):
  - **Run 1:** told to do only the first of two tasks. The guard blocked the stop and named `create bye.txt containing bye`. Claude kept to Brian's instruction, marked the item `(needs Brian: …)`, said so plainly, and the guard let it stop.
  - **Run 2:** not told to skip. Claude ticked task 1 and tried to stop with "the second task is still open". The guard blocked the stop, and Claude created `bye.txt` and ticked it. The final "Both tasks are done" names the files, so the evidence check let it stop.

## Finish line

| # | Item | Status |
|---|---|---|
| 1 | Open-items block, session run folder only | ✅ tests + live |
| 2 | Parked items, hand-back and background work never block | ✅ tests + live run 1 |
| 3 | Cap per prompt, reset on a prompt | ✅ tests |
| 4 | Evidence check | ✅ tests (live run 2 passed it with file evidence) |
| 5 | Line under the answer | ✅ tests |
| 6 | Headless off by default, on by setting | ✅ tests + live |
| 7 | Settings | ✅ |
| 8 | Tests, validate, tsc | ✅ 64/64 |
| 9 | Live receipt | ✅ two runs |
| 10 | README, RUNLOG, commit | ✅. The `publish` branch is not refreshed; that waits for Brian's go |

## Not verified
- An interactive session's line under the answer, drawn in the terminal. It is covered by tests only.
- The evidence check firing live; covered by tests.

## Follow-ups (parked)
- Subagent stops (`classic.SubagentStop`).
- Refresh the `publish` branch with 0.3.0 when Brian asks.
