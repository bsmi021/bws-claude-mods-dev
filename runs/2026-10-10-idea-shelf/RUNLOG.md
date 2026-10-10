# RUNLOG: bws-shelf 0.1.0 (idea shelf)

## Brief
Brian wants a shelf for ideas that would sidetrack the current task, his and Claude's, kept per project and
available in later conversations.

## Done
- New plugin `bws-shelf/`. `hooks/lib.ts` is pure (file format, add/close, per-project filter, text); `hooks/register.tsx` makes every `$` call.
  - `/idea <text>`: immediate, shows a toast, no transcript reply. Headless prints a line.
  - `/shelf [all]`: a pane with the open ideas (▶ resume fills the box, ✓ done, ✗ drop, `a` scope, `c` close). Headless prints a list.
  - Tools: `mcp__bws-shelf__shelve_idea` (not deferred), `list_ideas`, `close_idea`.
  - `prompt.context` adds one line to an attended conversation's first-message context (the open count, a snapshot) telling Claude to shelve tangents. Option `nudge`.
- Storage: `<CLAUDE_CONFIG_DIR or ~/.claude>/idea-shelf/shelf.json`, re-read before every write. `$.fs` instead of
  `$.store`, because the types don't say whether concurrent sessions see each other's store writes.
- Per project means the session root, compared without case; `/shelf all` shows every project.
- `~/.claude/settings.json` `env.CLAUDE_CODE_PLUGIN_DIRS` now ends in `;.../bws-shelf`. Backup:
  `settings.json.bak-2026-10-10-shelf`; the diff is that one line.
- Generated `.claude-plugin/types` came from bws-enhance (same CC version). The three tool inputs were added to
  `claude-code-mcp/index.d.ts` by hand, because a headless load doesn't rewrite it. Gitignored; an interactive save regenerates it.

## Evidence (`receipts/`)
- `validate.txt`: passed. `tests.txt`: 20 pass, 0 fail. `tsc.txt`: tsc 5.6 strict, exit 0, no output.
- `live-idea.jsonl`: `/idea` returned `Shelved #1: ...` with no model turn.
- `live-claude-shelves.jsonl`: Claude called `mcp__bws-shelf__shelve_idea` itself (`permission_denials: []`), got
  `Shelved as #2. Don't pursue it now; continue the current task.`, and finished the count without writing the README.
- `live-shelf-list.jsonl`: `/shelf` listed both ideas with detail. Those runs used a scratch shelf file through
  `--settings`, so the real shelf was not touched.
- `live-from-settings.jsonl`: a fresh `claude -p "/shelf"` with no `--plugin-dir` loaded bws-shelf from settings and
  answered from the real, empty shelf.

## Interactive check (drive-screen, Brian handed over the screen)
- A new terminal session (`live.ps1`/`launch.ps1`) ran with `--settings` pointing at a scratch shelf. The shelf was seeded
  with one idea from another project, so the real shelf was untouched.
- `ui-02`: two `/idea` commands left the transcript empty and saved #2 and #3 to the file.
- `ui-03`: `/shelf` opened a right-side pane: "2 open ideas · bws.mods.claude-code", rows `▶ ✓ ✗ #n text`, [All projects] [Close].
- `ui-04`: clicking All projects showed 3 ideas, including the other project's #1. `ui-05`: with the pane focused (one click
  inside it), `a` switched back to this project.
- `ui-06`: ✓ on #2 showed the note "#2 done". `ui-07`: ✗ on #1 in the all view showed "#1 dropped". The file has #1
  dropped and #2 done, each with `closedAt`.
- `ui-08`: ▶ on #3 put "Pick up shelved idea #3: ..." in the box, unsent, closed the pane and showed the toast; #3 stays open.
- Box cleared, session exited, window closed.
- Findings:
  - The pane opens on the right at about 40 columns, so idea text is cut with an ellipsis.
  - The pane opens without focus, so `a`/`c` need a click inside it first; the buttons work on click.
- One slip: the first launch's window hung below the taskbar. Closing it, `/exit` went through Git Bash path conversion
  (`C:/Program Files/Git/exit`) and may have reached that session as a one-line prompt. Relaunched; `MSYS_NO_PATHCONV=1` after that.

## Not verified
- The pane in Claude Desktop.
- A permission prompt for `shelve_idea` in default (non-auto) interactive mode. If one shows, allow-list `mcp__bws-shelf__*`.

## Next / follow-ups (parked)
- Pane: wrap idea text instead of cutting it in the narrow side pane; maybe open it focused when the box is empty.
- Refresh the `publish` branch with bws-shelf (name scan first).
- Band or footer indicator with the open count.
