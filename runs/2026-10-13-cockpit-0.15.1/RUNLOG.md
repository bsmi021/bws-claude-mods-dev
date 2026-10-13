# Run: bws-cockpit 0.15.1 (2026-10-13)

## Objective
Brian: add the `show` reply at `register.tsx:1152`, run the cockpit tests, finish 0.15.1.
Finish line: 0.15.1 committed, published to the bws-mods marketplace, installed, and `/cockpit show` answering in a fresh session.

## Found
- Installed 0.15.0 had no `show` text; source had uncommitted 0.15.1 work from another session (`/cockpit hide`, hide-button toast, `dashboardOnStart`, tests, version bump). Only `tests/cockpit.test.ts:509` expected "Cockpit bar shown."
- "No run folder" from `/cockpit` earlier was the session's cwd having moved into a run folder, not a cockpit bug.

## Done
- `hooks/register.tsx:1152`: appends `\nCockpit bar shown.` when the word is `show`.
- README: `/cockpit [show|hide]`, hide is no longer one-way, `dashboardOnStart` option row, 0.15.1 Tested row.
- Checks (main): validate passed, tsc 5.8.3 clean, 165/165 (`receipts/validate.txt`, `tsc.txt`, `test.txt`).
- Main commit `bc8c538`, pushed to `private` (`2437167..bc8c538`).
- Publish: scratch worktree of `publish` (`3abfb71`), `git restore --source=bc8c538 -- bws-cockpit`; tree identical to main (`receipts/tree-match-0.15.1.txt`); scan of 71 added lines, 68 folder names: 0 folder hits, 0 identifier hits (`receipts/scan-0.15.1.txt`). Marketplace + plugin validate passed; tsc clean (needs the untracked generated `.claude-plugin/types/` copied in); 165/165 (`receipts/publish-checks.txt`). Commit `f1b4caa`, `git push mods`: `3abfb71..f1b4caa` (`receipts/push.txt`). Worktree removed.
- `claude plugin marketplace update bws-mods`, `claude plugin update bws-cockpit@bws-mods`: 0.15.0 -> 0.15.1, exit 0 (`receipts/install.txt`).
- Fresh `claude -p "/cockpit show"` (`MSYS_NO_PATHCONV=1`, else Git Bash rewrites the leading `/`): loaded from `cache/bws-mods/bws-cockpit/0.15.1`, 0 `@inline`, printed "Cockpit bar shown." (`receipts/fresh-cockpit-show.txt`, `fresh-debug-excerpt.txt`).

## Not done / next
- Not checked by eye in an interactive session: the `3` hide toast, `/cockpit show` redrawing the bar, the dashboard opening at start with nothing waiting. Needs a new terminal (this session runs 0.15.0).
