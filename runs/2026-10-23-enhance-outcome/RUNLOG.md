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

## 2026-10-23 (3): stop conditions, enhancer models, agent outcomes
- Prompt: keep stop-and-report conditions; name only listed commands. Tests 51 pass / 4 fail (same Linux-only 4).
- Eval B per enhancer (haiku/sonnet/opus): new preferred 27/30, 30/30, 30/30. 3-way ranking of new rewrites: sonnet 1.70, opus 1.97, haiku 2.33 (reversed before the judge saw AGENTS.md).
- Eval A, agents (sonnet/opus) x raw/old/new on 4 tasks: work quality equal within noise (4.62–4.75); rewrites cost more turns than raw; new cheaper than old on Opus; new best on scope/report; new narrowed linux-tests to the bouncer tests.
- Harness fixes on the way: judges see AGENTS.md; outcome judge baseline corrected to main's 50/4 (it had this branch's 51/4).
- Details: eval/README.md.

## 2026-10-23 (4): tsc
- Generated `.claude-plugin/types/` by starting an interactive `claude --plugin-dir ./bws-enhance` under a pty (headless `-p` does not write them); the footer drew `✦ enhance`, so the mod loads live from source.
- `MODS_TSC=<scratch>/typescript@5.8.3/bin/tsc python tools/mods-gate.py --plugin bws-enhance`: validate passed, tsc 5.8.3 strict passed (exit 0, 11 hook and test files); the gate is red only on the 4 Linux-only plugin tests (`C:/proj` fixtures), the same as before this change.

## 2026-10-23 (5): vague prompts, Haiku agent
- 4 vague tasks x raw/old/new x 3 runs, Haiku agent: raw 4.67 ($0.02), new 4.40 ($0.07), old 4.06 ($0.15). Rewrites lost to the raw request because the rewriter's guesses became requirements; new failed safe (stopped and reported), old wandered (up to 82 turns on a question). Details in eval/README.md.

## 2026-10-23 (6): back out of bws-enhance, outcome-first bws-better
- Decision (Brian): revert bws-enhance to 0.4.4 and use the outcome-oriented prompt in bws-better, whose interview has the person settle what is vague before the prompt is written (the evals showed a rewriter's guesses becoming requirements).
- bws-enhance: restored from main (b5f8015); `git diff b5f8015 -- bws-enhance` is empty.
- bws-better 0.3.0: QUESTIONS_SYSTEM asks about the outcome (what done looks like, what a vague word means, what must not change, answer or change), never the method. REWRITE_SYSTEM: end state first, Done-when and check last, method left to Claude, a question stays a question, unsettled vague words stay in the person's words, no "where the fix belongs" unless they said, stop-and-report when the goal may be impossible, under ~120 words. JSON contract and [placeholder] rule unchanged. CHANGELOG, README, manifest description.
- Gate (MODS_TSC = scratch typescript 5.8.3, types generated by an interactive --plugin-dir load): bws-better ok (validate, 45/45 tests, tsc strict). bws-enhance: only the 4 Linux-only tests, as on main.
- Live headless check (`eval/better_check.py`, `eval/out-better/check.json`): old vs new /better on 6 rough requests plus the new interview questions. New keeps the fork question read-only (old asked for repro steps and a fix), leaves unasked choices open instead of inventing them (old added persistence and a system default to the theme toggle), and asks outcome questions.
- Not run: the agent-outcome eval with bws-better (the interview needs answers; headless skips it).

## 2026-10-23 (7): bws-mods 1.13.0 released (bws-better 0.3.0)
- PR #15 squash-merged to main as 95b70d2 (marketplace 1.13.0).
- `python tools/publish.py bws-better --version 1.13.0 --no-gate --push` from the cloud session, with Brian's approval: publish worktree matched main, 6 files vs the publish tip, privacy scan ok. Published `publish` c51ff5b to `mods` main (54ab51f..c51ff5b).
- `--no-gate`: bws-better's own gate passed here (validate, 45/45 tests, tsc 5.8.3 strict). The repo-wide gate fails in the Linux container on 9 mods that are unchanged since 1.12.0 (Windows `C:/` fixtures; this build's tool types lack PowerShell and type Glob/Grep differently).
- Not done here: the `v1.13.0` tag push got HTTP 403 from the container's git proxy (policy), and `gh` has no valid token, so there is no tag or GitHub release yet. Notes for the release: `receipts/v1.13.0-release-notes.md`.
- Brian, on Windows: `git fetch mods; git tag v1.13.0 mods/main; git push mods v1.13.0; gh release create v1.13.0 --repo bsmi021/bws-claude-mods --title "bws-mods 1.13.0" --notes-file runs/2026-10-23-enhance-outcome/receipts/v1.13.0-release-notes.md`, then `claude plugin marketplace update bws-mods; claude plugin update bws-better@bws-mods` and `/reload-plugins`.
