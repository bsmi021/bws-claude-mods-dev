# Handoff: bws-better (Prompt Upgrade) shipped, follow-ups open

## Objective
Build and maintain `bws-better`, a Claude Code mod in `C:\Projects\bws.mods.claude-code`. `/better <rough prompt>` asks up to three multiple-choice questions, rewrites the prompt, and shows both versions side by side. Nothing runs until Run is pressed.

## Finish line
- [x] Mod built: `/better`, `/better on|off`, `/better history`, four-step pane
- [x] Tests, validate and tsc pass; added to `.claude-plugin/marketplace.json`
- [x] Released: bws-mods 1.2.0, then 1.2.1 (two live-check bugs fixed), then 1.2.2 (suite-fit changes)
- [x] Assumptions A1–A10 confirmed by the user
- [ ] Live check of the 0.1.x fixes in a real terminal
- [ ] Run it, Edit and Copy pressed live (tests cover them only)

## Done so far
- **Latest release:** v1.2.2, https://github.com/bsmi021/bws-claude-mods/releases/tag/v1.2.2. `publish` is at `48ca477`, and `main` is at `3ea79aa`.
- **PRs merged:** #10, #11 and #12 in `bsmi021/bws-claude-mods-dev`.
- **Versions now:** bws-better 0.1.2, bws-cockpit 0.17.2, bws-enhance 0.3.1, bws-board 0.5.1; marketplace 1.2.2.
- **Receipts:** `runs/2026-10-14-prompt-upgrade/receipts/gate-1.2.2.txt`. `python tools/mods-gate.py` passes for all 12 plugins, the kit and the kit sync. Per-mod tests: better 43, board 84, cockpit 203, enhance 48.
- **Screenshots:** 20 live screenshots in `runs/2026-10-14-prompt-upgrade/screens/`, from the 0.1.0 live check. The look is confirmed at 72 and 160 columns.

## Next step
Rerun the live terminal check on the installed 0.1.2 to confirm the two 0.1.1 fixes: `/better <prompt>` opens its pane at 72 columns, and automatic mode empties the box. Ask the user first; it takes over their screen. Use the `drive-screen` skill. The launch scripts are `runs/2026-10-14-prompt-upgrade/scripts/launch.ps1` and `inner.ps1`; use sizes 72×38 and 160×38.

## Open items
- Nothing waits on the user. The live recheck above and the unpressed Run, Edit and Copy buttons are the only open work.
- Untested: what `/clear`, `/resume` and `/branch` do to an upgrade in progress. The README says so.
- A person's Esc or close mark mid-upgrade has no test (the test kit can't raise `ui.close`). The live check confirmed the close mark.
- The cockpit chip has not been seen in a live bar.
- Untracked `.claude/` (bws-memory's notes) and two old `runs/` folders are not mine; leave them alone.

## Key files and commands
- Mod: `bws-better/hooks/register.tsx` (the only file using `$`), `hooks/lib.ts`, `types/index.d.ts`, `kit.json`, `tests/`.
- Gate: `python tools/mods-gate.py` (add `--plugin bws-better` for one mod).
- Type-check: `node C:/Users/bsmi0/AppData/Local/pnpm/global/5/.pnpm/typescript@5.8.3/node_modules/typescript/bin/tsc -p bws-better`.
- Kit copy: `python tools/sync-kit.py --plugin bws-better`.
- Remotes: `private` is the dev repo; `mods` is the public marketplace repo.
- Install check: `claude plugin list`; bws-better is installed from `bws-mods` at user scope.

## Decisions and constraints
- Work on a branch, open a PR, merge it, and then do the release steps. Never push `main` to `mods`.
- Release steps: refresh the orphan `publish` branch in a scratch worktree with `git restore --source=<merge commit> --staged --worktree -- <mod dirs>`. Confirm the file list and contents match, scan for private names, copy each mod's types folder in, and rerun validate, test and tsc. Then commit, `git push mods`, `gh release create vX --repo bsmi021/bws-claude-mods`, and log it in `RUNLOG.md`.
- Bump versions only for mods you touch.
- Keep replies short. Lead with the result.

## Watch out for
- **Backslashes in Git Bash:** an escaped quote in a Python heredoc lost its backslash. Use double-quoted strings, or the Edit tool.
- **Driving a terminal:** Git Bash rewrites a leading `/better` to a Windows path. Set `MSYS_NO_PATHCONV=1` and use `C:/` paths. Close only windows you opened, and read screenshots before clicking.
- **The pane:** never name a variable `h`, and never name a local `next` (the validator forbids it).
- **Opening panes:** await `$.ui.open` inside the `command.run` hook (see AGENTS.md, "This repo"), or it only opens from 144 columns.
- **Dropped prompts:** a `{ drop }` leaves the typed text in the box, so clear it yourself.
