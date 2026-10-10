# PLAN: mods release (items 1–5 from runs/2026-10-10-mods-review)

## Finish line
bws-cockpit 0.10.0 and bws-shell-lint 0.2.0 ship the five changes below. For each plugin, `claude plugin validate`, `claude plugin test` and tsc (strict, noUncheckedIndexedAccess) pass. The lint replay over the corpus is recorded in `receipts/`, and everything is committed on main (not pushed, publish branch untouched).

Out of scope (park as follow-ups): Editor lease, the harness-template Monitor line, the Locator Glob path rewrite, and refreshing the publish branch.

## Tasks
- [x] T1 Finish-Line ownership: a run folder counts only if this session's own Edit/Write/NotebookEdit/Bash/PowerShell input named it (tracked per session from tool.call), not by mtime. Tests: a worker-written folder doesn't block; a session-written one does.
- [x] T2 Imperative hand-backs ("tell me when/once", "say go", "say the word", "when you next ask") count as hand-backs. "Say if you want a different order" still blocks. Items that start with `<owner>:` or `(proposed-task)` are parked. Tests.
- [x] T3 `evidenceCheck` defaults to false (manifest, code, README).
- [x] T4 Guard low-VRAM: a launch passes when the override cvars are already in the command text (including `$args` arrays). Render runs (`-unattended` or `HighResShot`) are exempt, as is an explicit `r.ScreenPercentage`. Tests.
- [x] T5 Shell Lint metric: length + 3×' + " + \ with a limit of 7800. Corpus replay before and after in receipts. Tests updated.
- [x] T6 Drop Repo Sessions: the pane, `/repo-sessions`, the poll, the msg button, notice tracking and the options. Keep the registry parsing in `peers.ts` (with its tests); drop pane-only helpers that nothing else uses.
- [x] T7 First-message run-folder context is off in `claude -p` / SDK sessions (no surfaces); the home-folder project list stays, as that is the Project Locator's guard against Glob timeouts. Tests.
- [x] T8 The loop chip carries the board URL. Tests.
- [x] T9 Version bumps and README updates (cockpit and shell-lint).
- [x] T10 Three checks pass for both plugins; receipts saved; commit.
