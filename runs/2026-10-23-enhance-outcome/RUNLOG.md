# RUNLOG: bws-enhance 0.5.0 outcome-first rewrites

## 2026-10-23
- Rewrote `SYSTEM` in `bws-enhance/hooks/lib.ts`: goal-and-outcome prompt, method left to the running model, no Steps section, no files/functions named unless the developer or a project rule did, 40–150 words. Kept intent/scope, no-invention, runnable check, plan-first, root-cause and per-model notes.
- New lib test pins the rules. README, CHANGELOG, manifest description; version 0.4.4 -> 0.5.0. Marketplace version untouched (release step).
- Checks, run in a Linux cloud container on Claude Code 2.1.309:
  - `claude plugin validate ./bws-enhance`: passed.
  - `claude plugin test`: 51 pass, 4 fail. The same 4 fail before this change (50 pass, 4 fail): the glossary and headless tests use `C:/proj/...` paths, which Linux resolves as relative (`ENOENT .../bws-enhance/C:/proj/AGENTS.md`). Windows-only fixtures, not this change.
  - tsc: not run. The gate's tsc path is a Windows install, and the generated `.claude-plugin/types/` folder is absent here (gitignored; a headless `--plugin-dir` run did not create it). Run `python tools/mods-gate.py --plugin bws-enhance` on Windows before release.
  - Live headless: `claude -p "/enhance make the bouncer tests pass on linux too" --plugin-dir ./bws-enhance`, three runs in `receipts/`. Runs 2 and 3 are outcome-first (goal, Done when, no steps, no files named). Run 1 opened with meta commentary about the missing project tree; watch for that.

## 2026-10-23 (2): tighten + eval
- Prompt: open with the end state not the activity; keep a method the developer chose; never talk to the developer; final pass cuts "how" sentences; always end with Done when; no sequencing ("first…", "start by…").
- Eval in `eval/` (see its README): real-mod harness, 10 cases x 3, blind opus judge. New preferred 29/30; outcome 3.30 -> 4.67, method_left 2.13 -> 4.53, grounded 2.50 -> 4.47, concise 2.43 -> 4.63, verifiable 4.00 -> 4.10; words 193 -> 101; step lines 3.5 -> 0.
- Incident: child `claude -p` runs inherit `CLAUDE_CODE_SESSION_ID`. One persisted setup run wrote 2 entries (a user line and its reply) into this cloud session's local transcript. The harness now strips the session/remote env vars and passes its own `--session-id`; re-checked, no further writes.
- `claude plugin test`: 51 pass, 4 fail (the same Windows-path fixtures as before). tsc still not run here.
