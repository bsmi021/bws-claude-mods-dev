# bws-cockpit

> A dashboard, an action bar and a set of guards for Claude Code: your run, your devices, your loose ideas and your finish line in one place.

Long Claude Code sessions lose track of things. The run folder you were in, the editor that is not running, the assumption Claude made without asking, the tangent you wanted to come back to. bws-cockpit keeps these in view. It adds a dashboard pane with a tab per topic, a short action bar above the prompt, and guards that stop calls that cannot work and stops that leave work unfinished.

It is also the dashboard host for the other `bws-` mods: each one that is loaded gets its own tab here.

## Install

```bash
claude plugin marketplace add bsmi021/bws-claude-mods
claude plugin install bws-cockpit@bws-mods
```

Then `/reload-plugins`. Requires Claude Code 2.1.296 or later and a trusted workspace. The mod tabs, the Board tab and the Enhance and Side chat tabs need the matching mods installed: [bws-board](../bws-board/README.md), [bws-notify](../bws-notify/README.md) and the others. Nothing breaks without them; their tabs are simply absent.

## Use

| Command | What it does |
|---|---|
| `/dashboard [assumptions\|shelf\|board\|loop\|<mod>]` | Open the dashboard, on a tab if you name one. A mod is named by its tab title or plugin name (`notify`, `shell`, `bws-skillgate`). |
| `/assumptions` | Open the Assumptions tab. |
| `/shelf [all]` | Open the Shelf tab (`all`: every project). |
| `/idea <text>` | Put an idea on this project's shelf. Works mid-turn; only toasts. |
| `/loop-watch` | Open the Loop tab for this project's harness loop. |
| `/cockpit [show\|hide]` | Print the run, devices, loop and guard as text. `show` brings the action bar back, `hide` hides it. |
| `/resume-run` | Queue a prompt that resumes the newest run folder. |
| `/handoff [focus]` | Write `HANDOFF.md` for a fresh agent. |
| `/cacheclock [status]` | Print the time left on the prompt cache. |
| `/projects [refresh]` | List the projects found under your project roots; `refresh` rebuilds the index. |

The action bar has buttons. Digits answer from an empty prompt box; letters need the bar focused (`ctrl+x tab` moves the keys bar, pane, prompt).

| Key | What it does |
|---|---|
| `1` | Resume the newest run (same as `/resume-run`). |
| `h` | Write a handoff. |
| `i` | Shelve the prompt box's draft as an idea and clear the box. |
| `e` | Run [bws-enhance](../bws-enhance/README.md)'s `/enhance` on the draft (queued until the turn ends if Claude is busy). |
| `2` | Open or close the dashboard. |
| `a`, `s`, `b`, `4` | Show the Assumptions, Shelf, Board (with bws-board) or Loop (with a loop) tab. |
| `3` | Hide the bar. |

In the dashboard, `1` to `9` switch to the first nine tabs and `Tab` then `Enter` reach the rest. Each tab has its own keys, shown on its buttons.

Claude also gets tools: `record_assumption`, `shelve_idea`, `list_ideas`, `close_idea` and `find_project`, all under `mcp__bws-cockpit__`.

## What it does

### Dashboard
One pane, `Dashboard`, docked right of the transcript in fullscreen from 110 columns, otherwise inline above the prompt.

- **Tabs:** Assumptions (count: unsent), Shelf (this project's open ideas), Board (asks waiting on this session), Loop (while a harness loop is live or you picked it), then one tab per loaded mod. With nothing picked, it shows the first tab with something waiting.
- **Opening:** with the commands above or the bar. Opened over an empty prompt box it takes the keys; `Esc` hands them back and the pane stays.
- **News brings a tab up:**
  - Claude records an assumption: Assumptions.
  - An ask addressed to this session appears on bws-board: Board.
  - A loop alert (needs you, stalled, driver dead, all done): Loop.
  - A session starts with unsent assumptions or open ideas for the project: that tab. With nothing waiting it opens on Assumptions (`dashboardOnStart`). On Desktop, which starts the session with your first message, it opens on that message. `bws-cockpit-start.log` beside the shelf file traces each start-up open. Headless sessions open nothing, and `/clear`, `/resume` and `/branch` do not reopen it.
  - It opens or switches only while you are not using the pane. Opened unasked, it needs a terminal 144 columns wide; one you opened yourself needs 110.
  - If you close it (its mark, `ctrl+x x`, or `2` on the bar), it stays closed for news; the bar's counts still show. Opening it again clears that.
- **Headless:** `claude -p "/dashboard"` prints every tab as text.

### Action bar
Above the prompt, in the terminal and in Desktop. Three rows, each wrapping when narrow:

- **Status:** the run folder with its open count (`- [ ]` items in PLAN.md and TASKS.md), devices that are up or in trouble (Unreal Editor and its unreal-mcp port, Unity, Blender, adb, VRAM used and total, warning on pressure), the loop state while a loop is live, and the cache clock.
- **Signals** (only when there is one): the bws-board chip (`board 3 · 2 open · 1 for you`), `N assumptions` unsent, `N ideas` open.
- **Actions:** the buttons above, grouped `do`, `open`, then hide.

Other details:
- The guard's last action shows on a row under the bar for ten minutes.
- The bar refreshes every `refreshSeconds` and after each turn. It draws once the first probe has landed.
- It shares the slot above the prompt: when another mod draws a band there, the cockpit draws it under its own row. Hidden, or while a survey shows, it gives the whole slot over. Two mods that bind the same digit will clash.
- `3` hides the bar and toasts how to get it back.

### Footer button
Under the prompt, at the right of the footer (terminal and Desktop), `◧ cockpit` opens the dashboard, or closes it when open. It also brings back a hidden bar. It sits beside other mods' footer buttons (bws-sidechat's `◨ side`, bws-enhance's `✦ enhance`) and Claude Code's own mode labels.
- Every new interactive conversation gets one short block of context naming the newest run folder, its next step and its open count, with a note to confirm before resuming it. `claude -p` and SDK sessions skip it.

### Assumptions tab
- Claude records each assumption it makes with `record_assumption` (`assumption`, optional `why`). A short system-prompt section, added only where the tool is offered, tells it to call the tool for choices you did not specify and keep going.
- The tab lists each `A<n>` with its reason and **Right** / **Wrong** buttons. Wrong opens an `Instead:` field for the correction (Enter saves it; text typed but not saved is still sent). Pressing a verdict again clears it.
- **Send N to Claude** (`s`) submits one prompt headed `Assumption review` as your own message: each wrong item with its correction (or "ask me what it should be"), then the confirmed ones, then "apply each correction now". If Claude is busy it runs when the turn ends. **Clear sent** (`c`) removes sent items.
- The list belongs to the session and survives a hot reload. Numbers never repeat. Mobile has no text field: Wrong there sends "ask me what it should be".

### Shelf tab
- `/idea <text>` adds an idea. Claude shelves its own tangents with `shelve_idea {text, detail?}`; `list_ideas {scope?}` and `close_idea {id, status}` load on demand.
- The tab shows this project's open ideas as bordered cards, newest first, eight at a time: who shelved it (🤖 Claude, 🙋 you), its number and age, the idea and the first line of its detail. `▶ Resume` puts the idea in the prompt box unsent (the box must be empty), `✓ Done` marks it done, `✗ Drop` drops it. `a` switches between this project and all projects; all projects groups the cards under one 📁 header per project (this project first, four per project).
- With `shelfNudge`, each conversation's first message carries one line: the open-idea count and an instruction to shelve tangents rather than follow them.
- One JSON file holds every project's ideas, so all sessions share it. Every change re-reads the file before writing. Done and dropped ideas stay in the file with `closedAt`. The count refreshes after each turn, which picks up other sessions' ideas.

### Loop tab
For projects that run a harness loop (`Tools/<name>/loop.json`). `/loop-watch` reads `loop.json`, then `<harnessDir>/state.json` and each unit's `TASKS.md`, and shows:

- the driver status and how long ago it updated, and the board link
- one row per unit: current-unit marker, status, sessions, cost, task progress, and the running worker's last tool and its age
- totals and the driver's message
- open needs, each with an input box. Type your answer and press Enter: that runs `python <harness.py> answer <unit> <N> <your text>` in the repo root and refreshes the tab. The text goes as one argument with no shell. An empty answer is refused. Needs already answered in `ANSWERS.md` show `answered: ...`. `answer` records the answer but does not resume the loop; once every need is answered the tab says `r resumes the loop`.
- a picker when the project has more than one loop

Actions: `r` runs `harness.py start --resume`, `s` runs `harness.py stop` (only on a second press within 10 seconds), `g` refreshes. The result shows in the tab. On mobile and in headless text, the exact `answer` command is shown instead of an input.

Alerts toast once, light the bar's `loop` chip and raise the tab: the driver says RUNNING but its 30-second heartbeat has stopped; the running worker has made no tool call for a while; the current unit is on too many sessions; the loop paused for you; every unit is done. Thresholds are options. Loops whose state is more than a day old do not toast.

### Mod tabs
Every loaded mod from the `modSummaries` list gets a tab after the built-in ones: bws-memory, bws-diagram, bws-enhance, bws-better, bws-sidechat, bws-secrets, bws-skillgate, bws-notify, bws-shell-lint, bws-interview, bws-direction and bws-summary, in that order by default.

- A mod publishes its tab as data (a title, a badge, a tone, and a body of text, buttons, an input, a picture or cards). The cockpit draws it and knows nothing mod-specific. A malformed tab draws nothing, and a mod that is not loaded has no tab.
- Button presses and submitted input go back to the mod. Typed input stays in the cockpit until Enter.
- A mod can bring its tab up (same rule as a board ask), switch to it from its command, or have the cockpit open the dashboard on it with the keyboard. The cockpit does the opening itself because only the opener can move the focus ring and scroll the pane.
- Headless, `claude -p "/dashboard"` prints each mod tab as text after the built-in ones.

### Editor & Device Guard
Blocks calls that cannot work and adds missing launch flags. It never approves anything. Every rewrite adds a note the model reads after the tool result, and a toast tells you.

| Trigger | Action |
|---|---|
| `mcp__unreal*__*` call when the project's unreal-mcp URL (`.mcp.json`) does not answer | Block, saying whether the editor is closed or still loading |
| `adb <cmd>` that needs a device, with none in `device` state | Block, listing unauthorized and offline devices. `devices`, `start-server`, `connect` and similar always pass |
| Unity CLI `command` call with no Unity editor running | Block, with the launch line to use |
| `unity open ...` or `Unity.exe ... -projectPath` without `-automated` | Rewrite: adds `-automated` |
| `Start-Process` Unity launch without `-automated` | Block, with the argument to add |
| `UnrealEditor.exe` launch of a `.uproject` that is already open | Block, with the running process id |
| `UnrealEditor.exe` launch under GPU pressure (another UE editor or Blender is running, or VRAM is at or over the threshold) | Rewrite: appends low-VRAM `-ini:Engine:[SystemSettings]` overrides. A `Start-Process` form is blocked with the exact argument instead |

- The built-in low-VRAM set caps the frame rate at 30, halves the screen percentage, shrinks the texture pool to 768 MB and drops the scalability groups to low. `lowVramCvars` replaces it.
- A launch that already sets render settings (`[SystemSettings]:`, `-ExecCmds`, `r.ScreenPercentage`, `t.MaxFPS`, `sg.*Quality`, including inside a `$args` array) passes untouched, and so do render runs (`-unattended`, `HighResShot`, `-RenderOffscreen`, Movie Render Queue) and commandlets (`UnrealEditor-Cmd`, `-run=`, `-nullrhi`, `-game`).
- Overrides use `-ini:` instead of `-ExecCmds="..."` because they have no spaces or quotes, so Git Bash and PowerShell pass them intact.
- Only commands where the tool is in command position trigger the guard: the first word of a segment, after `VAR=` prefixes, `timeout N`, `nohup`, `&`, `$x =` or `Start-Process -FilePath`. Text that is quoted, commented, in a heredoc, or mentioned by `echo` or `grep` is ignored.

### Finish-Line Guard
Keeps Claude from stopping while this session's checklist still has work. This session's run folder is the newest `runs/*` that this conversation's own tool calls wrote to: an Edit, Write or NotebookEdit inside it, or a Bash or PowerShell command that names it and writes (a redirect, `tee`, `sed -i`, `mkdir`, `cp`, `mv`, `Set-Content` and the like). A folder a harness worker writes while this session supervises the loop never counts, and neither does reading a worker's checklist.

- **Open items.** When Claude tries to end its turn and PLAN.md or TASKS.md still has `- [ ]` items, the stop is blocked and Claude is told which items remain (up to five) and how to hand back properly: say so plainly, and mark the item `(blocked: ...)` or `(needs <ownerName>: ...)`.
- **Items that never hold it open:** items marked blocked, waiting on, needs the user, parked, deferred, follow-up, later or out of scope; harness proposals marked `(proposed-task)`; and items addressed to you, starting with `<ownerName>:`.
- **Never blocked:** a reply that hands back (it ends with a question, or says "your call", "want me to", "should I", "let me know", or asks you to act: "tell me when...", "say go"), and a turn with background tasks or scheduled wake-ups pending.
- **RUNLOG check** (`finishLineRunlog`, on). When a run folder this session wrote has no `RUNLOG.md`, the stop is blocked and Claude is told to write one: brief, steps, outcomes with receipts, next step. Harness report folders (names ending `-harness` or `-sessions`) are exempt.
- **RUNLOG header check** (`finishLineRunlogHeader`, on, needs `finishLineRunlog`). When a `RUNLOG.md` in a run folder this session wrote has no `Status:`, `Finish line:`, `Next step:` or `Open:` line in its first 20 lines, the stop is blocked and Claude is told which lines to add. Bold and bullet forms (`**Next step:**`, `- Open: none`) count. The run band shows a `Finish line:` line as the finish line.
- **Evidence check** (`evidenceCheck`, off). When nothing is open but the reply claims "done", "complete" or "all tests pass" without citing evidence (test counts, receipt or log paths, "exit 0", a commit hash, a URL), the stop is blocked once. It is off because it mostly caught status replies.
- **Bounded.** At most `finishLineMaxContinues` blocks (default 2) per prompt you send, so it cannot loop.
- **Visible.** When a turn ends with open items anyway, a line under the answer shows the count and the first items.
- **Headless sessions** (`claude -p`, SDK) are not guarded unless `finishLineHeadless` is on, so harness workers keep their own budgets.

### Project Locator
Stops Claude from searching the whole disk for a project. A Glob over a big projects folder or a home folder can time out after 20 seconds.

- **Index.** Scans the folders in `projectRoots`, three levels deep, skipping `node_modules`, `.git`, `Content`, `Library`, `Intermediate`, `Saved`, `DerivedDataCache`, `Binaries`, `runs`, `Plugins`, `Assets`, `Packages`, `Temp`, `obj`, `build`, `Source` and dot-folders. Each project records its kinds (unreal, unity, node, android, python, git), `.uproject`, Unity editor version, package name, harness loops, whether it has `runs/` and AGENTS.md or CLAUDE.md, and when it was last active. The index is kept for six hours and shared by all sessions.
- **`find_project`** (`{ query?, kind? }`) returns matching projects with their paths and facts, newest first.
- **Globs answered from the index.** A Glob for `*.uproject` or `ProjectSettings/ProjectVersion.txt` under a projects root comes back at once, in Glob's own result form, with a note saying so. The same Glob over a home folder or a drive root is refused with a hint instead of running into the timeout. Every other Glob and Grep runs as usual.
- **Home-folder sessions.** A session started in a home folder or a projects root gets the 40 newest projects in its first message.

### /handoff
- Writes a handoff for a fresh agent into this session's run folder as `HANDOFF.md`. With no run folder, it goes in a new `runs/<date>-handoff/`.
- The session's own model writes it from the conversation, using the prompt cache. In a resumed session there is nothing to fork before the first request, so it is built from the transcript instead.
- Sections: objective, finish line, what is done with receipts, the next step, open items, key files and commands, decisions and constraints, traps. Optional focus text steers it.
- An existing `HANDOFF.md` is kept as `HANDOFF.<yyyymmdd-hhmm>.md`.
- The reply shows a short start prompt for the next session and copies it to the clipboard where there is one. The bar's `h` writes the handoff the same way (no focus text) and toasts the first line.
- **Nudge.** Once per session, when the context passes `handoffNudgePercent`, a toast says it is time for a handoff and `h` is highlighted until one is written.

### Cache clock
- **The chip.** On the bar, `cache 42m`: the time left on the main thread's prompt cache, counted from the end of its last turn for `cacheTtlMinutes`. It turns warning under `cacheLowMinutes`, and reads `cache cold` once the window has ended. It is hidden before the first turn and after `/clear`.
- **What counts.** Only main-thread turns; a sub-agent's turn does not restart it. After a resume the chip stays hidden until the next turn ends. A handoff's own request can re-read the cache without the clock counting it, so the chip can read cold while the cache is warm (the safe side).
- **Auto handoff** (`autoHandoff`, on). When the cache drops under the low threshold while the session is idle, and a turn has ended since the last handoff, it writes `HANDOFF.md` once for that window, as `/handoff` does but without copying the start prompt. It never runs mid-turn and never after expiry, because a request then would re-cache the whole context at full price. A manual `/handoff` counts as the window's handoff. A failed attempt is not retried in that window.

### Worker model pin
With `workerModel` set (for example `claude-sonnet-5-5`), subagents of the types in `workerAgentTypes` run on that model whenever the Agent call names none. An explicit `model` in the call wins. Forks always inherit, and other types (Explore, Plan, plugin agents with their own model) are not touched. Off by default. A toast names the model on each pinned spawn.

## Options

Set these in `/plugin`, or under `pluginConfigs["bws-cockpit"].options` in settings.json.

| Option | Default | What it does |
|---|---|---|
| `guard` | `true` | Editor & Device Guard: block calls that cannot work (editor or device down) and add launch flags (Unity `-automated`, Unreal low-VRAM). |
| `lowVramMode` | `auto` | `auto`: add the low-VRAM flags when another UE editor or Blender runs, or VRAM use is over the threshold. `always` or `off`. |
| `vramThresholdMb` | `4096` | In auto mode, VRAM in use at or above this counts as pressure. |
| `lowVramCvars` | empty | Comma-separated `cvar=value` pairs passed as `-ini:Engine:[SystemSettings]` overrides. Empty uses the built-in set. |
| `adbPath` | `adb` | Path or name of adb. |
| `refreshSeconds` | `30` | How often the bar re-probes editors and devices while a terminal or Desktop surface is attached. |
| `backgroundProbe` | `true` | Re-probe editors, VRAM and devices at session start, every refresh interval and after each turn. Each probe starts powershell, nvidia-smi and adb, which can flash a console window on Windows. Off: probes run only for `/cockpit`, the refresh button and the guard; the bar still shows at start, without device chips. |
| `loopIdleMinutes` | `20` | Loop alert when the running worker has made no tool call for this long. |
| `loopSessionAlert` | `6` | Loop alert when the current unit reaches this many worker sessions. |
| `loopDriverStaleMinutes` | `3` | Loop alert when the driver says RUNNING but its 30-second heartbeat has not updated for this long. |
| `finishLine` | `true` | Finish-Line Guard: keep Claude going while this session's run folder has open checklist items, and ask for evidence when it claims done without any. |
| `finishLineMaxContinues` | `2` | How many times the guard may block a stop before your next prompt. |
| `finishLineRunlog` | `true` | Block a stop while a run folder this session wrote has no `RUNLOG.md` (folders ending `-harness` or `-sessions` are exempt). |
| `finishLineRunlogHeader` | `true` | With `finishLineRunlog` on, also block a stop while such a `RUNLOG.md` lacks `Status:`, `Finish line:`, `Next step:` and `Open:` lines in its first 20 lines. |
| `evidenceCheck` | `false` | Block once when a reply claims the work is done but cites no evidence (test counts, receipt paths, commit hash). |
| `finishLineHeadless` | `false` | Also guard `claude -p` and SDK sessions. |
| `ownerName` | `the user` | What the guard calls you when it asks Claude to mark an item that needs you, as in `(needs <name>: question)`. |
| `projectLocator` | `true` | Index the projects under `projectRoots`: the `find_project` tool, `/projects`, Globs for `.uproject` and `ProjectVersion.txt` answered from the index, and a project list in home-folder sessions. |
| `projectRoots` | `C:/Projects` | Folders that hold your projects, separated by `;`. |
| `workerModel` | empty (off) | Run subagents of the types in `workerAgentTypes` on this model when the Agent call names none. An explicit model in the call still wins. |
| `workerAgentTypes` | `general-purpose,claude` | Subagent types the worker model applies to, comma-separated. |
| `shelfPath` | empty | Path of the idea shelf JSON file. Empty: `<CLAUDE_CONFIG_DIR or ~/.claude>/idea-shelf/shelf.json`. |
| `shelfNudge` | `true` | Add one line to the conversation's opening context with the open-idea count and the `shelve_idea` tool. |
| `modSummaries` | every known mod (see Mod tabs) | Mods that get a dashboard tab while loaded, in this order, comma-separated. Other names are ignored. |
| `dashboardOnStart` | `true` | Open the dashboard when a session starts, on the first tab with something waiting (else Assumptions). Needs a terminal 144 columns wide or Desktop. |
| `handoffNudgePercent` | `70` | Once per session, when the context passes this percentage, toast and highlight Handoff on the bar. `0` turns it off. |
| `cacheTtlMinutes` | `60` | How long the main thread's prompt cache lasts after its last request (sub-agents about 5; not counted here). |
| `cacheLowMinutes` | `5` | The cache chip turns warning, and auto handoff fires, when under this many minutes are left. |
| `autoHandoff` | `true` | When the cache drops under the low threshold while idle, after at least one new turn, write `HANDOFF.md` once for that window. |

## Permissions and data

- **Files read:** the folders under `projectRoots` (three levels deep) and their `.uproject`, `ProjectVersion.txt` and `package.json`; `runs/*/RUNLOG.md`, `PLAN.md` and `TASKS.md`; `.mcp.json`; `Tools/*/loop.json`, the loop's `state.json`, and each unit's `TASKS.md` and `ANSWERS.md`; the shelf file.
- **Files written:** the shelf file, `HANDOFF.md` (keeping the previous one), and a project index in the engine's store. Nothing else.
- **Processes:** `powershell` (Get-CimInstance for UnrealEditor, Unity and Blender), `nvidia-smi` and `adb devices`, for the bar and guard. `python <harness.py> start --resume`, `stop` and `answer` run only when you press or type them in the Loop tab.
- **Network:** a JSON-RPC `ping` to the project's unreal-mcp URL (localhost). Nothing else leaves the machine.
- **Models:** `/handoff` and auto handoff make one call on the session's own model, a fork of the conversation (or a plain completion on a resumed session). Nothing else calls a model.
- **Prompts:** it submits a prompt for resume and for the assumption review, fills the prompt box for the bar's idea and enhance and the Shelf's play button, and runs bws-enhance's `/enhance`.
- **Tools it registers:** `find_project`, `record_assumption`, `shelve_idea`, `list_ideas`, `close_idea`.
- **State it reads from other mods:** bws-board's `summary` and `lines` (absent: the Board tab says so) and the tab data of the mods in `modSummaries`. It never changes them.
- **What it never does:** approve a tool call, or run a harness command you did not press.

## Compatibility

- Checked on Claude Code 2.1.296 and later (the Mod tabs on 2.1.302, the footer button on 2.1.307 in the terminal, start-up open on 2.1.309 in the terminal), Windows 11, with Git Bash and PowerShell 7.
- The dashboard and bar were checked live in a terminal (Windows Terminal and tmux). Desktop is covered by automated tests only and has not been tried in the app; mobile has not been tried. Headless runs (`claude -p`) get text for `/dashboard`, `/cockpit`, `/loop-watch` and `/handoff`, and the guards apply.
- Not verified live: an unreal-mcp block with the port down, and a running or paused harness loop (tests cover both).
- The Editor & Device Guard and the process probes are Windows-oriented (PowerShell, `nvidia-smi`).
- The Loop tab needs a harness whose `loop.json` and `state.json` follow the layout described above.
- It replaces `bws-assumptions` and `bws-shelf` (folded in at 0.15.0), and the old Session Bus, which moved to [bws-board](../bws-board/README.md) at 0.14.0. Set `claimMinutes` on bws-board instead of the retired bus options.

## License

MIT. Version history: [CHANGELOG.md](CHANGELOG.md).
