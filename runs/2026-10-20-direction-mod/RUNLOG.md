# RUNLOG: bws-direction 0.1.0 (drift detection)

## Objective
New mod that detects drift in-session and across sessions: is the work still aligned with the session task, the run
PLAN.md and the project's `docs/` corpus? Must work for any project (Brian's correction mid-session: not only games).

## Done
- `bws-direction/` 0.1.0: corpus.ts (docs scan, heading sections, anchor detection, excerpt ranking), turn.ts (task,
  turn digest, gate, run dir), verdict.ts (judge prompts + JSON parser), view.ts (record, trends, tab, chip, text, nudge),
  register.ts (the only `$` user). 34 tests (pure + stubbed engine).
- Anchors generalized from GDD-only to PRD / spec / requirements / design doc / GDD / vision (rank 0), then architecture /
  technical design / *-spec (rank 1), shallowest only, max 3.
- Judge prompt tightened after live run 1 judged a user-requested, GDD-forbidden change "aligned 70"; run 2 judged it
  "drifting 40, scope widened by you".
- bws-cockpit 0.23.0 lists bws-direction among mod tabs. Marketplace 1.9.0 lists the mod.

## Receipts (receipts/)
- gate-direction.txt; full `python tools/mods-gate.py`: 14 plugins + kit ok.
- live-status/check/overall.jsonl: headless in bws.game.tms: anchors docs/GDD.md + 110 docs; overall verdict aligned 88.
- live-status-webapp.jsonl: non-game scratch project -> anchors docs/PRD.md, docs/architecture.md.
- live/, live2/: interactive (tools/live.py, cockpit + direction from source): turn 1 aligned, turn 2 (poem vs
  "no poems" GDD) drifting 40 cause user; dashboard strip shows "Direction ~ 40".
- dev-store-after-tms-live.json: the --plugin-dir store from the TMS headless run (moved out; held an empty-turn check,
  since guarded: a check with no work calls no model).

## Next
- Release when Brian says so: `python tools/publish.py bws-direction bws-cockpit --version 1.9.0`, then `--push`.

## Follow-up
- Docs, plan, history key and git log now resolve from `$.session.root()` (the project root), not cwd; tests run with cwd in a subfolder. Gate ok.

## Release
- Brian approved. A stale publish worktree from the earlier failed dry run held the `publish` branch; removed it (`git worktree remove --force`; a few locked temp files remain). `publish.py --push` released v1.9.0: https://github.com/bsmi021/bws-claude-mods/releases/tag/v1.9.0
- Installed: bws-direction 0.1.0 (new), bws-cockpit 0.22.0 -> 0.23.0.
- Desktop check: computer use cannot control the Claude app itself, so the Desktop surface is still untested by me; Brian to check (/reload-plugins, /direction, /dashboard Direction tab).
