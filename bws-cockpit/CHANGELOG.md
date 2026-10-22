# Changelog

## 0.26.0
- A `◧ cockpit` button in the footer under the prompt (terminal and Desktop): opens or closes the dashboard and brings back a hidden bar. It shares the footer with other mods' buttons and the engine's mode labels.

## 0.25.0
- Lists bws-summary among the mod tabs: a Summary tab with the rolling conversation summary and Older / Newer / Latest / Refresh. If you set `modSummaries` yourself, add `bws-summary` to it.

## 0.24.0
- Finish-Line Guard: RUNLOG header check. A stop is blocked while a `RUNLOG.md` this session wrote has no `Status:`, `Finish line:`, `Next step:` or `Open:` line in its first 20 lines. New option `finishLineRunlogHeader` (on).
- The run band reads a `Finish line:` header line as the finish line.

## 0.23.0
- Lists bws-direction among the mod tabs: a Direction tab with the last drift verdict, the session and project trends, and Tell Claude / Check now / Whole project buttons. If you set `modSummaries` yourself, add `bws-direction` to it.

## 0.22.0
- The Shelf tab draws each idea as a bordered card: who shelved it (🤖 Claude, 🙋 you), its number and age, the idea, the first line of its detail, and Resume / Done / Drop buttons.
- All projects groups the cards under one 📁 header per project, this project first, at most four per project with a "more" line.

## 0.21.2
- No behaviour change. Ships the 1.7.0 README, this CHANGELOG and the full manifest (author, homepage,
  repository, license, keywords) to installed copies: `claude plugin update` keeps files by version.

## 0.21.1
- The Enhance and Side chat tabs keep the keyboard: the cockpit opens the dashboard on them itself, so it can move the focus ring and scroll the pane.

## 0.21.0
- Every loaded mod gets its own dashboard tab after the built-in ones. The bar's per-mod chips are gone.
- A mod's tab shows text, buttons, an input, a picture or cards; presses and typed input go back to the mod.
- Tabs for bws-skillgate, bws-notify, bws-shell-lint and bws-secrets arrive with this version; `1` to `9` reach the first nine tabs.
- Checked live in a 170-column terminal with every mod loaded.

## 0.20.0
- The action bar is three rows: status, signals, and actions grouped as `do`, `open` and hide.
- Chips read `N assumptions` and `N ideas`; the run name is longer.

## 0.19.0
- Finish-Line Guard: RUNLOG check. A stop is blocked while a run folder this session wrote has no `RUNLOG.md` (harness report folders are exempt). New option `finishLineRunlog`.

## 0.18.1
- The withdrawn-ask glyph is double width, so the card header lines up.

## 0.18.0
- The Board tab draws sessions and asks as bordered cards with status emoji (needs bws-board 0.6.0 or later; older versions print text lines).
- Checked live in Windows Terminal.

## 0.17.2
- `bws-better` is a known mod for the `modSummaries` option and its default.

## 0.17.1
- Merges 0.15.1 (below) into the 0.17 line.

## 0.17.0
- Cache clock: a `cache 42m` chip on the bar counts down the main thread's prompt cache, warns under `cacheLowMinutes`, and reads `cache cold` after the window.
- Auto handoff: when the cache runs low while idle, `HANDOFF.md` is written once for that window. Options `cacheTtlMinutes`, `cacheLowMinutes`, `autoHandoff`.
- `/cacheclock [status]` prints the time left, state and last auto handoff.

## 0.16.0
- Mods can publish a summary that appears on the bar as a chip. New option `modSummaries`.

## 0.15.1
- `/cockpit show` and `/cockpit hide` bring the bar back or hide it; the hide button toasts the way back.
- New option `dashboardOnStart`.

## 0.15.0
- Dashboard pane with Assumptions, Shelf, Board and Loop tabs, and a slimmer one-row bar with hotkeys.
- Folds in `bws-assumptions` and `bws-shelf`: their tools, commands and state live here, and those plugins are retired.
- News (a new assumption, an ask for this session, a loop alert) brings its tab up while you are not using the pane.
- Checked live in a 170-column terminal.

## 0.14.0
- The Session Bus moves to bws-board (`bus_*` tools and the `sessionBus` and `busClaimMinutes` options are gone; set `claimMinutes` on bws-board).
- A board chip appears on the bar when bws-board is loaded.

## 0.13.0
- Session Bus refuses shell writes to claimed files.

## 0.12.0
- Session Bus: peers, file claims and messages between sessions in one folder.

## 0.11.0
- The bar becomes three bordered tiles (run, devices, loop), and a borderless grid in narrow terminals.

## 0.10.2
- `/handoff` writes into the session's own run folder, never one a loop worker freshened.

## 0.10.1
- The bar shares the slot above the prompt with another mod's band instead of hiding it.

## 0.10.0
- Finish-Line Guard: a run folder counts as the session's only if its own tool calls wrote to it; hand-backs such as "tell me when" or "say go" are recognised; `(proposed-task)` items and items addressed to `ownerName` never hold a stop open.
- The evidence check is off by default (option `evidenceCheck`).
- No run-folder context for `claude -p` and SDK sessions; the board URL appears in the loop chip and `/cockpit`.
- Low-VRAM flags pass through when a launch already sets them in a `$args` array, for render runs, and with an explicit screen percentage.
- New option `backgroundProbe` to stop timed, per-turn and session-start probes.
- The Repo Sessions pane is removed.

## 0.9.0
- Repo Sessions: a message shows held, approved, denied or expired.

## 0.8.0
- Repo Sessions: a message button on each peer row.

## 0.7.0
- Repo Sessions shows each peer's latest prompt and lists sessions in other repositories.

## 0.6.0
- Repo Sessions pane (`/repo-sessions`) lists other Claude Code sessions in the repository.

## 0.5.0
- `/handoff` writes `HANDOFF.md` for a fresh agent.
- Worker model pin: subagents run on a chosen model when the Agent call names none (`workerModel`, `workerAgentTypes`).

## 0.4.0
- Project Locator: `find_project`, `/projects`, Globs for `.uproject` and `ProjectVersion.txt` answered from an index, and a project list in home-folder sessions.
- New option `ownerName` (default `the user`) replaces a hard-coded name in the Finish-Line Guard.

## 0.3.0
- Finish-Line Guard: keeps Claude from stopping while the session's PLAN.md or TASKS.md has open items.

## 0.2.0
- Loop Watch pane for harness loops: units, sessions, cost, stalls and needs, with answers typed in the pane.

## 0.1.0
- Run Cockpit bar and Editor & Device Guard (Unreal, Unity, adb): blocks calls that cannot work and adds `-automated` and low-VRAM launch flags.
