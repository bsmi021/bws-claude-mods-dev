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

## Live check (drive-screen, Brian handed over ~3 min)
Windows Terminal, fullscreen layout, `claude --plugin-dir ./bws-enhance`. Receipts 01-09 in receipts/.
- 01: footer `✦ enhance` button drawn.
- 02: `/enhance what does bws-notify do, dont change anything` -> rewrite in box, pane docked with Send/Revert/Dismiss.
- 03: Enter sent it as a normal user turn; pane closed, box cleared. (Read-only answer followed.)
- 04/05: typed a draft + ctrl+x ctrl+p while Claude was mid-turn -> pane "Enhancing…", then rewrite replaced the draft. Chord works.
- 06: `r` went into the box: re-opening the pane with `focus: true` did NOT move focus. Removed that code.
- 07/08: ctrl+x tab then `r` still typed into the box: pane hotkeys not reached (maybe focus cycles band first). Open.
- 09: clicking Revert restored the draft and closed the pane.
- First launch failed: wt split the command on `;` (known trap); relaunched via a .ps1 file. Both windows closed after.
- Rewrite quality note: for "bws-notify" it said "find where it lives" because it gets no file tree. Fine; parked.

## Next
- Pane hotkeys: find why ctrl+x tab does not land in the pane (try a second ctrl+x tab, or close+reopen with focus). Needs another drive.
- Parked: auto-enhance on submit; give the rewriter a shallow file tree of the project root.
- Brian: add the folder to CLAUDE_CODE_PLUGIN_DIRS if keeping it.
