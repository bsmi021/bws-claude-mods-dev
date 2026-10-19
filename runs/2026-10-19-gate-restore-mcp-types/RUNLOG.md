# 2026-10-19 gate restores oversized claude-code-mcp types

Finish line: `tools/mods-gate.py` replaces `<plugin>/.claude-plugin/types/claude-code-mcp/index.d.ts` with bws-board's copy when it is over 400 KB (and board's is under), prints one line, before tsc. Test or receipt shows it; full gate passes; AGENTS.md bullet says "the gate restores it".

## Done
- `restore_lean_mcp_types(plugin, root)` in `tools/mods-gate.py`; called in `check()` right before tsc (after `plugin test`, which regenerates the folder) and for `bws-cockpit` in `check_kit()`.
- If the plugin is bws-board itself, or board's copy is missing/oversized, it prints a `warn` line and leaves the file.
- `tools/test_mods_gate.py` (5 tests), run by the full gate as "gate tests".
- AGENTS.md claude-code-mcp bullet: manual-copy instruction replaced with "The gate restores it".
- Work is in worktree `C:/Projects/bws.mods.claude-code-gate-mcp`, branch `fix/gate-restore-mcp-types` (the shared checkout had a peer switching branches).

## Receipt
`receipts/full-gate.txt`: full gate run with bws-cockpit's types padded to 618 KB beforehand.

Result: restored line printed for bws-cockpit (603 KB -> 288 KB), all 13 plugins + kit + sync + gate tests ok, exit 0, 124s.
