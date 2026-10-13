# bws-cockpit

A Claude Code mod. It puts a dashboard pane beside the transcript (Assumptions, Shelf, Board and Loop tabs), a one-row action bar above the prompt with the active run and live editor/device state, and guards calls to Unreal, Unity and adb.

0.15.0 folds in what were two separate mods, bws-assumptions and bws-shelf: their tools, commands and state now live here, and those plugins are retired.

Built from a 30-day review of one developer's Claude Code sessions across Unreal, Unity, web and Android work, which found:
- 94 resume prompts and 47 "where are we" prompts
- 95 unreal-mcp failures
- 42 Unity pipeline timeouts
- about 35 device handshakes
- repeated reminders about `-automated` and low-VRAM launches

## What it does

### Dashboard
- **One pane, `Dashboard`**, docked right of the transcript in fullscreen from 110 columns, else inline above the prompt. Its own tab strip:
  - `Assumptions` (count: unsent), `Shelf` (count: this project's open ideas), `Board` (count: asks waiting on this session), and `Loop` while a harness loop is live or you picked it with `/loop-watch`.
  - The picked tab is drawn as the primary button. With the pane focused, `1`–`4` switch tabs; each tab keeps its own keys.
  - With nothing picked, it shows the first tab with something waiting.
- **Opening it:** `/dashboard [assumptions|shelf|board|loop]`, `/assumptions`, `/shelf [all]`, `/loop-watch`, `/board pane` (bws-board), or the bar. Opened over an empty prompt box it takes the keys; `Esc` hands them back, the pane stays.
- **Proactive:** news for you brings its tab up:
  - Claude records an assumption → Assumptions.
  - An ask addressed to this session appears on bws-board → Board (cockpit watches bws-board's `summary` writes, so it comes at once).
  - A loop alert (needs you, stalled, driver dead, all done) → Loop, on that loop.
  - Session start with unsent assumptions or open ideas for the project → the dashboard opens on that tab. Not after `/clear`, `/resume` or `/branch` (no `session.start` there).
  - The dashboard is opened if closed, or switched to the tab if open, but only while you are not using it (pane not focused); then only the tab count changes. Opened without being asked, a pane is placed only from 144 terminal columns (110 for one you opened before).
  - Closed by you (its mark, `ctrl+x x`, or `2` on the bar), it stays closed for news; the bar's chips still count. Any asked open clears that.
- **Headless:** `claude -p "/dashboard"` prints every tab as text.

### Action bar (above the prompt, terminal and Desktop)
- One row that wraps when narrow:
  - **Chips:** the run folder name with its open count (`- [ ]` in PLAN.md and TASKS.md), devices that are up or in trouble (UE and its unreal-mcp port, Unity, Blender, adb, VRAM used/total, warning on `pressure`), the loop state while a loop is live, the cache clock (`cache 42m`, see Cache clock), the bws-board chip (`board 3 · 2 open · 1 for you`, hidden when alone with nothing open or when bws-board is not loaded), `⚑ N` unsent assumptions (warning while any are unreviewed), `💡 N` open ideas.
  - **Buttons:** `1` resume run, `2` dashboard open/close, `a` Assumptions, `s` Shelf, `b` Board (with bws-board loaded), `4` Loop (with a loop), `h` handoff, `i` idea, `e` enhance, `3` hide.
- Digits answer from an empty prompt box; letters need the bar focused (`ctrl+x tab`; it moves the keys bar → pane → prompt).
- **`i` idea** shelves the prompt box's draft and clears the box. **`e` enhance** runs bws-enhance's `/enhance` on the draft (mid-turn it queues until the turn ends); without bws-enhance it says so. **`h` handoff** writes HANDOFF.md as `/handoff` does, and is highlighted after the handoff nudge.
- The guard's last action shows on a row under the bar for ten minutes.
- Refreshes every `refreshSeconds` and after each turn; `/cockpit` probes on demand.
- Shares the slot: the band above the prompt holds one tree, so when another mod draws a band there too, bws-cockpit draws it under its own row instead of hiding it. Hidden (`3`), or while a survey shows, it hands the whole slot on. Both bands' digit hotkeys stay live, so two mods that bind the same digit will clash.
- Known: Hide has no way back within the session, and the bar draws only once the first refresh has landed.
- **`/resume-run`** queues a prompt that resumes the newest run folder: it reads RUNLOG/PLAN/TASKS, restates the finish line and the next step, checks the receipts, then continues.
- **`/cockpit`** gives the run, devices, loop and guard as text, for sessions where nothing draws.
- **First-message context.** Every new interactive conversation gets one short block naming the newest run folder, its next step and its open count, with a note to confirm before resuming it. `claude -p` and SDK sessions (no surface) skip it: harness workers get their run folder in their prompt.

### Assumptions (tab)
- Claude records each assumption it makes with `mcp__bws-cockpit__record_assumption` (`assumption`, optional `why`). A short system-prompt section, added only where the tool is offered, tells it to call it for choices you didn't specify and keep going. The tool answers `Recorded as A3. Keep working…`.
- The tab lists `A<n> <assumption>`, its reason, and **Right** / **Wrong**. Wrong opens an `Instead:` field for the correction (Enter saves it; text typed but not saved is still sent). Pressing a verdict again clears it.
- **Send N to Claude** (`s`) submits one prompt headed `Assumption review`, as your own message: each WRONG item with its correction (or "ask me what it should be"), then the confirmed ones, then "apply each correction now". If Claude is busy it runs when the turn ends. **Clear sent** (`c`) removes sent items.
- The list is the session's (`$.state`): it survives a hot reload. Numbers never repeat in a session. Mobile has no text field: Wrong there sends "ask me what it should be".

### Shelf (tab)
- `/idea <text>` adds an idea to this project's shelf; it runs mid-turn and only toasts. Claude shelves its own tangents with `mcp__bws-cockpit__shelve_idea {text, detail?}` (always loaded); `list_ideas {scope?}` and `close_idea {id, status}` load through ToolSearch.
- The tab lists this project's open ideas, newest first, eight at a time: `▶` puts the idea in the prompt box unsent (the box must be empty), `✓` marks it done, `✗` drops it. `a` toggles this project / all projects.
- An attended conversation gets one line of context with its first message: the open-idea count and the instruction to shelve tangents rather than follow them (`shelfNudge`).
- One JSON file holds every project's ideas, so all sessions share the shelf: `<CLAUDE_CONFIG_DIR or ~/.claude>/idea-shelf/shelf.json` (the same file bws-shelf used), or `shelfPath`. Every change re-reads the file before writing it; done and dropped ideas stay with `closedAt`. The count refreshes after each turn, which picks up other sessions' ideas.

### Loop Watch (Loop tab)
- **`/loop-watch`** opens the dashboard's Loop tab for this project's harness loop. It reads `Tools/<name>/loop.json`, then `<harnessDir>/state.json` and each unit's `TASKS.md`, and shows:
  - the driver status and how long ago it updated
  - the board link
  - one row per unit: the current-unit marker, status, sessions, cost and task progress, plus the running worker's last tool and its age
  - totals, and the driver's message
  - open needs, each with an input box: type your answer and press Enter. That runs `python <harness.py> answer <unit> <N> <your text>` in the repo root and refreshes the tab. The text goes as a single argument with no shell, so quotes and `&` pass as typed. An empty answer is refused.
  - needs already answered in the unit's `ANSWERS.md` show `answered: ...` instead of the box. Once every open need is answered, the tab says `all needs answered · r resumes the loop`. `harness.py answer` records the answer but does not resume the loop.
  - on a surface without input boxes (mobile), and in the headless text, the exact `answer` command is shown instead
  - a picker when the project has more than one loop
- **Layout:** in a narrow docked sidebar each unit takes two lines (name, then dim numbers). At 60 columns and up it's one line, and at 90 and up the status word is added.
- **Alerts:** each one toasts once, lights the bar's `loop` chip and raises the Loop tab:
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
  - The result of each action shows in the tab.
- **Bar:** a `loop` chip (running, needs you, stalled, stopped) and the hotkey `4: loop`, which opens the tab. `/cockpit` prints the loop and its board URL too.
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

### Mod chips
- **One chip per loaded, non-idle video-derived mod** in the action bar, after the board chip: `bws-memory`, `bws-diagram`, `bws-skillgate`, `bws-secrets`. Each mod publishes one `summary` state atom (`{ state: idle|busy|ok|warn|bad, label, detail? }`, defined in `bws-kit/summary.ts`). `idle`, `null`, a malformed value or a mod that is not loaded draws nothing.
- **`modSummaries`** picks which of those four to show, and in what order. Atoms are typed per plugin, so the list is closed: other names are ignored.
- cockpit reads the atoms (no dependency, like bws-board's) and vendors `summary.ts` from bws-kit (`kit.json`, `hooks/kit/`; `python tools/sync-kit.py` refreshes it).

### /handoff
- **`/handoff [focus]`** writes a handoff for a fresh agent into this session's run folder as `HANDOFF.md`: the newest run folder this conversation's own tool calls wrote to, the same one the Finish-Line Guard holds it to. A folder a harness worker writes while this session supervises the loop never counts. With none, it goes in a new `runs/<date>-handoff/`.
  - It's written by the session's own model from this conversation (`$.model.fork`, served from the prompt cache).
  - Sections: objective, finish line, what's done with receipts, the next step, open items, key files and commands, decisions and constraints, traps.
  - Optional focus text steers it.
  - An existing HANDOFF.md is kept as `HANDOFF.<yyyymmdd-hhmm>.md`.
- **Resumed sessions:** in a resumed session, before its first request there is nothing to fork, so the handoff is built from the transcript rows instead.
- **Start prompt:** the reply shows a short start prompt for the next session, and puts it on the clipboard where there is one.
- **The bar's `h`** writes it the same way (no focus text) and toasts the result's first line.
- **Nudge:** once per session, when the context passes `handoffNudgePercent` (default 70%), a toast says it's time for a handoff and `h` is highlighted on the bar until a handoff is written.

### Cache clock
- **The chip:** on the action bar after the loop chip, `cache 42m`: the time left on the main thread's prompt cache, counted from the end of its last turn for `cacheTtlMinutes` (default 60). Plain while fresh; warning under `cacheLowMinutes` (default 5); `cache cold` once the window has ended. Hidden before the first turn and after `/clear`. It refreshes about once a minute and redraws only when its text changes.
- **What counts:** only main-thread turns. A sub-agent's turn does not restart it. The engine gives mods no per-request timestamp, so after a resume the chip stays hidden until the next turn ends. A handoff's own request may also re-read the cache, which the clock does not count, so it can show cold while the cache is warm (the safe side).
- **Auto handoff** (`autoHandoff`, default on): when the cache drops under the low threshold while the session is idle, and at least one turn has ended since the last handoff, it writes HANDOFF.md once for that window. It uses the `/handoff` pipeline (same sections, same keep-the-previous-one rule) but does not copy the start prompt. It never runs mid-turn, and not after expiry, because a request then re-caches the whole context at full price. A manual `/handoff` counts as the window's handoff. A failed attempt is not retried in that window. Like `/handoff`, it writes into this session's run folder, or a new `runs/<date>-handoff/`.
- **`/cacheclock [status]`** prints the time left, the TTL, the state, when the window ends, and when the last auto handoff was written. Plain text, so headless runs print it too.

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

## Session Bus moved to bws-board
0.12.0 and 0.13.0 carried a Session Bus: peers, file claims, shell-write claims and messages between sessions in one folder. 0.14.0 removes it. [bws-board](../bws-board/README.md) replaces it with one card file per session, roles, and asks (ask, take, done) on top of the same claims. The `sessionBus` and `busClaimMinutes` options and the `bus_*` tools are gone; set `claimMinutes` on bws-board instead.

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
| `refreshSeconds` | `30` | Bar re-probe interval |
| `backgroundProbe` | `true` | Off stops the timed, per-turn and session-start probes (they start powershell, nvidia-smi and adb, which can flash a console window on Windows). `/cockpit` and the guard still probe on demand |
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
| `shelfPath` | (empty) | The idea shelf file; empty: `<CLAUDE_CONFIG_DIR or ~/.claude>/idea-shelf/shelf.json` |
| `shelfNudge` | `true` | The shelf line in a conversation's opening context |
| `handoffNudgePercent` | `70` | Context percentage for the handoff nudge; `0` turns it off |
| `modSummaries` | `bws-memory,bws-diagram,bws-skillgate,bws-secrets` | Mods whose `summary` atom shows as a bar chip; others are ignored |
| `cacheTtlMinutes` | `60` | How long the main thread's prompt cache lasts after its last turn (sub-agents about 5; not counted here) |
| `cacheLowMinutes` | `5` | The cache chip turns warning, and auto handoff fires, when under this many minutes are left |
| `autoHandoff` | `true` | Write HANDOFF.md once per cache window when the cache runs low while idle (see Cache clock) |

## Capabilities it uses

| Category | What it uses |
|---|---|
| Hooks | `session.start`, `turn.complete`, `prompt.submit`, `prompt.compose` (the assumptions guide), `classic.Stop`, `prompt.context`, `command.run` (cockpit, resume-run, loop-watch, projects, handoff, cacheclock, dashboard, assumptions, idea, shelf), `$.clock.every` (the cache clock's minute tick, and the existing refresh), `agent.spawn`, `tool.call` (`Glob`, the plugin's own `find_project`, `record_assumption`, `shelve_idea`, `list_ideas`, `close_idea`; Edit/Write/NotebookEdit/Bash/PowerShell, observe only, to see which run folders the session writes), `ui.render` (AbovePrompt, the dashboard Pane), `ui.close` (your close of the dashboard), `state.set` (observes bws-board's `summary` writes; never changes them), `tool.call` (unreal MCP tools; Bash/PowerShell commands mentioning adb, unity or UnrealEditor.exe) |
| Processes | `powershell` (Get-CimInstance for UnrealEditor/Unity/blender), `nvidia-smi`, `adb devices`. Only when you press or type them in the Loop tab: `python <harness.py> start --resume`, `stop` and `answer` |
| Network | a JSON-RPC `ping` POST to the project's unreal-mcp URL (localhost) |
| Files | lists the folders under `projectRoots` (3 deep) and reads `.uproject` markers, ProjectVersion.txt and package.json; reads `runs/*/RUNLOG.md`, `PLAN.md`, `TASKS.md`, `.mcp.json`, `Tools/*/loop.json`, the loop's `state.json`, and each unit's `TASKS.md` and `ANSWERS.md`; reads and writes the shelf file; writes `HANDOFF.md` (keeping the previous one) |
| Prompts | `$.prompt.submit` for resume and the assumption review; `$.prompt.read`/`fill` for the bar's idea and enhance and the Shelf's ▶; `$.command.run` for bws-enhance's `/enhance` |
| Models | `$.model.fork` (or `$.model.complete` on a resumed session) for /handoff and the cache clock's auto handoff, on the session's own model |
| Store | `$.store` key `bws-cockpit.projectIndex` (the project index) |
| Tools | registers `find_project`, `record_assumption`, `shelve_idea`, `list_ideas`, `close_idea` |
| State | reads bws-board's `summary` and `lines` (no dependency: absent, the Board tab says so), and the `summary` atoms of the mods in `modSummaries` (absent: no chip); keeps its own `cacheClock` (the window and its last turn) and `cacheBar` (the chip) atoms |

It writes only the shelf file and HANDOFF.md.

## Tested

Claude Code 2.1.287 through 2.1.296 (0.10.0), Windows 11, Git Bash + PowerShell 7.6.

| Check | Result |
|---|---|
| 0.17.0 (2.1.296) | Cache clock: validate, tsc and `claude plugin test` in the M1 receipts (`runs/2026-10-13-mods-m1-cacheclock/receipts/`), 199/199 tests: the pure clock (state boundaries, chip text, records, the auto-handoff decision table, `/cacheclock` text) and the bar (chip hidden before a turn, counts down a minute at a time, warning under 5 min, cold after the hour, hidden after a `/clear`, drawn on terminal and desktop); the auto handoff (fires once, not mid-turn, not without a new turn, a manual `/handoff` counts, a failed attempt is not retried, a new turn starts a new window, off when `autoHandoff` is false). Time is stubbed (mock clock), so no live cache was measured. The live probe is in the M1 receipts |
| 0.16.0 (2.1.296) | Mod chips: validate, tsc and tests in the gate receipt of `runs/2026-10-13-mods-m0-kit`. Tested with stubbed atoms on terminal and desktop only; no real mod publishes a summary yet, so no chip has been seen in a live bar |
| 0.15.0 (2.1.296) | Dashboard pane, one-row bar, bws-assumptions and bws-shelf folded in. validate passed; tsc 5.8.3 clean; 162/162 tests (tabs and counts, raise vs a focused pane, closed from the bar, session-start open, the handoff nudge, a loop alert raising the Loop tab, the bar's idea/enhance/tab/dash buttons, the moved assumption and shelf tests). Live in a 170-column tmux terminal with Sonnet (`runs/2026-10-10-bws-dashboard/receipts/ui-*.txt`): the dashboard opened at start on Shelf; Claude's `record_assumption` calls switched it to Assumptions; an ask from another session switched it to Board; the handoff toast and highlight; in-pane tab keys, Right/Wrong/Instead/Send/Clear sent, the shelf scope, ✗ and ▶; `/board pane`; the bar's 2, a, s, b, i, e, h and 3. Then checked by Brian in his own session. Not tried live: bar `1` resume, `4` and the Loop tab with a real loop (tests only), ✓ in the Shelf tab (tests), the Desktop app |
| 0.14.0 (2.1.296) | Session Bus removed (back to 0.11.0's hooks); board chip added. validate passed, with `bws-board.summary` listed as another plugin's state, so no dependency is needed. 122/122 tests, including the chip: hidden without bws-board and when alone, `board 3 · 2 open · 1 for you` in warning color in the tiles, `board 2 · 0 open` in the grid. tsc clean. A fresh `claude -p "/board"` with both plugins in `CLAUDE_CODE_PLUGIN_DIRS` loaded both, listed no `bus_*` tools, and printed the board. The chip has not been checked by eye in an interactive band yet |
| `claude plugin validate` | passed |
| `claude plugin test` (0.11.0, Claude Code 2.1.296) | 121/121. 0.11.0: the band as three bordered tiles at 120 columns (borders, widths, content, no loop tile without a loop, desktop, no run folder) and the borderless grid under 90 columns and under 6 band rows; the loop tile and the grid LOOP row with the board link. 0.10.2: /handoff picks its folder from the session's own writes (a worker-freshened folder is ignored; found with finishLine off too). 0.10.1 adds the shared band slot (another mod's band drawn under ours on terminal and desktop, the whole slot handed on when hidden, nothing added when no other band draws). 0.10.0 (112/112, three runs in a row) added: run-folder ownership (a worker-written folder and a read of its checklist claim nothing; a shell write claims it; a new conversation forgets), imperative hand-backs from real replies ("tell me when", "say go", "when you next ask"; "say if you want" still blocks), `(proposed-task)` and `<ownerName>:` items parked, the evidence check off by default and on by option, the run-folder context skipped with no surface, the board URL in the loop chip and `/cockpit`, and the low-VRAM pass-through for overrides in a `$args` array, render runs, an explicit screen percentage, and a startup-script `-ini` that is not an override. The Repo Sessions tests went with the pane; the registry parsing kept in `peers.ts` is still tested. Earlier: parsing, command-position rules, every guard path, pass-through, band layout on terminal and desktop, Loop Watch, /handoff, the worker model pin, the Project Locator and the Finish-Line Guard |
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
