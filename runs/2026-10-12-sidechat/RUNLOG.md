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
