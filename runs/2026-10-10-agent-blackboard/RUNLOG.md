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

## Next step
T3: register.tsx wiring. T5 (cockpit cut-over) still waits for 193b884d's confirmation or Brian's OK.
