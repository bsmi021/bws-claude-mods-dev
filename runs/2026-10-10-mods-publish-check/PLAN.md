# PLAN: all five mods published, running, tested, on GitHub

## Finish line
For each of bws-cockpit, bws-design-picker, bws-enhance, bws-notify, bws-shell-lint:
- published: its directory on the `publish` branch matches `main` (README scrub excepted), and `publish` is pushed (`mods/main` == `publish`);
- loads and runs: listed as loaded in a live `claude -p` session (plugins come from `CLAUDE_CODE_PLUGIN_DIRS`), validate lists the hooks its README declares;
- tests: `claude plugin validate`, `claude plugin test`, tsc 5.x strict + noUncheckedIndexedAccess all pass;
- git: `main` working tree clean; `publish` pushed.

Fix only what blocks the above. No features, refactors or behavior changes. Never push `main`.

## Tasks
- [x] T1 Survey: publish/load mechanism (docs/mods.md, READMEs, AGENTS.md), publish vs main, remote state
- [x] T2 validate / test / tsc for all five, receipts saved
- [x] T3 Live load check: one `claude -p` stream-json init, plugin list + mod hooks registered
- [x] T4 Fix anything that fails (only what is needed); republish if a mod changed — nothing failed, no republish
- [x] T5 Commit (incl. the untracked `runs/2026-10-06-headless-flash`), push `publish` if changed, confirm clean tree
- [x] T6 RUNLOG with per-mod state table
