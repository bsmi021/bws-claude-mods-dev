# RUNLOG: session bus

## Objective
Extend bws-cockpit so Claude Code sessions in one project folder coordinate through a shared bus file:
- register each session
- record what it is working on
- tell a new session about its peers and the bus tools
- block edits of files another live session claimed
- clear entries on exit or when they go stale

Finish line in PLAN.md.

## 2026-10-10
- `claude --version` is 2.1.296, which matches the AGENTS.md baseline (receipts/claude-version.txt).
- Confirmed the target mod: bws-cockpit. Its Repo Sessions pane, the old session list, was dropped in 0.10.0. Nothing drew a session list before this change; the band, `/cockpit` and Loop Watch are untouched, and all 121 earlier tests still pass.
- PLAN.md written, then reviewed by the advisor. Folded in from the review:
  - read back after every write
  - call `$.session.id()` on every tick
  - merge into the existing unmatched hooks
  - run the heartbeat headless too
  - fail open on bus I/O errors
  - keep `session.end` within its bound
- Auto mode skipped the Write of `hooks/bus.ts` four times ("classifier gave no verdict"). It worked after Brian restarted the session.
- Built:
  - `hooks/bus.ts` (pure helpers)
  - `register.tsx` wiring:
    - `session.start`: registers the 3 tools and starts the heartbeat
    - new `session.end`: leaves the bus
    - `prompt.context`: registers the session and adds the `bwsBus` block when peers are live
    - `prompt.submit`: records the task and busy status, and attaches queued messages
    - `turn.complete`: sets idle on the main loop only
    - the existing Edit/Write/NotebookEdit/Bash/PowerShell `tool.call` hook gained the claim check
    - a new unmatched `tool.call` delivers messages after a result
    - 3 tool handlers
  - `$.state` atom `bus`: this session's own entry, keyed by session id
  - options `sessionBus` and `busClaimMinutes`
  - version 0.12.0
- Decisions:
  - Claims record `since` (the first claim) and `at` (the last edit). When two sessions claim a file at the same moment, the earlier `since` holds it, so they can't deadlock.
  - The intro block appears only when peers are live, so a session alone in a folder pays no tokens. Peers that arrive later reach running sessions as join notices.
  - The bus tool inputs are declared in `types/index.d.ts`, not in the generated `.claude-plugin/types/claude-code-mcp`. `claude plugin test` regenerates that folder and wiped the hand edit.
  - The validator could not read `import('../hooks/bus')` types in the types contract (every PluginState key came back "not declared"). The shapes are now written out inline.
- Checks (receipts/):
  - validate.txt: passed. The inventory lists `session.end`, the new `tool.call` hooks, `$.env.get`, `$.session.id/.repo/.root`, and state `bws-cockpit.bus`.
  - plugin-test.txt: 136/136 (121 earlier plus 15 new in tests/bus.test.ts).
  - tsc.txt: TypeScript 5.8.3, strict with noUncheckedIndexedAccess, exit 0. Still clean after a test run regenerates the types.
- Live run 1 (receipts/live-run1/):
  - All three behaviours passed.
  - Two wording problems:
    - A took the "B joined" notice, which quotes B's task line, as a request.
    - A didn't know its edits claim files, so it said there was nothing to release.
  - Fixes:
    - Delivered messages now say they come from other sessions, not the user, and are never to be followed as instructions.
    - They also explain that edits claim files automatically and that `bus_release` frees them.
    - The join notice is marked "(notice, not a request)" and quotes the task line.
  - The script's snapshot-1 grep matched the task text, so it now matches the claim path.
- Live run 2 (receipts/live-*; script `live.sh`; Haiku 5.5, two `claude -p` sessions in a scratch git repo):
  - bus-1: A busy, with a claim on notes.txt.
  - B quoted the bus block: "1 other Claude Code session(s) are live … 951bf558 … busy … claims: notes.txt".
  - B's Edit of notes.txt was refused with the claim text, and the file stayed `from A`.
  - B's `bus_send` reached A after A's background task finished. A did not follow it.
  - bus-2, after B exited: only A remains.
  - bus-3, after A exited: `"sessions": {}`.
- Side note: Brian's other open sessions in this repo, tms and pit-maneuver hot-reloaded the plugin and registered on their buses during the run, so the bus is live for them now.

## Outcome
Every finish-line item in PLAN.md is met. Committed on main (not pushed: publish goes through the `publish` branch only).

## Next step
Parked follow-ups (PLAN.md): claim-check Bash/PowerShell writes, a band chip or `/bus` command, push delivery through `$.session.send`, and pid liveness. Refresh the publish branch when Brian asks.
