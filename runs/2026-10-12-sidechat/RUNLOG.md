# RUNLOG: bws-sidechat

Brief: side chat in the right pane; /fork and /btw open it, forked from the current conversation, main untouched.

## Done
- Probe: `claude -p /btw`, `/fork` headless don't exist (built-ins are interactive only), so the command names `btw`/`fork`/`branch` are matched by guess, unverified interactively.
- Live backend check (receipts/): `claude -p ... --resume <this session> --fork-session --session-id <uuid> --strict-mcp-config --allowedTools Read Glob Grep` answered with this conversation's context; first token 3.8 s, total 8.5 s, fork file written, session_id = the minted one.
- Mod spawn check: `$.process.spawn(['claude','--version'])` works on Windows.
- bws-sidechat/ built: side.ts (pure), register.tsx, types, README, 25 tests.
- validate passes, tsc 5.8.3 clean, `claude plugin test` 25/25.

## Decisions / assumptions
- Real fork via child process, not $.model.fork (multi-turn, tools).
- Child: plugins off, MCP off, read-only tools. /btw continues an open side chat; /fork always starts fresh.
- Mid-turn: sends immediately, fork sees up to the last saved message.

## Next
- Brian: add `C:/Projects/bws.mods.claude-code/bws-sidechat` to CLAUDE_CODE_PLUGIN_DIRS (not changed), start a session, try /btw and /fork. If they don't open the pane, the built-in's name differs: check with `claude --debug`.
