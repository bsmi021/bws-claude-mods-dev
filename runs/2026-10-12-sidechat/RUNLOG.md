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
