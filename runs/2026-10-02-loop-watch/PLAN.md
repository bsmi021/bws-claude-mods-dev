# PLAN: Loop Watch pane (mod #5 from the usage review)

Brian's ask: "build the loop watch pane". Built inside `bws-cockpit`, which shares the band, the refresh timer and the per-session loading.

## Pain it targets (from runs/2026-10-02-usage-analysis)
- Units that took 11–12 worker sessions.
- About 18 "are you stuck / hung" prompts, including "you ran for 47m with no action".
- 47 "where are we" asks, and "open the dashboard in the browser" ×3.
- Loops that crash, then need resume.

## What it reads (harness-loop format, checked against real loops)
- `<cwd>/Tools/*/loop.json`: `name`, `title`, `harnessDir`, `board.port`. `harness.py` sits beside it.
- `<cwd>/<harnessDir>/state.json`:
  - the driver's `status`, `message`, `updated` (heartbeat every 30 s) and `desired`
  - `current` and `order`
  - per unit: `status`, `sessions`, `costUsd`, `crashes`, `verifyFails`, `heartbeat {at, tool, hint}`, `message`, `folder`
- `<cwd>/<unit folder>/TASKS.md`: task progress (`- [x] T..`) and open needs under `## Needs ...` (`- [ ] N..`).

## Finish line (all true, with receipts in this folder)
1. **`/loop-watch`** opens a pane showing the newest loop in the project:
   - header: name, title, driver status, how old the last update is, and the board link
   - one row per unit in `order`: the current marker, status, name, sessions, cost, task progress, and the heartbeat age and tool for the running unit
   - totals
   - open needs plus the exact `answer` command, when paused
   - a Select to switch loops when the project has more than one
2. **Alerts**, each with a toast when it first appears and a band chip:
   - the driver says RUNNING but has not updated for 3 minutes or more ("driver looks dead")
   - the running unit has had no tool activity for 20 minutes or more
   - the current unit is on 6 or more sessions
   - the loop has just paused for Brian
   - the loop has finished
   - All thresholds come from userConfig.
3. **Band:** a `loop` chip shows the state (running, paused, stalled, stopped) and `4: loop` opens the pane.
4. **Actions:**
   - `r: resume` runs `harness.py start --resume`.
   - `s: stop` runs `harness.py stop`, but only on a second press within 10 s, so it can't fire by accident.
   - `g: refresh`.
   - Each action's output shows in the pane. Tests prove the argv and cwd. No live stop or start is run against Brian's real loops.
5. **Without a pane:** `/loop-watch` with no surface (headless) replies with the same summary as text. Receipt: a live `claude -p "/loop-watch"` in `bws.game.tms`.
6. Validate clean, `claude plugin test` green, tsc strict clean, README updated, RUNLOG written, local commit.
7. **Interactive screenshot** of the pane in a real terminal session on `bws.game.tms`. The pane opens from a command, so Brian types `/loop-watch`, or allows me to.

## Out of scope (parked)
- Answering needs from inside the pane (an Input that runs `harness.py answer`).
- Loops outside the session's working directory.
- Changing `harness.py` or the skill. The pane is read-only apart from stop and resume.
