# RUNLOG: install and publish all eight bws mods

## Objective
Install the eight bws mods on this machine the way `docs/mods.md` says (from a marketplace) and push all their code to GitHub in one pass: main to `private`, the eight mods to `mods` `main` through a scratch worktree, each identical to its source commit. Finish line in PLAN.md.

## 2026-10-10
- Install method: `docs/mods.md` "Install or update a mod" says to install from a marketplace (`claude plugin install <plugin>@<marketplace>`). The repo had no marketplace, so I added `.claude-plugin/marketplace.json` (name `bws-mods`, eight `./bws-*` sources). The marketplace source is the published GitHub repo, not this working tree: a directory marketplace reads the folder in place and would have picked up unpublished work.
- Orientation:
  - Six mods were already published identical to HEAD.
  - bws-enhance on main had a local path and a `runs/` link in its README that the published copy didn't.
  - bws-shelf had never been published.
- **Change mid-run:** the other session committed bws-board 0.3.0 itself (`21305f7`, `3f58643`) while I was starting, so the working tree was clean. You'd said to keep 0.3.0 out of the publish, so bws-board publishes and installs at 0.2.0 (tree `0162120`). 0.3.0 is on main and pushed to `private`. Its own PLAN shows every finish-line item ticked, so it's ready for a later publish.
- Checks on HEAD `3f58643`, in a clean detached worktree (receipts/checks-head-*):
  - Validate passed for all eight.
  - Tests: assumptions 12, board 75 (0.3.0), cockpit 122, design-picker 27, enhance 16, notify 12, shelf 26, shell-lint 17. All pass.
  - **Tooling fix:** tsc failed for all eight in the fresh worktree because `.claude-plugin/types/` is gitignored and wasn't generated there (TS5083: no `types/tsconfig.json`). I copied each mod's generated types (Claude Code 2.1.296) from the working tree, and tsc 5.8.3 is clean for all eight.
- Main commits (explicit paths only):
  - `fd09e8d`: marketplace, plus the bws-enhance README in its published form (no local path or `runs/` link).
  - `7a6f5fd`: dropped per-plugin descriptions from the marketplace. The file describes no particular version (bws-board's 0.3.0 description would have described a git lease 0.2.0 lacks), so it's identical on main and publish.
  - Marketplace validate passed. The only warnings are that the eight mod READMEs lack a marketplace install line. The top-level published README has the install lines instead (receipts/marketplace-validate.txt).
  - `git push private main`: `974f348..7a6f5fd` (bws-claude-mods-dev, private).
- Publish (worktree of `publish` at `55f3a76`):
  - `git restore --source=7a6f5fd --staged --worktree` for seven mods plus `.claude-plugin`, and `--source=0162120` for bws-board.
  - Each folder matched its source commit by file list and content. Only bws-shelf and the marketplace file were new; enhance was already equal.
  - Scan of the 933 added lines: the owner name, as already used in the plugin.json files, and dummy test paths (`C:/Users/me`, `C:/Projects/game`). A sweep of the whole published tree found only content that was already published: test dummies, the generic `C:/Projects` default, and shell-lint's anonymized "demo" corpus.
  - Top-level README: eight mods, a bws-shelf row, an Install section (`marketplace add` plus eight installs), and "Load from source" with the shelf flag.
  - Checks on the exact publish tree (receipts/publish-*): marketplace validate passed; for all eight, validate passed, tests passed (board 61 at 0.2.0), and tsc was clean.
  - Committed `9351fec` and pushed: `55f3a76..9351fec publish -> main`. After fetching, `mods/main` matches `7a6f5fd` for seven mods plus `.claude-plugin`, and `0162120` for bws-board. The worktree was removed.
- Install (receipts/install.txt):
  - `claude plugin marketplace add bsmi021/bws-claude-mods` cloned over SSH, as marketplace `bws-mods`, user scope.
  - `claude plugin install <mod>@bws-mods` for all eight exited 0 (user scope).
- Load check, two fresh `claude -p` sessions on Haiku (receipts/load.txt):
  - **As is** (`CLAUDE_CODE_PLUGIN_DIRS` still lists the source folders): each mod loads once, from source (`@inline`, board 0.3.0). The source copy shadows the installed copy, so no hook runs twice.
  - **With `CLAUDE_CODE_PLUGIN_DIRS` emptied** (`--settings`): all eight load from `~/.claude/plugins/cache/bws-mods/<mod>/<version>` at the published versions. Their tools and commands are registered, and there are no bws plugin warnings.
  - The only error line in either session is the unrelated `copilot-bridge` MCP server.
- AGENTS.md:
  - The publish note now says to use `git restore --source`.
  - A fresh worktree needs the generated types copied in before tsc.
  - An installed copy is shadowed by `CLAUDE_CODE_PLUGIN_DIRS`.

## Outcome
- Source: main `7a6f5fd` (seven mods and the marketplace) plus `0162120` (bws-board 0.2.0); pushed to `private`.
- Publish: `9351fec` = `mods/main`.
- Installed: all eight `@bws-mods`, user scope.

## Blockers / notes
- No blockers.
- Open sessions need `/reload-plugins`, which I can't run in Brian's terminals. While `CLAUDE_CODE_PLUGIN_DIRS` lists the source folders, sessions keep running the source copies (bws-board 0.3.0) and the installed copies are the fallback. Remove the variable to run the installed copies.
- bws-board 0.3.0 is committed and finished but not published, as instructed.
