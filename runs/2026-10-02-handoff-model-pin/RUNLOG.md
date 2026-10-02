# RUNLOG: /handoff and worker model pin

## Objective
Build mod #7 from the usage review inside `bws-cockpit` (version 0.5.0):
- `/handoff` writes HANDOFF.md for a fresh agent and gives the start prompt.
- A worker model pin puts subagents on Sonnet 5.5 unless the call names a model.

The finish line is in [PLAN.md](PLAN.md).

## Actions
- **Checked what Brian asked** with a prompt search: "the subagents that are running worker tasks will now need to run sonnet 5.5", "workers are to use sonnet 5.5 as well unless the task is complex", and more.
  - The pin targets subagents, not harness workers: their model comes from loop.json tiers and escalation, which the harness owns.
- **Mechanisms, from the 2.1.287 types:**
  - `$.model.fork`: a question over the session's own transcript.
  - `$.session.messages()` + `$.model.complete`: the fallback.
  - `$.ui.copy`.
  - `agent.spawn` with `model`, `subagentType` and `fork`; `next({ ...e, model })` picks the model.
- **`hooks/handoff.ts`** (pure): the handoff prompt, the start prompt, the dated folder and kept-file names, the transcript builder, and `pinnedModel`.
- **`hooks/register.tsx`:**
  - the `/handoff` command: fork, fallback, write, keep, copy
  - the `agent.spawn` pin hook
  - the command registration
- **`plugin.json`:** settings `workerModel` (default "", off) and `workerAgentTypes`; version 0.5.0.
- **Brian's settings:** `pluginConfigs["bws-cockpit"].options.workerModel = "claude-sonnet-5-5"`. Backup: `settings.json.bak-2026-10-02-workermodel`; the diff is that one entry.
- **Tests:** 14 new in `tests/handoff.test.ts`, 93 total, all passing. Validate clean, tsc strict clean.

## Live (`receipts/`)
- **Pin** (`live-pin.txt`): a parent on claude-opus-5-5 spawned three subagents.
  - general-purpose with no model ran on claude-sonnet-5-5, and the toast showed.
  - Explore kept claude-opus-5-5.
  - An explicit `haiku` ran on claude-haiku-4-5.
- **/handoff** (`live-handoff.txt`):
  - **Run 1** failed: with `claude -p --continue "/handoff"`, the resumed session had nothing to fork, so no handoff was written. That's the resume-after-crash case.
  - **Fix:** fall back to `$.session.messages()` + `$.model.complete` on the session's model.
  - **Run 2** wrote a 467-word HANDOFF.md: objective, finish line (1 of 3 done), done-so-far with commit `e98b47e` (checked against `git log`), a concrete next step, open items, files, constraints and traps.

## Finish line

| # | Item | Status |
|---|---|---|
| 1 | /handoff writes HANDOFF.md (session run folder, else runs/<date>-handoff) | ✅ tests + live |
| 2 | Previous HANDOFF.md kept | ✅ tests |
| 3 | Start prompt in the reply and on the clipboard | ✅ tests + live (headless reply) |
| 4 | Clear failures, no file | ✅ tests |
| 5 | Worker pin: unnamed models only, configured types, forks and others untouched, off by default | ✅ tests + live |
| 6 | Brian's settings workerModel | ✅ |
| 7 | Tests, validate, tsc | ✅ 93/93 |
| 8 | Live | ✅ |
| 9 | README, RUNLOG, commit | ✅. `publish` not refreshed |

## Not verified live
- The clipboard copy in an interactive session; the headless reply path was verified.
- /handoff via `$.model.fork` in a live interactive session; the fork path is tested, and the live run went through the fallback.

## Follow-ups (parked)
- Subagent effort ("sonnet high"): `agent.spawn` has no effort field; a per-subagent `turn.step` effort override is possible later.
- Refresh `publish` with 0.5.0 when Brian asks.

## Publish refresh (2026-10-02)
- The pre-scan of the new 0.5.0 files (handoff.ts, handoff.test.ts, README, register.tsx) found no private names. The only hit was the manifest author, kept by design.
- The publish README now mentions /handoff and the worker model pin (commit on main).
- **`publish` refreshed** from main with bws-cockpit 0.5.0, committed on top of 1b99a1f; 28 files.
  - Full scan: only the two generator-script comments and the manifest authors.
  - Validate passes for both plugins; bws-cockpit 93/93 and bws-shell-lint 16/16, run from the publish tree.
  - Not pushed; no remote is configured.
