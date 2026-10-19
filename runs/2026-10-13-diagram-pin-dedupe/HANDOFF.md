# Handoff: bws-diagram 0.2.1 (one pin per diagram)

## Objective
Make pinning an identical mermaid diagram replace the earlier pin so `/diagram status` counts it once. Then continue the manual checks for the video-derived mods, starting with M5 (diagram pane).

## Finish line
- [x] Reproduce the duplicate pin with a test first
- [x] Fix, run the gate, bump bws-diagram to 0.2.1
- [x] Commit, PR, merge, publish to `mods`, release
- [ ] User confirms live: after updating to 0.2.1, re-posting the tea flowchart gives `1 pinned`
- [ ] M5 manual checks 3–9 (the user asked to continue with these)

## Done so far
- Cause: `pinsFrom` in `bws-diagram/hooks/diagram.ts` skipped a block only on exact source text. The same flowchart written differently pinned twice.
- Fix: added `pinKey` and `addPin` in `diagram.ts`; `pin()` in `hooks/register.tsx` now uses `addPin`.
- Test: `bws-diagram/tests/mermaid.test.ts`, "the same diagram written differently replaces its earlier pin". It failed first with `0 drawn, 2 pinned`. bws-diagram now has 61 tests passing.
- Gate: `python tools/mods-gate.py` was all ok (11 plugins + kit, 72 s).
- Commits and release:
  - Feature commit 7c02c88, merged as b7242e6 (PR 9 on `bsmi021/bws-claude-mods-dev`).
  - Publish commit 0144a86 pushed to `mods` main.
  - Release v1.1.1 on `bsmi021/bws-claude-mods`.
  - Marketplace is 1.1.1.
- Run log: `runs/2026-10-13-diagram-pin-dedupe/RUNLOG.md`.

## Next step
Ask the user to run `/diagram status` after updating, then re-post the tea flowchart:
```
! claude plugin marketplace update bws-mods
! claude plugin update bws-diagram@bws-mods
/reload-plugins
```
Their board still holds two old "Boil water" pins. A re-pin should replace them and leave `1 pinned`. If it doesn't, check how to clear the board.

## Open items
- M5 checks 3–9 are in the M5 `MANUAL-CHECKS.md`. M8 steps 3–13 are also open, and step 7 was classifier-blocked.
- The other seven mods' manual checks are open (124 in total across nine `MANUAL-CHECKS.md` files).
- `/cockpit show` at `bws-cockpit/hooks/register.tsx:1152` is unverified. The classifier blocked that edit three times, and another board session was assigned it.
- The loop worktree `C:/Projects/bws.mods.claude-code-loop` (branch `feat/video-mods`) is merged and can be removed. The user hasn't said yes.
- Untracked `runs/2026-10-12-service-bus-prompt/` is not from this work.
- DEMO_TOKEN is still in the secrets store (`/secrets remove DEMO_TOKEN`).
- Earlier UX findings are unresolved: decision-tree focus after Explore, scroll to bottom, missing cockpit bar, and the cockpit showing all window tools as tabs.

## Key files and commands
- `bws-diagram/hooks/diagram.ts`, `hooks/register.tsx`, `tests/mermaid.test.ts`
- `claude plugin test` (run from `bws-diagram/`)
- `python tools/mods-gate.py [--plugin bws-diagram]`
- `gh pr create --repo bsmi021/bws-claude-mods-dev ...`

## Decisions and constraints
- Be terse. Don't drift. Never push `main` to `mods`.
- Don't install, enable or publish plugins, or touch `CLAUDE_CODE_PLUGIN_DIRS`, without the user.
- Don't work around classifier denials.
- The user chose to leave the pane in the side panel. The engine decides dock versus inline, so don't change that.

## Watch out for
- Plain `gh pr create` targeted the wrong repo. Pass `--repo bsmi021/bws-claude-mods-dev`.
- Publish recipe:
  1. In a scratch worktree on the orphan `publish` branch, run `git restore --source=<main sha> --staged --worktree -- <dirs> .claude-plugin/marketplace.json`.
  2. Copy the gitignored `.claude-plugin/types`.
  3. Validate and test, scan, commit.
  4. `git push mods` maps `publish` to `main`.
  5. `gh release create --repo bsmi021/bws-claude-mods --target main` (don't tag locally).
- Source files are CRLF. Normalize before exact-match edits, and don't write Windows backslash paths in Python strings.
