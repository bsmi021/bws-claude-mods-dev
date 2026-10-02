# PLAN: Finish-Line Guard (mod #4 from the usage review)

Built inside `bws-cockpit`, which already finds the run folder, reads its checklists and loads in every session.

## Pain (from runs/2026-10-02-usage-analysis)
- About 19 "don't stop / make the decisions" orders, e.g. "I do not understand why you keep stopping with open items".
- About 10 "do we trust it's done?" checks, e.g. "Why didn't you tell me we weren't done".
- Brian's rule: never claim done without proof (test output, receipts, captures).

## Mechanism (checked in the 2.1.287 types)
- `classic.Stop` fires when the main loop is about to stop. Returning `{ block: reason }` makes Claude continue with that reason, as a Stop settings hook does.
- Its input has `stop_hook_active`, `last_assistant_message`, `background_tasks` and `session_crons`.
- `turn.complete` can return `{ text }`, which is shown as a line under the answer.

## Finish line (all true, receipts in this folder)
1. **Open-items guard.** When the main loop tries to stop and the session's run folder still has actionable open items, the guard blocks the stop. The reason lists up to 5 items and says how to hand back properly.
   - The session's run folder is the newest `runs/*` whose RUNLOG, PLAN or TASKS was written during this session. A stale folder from another day is ignored.
   - Open items are `- [ ]` lines in PLAN.md or TASKS.md.
2. **Not actionable, never blocks:**
   - items marked blocked, waiting on or needing Brian/the user/you, parked, deferred, follow-up, later, or out of scope
   - a reply that hands back (ends with a question, or says "your call", "want me to", "should I", "which do you", "waiting on you", "let me know")
   - background tasks or session crons still pending
3. **Bounded.** At most `finishLineMaxContinues` blocks (default 2) per user prompt. The count resets when Brian sends a prompt, so it can never loop.
4. **Evidence check.** When nothing is open but the reply claims completion ("done", "complete", "finished", "all tests pass", "ready to merge", ✅) and cites no evidence, the guard blocks once and asks for it. Evidence means:
   - a receipt or file path (`.txt`, `.png`, `.json`, `.log`, `.md`, `receipts/`)
   - test counts ("48/48", "16 pass", "0 fail")
   - "exit 0"
   - a commit hash
   - a URL
5. **Visible line under the answer.** When a turn ends with actionable open items, `turn.complete` shows `⚑ finish line: N open · <first items>`. Brian always sees it, even after the guard has used up its continues.
6. **Headless.** Off in `claude -p` and SDK sessions by default, so harness workers keep their own budgets and watchdog. `finishLineHeadless: true` turns it on.
7. **Settings:** `finishLine` (on), `finishLineMaxContinues` (2), `evidenceCheck` (on), `finishLineHeadless` (off).
8. **Tests:**
   - a block that lists the items
   - no block when everything is ticked
   - blocked-marked items are excluded
   - question hand-back
   - background tasks
   - the continue cap and its reset
   - the evidence claim, with and without evidence
   - a stale run folder is ignored
   - headless skip
   - the turn.complete line
   - pass-through when the feature is off
   - Also: validate clean, tsc strict clean, the existing 48 tests still green.
9. **Live receipt:** `claude -p` in a scratch project with an open TASKS.md and `finishLineHeadless` set through `--settings`. The transcript shows the Stop block reason and Claude continuing.
10. README, RUNLOG and a local commit. The `publish` branch is not refreshed until Brian asks.

## Out of scope (parked)
- Subagent stops (`classic.SubagentStop`).
- Judging whether ticked items are really done. That is the evidence check's job, kept heuristic.
