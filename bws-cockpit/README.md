# bws-cockpit

A Claude Code mod. It puts the active run and live editor/device state above the prompt, and guards calls to Unreal, Unity and adb.

Built from a 30-day review of one developer's Claude Code sessions across Unreal, Unity, web and Android work, which found:
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
  - Shares the slot: the band above the prompt holds one tree, so when another mod draws a band there too, bws-cockpit draws it under its own rows (by the prompt) instead of hiding it. Hidden (`3`), or while a survey shows, it hands the whole slot on. Both bands' digit hotkeys stay live, so two mods that bind the same digit will clash.
- **`/resume-run`** queues a prompt that resumes the newest run folder: it reads RUNLOG/PLAN/TASKS, restates the finish line and the next step, checks the receipts, then continues.
- **`/cockpit`** gives the same status as text, for sessions where nothing draws.
- **First-message context.** Every new interactive conversation gets one short block naming the newest run folder, its next step and its open count, with a note to confirm before resuming it. `claude -p` and SDK sessions (no surface) skip it: harness workers get their run folder in their prompt.

### Loop Watch (harness loops)
- **`/loop-watch`** opens a pane for this project's harness loop. It reads `Tools/<name>/loop.json`, then `<harnessDir>/state.json` and each unit's `TASKS.md`, and shows:
  - the driver status and how long ago it updated
  - the board link
  - one row per unit: the current-unit marker, status, sessions, cost and task progress, plus the running worker's last tool and its age
  - totals, and the driver's message
  - open needs, each with an input box: type your answer and press Enter. That runs `python <harness.py> answer <unit> <N> <your text>` in the repo root and refreshes the pane. The text goes as a single argument with no shell, so quotes and `&` pass as typed. An empty answer is refused.
  - needs already answered in the unit's `ANSWERS.md` show `answered: ...` instead of the box. Once every open need is answered, the pane says `all needs answered · r resumes the loop`. `harness.py answer` records the answer but does not resume the loop.
  - on a surface without input boxes (mobile), and in the headless text, the exact `answer` command is shown instead
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
- **Band:** a `loop` chip (running, needs you, stalled, stopped) with the board link beside it, and the hotkey `4: loop`, which opens the pane. `/cockpit` prints the loop and its board URL too.
- **Without a pane** (headless `claude -p "/loop-watch"`), the same summary comes back as text.

### Finish-Line Guard
Keeps Claude from stopping while this session's checklist still has work. This session's run folder is the newest `runs/*` that this conversation's own tool calls wrote to: an Edit, Write or NotebookEdit inside it, or a Bash/PowerShell command that names it and writes (a redirect, `tee`, `sed -i`, `mkdir`, `cp`/`mv`, `Set-Content` and the like). A folder a harness worker writes while this session supervises the loop never counts, and neither does reading a worker's checklist.
- **Open items.** When Claude tries to end its turn and PLAN.md or TASKS.md still has `- [ ]` items, the stop is blocked and Claude is told which items remain (up to 5). It is also told how to hand back properly: say so plainly, and mark the item `(blocked: …)` or `(needs <ownerName>: …)`.
- **Items that never hold it open:** items marked blocked, waiting on, needs the user/you, parked, deferred, follow-up, later or out of scope; harness proposals marked `(proposed-task)`; and items addressed to you, starting with `<ownerName>:`.
- **Never blocked:**
  - a reply that hands back: it ends with a question, or says "your call", "want me to", "should I" or "let me know", or asks you to act: "tell me when…", "say go", "when you say…", "when you next ask". An offer such as "say if you want a different order" is not a hand-back
  - a turn with background tasks or scheduled wake-ups pending
- **Evidence check (off by default).** With `evidenceCheck` on, when nothing is open but the reply claims "done", "complete", "all tests pass", ✅ and so on without citing evidence, the stop is blocked once. Evidence is test counts, receipt or log paths, "exit 0", a commit hash or a URL. Off since 0.10.0: in a week of sessions all 13 of its blocks hit status replies ("holding for master", "nothing committed yet").
- **Bounded.** At most `finishLineMaxContinues` blocks (default 2) per prompt you send, so it can never loop.
- **Visible.** When a turn ends with open items anyway, a line under the answer shows `⚑ finish line: N open · …`.
- **Headless is off by default**, so harness workers keep their own budgets. `finishLineHeadless` turns it on.

### Project Locator
Stops Claude from searching the whole disk for a project. A Glob over a big projects folder or a home folder times out after 20 s, and a 30-day review counted 351 of them.
- **Index.** Scans the folders in `projectRoots` (default `C:/Projects`), 3 folders deep. It skips node_modules, .git, Content, Library, Intermediate, Saved, DerivedDataCache, Binaries, runs, Plugins, Assets, Packages, Temp, obj, build, Source and dot-folders.
  - Each project records its kinds (unreal, unity, node, android, python, git), its `.uproject`, the Unity editor version, the package name, any harness loops (`Tools/*/loop.json`), whether it has `runs/` and AGENTS.md/CLAUDE.md, and when it was last active.
  - The index is kept for 6 hours and shared by all sessions.
- **`find_project` tool** (`mcp__bws-cockpit__find_project`, input `{ query?, kind? }`) returns matching projects with their paths and facts, newest first.
- **Globs answered from the index.** A Glob for `*.uproject` or `ProjectSettings/ProjectVersion.txt` under a projects root comes back at once, in Glob's own result form, with a note saying so. The same Glob over a home folder or a drive root is refused with a hint, instead of running into the timeout. Every other Glob and Grep runs as usual.
- **Project list for home-folder sessions.** A session started in a home folder or a projects root gets the 40 newest projects in its first message.
- **`/projects`** lists them; `/projects refresh` rebuilds the index.

### /handoff
- **`/handoff [focus]`** writes a handoff for a fresh agent into this session's run folder as `HANDOFF.md`: the newest run folder this conversation's own tool calls wrote to, the same one the Finish-Line Guard holds it to. A folder a harness worker writes while this session supervises the loop never counts. With none, it goes in a new `runs/<date>-handoff/`.
  - It's written by the session's own model from this conversation (`$.model.fork`, served from the prompt cache).
  - Sections: objective, finish line, what's done with receipts, the next step, open items, key files and commands, decisions and constraints, traps.
  - Optional focus text steers it.
  - An existing HANDOFF.md is kept as `HANDOFF.<yyyymmdd-hhmm>.md`.
- **Resumed sessions:** in a resumed session, before its first request there is nothing to fork, so the handoff is built from the transcript rows instead.
- **Start prompt:** the reply shows a short start prompt for the next session, and puts it on the clipboard where there is one.

### Worker model pin
- **`workerModel`** (e.g. `claude-sonnet-5-5`): subagents of the types in `workerAgentTypes` (default `general-purpose,claude`) run on it whenever the Agent call names no model.
- **Left alone:** an explicit `model` in the call still wins, for the complex task. Forks always inherit, and other types (Explore, Plan, plugin agents with their own model) are not touched.
- **Off by default.** A toast names the model on each pinned spawn.

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
| GUI `UnrealEditor.exe` launch under GPU pressure (another UE editor, Blender, or VRAM ≥ threshold) | **Rewrite**: appends `-ini:Engine:[SystemSettings]:t.MaxFPS=30,…` low-VRAM overrides. A `Start-Process` form is **blocked** with the exact argument instead. Passes untouched when the command already sets render settings anywhere (`[SystemSettings]:`, `-ExecCmds`, `r.ScreenPercentage`, `t.MaxFPS`, `sg.*Quality`), including inside a `$args = @(…)` array passed as `-ArgumentList $args`, and for render runs (`-unattended`, `HighResShot`, `-RenderOffscreen`, Movie Render Queue) |

Notes on the guard:
- Every rewrite adds a note the model reads after the tool result, so it is never silent. A toast tells you as well.
- Commandlets (`UnrealEditor-Cmd`, `-run=`, `-nullrhi`, `-game`) are never touched.
- The built-in low-VRAM set caps the frame rate at 30, halves the screen percentage, shrinks the texture pool to 768 MB and drops the scalability groups to low. Replace it with `lowVramCvars`.
- It uses `-ini:` overrides instead of `-ExecCmds="…"` because the override form has no spaces or quotes, so Git Bash and PowerShell pass it through intact. Verified with a UE 5.8 commandlet, which read back MaxFPS 30, ScreenPercentage 50, PoolSize 768, Shadow 0 and Texture 1.

## Load it

```bash
# one session
claude --plugin-dir path/to/bws-cockpit
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
| `backgroundProbe` | `true` | Off stops the timed, per-turn and session-start probes (they start powershell, nvidia-smi and adb, which can flash a console window on Windows). `/cockpit`, the refresh button and the guard still probe on demand |
| `loopIdleMinutes` | `20` | Alert when the running worker has made no tool call for this long |
| `loopSessionAlert` | `6` | Alert when the current unit reaches this many sessions |
| `loopDriverStaleMinutes` | `3` | Alert when a RUNNING driver's heartbeat stops |
| `finishLine` | `true` | The Finish-Line Guard |
| `finishLineMaxContinues` | `2` | Stops the guard may block per prompt you send |
| `evidenceCheck` | `false` | Block once when a done claim cites no evidence |
| `finishLineHeadless` | `false` | Also guard `claude -p` and SDK sessions |
| `ownerName` | `the user` | What the guard calls you when it asks Claude to mark an item that needs you |
| `projectLocator` | `true` | The Project Locator |
| `projectRoots` | `C:/Projects` | Folders that hold your projects, separated by `;` |
| `workerModel` | (empty: off) | Model for subagents whose Agent call names none |
| `workerAgentTypes` | `general-purpose,claude` | Subagent types the worker model applies to |

## Capabilities it uses

| Category | What it uses |
|---|---|
| Hooks | `session.start`, `turn.complete`, `prompt.submit`, `classic.Stop`, `prompt.context`, `command.run` (cockpit, resume-run, loop-watch, projects, handoff), `agent.spawn`, `tool.call` (`Glob`, the plugin's own `find_project`; Edit/Write/NotebookEdit/Bash/PowerShell, observe only, to see which run folders the session writes), `ui.render` (AbovePrompt, the loop-watch Pane), `tool.call` (unreal MCP tools; Bash/PowerShell commands mentioning adb, unity or UnrealEditor.exe) |
| Processes | `powershell` (Get-CimInstance for UnrealEditor/Unity/blender), `nvidia-smi`, `adb devices`. Only when you press or type them in the Loop Watch pane: `python <harness.py> start --resume`, `stop` and `answer` |
| Network | a JSON-RPC `ping` POST to the project's unreal-mcp URL (localhost) |
| Files | lists the folders under `projectRoots` (3 deep) and reads `.uproject` markers, ProjectVersion.txt and package.json; reads `runs/*/RUNLOG.md`, `PLAN.md`, `TASKS.md`, `.mcp.json`, `Tools/*/loop.json`, the loop's `state.json`, and each unit's `TASKS.md` and `ANSWERS.md` |
| Prompts | `$.prompt.submit` for resume |
| Models | `$.model.fork` (or `$.model.complete` on a resumed session) for /handoff, on the session's own model |
| Store | `$.store` key `bws-cockpit.projectIndex` (the project index) |
| Tools | registers `find_project` |

It writes no files.

## Tested

Claude Code 2.1.287 through 2.1.296 (0.10.0), Windows 11, Git Bash + PowerShell 7.6.

| Check | Result |
|---|---|
| `claude plugin validate` | passed |
| `claude plugin test` (0.10.2, Claude Code 2.1.296) | 117/117. 0.10.2: /handoff picks its folder from the session's own writes (a worker-freshened folder is ignored; found with finishLine off too). 0.10.1 adds the shared band slot (another mod's band drawn under ours on terminal and desktop, the whole slot handed on when hidden, nothing added when no other band draws). 0.10.0 (112/112, three runs in a row) added: run-folder ownership (a worker-written folder and a read of its checklist claim nothing; a shell write claims it; a new conversation forgets), imperative hand-backs from real replies ("tell me when", "say go", "when you next ask"; "say if you want" still blocks), `(proposed-task)` and `<ownerName>:` items parked, the evidence check off by default and on by option, the run-folder context skipped with no surface, the board URL in the loop chip and `/cockpit`, and the low-VRAM pass-through for overrides in a `$args` array, render runs, an explicit screen percentage, and a startup-script `-ini` that is not an override. The Repo Sessions tests went with the pane; the registry parsing kept in `peers.ts` is still tested. Earlier: parsing, command-position rules, every guard path, pass-through, band layout on terminal and desktop, Loop Watch, /handoff, the worker model pin, the Project Locator and the Finish-Line Guard |
| Finish-Line Guard live (`claude -p`, `finishLineHeadless` on) | Claude ticked one of two tasks and tried to stop. The guard blocked it with the open item named, and Claude did the second task. In a run told to skip the second task, Claude instead marked it `(needs …)` and the guard let it stop. 0.10.0 (2.1.296, Haiku 5.5, scratch repo with two open items): a session that ran a script which appended to the run folder's RUNLOG (as a harness worker does) was not blocked; a session that appended to the RUNLOG with Edit was blocked with both items named, then did both and ticked them |
| Type-check against the 2.1.296 declarations (tsc 5.9.3, strict, noUncheckedIndexedAccess) | clean |
| Corpus replay: the guard's classifiers over 8,277 real Bash/PowerShell commands from 30 days | Unity rewrites: 3, all real launches. UE GUI launches: 72, all real. Mentions in `echo`, Get-CimInstance filters, heredocs, comments and `$x = '...exe'` assignments are ignored |
| Live headless (`claude -p --plugin-dir`) | `echo` naming the exes passes untouched. A UE launch under GPU pressure gets the `-ini` overrides, and a `Unity.exe -projectPath` launch gets `-automated` (both exes at nonexistent paths, so nothing started). adb is blocked for an unauthorized device and passes once it's authorized. A second editor for an open `.uproject` is blocked. An unreal-mcp call passes against a live editor |
| Loop Watch live | headless `/loop-watch` printed a real loop; the pane drew in an interactive session docked at about 30 columns |
| Project Locator live | `/projects refresh` from the home folder indexed 65 real projects (9 s including startup). A Glob for `**/*.uproject` over `C:\Projects` came back from the index in 4 ms with the 7 real `.uproject` files. The same Glob over the home folder was refused at once. `find_project` by name returned the folder, `.uproject` and harness loop |
| /handoff live | After a headless task in a scratch repo, `claude -p --continue "/handoff"` wrote a 467-word HANDOFF.md through the resumed-session fallback, with the correct commit hash and next step |
| Worker pin live | A parent on claude-opus-5-5 spawned three subagents: general-purpose with no model ran on claude-sonnet-5-5 (toast shown), Explore kept claude-opus-5-5, and an explicit `haiku` stayed on Haiku |
| Guard pass-through live (0.10.0, `vramThresholdMb` 1 to force pressure) | A `Start-Process … -ArgumentList $a` whose `$a` array carried the `-ini` overrides ran (nonexistent path, so PowerShell said the file was missing); the same launch without them was refused with the argument to add |
| Repo Sessions live (2.1.288, removed in 0.10.0) | headless `claude -p "/repo-sessions"` in this repo listed the other live session here with its latest prompt (read from the tail of a real 5 MB history.jsonl), and the 5 sessions in other repos under their repo names. The docked pane was checked by eye in fullscreen. A `$.session.send({ to: { sessionId } })` from a scratch probe mod to a live peer returned `isDelivered: true`; the peer received the text as a cross-session message and replied. From the pane, a message to a default-mode session showed `◆ held`, then `✓ approved and delivered` once its person approved it |
| Interactive terminal band | drawn live with the run line, the device row and the hotkeys |

Only commands where the tool is in command position trigger the guard. That is the first word of a segment, after `VAR=` prefixes, `timeout N`, `nohup`, `&`, `$x =` or `Start-Process -FilePath`. Anything quoted, commented, inside a heredoc or here-string, or mentioned by `echo` or `grep` is ignored.

Untested:
- the Desktop app
- a live unreal-mcp block (port down)
- a live running or paused loop (tests cover it)
