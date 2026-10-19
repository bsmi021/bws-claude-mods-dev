# RUNLOG: AGENTS.md review from recent sessions

## Brief
Brian: look at the last few sessions, find updates for the repo's instruction file, and tooling or mods that would help.
This repo has no CLAUDE.md; `AGENTS.md` is the instruction file (loaded by `cc-plugin-agents-md`), so it was edited instead.

## Finish line
- `## This repo` in AGENTS.md matches the repo as it is now, with lessons from recent RUNLOGs folded in. Committed on a branch.
- Tooling and mod ideas listed, the top ones proposed as follow-up sessions. Nothing built.

## Sources
- RUNLOGs 2026-10-15 to 2026-10-19 (board-cards, sidechat-model-links, runlog-check, sidechat-desktop, cockpit-bar-layout,
  dashboard-tabs, tab-focus, interview-qa, publish-polish, patch-bumps), the 2026-10-13 and 2026-10-14 handoffs, memory.
- Brian's messages in the last 11 session transcripts.
- Counts by grep over the transcripts: cp1252 UnicodeEncodeError in 8 sessions, TS2589 in 5, `gh release create` in about 4 non-harness sessions.

## AGENTS.md changes (branch chore/agents-md-review)
- Stale: "bws-cockpit is one plugin ... bws-shell-lint is separate" -> 13 mods + bws-kit + sync-kit.
- Stale: "both plugins load through CLAUDE_CODE_PLUGIN_DIRS" -> the variable is unset; sessions load the installed marketplace copies.
- Checks -> `python tools/mods-gate.py --plugin <mod>`.
- Wrong: "claude-code-mcp is rewritten only on an interactive save" -> any live session bloats it; restore from bws-board.
- Added: peer-session staging, dashboard-tab focus/ownership rules, Desktop taking `/side`, `PYTHONIOENCODING=utf-8`,
  release steps, cache keyed by version (docs-only change needs a bump), uninstall drops pluginConfigs, validator forbids `h`.
- Version line notes 2.1.302-2.1.303.

## Proposed (not built)
1. `tools/publish.py`: the release ritual as one script.
2. mods-gate.py: auto-restore oversized claude-code-mcp types before tsc.
3. `tools/live.py`: promote the pywinpty + pyte harness from runs/2026-10-15-sidechat-model-links.
4. Cockpit "Versions" tab: source vs marketplace vs installed per mod (shelved).

## Notes
- Shelf #35 (bws-interview tab in cockpit) is already done per runs/2026-10-18-interview-qa; left open for Brian to close.

## Next
- Brian reviews the AGENTS.md diff; merge chore/agents-md-review into main and push `private`.
