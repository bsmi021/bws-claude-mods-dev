# RUNLOG: Shelf tab as cards (bws-cockpit 0.22.0)

## Brief
Brian: make each idea on the idea shelf a card with borders and emoji, and separate projects in the all-projects view.
The shelf is bws-cockpit's dashboard Shelf tab. Finish line: PLAN.md.

## Done
- hooks/shelf.ts: `groupByProject` (this project first, then the project with the newest idea; per-project cap; same folder
  names shown by full path) and `detailLine`.
- register.tsx Shelf tab: one round-bordered card per idea (`idea-<id>`), border `claude` for Claude's ideas and `suggestion`
  for yours; header `🤖/🙋 #id · who · age ago`, `💡 text`, `📝 first detail line`, buttons `▶ Resume`, `✓ Done`, `✗ Drop`
  (keys unchanged). Glyphs only at line starts, as on the Board tab. All projects: a `📁 name · N open` header per project
  (`proj-<path>`), four cards each, a "more" line when cut.
- 0.22.0, CHANGELOG, README. Assumptions A1 (four per project) and A2 (colours and glyphs).

## Evidence
- `python tools/mods-gate.py --plugin bws-cockpit`: ok (validate, 214 tests, tsc). New tests: groupByProject, the card props.
- Live (tools/live.py, cockpit from source, real shelf, read only): receipts/live (170x50) shows aligned card borders;
  receipts/live-tall (170x140) shows six project headers with "more" lines for harness-loop and bws.game.tms.

## Next
- Released as 1.8.0 (below).

## Release (2026-10-19)
- bws-mods 1.8.0 (bws-cockpit 0.22.0) via `tools/publish.py bws-cockpit --version 1.8.0 --push`: marketplace bump 84b3d60
  pushed to private; dry run then push: worktree matched main, privacy scan clean, gate 13/13 in the worktree.
  `publish` 690db5c pushed to mods main, tag v1.8.0. Release: https://github.com/bsmi021/bws-claude-mods/releases/tag/v1.8.0
- Installed on this machine: `claude plugin marketplace update bws-mods` + `claude plugin update bws-cockpit@bws-mods`
  (0.21.2 -> 0.22.0, cache 0.22.0 has groupByProject); pluginConfigs for bws-cockpit unchanged.
- Open sessions need `/reload-plugins` (or a restart) to draw the cards.
