# mods harness: RUNLOG

Task: a harness loop that builds the mods mined from Ray Amjad's "Top 1% Claude Code Mods" video
(analysis: `runs/2026-10-12-mod-ideas-video/RUNLOG.md`). Spec: `docs/SPEC-VIDEO-MODS.md`.

## State (2026-10-12): generated and proven, NOT started
- Worktree `C:/Projects/bws.mods.claude-code-loop`, branch `feat/video-mods` (from main 7b5c591). Never pushed.
- 9 units, 89 tasks: M0 kit, M1 cache clock, M2 bouncer, M3 skillgate, M4 memory, M5 diagram, M6 dreampath, M7 decision tree, M8 secrets.
- Tiers: fast=Haiku 5.5 (M1, M2), workhorse=Sonnet 5.5 (M0, M4, M6), frontier=Opus 5.5 (M3, M5, M7, M8). Escalation on.
- $20/session, $250 total. Board port 8781. Gate `python tools/mods-gate.py` (~35 s, all plugins). Live probes only via `python tools/probe.py`.
- Locked wide paths: AGENTS.md, README.md, docs/*, .claude-plugin/marketplace.json.

## Decisions (user, 2026-10-12)
All 8 mods plus M0; own worktree; automated checks + live probe; collect sign-offs, don't pause; I draft the spec;
Haiku added for simple units; $20/$250; separate plugins with vendored helpers; existing mods editable, additive only.

## Proof (runs/2026-10-12-mods-harness/proof)
- offline suite: `offline-suite.txt` all passed.
- dry cycle: cycle1 (found D0 needed MANUAL-CHECKS.md named in its task list: fixed), cycle2 clean in 2 sessions: PAUSED -> answer -> COMPLETE.
- board: `board-dry-paused.jpg`, `board-dry-complete.jpg`.
- restart: state.json removed -> restored from state.bak; both bad -> `recover` rebuilt it (`restart-A.txt`, `recover-B.txt`).
- real-mode verify with the REAL gate on a clean tree: no problems (`verify-real.txt`).
- deny list: `git push --dry-run` and `gh pr create --help` DENIED for the claude worker (`deny-probe.jsonl`); the worktree pre-push guard refuses when MODS_HARNESS_WORKER=1 and lets the user's own push through.
- preconditions: pass in the worktree; a failing one refuses with a clear message.
- run budget: with HARNESS_RUN_BUDGET=1 the second `tools/probe.py` run exits 3 before touching claude.

## Not proven / known
- Subagent model: CLAUDE_CODE_SUBAGENT_MODEL was ignored on CLI 2.1.293 (lessons.md); not re-proven on 2.1.296. Treat subagentModel as advisory.
- Workers load Brian's installed mods (bws-board, cockpit, ...) because the driver has no flag for `--setting-sources`. They appear on bws-board as peers; harmless in the dry run. Probes are isolated.
- Supervisor not installed (covered by the offline suite). On battery power its task will not start.
- Claude token caps are not enforced; only the USD caps are.

## Start
Open a fresh session in `C:/Projects/bws.mods.claude-code-loop`, run `/mods-harness` (it calls `harness.py start`). Cancel only with `harness.py stop`.
Board: `python tools/mods-harness/harness.py serve` -> http://127.0.0.1:8781/tools/mods-harness/status.html
Manual checks per unit land in each unit's `MANUAL-CHECKS.md`.

## Pending ideas
- Ideas shelf: none added. Chronicler: not applicable (no TMS content).
