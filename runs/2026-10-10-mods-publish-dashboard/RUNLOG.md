# RUNLOG: publish bws-cockpit 0.15.0 and bws-board 0.5.0 to mods

## Objective
Refresh the orphan `publish` branch from main per AGENTS.md, drop bws-assumptions and bws-shelf, scan, push to `mods`.

## 2026-10-10
- Source: main `fc4d93e`. Against `publish` (`9351fec`), only bws-cockpit, bws-board, `.claude-plugin` and the two
  retired folders differed; design-picker, enhance, notify and shell-lint were already identical, so the publish
  stayed to the two mods named. bws-board goes from the published 0.2.0 straight to 0.5.0 (0.3.0 git lease and
  0.4.0 overwrite guard ride along, as they are in 0.5.0).
- Scratch worktree of `publish`: `git restore --source=fc4d93e --staged --worktree -- bws-cockpit bws-board
  .claude-plugin`, `git rm -r bws-assumptions bws-shelf`. Every folder matched main by file list and content
  (`receipts/tree-match.txt`). `.claude-plugin/marketplace.json` from main already lists the six.
- Top-level README (publish-only): six mods, cockpit row rewritten for the dashboard, board row updated
  (`/board pane` → Board tab, git lease and overwrite guard), the retired rows, install and `--plugin-dir` entries
  removed, and a retirement note with the uninstall / `marketplace update` / `plugin update` lines (commands checked
  against `claude plugin --help`).
- Checks on the exact publish tree (types copied in first): validate passed for both mods and the marketplace;
  cockpit 162/162, board 83/83; tsc 5.8.3 exit 0 for both (`receipts/publish-*`).
- Scan of 2,683 added lines (`receipts/added-lines.txt`) against the 71 folder names under C:/Projects, personal
  identifiers, emails, home and temp paths, this repo's and worktrees' paths, session ids and device serials: only
  test dummies (`Users/me`, `C:/Projects/game|site`, `aaaaaaaa-`/`bbbbbbbb-` ids), the owner's first name in cockpit's
  Tested row (already public as the plugin.json author), and `runs/.../receipts/` citations as board already publishes.
- Committed `bc96bc7` on publish; `git push mods`: `9351fec..bc96bc7 publish -> main`; after fetch `mods/main` =
  `bc96bc7`. Worktree removed.

## Installed copies updated
- `claude plugin marketplace update bws-mods` (re-cloned from GitHub), then `claude plugin update` for both:
  bws-cockpit 0.14.0 → 0.15.0, bws-board 0.2.0 → 0.5.0, user scope, all exit 0 (`receipts/install-update.txt`).
- `claude plugin list` shows both enabled at 0.15.0 / 0.5.0; the cache holds `bws-cockpit/0.15.0` and
  `bws-board/0.5.0` with matching plugin.json versions (the old version folders are still beside them).

## Next step
None. Sessions pick up the update on restart; while the source folders are on `CLAUDE_CODE_PLUGIN_DIRS`, the
source copies (same versions) load instead.
