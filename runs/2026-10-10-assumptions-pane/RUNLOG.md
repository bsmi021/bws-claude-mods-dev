# RUNLOG: bws-assumptions 0.1.0

## Brief
Brian: while Claude builds and has to assume something, show a small side UI that expands on a button and lists every
assumption, so he can say right or wrong; on changes Claude makes them directly.

## Done
- New plugin `bws-assumptions/` (lib.ts pure, register.tsx the only `$` user, types/index.d.ts state contract).
- Capture: registered tool `record_assumption` (not deferred) + `prompt.compose` session section (only where the tool is offered).
- Pane: collapsed one line + Expand; expanded Right/Wrong per item, Wrong opens an Instead field; Send submits one
  `Assumption review` prompt as the user (deferred via clock.after); sent items dim; Clear sent.
- Status line keeps the count; `/assumptions` (immediate) opens it at any width, text list headless or unseated.
- The mod's own tool input is declared in types/index.d.ts (McpToolInputs merge): a `-p` load lays claude-code-mcp
  before session.start registers the tool, so tsc failed on the matcher without it.

## Evidence (receipts/)
- validate.txt: passes. test.txt: 12 pass, 0 fail. tsc.txt: TypeScript 5.8.3 strict, exit 0.
  (The `tsc` on PATH is the bogus `tsc@2.0.4` package; real one: pnpm global typescript@5.8.3.)
- live-run.jsonl: `claude -p` weather-script task, Claude called record_assumption twice unprompted
  (wttr.in; argv city + weather.py), "Recorded as A1/A2", no permission denial for the tool.

- Interactive (tmux 160x50, PowerShell, `claude --plugin-dir`): weather-script prompt; Claude recorded A1 (wttr.in) and
  A2 (argv city, London). Pane docked right, expanded via /assumptions; ctrl+x tab focus, e collapse/expand, Tab+Enter
  Right on A1, Wrong on A2, typed "read the city from the CITY env var, default Boston", Enter, Send. Claude got the
  `Assumption review` prompt and edited weather.py to `os.environ.get("CITY") or "Boston"`, A1 kept. Status line cleared.
  Receipts: tmux-expanded.txt, tmux-send-and-fix.txt.
- Fixes from the live run: Input label doubled its colon (`Instead: :`); collapsed line read `0 assumptions · 2 reviewed`
  (now `all reviewed · 2 sent`); Send hidden when nothing is open. Checks rerun: validate pass, 12/12, tsc exit 0.
- The unasked auto-open did seat at 160 columns (first capture missed it: the pane is on the right edge).

## Open
- Not tested: person-close flag; behaviour across /clear.
- Not added to CLAUDE_CODE_PLUGIN_DIRS or the publish branch (Brian's call).

## Session 2: loads every session
- Brian OK'd it: appended `C:/Projects/bws.mods.claude-code/bws-assumptions` to `CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json` (env block).
- Fresh `claude -p` (inherited var unset, so settings supply it): init lists all seven plugins incl. bws-assumptions 0.1.0 and the tool; reply OK.
  Receipt: receipts/plugin-dirs-load.jsonl.

## Session 3: published
- Scratch worktree on `publish` (was 9d875b0 = mods/main), `git checkout main -- bws-assumptions`.
- Scan (names, Gmail, project/game names, `C:/`, `Users/`, AppData, `runs/`, serials, UUIDs): only hit is manifest
  `"author": { "name": "Brian" }`, the same field every published mod carries; kept.
- Root README: "Five" -> "Six", a bws-assumptions row, `--plugin-dir` added to the load line.
- Published copy: validate pass, 12/12 tests.
- Commit eafc731 on `publish`; `git push mods`: 9d875b0..eafc731 publish -> main; mods/main = eafc731. Worktree removed.
- Seen, not touched: `publish` still has bws-cockpit 0.11.0 (main is 0.12.0) and no bws-shelf. Both are other sessions' work.
