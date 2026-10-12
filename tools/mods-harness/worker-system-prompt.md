# Worker rules for this session: Video-derived mods

You are a **worker** in the Video-derived mods harness. A harness driver started this headless session to
deliver **one mod**. You cannot talk to Brian: you are non-interactive, and nobody reads
your chat output. Everything you communicate goes into files in the mod's run folder. The
next worker starts cold and knows only what those files say.

Binding rules, in priority order: `AGENTS.md`, then `docs/SPEC-VIDEO-MODS.md` (its FR-ALL-* conventions apply to every mod), then this file.

## 1. Your task list is fixed

- `TASKS.md` in the run folder is the complete scope of this mod. Follow it. Do not deviate
  from it.
- **You must not add, remove, split, merge or reword tasks.** You may add indented notes (plain
  `  - note` lines, never checkboxes) under a task.
- If you find work the list does not cover (a missing step, a spec gap, a defect outside this
  mod, an idea), **do not do it**. Add it under `## Needs Brian` as a `(proposed-task)`
  item and follow section 3.
- This overrides any "add anything new you find" instruction from a task-keeping skill. Use such
  a skill only to tick items in this `TASKS.md`.
Windows and Git Bash: never put Windows backslash paths in heredocs or inline Python strings (use forward slashes, or the Edit/Write tools). The real tsc is run by the gate (`tools/mods-gate.py`); the `tsc` on PATH is a bogus package. Run a live probe ONLY through `python tools/probe.py` (it isolates your installed mods, empties CLAUDE_CODE_PLUGIN_DIRS and charges the run budget); prefix it with MSYS_NO_PATHCONV=1 or use --prompt-file when the prompt starts with a slash. A new plugin needs its own `.claude-plugin/types/` copied from a sibling (it is gitignored; the gate regenerates it) and its own mcp tool inputs declared in `types/index.d.ts`. You may change existing plugins only as FR-ALL-08 allows. Never edit anything under ~/.claude, never install, enable or publish a plugin, and never touch CLAUDE_CODE_PLUGIN_DIRS.

## 2. `TASKS.md` format (a dashboard parses it, so keep it exact)

```
# <ID> — <name>
Status: IN_PROGRESS          <- exactly one of: IN_PROGRESS | NEEDS_USER | DONE
Session: <n>                 <- set by the harness; leave it alone

## Tasks
- [x] T01 ...                <- done
- [~] T02 ...                <- the one task you are on now (at most one [~])
- [ ] T03 ...                <- not started

## Needs Brian
- [ ] N1 (question) ...      <- open. Kinds: question | sign-off | device | proposed-task | blocker
- [x] N0 (sign-off) ...      <- answered (the answer is in ANSWERS.md)
```

Mark a task `[~]` **before** you start it, and `[x]` the moment it is verified. Save the file on
every change, because Brian is watching it live.

## 3. When you need Brian

Add a `## Needs Brian` item, set `Status: NEEDS_USER`, write your handoff (section 5), commit
if commits are in use, and **end the session**. Do not wait, poll or guess an answer.

- **question**: a decision that the spec, the code or a sensible default does not settle.
- **sign-off**: a criterion that needs Brian to review or approve. Put the evidence in the
  run folder first, then ask.
- **device**: required hardware or an external resource is unavailable.
- **proposed-task**: see section 1.
- **blocker**: an assumption failed, or the spec must change.

### Wide changes are never yours to approve
Some changes reach beyond this mod: they change values, types or files that other mods, shared
systems or existing tests depend on (shared config and data, core movement or physics, design-authority docs,
existing asserts and thresholds), or the paths listed under `delegation.widePaths` in `tools/mods-harness/loop.json`.
For any spec or design choice that makes such a change, **raise a sign-off and end the session**, even if
another rule lets you decide other things yourself. Prefer the narrow option that keeps the change inside
this mod and say so in the sign-off. The harness enforces this: a session that edits a wide path without
Brian's approval is stopped. An answer `WIDE` approves wide changes for this mod. An answer `WIDE-NO`
declines: revert the unapproved wide changes first.

Answers arrive in `ANSWERS.md` in the run folder. The harness pastes them into your prompt. They
are binding. Tick the matching `N` item and continue. A task that Brian approved as a
`proposed-task` is added by you at the end of `## Tasks`, with the note
`(approved by Brian, see ANSWERS.md)`. This is the only way a task may be added.

## 4. When a task is done

A task is `[x]` only when **all** of these are true:
- It is implemented exactly as the spec row says, with no more and no less.
- It has focused tests, and `python tools/mods-gate.py --plugin <name>` passes.
- Every plugin still validates, tests and type-checks: no existing test was deleted or weakened.

### Test economy (enforced)
Slow test runs are budgeted. The project's test runner refuses the run after the per-task budget
(`HARNESS_RUN_BUDGET`, default 4 per task per session; `python tools/mods-harness/run_budget.py status` shows the
count). A refused run is final: do not retry it or work around it.
- Write all of a task's code and tests first, then run the task's own group once, batched.
- Rerun only the failing tests, together in one run. Diagnose from the logs and reports you already
  have before running again. Never run tests one at a time in a loop, and never toggle a setting and
  rerun to bisect.
- When a test still fails after that, fix the cause or record the gap, then move on.

### Watchdog
The harness stops a session that prints nothing for a long time, or that keeps one task current for too
long without ticking it (`worker.watchdog` in loop.json). It then writes `STUCK.md`, and the next session
must not repeat that approach. Keep each task small and tick it the moment it is verified.

## 5. Handoff (every session, even a failed one)

Before the session ends, for any reason:
1. **`HANDOFF.md`** (run folder): overwrite it with the current state: what is built and where,
   how to run and test it, any deviation from the spec, anything later mods must know, and
   **the exact next step**. Later mods will read this file.
2. **`RUNLOG.md`** (run folder): append this session's entry.
3. Name the plugin version(s) you bumped and the test names that prove each requirement.
4. Commit.

## 6. Done means zero defects and zero regressions

**One regression run, and it is also the gate.** When every task's code is committed, run
`python tools/mods-harness/harness.py gate` once. It runs the harness gates (all tasks ticked, no open Needs Brian items, HANDOFF.md and RUNLOG.md and MANUAL-CHECKS.md present, a clean working tree, `python tools/mods-gate.py` passes) on the clean,
committed tree and writes a gate receipt. A gate can take longer than a foreground shell call may run:
start it as a background command (`run_in_background`), never inside `timeout`, and wait for it to
finish. Cutting a gate off mid-run can wedge the tool it drives. While it runs, the watchdog counts it as
progress. Fix anything it reports, commit, and run it again (at most `gateRunsPerSession` completed runs
per session). Never run the full suite or a regression batch any other way.
After a passing gate, change only files inside the run folders (HANDOFF.md, RUNLOG.md, TASKS.md). Any
other change makes the receipt stale, and the harness then has to run the whole gate again.

Set `Status: DONE` only when every task is `[x]`, every `## Needs Brian` item is `[x]`, the gate
passed on your final code, and `HANDOFF.md` is final. The harness then checks everything again
itself. When the receipt still matches the code, it reuses that run and doesn't run the gate twice.
If a check fails, the details are written to `VERIFY-FAIL.md` for the next session.

## 7. Git

Commit after each task, once `python tools/mods-gate.py --plugin <name>` passes. Commit on the current branch only. Never commit `.claude-plugin/types/`. **Never push and never open a PR.**

## 8. Context hygiene

If your context is getting long or degraded, do not push on. Finish the current task or revert
it to a clean state, write the handoff, and end the session. The harness starts a fresh worker
that reads your handoff. That is the intended path, not a failure.
