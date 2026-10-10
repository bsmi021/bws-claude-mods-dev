# RUNLOG: mods release, bws-cockpit 0.10.0 and bws-shell-lint 0.2.0

## Brief
Ship items 1–5 from `runs/2026-10-10-mods-review` as one release, with the finish line pinned in PLAN.md first.

## Done
- **Finish-Line ownership (T1):** a run folder counts only when this conversation's own tool calls write to it.
  - `writtenRunFolders` in `finish.ts` counts Edit/Write/NotebookEdit paths, and Bash/PowerShell commands that name the folder and write to it.
  - A matched `tool.call` observer records the folders in the `touched` state, keyed by `usage().startedAt`.
  - `readRunFolder(only)` picks the newest folder among the ones this session wrote. The mtime rule is gone.
- **Hand-backs (T2):** new `IMPERATIVE_ASK` phrases count: "tell me when/once/"…"", "when you say", "say go/yes/the word", "when you next ask", "once you answer/confirm…".
  - "Say if you want a different order" still blocks. That was the one useful block in the review.
  - Items marked `(proposed-task)`, and items that start with `<ownerName>:`, are parked.
- **T3:** `evidenceCheck` now defaults to false, in the manifest, the code and the README.
- **Guard (T4):** `findUeGuiLaunch` checks render settings across the whole command, not just the launch's args.
  - Settings it recognizes: `[SystemSettings]:`, `-ExecCmds`, `r.ScreenPercentage`, `t.MaxFPS`, `sg.*Quality`. A `$args` array therefore counts.
  - New `isRender` check: `-unattended`, `HighResShot`, `-RenderOffscreen`, MoviePipeline. Render runs skip the low-VRAM overrides.
  - A Python startup-script `-ini:` no longer counts as an override.
- **Shell Lint (T5):** the size is now length + 3×`'` + `"` + `\`, with the limit at 7800.
  - `replay_long.py` covered 73,857 Bash commands from every transcript. Results: `receipts/lint-replay.json` and `lint-replay.txt`.

    | Limit and metric | Long EOF failures caught | Commands that ran but would be refused |
    |---|---|---|
    | Old: 7850, len + 3×' | 142 of 154 | 4 of 73,470 |
    | New: 7800, adds `"` and `\` | 152 of 154 | 10 of 73,470 |

  - The Python reference `runs/2026-10-02-shell-lint-mod/lint.py` got the same metric. `regen_fixture.py` re-ran it over the fixture; one detail changed (c081: 8013 to 8016). Receipt: `receipts/fixture-regen.txt`.
- **Drop Repo Sessions (T6):** removed the pane, `/repo-sessions`, the poll, the msg button, delivery-notice tracking, the `peersPane` and `peersAutoOpen` options, and the peer state and types.
  - `peers.ts` keeps the registry parsing: records, `normPipe`, `repoKey`, `whereIn`, `parseTasklist`, `isAliveIn`, `livenessKey`. Its tests stay.
  - register.tsx: 1398 to about 1070 lines.
- **T7:** the run-folder note in `prompt.context` needs a surface, so `claude -p` and SDK sessions skip it. The home-folder project list stays.
- **T8:** the loop chip draws a `Link` to the board URL, and `/cockpit` prints `Loop: <name> <state> · board <url>`.
- **T9:** cockpit is 0.10.0 and shell-lint 0.2.0. Both READMEs are updated.

## Fixed along the way (all failed at HEAD on Claude Code 2.1.296; checked in a scratch worktree)
- `cockpit.test.ts` `/resume-run`: the bottom `prompt.submit` stub returned `{ isQueued }`. It now returns `{ text }`.
- `shell-lint register.test.ts`: the `ui.toast` stub returned `null`, which failed 8 tests. It now returns `{ value: undefined }`.
- shell-lint tsc:
  - The `./lint.ts` and `./corpus-fixture.ts` imports are now extensionless (TS5097), as bws-cockpit's are.
  - Seven `noUncheckedIndexedAccess` fixes in `lint.ts`, with `?? ''`.

## Checks (receipts/)

| Check | bws-cockpit | bws-shell-lint |
|---|---|---|
| `claude plugin validate` | passed (`validate-bws-cockpit.txt`) | passed (`validate-bws-shell-lint.txt`) |
| `claude plugin test` | 112/112, three runs in a row (`test-bws-cockpit.txt`) | 17/17 (`test-bws-shell-lint.txt`) |
| tsc 5.9.3, strict + noUncheckedIndexedAccess | clean (`tsc-bws-cockpit.txt`) | clean (`tsc-bws-shell-lint.txt`) |

## Live checks (headless, Claude Code 2.1.296, Haiku 5.5, scratch repo)
- `live-fl-worker.jsonl`: the session ran a script that appended to the run folder's RUNLOG, as a worker does. With 2 open items and a fresh mtime it was not blocked. The old rule would have blocked it.
- `live-fl-owned.jsonl`: the session appended to the RUNLOG with Edit and was blocked with both items named. Claude then made both files and ticked T1 and T2.
- `live-guard-args.jsonl` (`vramThresholdMb` 1): a `Start-Process -ArgumentList $a` with the overrides in `$a` ran. Without them it was refused.
- Not checked live:
  - the band's board link on a real terminal (covered by a test only)
  - the context gate (covered by a test only)

## Not done (parked)
Editor lease, the harness-template Monitor line, the Locator Glob path rewrite, and the publish-branch refresh.

## Next step
Brian decides whether to refresh the `publish` branch with 0.10.0 / 0.2.0 and push it to `mods`.
