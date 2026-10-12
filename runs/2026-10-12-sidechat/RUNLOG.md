# RUNLOG: bws-sidechat

Brief: side chat in the right pane; /fork and /btw open it, forked from the current conversation, main untouched.

## Done
- Command names: headless `-p` has no `/btw`/`/fork`, so checked the binary instead: `btw`, `branch` and `fork` are all registered local-jsx commands (so `command.run` should see them; same kind as `/diff`, which a built-in mod takes over). Not yet seen firing in a live terminal.
- Live backend check (receipts/): `claude -p ... --resume <this session> --fork-session --session-id <uuid> --strict-mcp-config --allowedTools Read Glob Grep` answered with this conversation's context; first token 3.8 s, total 8.5 s, fork file written, session_id = the minted one.
- Mod spawn check: `$.process.spawn(['claude','--version'])` works on Windows.
- bws-sidechat/ built: side.ts (pure), register.tsx, types, README, 25 tests.
- Fixed: Stop no longer marks the fork as made unless the child printed its init line.
- validate passes, tsc 5.8.3 clean, `claude plugin test` 25/25.

## Interactive check (2026-10-12, drive-screen, Windows Terminal 120 cols)
- `/btw` reached the mod as `btw`; `/fork` as `fork` or `branch` (both hooked; the log does not say which). `/side` works.
- First try: pane did not open. Cause (from the debug log): I opened the pane from `$.clock.after`, which the engine counts as *unasked*, and unasked panes need 144 columns. Fix: `$.ui.open` inside the command hook (asked, placed at any width); focus requested again after.
- After fix: `/btw hello again` showed the Side chat tab beside Dashboard with both answers (child ~5 s, exit 0); main transcript unchanged. `/fork` showed a fresh empty side chat. Receipts: 06-09 png, debug-sidechat.log.
- Not checked by hand: typing into the pane's Ask box, Stop, scroll buttons, narrow terminal.

## Decisions / assumptions
- Real fork via child process, not $.model.fork (multi-turn, tools).
- Child: plugins off, MCP off, read-only tools. /btw continues an open side chat; /fork always starts fresh.
- Mid-turn: sends immediately, fork sees up to the last saved message.

## Next
- (old) Brian: add `C:/Projects/bws.mods.claude-code/bws-sidechat` to CLAUDE_CODE_PLUGIN_DIRS (not changed), start a session, try /btw and /fork. If they don't open the pane, the built-in's name differs: check with `claude --debug`.

## Published (2026-10-12)
- main `a6d6545`: README note + bws-sidechat in `.claude-plugin/marketplace.json` (sorted, seven mods).
- Scratch worktree of `publish` (`bc96bc7`): `git restore --source=a6d6545 --staged --worktree -- bws-sidechat .claude-plugin`; top-level README (publish-only) now says seven mods, adds the row, install and `--plugin-dir` entries. Types folder copied in for tsc.
- On the publish tree: validate passed (plugin and marketplace), 25/25 tests, tsc 5.8.3 exit 0, tree and file list match main (`receipts/tree-match.txt`).
- Scan of 811 added lines (`receipts/added-lines.txt`) against 70 folder names under C:/Projects, emails, handles, home/temp paths, session ids, serials, game/project words: no hits except `"author": "Brian"` (already in every published plugin.json).
- Commit `de29b7d` on publish; `git push mods`: `bc96bc7..de29b7d publish -> main`; `mods/main` = `de29b7d`. Worktree removed.
- Installed copy not updated: `claude plugin marketplace update bws-mods && claude plugin install bws-sidechat@bws-mods` when wanted.

## Installed (2026-10-12)
- `claude plugin marketplace update bws-mods` (re-cloned), `claude plugin install bws-sidechat@bws-mods`: both exit 0, user scope, 0.1.0 enabled (`receipts/install.txt`). Six userConfig options unset: defaults apply.
- Fresh `claude -p` with no `--plugin-dir`: `bws-sidechat@bws-mods` loaded from `~/.claude/plugins/cache/bws-mods/bws-sidechat/0.1.0`, events session.start, command.run, ui.render; `/side` registered (`receipts/fresh-session.txt`). Headless draws no pane; the pane itself was checked earlier via `--plugin-dir`.

## Interactive pass 2: installed copy, Ask box, Stop, scroll (2026-10-12, drive-screen)
Receipts 10-16 png, debug3-sidechat.txt. Installed copy (no --plugin-dir) loads; `/btw` answered in the pane (5.2 s, exit 0).
Found:
1. Pane gets no keyboard focus after `/btw`/`/fork` (cursor stays in the main prompt). `ctrl+x` then `tab` did nothing. Clicking the Ask row focuses it; typing, Enter and streaming then work (live text shows).
2. Tall messages overflow the pane: `windowOf` always keeps one message even when it is taller than the room, and live text is not in the row budget, so the busy row / Stop, the "Stopped." note and the Ask box are pushed below the pane's bottom edge. Ask box invisible after a long answer.
3. Stop: could not confirm. The child ended `(0)` in 14.9 s with 231 chunks, i.e. it ran to completion; either the click missed or `stream.return()` did not kill it. The pane showed no "Stopped." note (clipped).
4. Scroll: `↑ n earlier` / `↓ n newer` both work, but step 3 messages and jump the view (back to the first exchange / to the long essay).
Stray text "rite a 400 word essay..." was left in the test window's main prompt by a failed first attempt (ctrl+a + delete removed one character).

## 0.1.1: fixes for the pass-2 findings (2026-10-12)
1. Focus: the engine hands the keys back to the prompt once the opening command returns, and the single 10 ms request lost to that. Now asked at 10, 250 and 800 ms (each only while the composer is empty and the pane is not already focused), then `$.ui.focus` puts the ring on the Ask box (key `ask-<n>`). The Ask box key no longer changes with busy state or message count (it remounted mid-answer and lost typing); it changes only on send, and the ring follows it.
2. Overflow: the transcript is now rows (`wrapLines`, `transcriptRows`), each at most the pane width, windowed by `roomOf(bodyRows)` = bodyRows - 7 chrome rows. The header, scroll buttons, Stop and Ask box always keep their rows; no message can exceed the window.
3. Stop: `stream.return()` only takes effect when the next piece arrives, which a thinking child never sends. Stop, New fork and Close now also run `killArgv(sideId)` (PowerShell: find the process whose command line holds the side session id, excluding itself, Stop-Process; `pkill -f` off Windows; non-uuid ids refused). Verified live against a real long `claude -p`: 1 process found, killed (exit 127), output stopped growing (receipts/kill-check.txt).
4. Scroll: buttons step half the room (min 3 rows) and clamp at both ends; labels say rows.
- 48 tests (was 25): wrapLines/transcriptRows/windowRows/clampBack/killArgv unit tests; long answer keeps Input, scroll buttons step 6 rows at bodyRows 20, Stop kills a silent child, New fork and Close kill, focus retry/yield. validate passes, tsc 5.8.3 clean.
- Not provable in a test: `$.ui.focus` (the engine answers it before a test stub); keyboard focus and scroll on a long answer need a live look.
- Not published: marketplace and installed copies are still 0.1.0.

## Published and installed 0.1.1 (2026-10-12)
- main `93087f8` (test session id replaced with a dummy: the scan found a real throwaway fork id in side.test.ts; first scan regexes were mangled by Git Bash backslash halving, so the scan is now `runs/2026-10-12-sidechat/scan.py`, written with the Write tool).
- Scratch worktree of `publish` (`de29b7d`), `git restore --source=93087f8 --staged --worktree -- bws-sidechat`; tree and file list match main (`receipts/tree-match-0.1.1.txt`). Scan of 496 added lines: 0 folder-name hits (67 names), 0 identifier hits except the dummy uuid (`receipts/scan-0.1.1.txt`).
- On the publish tree: validate (plugin and marketplace), 48/48 tests, tsc 5.8.3 clean. Commit `e788873`; `git push mods`: `de29b7d..e788873 publish -> main`; `mods/main` = `e788873`. Worktree removed.
- `claude plugin marketplace update bws-mods` and `claude plugin update bws-sidechat@bws-mods`: both exit 0, 0.1.0 -> 0.1.1 (user scope). Fresh `claude -p` (no --plugin-dir) loaded `bws-sidechat@bws-mods` from cache/.../0.1.1, `/side` registered (`receipts/fresh-session-0.1.1.txt`).
- Config note: cockpit, shell-lint, notify, design-picker, enhance and board load from local source via CLAUDE_CODE_PLUGIN_DIRS (shadowing their marketplace installs); bws-sidechat loads from the marketplace only.

## 0.1.2: hotkey (2026-10-12)
- A mod cannot bind a chord; a Button can borrow an engine keybinding action (`action=`), as bws-enhance does. Added a `◨ side` button to the footer (`ui.render` on `SessionMode`, terminal only, shares the footer with another mod's tree via `next`), option `chordAction` (default `app:cycleDiffBase`; empty hides it). Press = `openPane` (continues the side chat there is; focus asked after the command as before).
- Bound `ctrl+x ctrl+o` -> `app:cycleDiffBase` (Global) in ~/.claude/keybindings.json on this machine: free per the binary's chord list (taken: ctrl+x b, ctrl+b, ctrl+s, ctrl+e, ctrl+k, ctrl+a, tab, x). Other computers need the same line (README).
- 56 tests (7 new hotkey tests + 2 no-button). validate, tsc 5.8.3, plugin test pass.
- Not checked live: the button's position next to bws-enhance's footer button (hook order decides whether another mod's tree is shared), the chord pressing it, while /diff is open the chord belongs to the diff pane.
- Not published: marketplace and installed copy are still 0.1.1. Marketplace already lists bws-sidechat (mods/main e788873).

## Published and installed 0.1.2 (2026-10-12)
- Scratch worktree of `publish` (`e788873`), `git restore --source=96537ef --staged --worktree -- bws-sidechat`; tree and file list match main (`receipts/tree-match-0.1.2.txt`). Scan (`scan.py`) of 152 added lines, 67 folder names: 0 folder hits; 2 identifier hits, both expected (the install line's repo owner, already in the published top-level README; the plugin.json author "Brian", reformatted) (`receipts/scan-0.1.2.txt`).
- Publish tree: validate (plugin and marketplace), 56/56 tests, tsc 5.8.3 clean. Commit `1c3470d`; `git push mods`: `e788873..1c3470d publish -> main`; `mods/main` = `1c3470d`. Worktree removed.
- `claude plugin marketplace update bws-mods` + `claude plugin update bws-sidechat@bws-mods`: exit 0, 0.1.1 -> 0.1.2. Fresh `claude -p` (no --plugin-dir) loaded `bws-sidechat@bws-mods` from cache/.../0.1.2, `/side` registered (`receipts/fresh-session-0.1.2.txt`); cached plugin.json has `chordAction`.
- The footer button and chord are still unseen in a live terminal (headless draws no footer).

## Interactive pass 3: installed 0.1.2 (2026-10-12, drive-screen; receipts 20-27 png)
- Keyboard focus on open: FIXED. After `/side` the Ask box shows its focus hint and the main prompt cursor is gone; typed text went straight into the Ask box with no click (23, 24).
- Long answer layout: FIXED. A ~600-word answer (80+ rows) kept `Stop`/`answering…` and the Ask box in view while streaming, and "↑ 80 rows above" + the Ask box after it finished (24, 25).
- Scroll up: works, smooth: 80 -> 72 rows above (8-row step), "↓ 8 rows below" appears (26).
- Footer `◨ side` button: BROKEN. Not drawn; footer shows only "✦ enhance" (20). Debug log: the SessionMode chain is `bws-enhance@inline, next-steps, bws-sidechat@bws-mods`; bws-enhance (inline, above) returns its own tree without calling `next`, so sidechat's hook never draws. The chord `ctrl+x ctrl+o` therefore does nothing (21): no mounted Button carries the action.
- Not checked: `↓` button and Stop. The terminal window moved from x=27 to x=-176 between shots, so the `↓` click landed on text (selected it) (27); out of time before Stop.

## Hotkey fix: share the footer (2026-10-12)
- Cause (pass 3): the SessionMode chain is bws-enhance (inline, above) -> next-steps -> bws-sidechat; bws-enhance returned its own tree without `next`, so sidechat's `◨ side` never drew and the chord had no button.
- bws-enhance 0.2.1: the SessionMode hook now calls `next(e)` (via a local `settle`), keeps another mod's tree beside `✦ enhance`, and draws the mode labels itself only when nothing else did (so they are drawn once). Same pattern as bws-cockpit's AbovePrompt and bws-sidechat's own hook. 2 new tests (18 total): shared footer, and the engine-below case.
- bws-sidechat 0.1.3: no code change; 1 new test (57 total) that another mod's footer stays beside `◨ side`; README notes the pairing.
- validate, tsc 5.8.3, plugin test pass for both (enhance 18/18, sidechat 57/57).
- bws-enhance loads inline from source, so the fix is live in the next new session; sidechat 0.1.2 installed has the same hook. Not published (marketplace: enhance 0.2.0, sidechat 0.1.2). Not seen live: both buttons in the footer and the chord pressing `◨ side`.
