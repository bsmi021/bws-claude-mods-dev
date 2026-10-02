# bws-cockpit

A Claude Code mod. It puts the active run and live editor/device state above the prompt, and guards calls to Unreal, Unity and adb.

Built from a 30-day usage review (`runs/2026-10-02-usage-analysis`) that found:
- 94 resume prompts and 47 "where are we" prompts
- 95 unreal-mcp failures
- 42 Unity pipeline timeouts
- about 35 device handshakes
- repeated reminders about `-automated` and low-VRAM launches

## What it does

### Run Cockpit
- **Band above the prompt** (terminal and Desktop):
  - Row 1: newest `runs/<folder>` in the session's folder, its open items (`- [ ]` in PLAN.md and TASKS.md), and the next step from RUNLOG.md.
  - Row 2: UE editors and the unreal-mcp port, Unity, Blender, adb devices, and VRAM used/total (`(pressure)` when the low-VRAM rule would apply).
  - Row 3: the last thing the guard did.
  - Buttons: `1` Resume run, `2` Refresh, `3` Hide.
  - Refreshes every `refreshSeconds` and after each turn.
- **`/resume-run`** queues a prompt that resumes the newest run folder: it reads RUNLOG/PLAN/TASKS, restates the finish line and the next step, checks the receipts, then continues.
- **`/cockpit`** gives the same status as text, for sessions where nothing draws.
- **First-message context.** Every new conversation gets one short block naming the newest run folder, its next step and its open count, with a note to confirm before resuming it. This also works headless.

### Loop Watch (harness loops)
- **`/loop-watch`** opens a pane for this project's harness loop. It reads `Tools/<name>/loop.json`, then `<harnessDir>/state.json` and each unit's `TASKS.md`, and shows:
  - the driver status and how long ago it updated
  - the board link
  - one row per unit: the current-unit marker, status, sessions, cost and task progress, plus the running worker's last tool and its age
  - totals, and the driver's message
  - open needs, each with the exact `harness.py answer` command
  - a picker when the project has more than one loop
- **Layout:** in a narrow docked sidebar each unit takes two lines (name, then dim numbers). At 60 columns and up it's one line, and at 90 and up the status word is added.
- **Alerts:** each one toasts once and lights the band's `loop` chip:
  - the driver says RUNNING but its 30 s heartbeat has stopped for 3 min or more ("looks dead")
  - the running worker has made no tool call for 20 min or more
  - the current unit is on 6 or more sessions
  - the loop has paused for you
  - every unit is done
  - Thresholds are in `/config`. Loops whose state is more than a day old don't toast.
- **Actions:**
  - `r` resume runs `harness.py start --resume`
  - `s` stop runs `harness.py stop`, only on a second press within 10 s
  - `g` refreshes
  - The result of each action shows in the pane.
- **Band:** a `loop` chip (running, needs you, stalled, stopped) and the hotkey `4: loop`, which opens the pane.
- **Without a pane** (headless `claude -p "/loop-watch"`), the same summary comes back as text.

### Editor & Device Guard
Fix mode: it blocks calls that cannot work and adds missing launch flags. It never approves anything.

| Trigger | Action |
|---|---|
| `mcp__unreal*__*` call when the project's unreal-mcp URL (`.mcp.json`) does not answer | **Block**, saying whether the editor is closed or still loading |
| `adb <cmd>` that needs a device, with no device in `device` state | **Block** (lists unauthorized/offline devices). `devices`, `start-server`, `connect` and similar always pass |
| `unity … command …` (Unity CLI pipeline) with no Unity editor running | **Block** with the launch line to use |
| `unity open …` or `Unity.exe … -projectPath` without `-automated` | **Rewrite**: adds `-automated` (or `--args -automated`) |
| `Start-Process` Unity launch without `-automated` | **Block** with the argument to add (argument lists are not rewritten) |
| GUI `UnrealEditor.exe` launch of a `.uproject` that is already open | **Block** with the running pid |
| GUI `UnrealEditor.exe` launch under GPU pressure (another UE editor, Blender, or VRAM ≥ threshold) | **Rewrite**: appends `-ini:Engine:[SystemSettings]:t.MaxFPS=30,…` low-VRAM overrides. A `Start-Process` form is **blocked** with the exact argument instead |

Notes on the guard:
- Every rewrite adds a note the model reads after the tool result, so it is never silent. A toast tells you as well.
- Commandlets (`UnrealEditor-Cmd`, `-run=`, `-nullrhi`, `-game`) are never touched.
- The low-VRAM set comes from your earlier TMS sessions (`Config/Harness/EditorLaunch.json` `lowPerfExecCmds`).
- It uses `-ini:` overrides instead of `-ExecCmds="…"` because the override form has no spaces or quotes, so Git Bash and PowerShell pass it through intact. Verified with a UE 5.8 commandlet, which read back MaxFPS 30, ScreenPercentage 50, PoolSize 768, Shadow 0 and Texture 1 (`runs/2026-10-02-cockpit-guard-mod/receipts/ue-ini-override-check.txt`).

## Load it

```bash
# one session
claude --plugin-dir C:\Projects\bws.mods.claude-code\bws-cockpit
```

To load it in every session, add the path to `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json`. Or add this repo as a directory marketplace and install it.

The workspace must be trusted.

## Configure

Run `/config`, or set `pluginConfigs["bws-cockpit"].options` in settings:

| Field | Default | Meaning |
|---|---|---|
| `guard` | `true` | Turn the whole guard off |
| `lowVramMode` | `auto` | `auto` (on pressure), `always`, `off` |
| `vramThresholdMb` | `4096` | VRAM in use that counts as pressure |
| `lowVramCvars` | (built-in set) | Comma-separated `cvar=value` list |
| `adbPath` | `adb` | adb executable |
| `refreshSeconds` | `30` | Band re-probe interval |
| `loopIdleMinutes` | `20` | Alert when the running worker has made no tool call for this long |
| `loopSessionAlert` | `6` | Alert when the current unit reaches this many sessions |
| `loopDriverStaleMinutes` | `3` | Alert when a RUNNING driver's heartbeat stops |

## Capabilities it uses

| Category | What it uses |
|---|---|
| Hooks | `session.start`, `turn.complete`, `prompt.context`, `command.run` (cockpit, resume-run), `ui.render` (AbovePrompt), `tool.call` (unreal MCP tools; Bash/PowerShell commands mentioning adb, unity or UnrealEditor.exe) |
| Processes | `powershell` (Get-CimInstance for UnrealEditor/Unity/blender), `nvidia-smi`, `adb devices` |
| Network | GET to the project's unreal-mcp URL (localhost) |
| Files | reads `runs/*/RUNLOG.md`, `PLAN.md`, `TASKS.md` and `.mcp.json` |
| Prompts | `$.prompt.submit` for resume |

It writes no files.

## Tested

Claude Code 2.1.287, Windows 11, Git Bash + PowerShell 7.6.

| Check | Result | Receipt |
|---|---|---|
| `claude plugin validate` | passed | `receipts/validate.txt` |
| `claude plugin test` | 44/44 (parsing, command-position rules, every guard path, pass-through, band layout on terminal + desktop, Loop Watch parsing, alerts, pane layouts, stop confirm, resume, toasts, picker) | `receipts/test.txt` |
| Loop Watch live | headless `/loop-watch` in bws.game.tms printed the real Warden loop; the pane drew in an interactive session, docked at about 30 columns | `runs/2026-10-02-loop-watch/receipts/` |
| Type-check vs the 2.1.287 declarations (tsc 5.9, strict) | clean | n/a |
| Corpus replay: classifiers over 8,277 real Bash/PowerShell commands from 30 days | Unity rewrites: 3, all real launches. UE GUI launches: 72, all real. Mentions in echo, Get-CimInstance filters, heredocs, comments and `$x = '...exe'` assignments are ignored | `receipts/corpus-replay.md` |
| Live headless (`claude -p --plugin-dir`) | `echo` naming the exes passes untouched; a UE launch under GPU pressure gets the `-ini` overrides; a `Unity.exe -projectPath` launch gets `-automated` (both exes at nonexistent paths, so nothing started); adb blocked for an unauthorized device; a duplicate TMS editor blocked (pid 59468); `mcp__unreal-mcp__list_toolsets` passes against the live TMS editor on :3092 | `receipts/live-guard.txt` |
| Interactive terminal band | drawn live with the run line, device row (UE, Unity, Blender, adb, VRAM with pressure) and buttons | `receipts/band.png` |
| adb pass-through | with the tablet authorized, `adb shell echo` runs untouched | `receipts/live-guard.txt` (run 6) |

Only commands where the tool is in command position trigger the guard. That is the first word of a segment, after `VAR=` prefixes, `timeout N`, `nohup`, `&`, `$x =` or `Start-Process -FilePath`. Anything quoted, commented, inside a heredoc or here-string, or mentioned by `echo` or `grep` is ignored.

Untested:
- the Desktop app
- a live unreal-mcp block (port down)
