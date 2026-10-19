# Live harness

## Finish line
- [x] `tools/live.py`: start `claude --plugin-dir <mods...>` at a given size in a scratch folder; steps for text, keys, SGR clicks on a cell found by label, waits on screen text; screen dumps to a receipts folder. NO_COLOR cleared, MSYS_NO_PATHCONV=1. Bloated `claude-code-mcp/index.d.ts` (>400 KB) restored from bws-board after the run.
- [x] Reproduces an existing live check: `/dashboard` with bws-cockpit + bws-diagram from source shows the tab strip with Diagram; a real click switches to the Diagram tab (receipts/dashboard/).
- [x] AGENTS.md "Live checks" points at it.
- [x] Committed on `feat/live-harness` (worktree `../bws.mods.claude-code-live-harness`; the shared checkout stays on its branch).

Out of scope: converting older per-run scripts; a test suite for the harness.
