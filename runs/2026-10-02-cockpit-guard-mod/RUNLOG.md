# RUNLOG — bws-cockpit (Run Cockpit band + Editor & Device Guard)

## Objective
Build mods #1 and #2 from the usage review as one plugin, `bws-cockpit/`. The finish line is in [PLAN.md](PLAN.md). Brian answered "Fix" to the guard question, so the guard runs in fix mode: it blocks and rewrites ([DECISIONS.md](DECISIONS.md)). Mod #3 (Shell Lint) went to a parallel subagent, with its own folder and run folder.

## Actions
- Re-enabled `cc-plugin-agents-md@builtin` in `~/.claude/settings.json`. The backup is `settings.json.bak-2026-10-02-agentsmd`.
- Took the low-VRAM cvars and the Unity `-automated` rule from Brian's own transcripts and TMS's `Config/Harness/EditorLaunch.json`.
- Ran a UE 5.8 commandlet to check `-ini:Engine:[SystemSettings]:…` overrides. All 5 cvars read back as set (`receipts/ue-ini-override-check.txt`).
  - I chose `-ini:` over `-ExecCmds="…"` because it has no spaces or quotes.
- Wrote the plugin: `hooks/lib.ts` (pure parsing and classification), `hooks/register.tsx` (hooks), `types/index.d.ts` (state), and `tests/cockpit.test.ts` (26 tests).
- Bugs that tests caught and I fixed:
  - Segment scanning started inside a quoted exe path, so the flags landed after the redirect.
  - `/resume-run` called `prompt.submit` inside `command.run`, which the host refuses as a deadlock. It is now deferred with `clock.after`.
- Live headless checks (`claude -p --plugin-dir`) are in `receipts/live-guard.txt`:
  - adb with no device: blocked.
  - Duplicate TMS editor: blocked. TMS really was open, pid 59468.
  - `unity open`: rewritten to add `--args -automated`, with the note shown to the model.
  - UE GUI launch of StreetWar under pressure (Blender plus UE running): rewritten with the low-VRAM `-ini` overrides. The launch was wrapped in `echo`, so nothing actually started.
  - After Brian attached a device: adb was blocked because the device is `unauthorized`, which is correct behavior.
- Interactive band: opened a new Windows Terminal with `claude --plugin-dir ./bws-cockpit`. It stopped at the workspace-trust prompt, which waits on Brian.

## Review fixes (advisor pass)
- **MCP probe.** It now sends a JSON-RPC `ping` by POST instead of a GET, so an SSE GET can't hang it.
  - Checked live: the TMS editor on :3092 answers the POST with 200 and the GET with 405.
  - `list_toolsets` passes through the guard from `bws.game.tms` (`receipts/live-guard.txt`, run 4).
- **Classifiers were too broad.** They fired on mentions, and the replay over 8,277 real commands proved it:
  - 33 Unity "rewrites", mostly Get-CimInstance filters, heredoc bodies and `--help`.
  - 261 UE "launches".
- **Rewrote them as a command-position parser** (`hooks/shell.ts`). It works on segments outside quotes, comments, heredocs and here-strings, strips wrappers, and treats a quoted PowerShell string as a value unless it follows `&`.
  - Result: 3 Unity rewrites and 72 UE launches, all real (`receipts/corpus-replay.md`).
  - The live re-run shows `echo` passing untouched.
- **Insertion bug.** Flags appended after a `\` line continuation broke it. They now land before continuations and redirects.
- **Tests:** 29 (was 26), now covering every false-positive shape from the replay.

## Finish line status

| # | Item | Status |
|---|---|---|
| 1 | validate | ✅ `receipts/validate.txt` |
| 2 | tests | ✅ 29/29, `receipts/test.txt`; tsc strict is clean; corpus replay `receipts/corpus-replay.md` |
| 3 | band screenshot | ✅ `receipts/band.png`: live terminal session, run line, device row (UE 1 open, Blender open, adb 1 ready, VRAM 5.4/8.0 GB pressure), buttons |
| 4 | live guard | ✅ blocks (adb, duplicate editor), rewrites (UE low-VRAM, Unity -automated), pass-throughs (echo, unreal-mcp with the editor up), `receipts/live-guard.txt` |
| 5 | README | ✅ |
| 6 | RUNLOG + commit | ✅ |

## Close-out (2026-10-02)
- Brian trusted the folder. The band rendered live (`receipts/band.png`).
- Brian authorized the tablet. `adb shell echo hello-from-device` passed through the guard and returned the text (`receipts/live-guard.txt`, run 6).
- **Every finish-line item is done.**

## Follow-ups (parked, not part of this finish line)
- Decide whether to load both mods in every session through `CLAUDE_CODE_PLUGIN_DIRS`, or a local marketplace.
- Untested: a live unreal-mcp block with the port down, and the Desktop app.
- Re-inject the cockpit block after compaction (no clean route yet).
- Loop Watch pane and dev-server tracker (mods #5 and #7 of the review).
- Before any push: review or shrink `bws-shell-lint/tests/corpus-fixture.ts` (512 KB of real commands).

## Interop with bws-shell-lint (mod #3, built by a subagent, commit 6bc8c9f)
- Ran one headless session with both `--plugin-dir` flags (`receipts/live-both.txt`):
  - cockpit added `-automated` to a Unity launch
  - shell-lint denied `ls "C:\...\"` (dq-trailing-backslash) with its fix hint
  - `echo` passed through both
- No conflicts.

## Global load (2026-10-02)
- Added `CLAUDE_CODE_PLUGIN_DIRS` = `C:/Projects/bws.mods.claude-code/bws-cockpit;C:/Projects/bws.mods.claude-code/bws-shell-lint` to the `env` block of `~/.claude/settings.json`. Backup: `settings.json.bak-2026-10-02-plugindirs`; the diff against it is that one line.
- Verified from `C:/Projects/bws.game.tms` with no `--plugin-dir` flag (`receipts/plugin-dirs-check.txt`):
  - the init lists both mods
  - shell-lint denied a trailing-backslash `ls`, and the model's forward-slash retry ran
- Applies to new sessions only, including headless harness workers. Sessions already open need a restart.
