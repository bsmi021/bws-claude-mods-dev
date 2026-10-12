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
