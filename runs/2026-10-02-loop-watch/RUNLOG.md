# RUNLOG: Loop Watch pane

## Objective
Build mod #5 from the usage review: a pane that watches harness loops and flags stalls. It lives in `bws-cockpit`, version 0.2.0. The finish line is in [PLAN.md](PLAN.md).

## Actions
- **Read the harness-loop format** from the skill template and 7 real loops (TMS Warden and M1, scribe, canopy, axo, street-war, pit-manuever):
  - `Tools/<name>/loop.json` gives `harnessDir` and `board.port`.
  - `<harnessDir>/state.json` holds the driver, current unit, order and units, with heartbeats.
  - Each unit's `TASKS.md` holds the tasks and `## Needs`.
- `hooks/loop.ts` (pure): parses the state, progress and needs; judges the alerts; builds the text summary.
- `hooks/register.tsx`:
  - finds the loops and refreshes them on the band's timer
  - toasts each alert once
  - draws the `/loop-watch` command and the pane, with stop on a second press and resume
  - adds the band's `loop` chip and the `4: loop` hotkey
- `types/index.d.ts`: Loop types, plus 4 new state values.
- `plugin.json`: three threshold settings; version 0.2.0.
- **Tests:** 12 Loop Watch tests on a fixture shaped like the real Warden state. 44 total, all passing.
- **Fixes after the first live look** (`receipts/pane.png` is the final state):
  - Fixed column widths overflowed the roughly 30-column docked pane, so words wrapped mid-word. There are now three layouts: narrow (two lines per unit, under 60 columns), medium, and wide (status word, 90 columns and up).
  - STOPPED and PENDING units were drawn red: a missing color fell through to `error`. They now check the map with `in`.
  - The headless text said "1 sessions". Fixed the plural.
- **Live checks:**
  - Headless `/loop-watch` in `bws.game.tms` (`receipts/live-headless.txt`) prints the real Warden loop: STOPPED by Brian, 6 units, 3 done, 20 sessions, $160.16.
  - The first run was mangled by Git Bash path conversion; it needed `MSYS_NO_PATHCONV=1`.
  - An interactive session started as `claude "/loop-watch"` (no keyboard driving) drew the pane. The band showed `○ loop warden W2c stopped` and `4: loop`.

## Finish line

| # | Item | Status |
|---|---|---|
| 1 | Pane: header, unit rows, totals, needs plus the answer command, loop picker | ✅ tests + `receipts/pane.png` (the needs and picker appear in tests; the live loop was stopped and had none) |
| 2 | Alerts: dead driver, idle worker, sessions, paused, complete; toast once; thresholds in settings | ✅ tests |
| 3 | Band `loop` chip and `4: loop` | ✅ test + screenshot |
| 4 | Actions: resume, two-press stop, refresh; argv and cwd proven | ✅ tests. Not pressed against the real loops, by design |
| 5 | Text when there is no surface | ✅ `receipts/live-headless.txt` |
| 6 | Validate, tests, tsc, README, RUNLOG, commit | ✅ validate clean, 44/44, tsc strict clean |
| 7 | Interactive screenshot | ✅ `receipts/pane.png` |

## Not verified live
- A RUNNING or PAUSED loop: none was live today. That path is covered by tests on a fixture shaped like the real loop.
- Stop and resume against a real loop: deliberately not run.

## Follow-ups (parked)
- Answer needs from inside the pane (an Input that runs `harness.py answer`).
- Loops outside the session's folder.
