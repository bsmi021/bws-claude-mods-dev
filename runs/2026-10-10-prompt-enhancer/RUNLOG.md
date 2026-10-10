# RUNLOG: bws-enhance (prompt enhancer)

## Brief
Mod that takes a rough prompt, rewrites it using the project's instructions, installed skills/commands, MCP servers and
conversation, puts it in the prompt box, and offers a Send button. Mid-task additions from Brian: keyboard shortcuts;
ground the rewrite in Anthropic's prompting guidance, per model.

## Done
- New plugin `bws-enhance/` (separate from cockpit). `/enhance <text>` (immediate), pane with Send/Revert/Put in box/Dismiss,
  hotkeys s/r/p/d/c, focus on result. Footer `✦ enhance` button borrowing `app:toggleDiffPreSession`, bound to
  `ctrl+x ctrl+p` in a new `~/.claude/keybindings.json` (file did not exist before).
- Band above prompt rejected: it's single-instance and cockpit owns it; nothing in the chain tells cockpit another plugin drew. Pane instead.
- System prompt rewritten from Anthropic's prompting best practices + per-model pages (receipt: receipts/anthropic-prompting-guidance.md);
  target model = `$.session.model()`, per-family notes are our inference (docs give no rewriter guidance).
- Checks: validate pass, 16/16 tests, tsc 5.6 strict clean. Live headless runs: receipts/live-headless*.jsonl.

## Next
- Interactive terminal check (pane, focus hotkeys, chord) — see below.
- Parked: auto-enhance on submit; enhance option inside other plugins' bands.
