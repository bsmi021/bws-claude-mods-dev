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

- This session (193b884d) never showed on this repo's bus. It started before `bus.ts` existed and its hot reload hasn't applied (no `bus_*` tools in its tool list), so this is not a mod bug. After the next restart, this repo's bus should list the new session.
- Follow-up from the final advisor review (second commit):
  - **Exit fix:** a heartbeat or `turn.complete` write still in flight could put an entry back after `session.end` removed it. Departed ids are now held in a module set, and `busSync` refuses to write for them. A `/clear` gets a new id, so it is unaffected. Test: end the session, then 3 heartbeats; the entry stays gone and no failure toast appears.
  - **`bus_release` test:** release one of two claims, and the peer can edit that file but not the other.
  - **Docs:** the heartbeat-race limit is now in the README's "Not covered" and in the PLAN's parked list.
  - **AGENTS.md:** two gotchas added: test runs regenerate the MCP types, and an `import()` type breaks the validator.
  - Tests: 138/138.

- Publish (Brian's request):
  - Made a scratch worktree of `publish` (eafc731, equal to `mods/main`) and ran `git checkout main -- bws-cockpit`. The only changes were the six 0.12.0 files.
  - Added the Session Bus to the bws-cockpit row of the top-level README.
  - Scanned the 1,089 added lines for names, emails, user paths, project and game names, session ids and hardware. Nothing was found. The only hits were `timeoutMs`, the neutral test ids `aaaaaaaa-…`, and the dummy `C:/Users/u`.
  - validate passed in the worktree (receipts/publish-validate.txt).
  - Committed `dadac39` and ran `git push mods`: `eafc731..dadac39 publish -> main` (receipts/publish-push.txt). `mods/main` is now `dadac39`. The worktree was removed.

## Follow-up 1: claim-check shell writes (0.13.0)
- Brief: a Bash or PowerShell command that writes a file another live session claimed is refused, using the command-position parser in shell.ts. Replay over the real-command corpus before shipping.
- A peer session (ad933363) asked over the bus whether I was committing 0.12.0. Its picture was out of date, so I replied with the commits and the publish, and asked it to stay off bws-cockpit while this change was in flight.
- Built `writeTargets(cmd, dialect)` in `hooks/shell.ts` (pure). It works per segment from `splitSegments` and `invocationOf`, and adds a lexer that resolves quotes and escapes and pulls out redirect targets. What it finds:
  - bash: redirects, tee, sed -i, cp/mv (handles `-t`, a folder destination, and mv sources)
  - PowerShell: the write cmdlets, Copy-Item and Move-Item (handles comma lists and `*>`)
  - `cd` / `Set-Location` tracking
  - It skips paths built from variables, globs, `~`, devices and shares, and skips `[[ > ]]`, `(( > ))` and arrows.
- `bus.ts` `normFile` now folds Git Bash `/c/x` into `c:/x`.
- In `register.tsx`, the existing Edit/Write/NotebookEdit/Bash/PowerShell `tool.call` hook now calls `busClaim` with every write in the call: one bus read, refuse on the first claimed file, otherwise claim. Shell writes claim only files inside the bus folder that the command plainly names, never cp/mv's guessed dest/name.
- Corpus replay (`corpus_build.py` + `corpus_replay.mts`; corpus in the scratchpad, not committed): 77,784 distinct commands from 30 days, day-job projects excluded, with receipts/corpus-replay-write-targets.md.
  - The first pass flagged 82 odd targets, which turned into three fixes:
    - `sed -i \` line continuations produced a newline "file"
    - PowerShell `@'…'@` here-string bodies containing an apostrophe and `>` produced redirects (`git commit -m @'…'@`)
    - `Move-Item a, b dest` comma lists
  - After the fixes: 10,627 commands write a file it can name. Redirect 8,999, sed -i 2,737, cp 1,709, tee 587, cmdlet 459, mv 259 plus 167 sources. 49 µs per command.
  - Two odd targets remain, both real writes: `cp -r bin2 bin3`, and a stray `E=1` argument to `sed -i`.
  - Samples of every kind were read by hand.
- Checks: validate passed, 143/143 tests (7 new), tsc clean (receipts/validate.txt, plugin-test.txt, tsc.txt). Version 0.13.0. README updated (claims, not covered, capabilities, tested).
- Not done: a live run of a shell write from a second session. The plugin tests cover the hook end to end over a shared bus file. Parked shell writes: git checkout/restore, rm, script writes, variable paths.

- Publish 0.13.0 (Brian's request):
  - By then main held bws-cockpit 0.14.0 (`3f6bfd9`, another session), which moves the bus to bws-board. bws-board is unpublished, so I published 0.13.0 as asked, from `ee31074`. It stands on its own.
  - Worktree of `publish` (dadac39), then `git checkout ee31074 -- bws-cockpit`. The only changes were the six 0.13.0 files.
  - Scanned the 374 added lines. One hit: a corpus test string named Brian, changed to "it's" in the publish copy only (main's copy was already gone in 0.14.0). The author field in plugin.json was already published.
  - Top-level README row: claims now cover shell writes.
  - In the worktree, validate passed and 143/143 tests passed (receipts/publish13-*).
  - Committed `1fa871e` and pushed: `dadac39..1fa871e publish -> main`. The worktree was removed.

- Publish bws-board 0.1.0 + bws-cockpit 0.14.0 (Brian's request):
  - Main had moved on to bws-board 0.2.0 (`0162120`, another session). Cockpit is identical at `44249cf` and HEAD, so both came from `44249cf`, where 0.1.0 and 0.14.0 shipped together.
  - `git checkout 44249cf -- bws-cockpit bws-board` left 0.13.0's `hooks/bus.ts` and `tests/bus.test.ts` in place, and cockpit's test run failed on them ("the file did not load"). I removed both. After that the tree matched `44249cf` exactly. The trap is now noted in AGENTS.md.
  - Scanned the 2,709 added lines. Hits: only the author field (as in the other plugins), the neutral test ids `aaaaaaaa-…`, and the dummy `C:/Users/u` and `C:/Users/someone`.
  - Top-level README: seven mods. The cockpit row swaps the Session Bus for the board chip; added a bws-board row and its load flag.
  - In the worktree, validate passed for both. Tests: board 45/45, cockpit 122/122 (receipts/publish14-*).
  - Committed `e07a3a5` and pushed: `1fa871e..e07a3a5 publish -> main`. The worktree was removed.

- Publish bws-board 0.2.0 (Brian's request):
  - Source `0162120`. The working tree holds another session's uncommitted 0.3.0, which I left alone; the worktree checkout reads the commit only.
  - `git checkout 0162120 -- bws-board`. The file list and contents of bws-board and bws-cockpit matched `0162120` exactly, with no leftovers.
  - Scanned the 946 added lines. Hits: only the neutral test ids, plus a relative `runs/` reference to unpublished receipts (the 0.1.0 README has the same kind).
  - Top-level README: the bws-board row now mentions history and `/board digest`.
  - In the worktree, validate passed and 61/61 tests passed (receipts/publish-board020-*).
  - Committed `55f3a76` and pushed: `e07a3a5..55f3a76 publish -> main`. The worktree was removed.

## Outcome
Every finish-line item in PLAN.md is met. Committed on main (not pushed). Published bws-board 0.2.0 + bws-cockpit 0.14.0 as `publish` 55f3a76 = `mods/main`.

## Next step
Parked follow-ups (PLAN.md): claim-check Bash/PowerShell writes, a band chip or `/bus` command, push delivery through `$.session.send`, and pid liveness.
