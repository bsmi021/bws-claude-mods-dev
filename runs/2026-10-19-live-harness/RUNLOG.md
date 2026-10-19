# 2026-10-19 live harness

Brief: promote runs/2026-10-15-sidechat-model-links/scripts/live.py to a general `tools/live.py` so interactive checks stop being improvised (tmux or per-run scripts), and prove it on one existing live check.

- Worked in a worktree on `feat/live-harness` (peers share the main checkout; no branch switching there).
- Installed pywinpty 3.x (pyte was already there) into the Python 3.12 user site.
- `tools/live.py`: Live class (ConPTY spawn, pyte screen, waits on the rendered screen, SGR click on the lowest cell showing a label, dumps), a step DSL (say/type/key/click/wait/sleep/dump, from `--step` or a `--steps` file), startup that answers the trust dialog (its default is "No, exit", so it moves to Yes) and keeps the default No on the external CLAUDE.md imports dialog, `/exit` teardown with a kill fallback, and the MCP types restore (bws-board's lean copy from this checkout or, in a fresh worktree, the main checkout).
- Found: `--source-only` (`--setting-sources project,local`) drops user settings, and with them mouse tracking and the side-panel layout; kept it opt-in. The default run still loads installed mods next to the `--plugin` source copies (the strip showed Memory, Enhance, Better... from installed). `click:` refuses when mouse tracking was never switched on.
- Receipt (Claude Code 2.1.303, 170x50, scratch `<temp>/bws-live`): `python tools/live.py --plugin bws-cockpit --plugin bws-diagram --steps runs/2026-10-19-live-harness/dashboard-steps.txt --out runs/2026-10-19-live-harness/receipts/dashboard` -> exit 0. `01-dashboard.txt`: strip `[ Assumptions ] 2: Shelf 3: Board 4: Memory 5: Diagram ...`; a mouse click on "Diagram" -> `02-diagram-tab.txt`: `[ Diagram ]` selected, "No diagrams yet. /diagram draws the session." No model turn was spent.
- Types: this run's generated MCP types were 134 KB (no restore needed); the restore path was exercised with a fake 460 KB file and replaced it with bws-board's copy.
- AGENTS.md "Live checks" now points at `tools/live.py`.

Next: use it in the next mod's live step (e.g. Enhance / Side chat tab focus, still unconfirmed from 2026-10-18). Not done: no automated tests of the harness itself.
