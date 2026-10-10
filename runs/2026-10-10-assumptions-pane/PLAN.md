# Assumptions pane (bws-assumptions)

## Finish line
- [x] New plugin `bws-assumptions/`: Claude calls `mcp__bws-assumptions__record_assumption` whenever it makes an unstated choice mid-build, and keeps working.
- [x] A small side pane opens: one line (count + Expand). Expanded, it lists every assumption with Right / Wrong; Wrong takes a correction.
- [x] "Send to Claude" submits one prompt with the verdicts; Claude applies the corrections directly.
- [x] Status line shows the unreviewed count when the pane is closed or can't seat (narrow terminal). `/assumptions` opens it at any width; text list headless.
- [x] Checks: `claude plugin validate`, `claude plugin test`, tsc strict clean.
- [x] Live `claude -p` run: the model calls the tool on a task with an unstated choice; no permission prompt blocks it (or README says how to allow it).

## Out of scope (park as follow-ups)
- Auto-detecting assumptions from prose without the tool.
- Adding to CLAUDE_CODE_PLUGIN_DIRS / publish branch (needs Brian's OK).

## Design
- Capture: registered tool (not deferred) + a `prompt.compose` session section telling Claude when to call it.
- State: `$.state` atom `bws-assumptions.items` and `.ui` (expanded, closedByPerson). Survives reloads; it is the session's list.
- Send: deferred `$.prompt.submit({ asUser: true })`; queued until idle if Claude is busy.
