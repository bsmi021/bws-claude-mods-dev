# Install and publish all eight bws mods

## Finish line (all true)
- [x] All eight mods load locally, as installed plugins, in a fresh session (receipts/load-*)
- [x] Every mod passes validate, `claude plugin test`, and tsc 5.8.3 in a clean worktree of the source commit (receipts/checks-*)
- [x] Main is pushed to `private` (bws-claude-mods-dev, private)
- [x] `mods/main` holds all eight mods, each identical to the source commit (receipts/publish-*)
- [x] RUNLOG records the commit hashes and any blockers

## Install method
`docs/mods.md` ("Install or update a mod"): a mod installs as a plugin from a marketplace, with `claude plugin install <plugin>@<marketplace>`, then `/reload-plugins` in open sessions.
- The repo has no marketplace yet. Add `.claude-plugin/marketplace.json` at the repo root, listing the eight `./bws-*` folders.
- The marketplace source is the published GitHub repo (`bsmi021/bws-claude-mods`), not this working tree. A directory marketplace reads the folder in place, so it would install another session's uncommitted bws-board 0.3.0.
- `CLAUDE_CODE_PLUGIN_DIRS` already loads the eight source folders in every session. Whether an installed copy is shadowed or loads twice gets checked by test, not guessed.

## Mods and source commit
All eight publish from one main commit: the marketplace + bws-enhance README commit made in step 2. Its hash goes in RUNLOG.

| Mod | Version | Published now | Change |
|---|---|---|---|
| bws-assumptions | 0.1.0 | = HEAD | none |
| bws-board | 0.2.0 (committed; working tree 0.3.0 belongs to another session, left out) | = HEAD | none |
| bws-cockpit | 0.14.0 | = HEAD | none |
| bws-design-picker | 0.2.3 | = HEAD | none |
| bws-enhance | 0.2.0 | README differs | main's README has a local path and a `runs/` link; scrub it to the published form |
| bws-notify | 0.1.1 | = HEAD | none |
| bws-shelf | 0.1.2 | not published | first publish; scan every line |
| bws-shell-lint | 0.2.0 | = HEAD | none |

## Steps
1. Checks in a clean worktree of HEAD: validate, `plugin test`, tsc for all eight.
2. Main commit (explicit paths only): `.claude-plugin/marketplace.json` and the bws-enhance README. Validate the marketplace. `git push private main`.
3. Publish worktree from `publish`: `git restore --source=<main commit> --staged --worktree -- <dirs>`, verify exact match, top-level README (eight mods), scan, validate, commit, `git push mods`.
4. `claude plugin marketplace add bsmi021/bws-claude-mods`, then install all eight; check that a fresh session loads them, with and without `CLAUDE_CODE_PLUGIN_DIRS`.
5. RUNLOG.

## Parked
- None yet.
