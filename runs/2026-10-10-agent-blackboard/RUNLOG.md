# RUNLOG: agent blackboard (research + plan, no code)

## Objective
Find out whether a shared "blackboard" mod is feasible, then plan it. Several Claude Code sessions in one repo should be able to post what they're doing, read what the others are doing, avoid clipping each other's edits, and say what they need from each other. The model is a team of peer agents, not one lead with subagents. Settle the open questions with Brian through `/interview`. No implementation in this pass.

## Does this make sense?
Yes. About 70% of it already exists and runs in every session today: the **Session Bus** in `bws-cockpit` 0.12.0. It is uncommitted, but its receipts show validate, 136/136 tests and tsc passing, plus a live two-session claim/deny run. The bus already provides per-session task and busy/idle status, a list of peers at conversation start, Edit/Write/NotebookEdit claims that deny another session's edit, `bus_send`/`bus_status`/`bus_release`, a 20 s heartbeat with 90 s staleness, and cleanup on `session.end`. It delivered peer notices into this very session mid-turn.

What a blackboard adds is the missing 30%:
- **Needs and requests** as first-class board items: open, claimed, done, addressed to someone or to anyone. Today these are only free-text messages.
- **A view a person can read**: a pane or command.
- **Concurrency-safe storage.** The bus does a single-file read-modify-write and repairs lost writes on its next heartbeat.
- **Optionally, push delivery** that can wake an idle peer.

The real question is where this lives, not whether it can be built.

## 2026-10-10
- `claude --version` → 2.1.296, which matches the AGENTS.md baseline (receipts/claude-version.txt).
- Loaded `/plugin-authoring` and read the generated types: `bws-cockpit/.claude-plugin/types/claude-code/index.d.ts`, written by 2.1.296. Findings, with line numbers, are in PLAN.md § Feasibility.
- Found the uncommitted Session Bus: `bws-cockpit/hooks/bus.ts`, register.tsx +360 lines, manifest 0.12.0, and `runs/2026-10-10-session-bus/`. Its RUNLOG stops at "blocked on writing bus.ts", but the code and passing receipts exist, so that RUNLOG is stale. I did not touch it, since it belongs to another task.
- Advisor review: build on the bus, store one file per session, put the "which mod" fork first in the interview, and keep the acceptance check distinct from the bus's claim/deny receipts.
- Interview: 3 rounds, quick depth (BRIEF.md). Every recommended option was picked, and Brian added the pane and band chip on top of /board. Decisions are in PLAN.md § Decisions.
- I offered to commit the cockpit 0.12.0 bus. Its owner session 193b884d had already committed it (8a2dbbf, 0482f75, RUNLOG bd4a36c) and published it (dadac39). It's now adding Bash/PowerShell write claim checks to the bus in cockpit, so I stayed hands-off on bws-cockpit.
- Shelved: #1 bus redact() false positive on run paths; #2-#7 blackboard follow-ups (commit token, /board spawn, intent claims, worktree per role, asks linked to finish lines, team digest page). Brian asked for these mid-turn.
- Recorded assumptions A1-A4 (sweep, wake rate limit, duplicate roles, band chip).
- PLAN.md written: finish line, design, feasibility table with line numbers from the 2.1.296 types, decisions, assumptions, tasks T1-T9.

## 2026-10-10 (build, session 2)
- Brian: go, after checking with 193b884d. Its shell-claim work is on main as ee31074 (cockpit 0.13.0, 143/143 tests), and the tree is clean. Sent 193b884d a bus message asking it to confirm nothing is pending and to stop changing the bus in cockpit. It was idle, so the message lands with its next prompt. T5 (removing the bus from cockpit) waits for its reply or Brian's OK; T1-T4 touch only bws-board/.
- T1: `bws-board/hooks/shell.ts`, a port of cockpit's command splitter + `writeTargets` (the Unity/UE/adb guards stay in cockpit). Mods can't import across plugins, so the parser is duplicated.

- T1 `hooks/board.ts` (pure): cards in one file per session; torn-read fallback to the last good copy; tombstones; the sweep picker; claims (ported); roles (normRole, duplicates); asks (target, merged views, settle-on-done, act rules, ids, cap); news and unread delivery; urgent wake rate limit; texts; summary. The redact fix for shelf #1: a long run is hidden only if it mixes upper case, lower case and digits and isn't path-like, or is a known key prefix, or is hex of 40+ characters.
- T2 scaffold: manifest 0.1.0 with options (board, claimMinutes, urgentWake, wakeMinutes); types contract with state role/own/summary/lines and the McpToolInputs augmentation; types copied from cockpit; register.tsx stub.
- Checks: validate passed, tsc exit 0, 30/30 tests (receipts/t1-*). bws-board is not yet in CLAUDE_CODE_PLUGIN_DIRS, so no session loads it.

- T3 `register.tsx`: session.start (8 tools, /board, first sync, sweep, 20 s heartbeat), prompt.context (bwsBoard block when a peer is live or an ask waits), prompt.submit (busy + task + news), turn.complete (idle), the claims gate on tool.call, the unmatched tool.call that delivers news, session.end (tombstone), the 8 tool handlers, /board [role <name> | pane], and the Board pane. The run folder now comes from this session's own writes under runs/, not from cockpit's state. Left out: the session.receive hook (nothing needed it).
- Validate rule: `act` (which takes `$`) was moved to top level.
- T4 `tests/plugin.test.ts`, 14 two-session tests over one stubbed folder. They found two things:
  - (a) The `own` state was a single value, so a second session in the same process reset the first's cursors. It is now a map by session id, keeping the newest 4. That also fits a real process across /clear.
  - (b) "An ask you took was withdrawn" needed a news pass between take and withdraw. It now reads the session's own take act.
- Also learned: `session.send` hooks see `to` as a string, not `{ sessionId }`.
- Checks: validate passed, tsc exit 0, 44/44 tests (receipts/t4-*).

- T8 live run 1 (receipts/live-run1): partial.
  - **Worked:** B's opening context listed A (api, busy, its claim) and "Open asks for this session: 6a63575c-1 · open · api → tests". B's Edit of notes.txt was denied by bws-board, naming api and its task. board_take worked. Both board_status listings agreed.
  - **Gaps, all in the test setup:**
    - Claude Code's built-in rule blocked A's `sleep 75`, so A finished before B answered.
    - B refused to post a made-up "12 passed", which is correct model behavior; it needed a real command.
    - Clearing CLAUDE_CODE_PLUGIN_DIRS in the shell had no effect, because the user settings' env wins, so cockpit's bus ran too.
  - **Fixes for run 2:**
    - A waits with an until-loop on its own card recording the ask as done. The same heartbeat queues the news, so the tool result that ends the loop must carry it.
    - A then holds on a flag file until /board has run.
    - B runs `echo 12 passed` as the suite.
    - `--settings live-settings.json` sets cockpit's sessionBus to false.

- T8 live run 2 (receipts/live-run2): B again got the intro with the open ask and was refused A's file. But A's `until grep ... <board dir>` was blocked by the sandbox's read rule (the board folder is outside A's working dir), so A exited. Its tombstone correctly removed the ask before B took it: B got `No ask "e7c36715-1" on the board`. Fix for run 3: the script watches A's card and drops a flag in the scratch repo, and A waits only on that flag.

- T8 live run 3 (receipts/live-run3) found a **real bug**:
  - **What passed:** B was told about the ask, was refused A's file, took the ask, ran `echo 12 passed`, and marked it done. B's board_status showed "done by tests (note: 12 passed)".
  - **The bug:** B exited seconds later. Its tombstone dropped its acts, so A's next heartbeat found no done. A and a /board run both saw the ask as `open`.
  - **Fix:** a tombstone keeps its `done` acts, since an outcome is final. askViews counts a done from any card file still present, while takes and declines count only from live cards.
  - New unit test, and the plugin test now has B exit before A looks. 45/45.

- T8 live run 4 (receipts/live): **passed**. Every point held:
  - B's opening context listed `4cc42c37-1 · open · api → tests`.
  - B's Edit of notes.txt was refused by bws-board, and the file stayed `from A`.
  - B took the ask, ran `echo 12 passed`, and marked it done.
  - A's next tool result carried "your ask 4cc42c37-1 is done by tests (a1eeca7d): 12 passed".
  - A's board_status, B's board_status and a separate `/board` run all listed `4cc42c37-1 · done by tests (a1eeca7d) … (note: 12 passed)`.
  - After exit all three cards were tombstones with no claims. B's kept its done act.
- Final checks: validate passed, tsc exit 0, 45/45 tests (receipts/validate.txt, tsc.txt, plugin-test.txt). README written.
- Not verified live: the urgent wake of an idle interactive session (tests only, with session.send stubbed), the Board pane in a terminal, and the day-old sweep (`del` via `$.process.run`, stub only). Confirmed: run 4's transcripts contain no cockpit bus text, so `--settings` did keep cockpit's bus out.

## 2026-10-10 (interactive check, session 2)
- Brian asked for live verification of the urgent wake and the Board pane in two interactive terminals via wt.exe, with screenshots.
- Setup in `ui/`:
  - `open-session.ps1` launches wt.exe. `--size` is a top-level wt option and must come before `new-tab`.
  - `launch-session.ps1` clears CLAUDECODE, CLAUDE_CODE_ENTRYPOINT, CLAUDE_CODE_CHILD_SESSION and NO_COLOR, then runs claude.exe with the opening prompt from a file, --plugin-dir bws-board, live-settings.json (cockpit bus off), haiku and acceptEdits.
  - B (tests) opened with `/board pane`; A (api) opened with two urgent asks to tests.
- Results (receipts/ui):
  - 01: the folder-trust dialog for the new scratch repo.
  - 02: B idle with the Board pane open ("Board · 1 agent · 0 open asks").
  - 03: A got "Woke a370585b" for the first ask and "Not woken again (woken in the last 5 min)" for the second.
  - 04/05: idle B started a turn by itself from "Message from @board-ui-e7: [bws-board] Urgent ask 55d98975-1 …". It declined the ask (it judged `echo 12 passed` not a real test run). The pane redrew live to "2 agents · 2 open asks · 2 for you", listing the declined ask and the open one.
  - 05 was captured snapped to half width, where the pane re-seats as a bordered box below the transcript. screenctl's shot restores the window, so that one is a direct screen capture.
- Transcript evidence (receipts/ui/transcript-evidence.txt): A's board_ask result at 16:13:03.767; B's transcript opens at 16:13:03.788 with `<cross-session-message … from-plugin="bws-board">`, then board_decline.
- Driving incident: my first `/exit` attempt set MSYS_NO_PATHCONV for the whole command, which broke the script path, so only Enter was sent to each window. Screenshots showed nothing was submitted (the ghost suggestions stayed unsent). The retry used the script's Windows path. Both sessions exited, both cards are tombstones, and both windows closed.
- Still not verified live: the day-old sweep.

## 2026-10-10 (T5 cut-over, session 2)
- Brian: go on T5. Cockpit was unchanged since ee31074, and 193b884d was idle with no claims; I told it over the bus before editing.
- Every cockpit change since 0.11.0 (17640b3) was bus work: 8a2dbbf, 0482f75 and ee31074, which only added to register.tsx and the types and appended to shell.ts. So I restored register.tsx, shell.ts, types/index.d.ts, README.md and plugin.json from 17640b3 and deleted hooks/bus.ts and tests/bus.test.ts. The Unity/UE/adb guards keep 0.11.0's shell.ts, so their behavior is exactly as it was.
- Board chip:
  - It sits in the band's button row in both layouts, so the band gets no taller.
  - It reads the `{ plugin: 'bws-board', key: 'summary' }` atom and is shown when agents > 1 or asks are open. Its dot is warning-colored while asks wait on this session.
  - Cockpit declares that one state shape inline in its own contract, with **no `dependencies` entry**. validate passes and reports it as "state of other plugins, not checked". That retires PLAN's hard/soft-dependency risk: cockpit loads without bws-board.
  - New band test with a `state.get` stub: hidden without bws-board and when alone, warning-colored in the tiles, and drawn in the grid.
- Version 0.14.0. The README has the chip, a "Session Bus moved to bws-board" note, and a tested row.
- Checks (receipts/t5): validate passed for both; tests 122/122 (cockpit) and 45/45 (board); tsc exit 0 for both.
- `~/.claude/settings.json`: bws-board appended to CLAUDE_CODE_PLUGIN_DIRS. Fresh-session check (receipts/t5/fresh-board.jsonl): all 8 bws plugins loaded, 8 board tools, no bus tools, and `/board` printed the board for this repo.
- Not checked yet: the chip in an interactive band. Old bus files remain under ~/.claude/bws-cockpit/bus/ (unused, untouched).

## Next step
Open sessions pick up bws-board on their next start (or after /reload-plugins). Optional follow-ups: check the chip by eye in an interactive band; publish to the `publish` branch when Brian asks.
