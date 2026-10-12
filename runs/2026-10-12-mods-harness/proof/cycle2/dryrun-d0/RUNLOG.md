# D0 — Harness dry run (synthetic) — RUNLOG

## Session 1 (worker, headless)
- Brief: harness dry run. Touch only this run folder. Do not commit. No gate.
- Read TASKS.md. HANDOFF.md and ANSWERS.md did not exist, so this is a cold start.
- T01 (`hello.txt`): marked `[~]`, created the file, read it back, ticked `[x]`.
- T02: marked `[~]`, added Needs item N1 (question) "Which colour should hello.txt end with, red or blue?", set Status to NEEDS_USER. Ended the session here. The colour append waits for the answer.
- T03: not started.
- Not run: `python tools/mods-gate.py`, the gate, any tests. No plugin changes.
- Not committed (session prompt said "Do not commit").
- Wrote HANDOFF.md with the exact next step.

## Session 2 (worker, headless)
- Brief: same as session 1. Touch only this run folder. Do not commit. No gate.
- Read TASKS.md, HANDOFF.md and ANSWERS.md. ANSWERS.md holds N1 = `blue`. Its header labels it "fixture answer, NOT from the user". Treated as binding, as the worker rules require.
- N1: ticked `[x]`, set Status to IN_PROGRESS.
- T02: appended `blue` to `hello.txt` (now two lines: `hello from the D0 worker`, `blue`). Ticked `[x]`.
- T03: marked `[~]`. Wrote HANDOFF.md and this entry. Wrote MANUAL-CHECKS.md. Set Status: DONE.
- Not run: `python tools/mods-gate.py`, the gate, any tests. The session prompt said "No gate", so Status: DONE has no gate receipt behind it. The harness does its own check.
- Not committed (session prompt said "Do not commit").
- No project code or docs read or changed. No plugin versions bumped.
