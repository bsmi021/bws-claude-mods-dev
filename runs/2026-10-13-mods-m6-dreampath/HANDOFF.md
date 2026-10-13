# Handoff: M6 DreamPath (bws-memory 0.1.0 -> 0.2.0; extends the M4 plugin, no new plugin)

Status: code tasks T01 to T06 done and committed on `feat/video-mods`; the harness gate result is in RUNLOG.md. Brian's
interactive checks are in MANUAL-CHECKS.md (15 checks; the worker only ran headless). Decisions: DECISIONS.md (D1 to D7).

## What exists (later mods: read this)
- New pure modules in `bws-memory/hooks/`: `dream.ts` (what the fork is shown: `dreamFiles`, `dreamPrompt`; reading and
  checking its plan: `parseDreamPlan`, `validatePlan` (unknown files, a file in two actions, more than 40% `remove`s),
  `cleanPlan` (redaction); `planText`, `sessionsByFile`) and `dreamapply.ts` (the `dream` view and chip `combinedSummary`,
  fingerprints `hashText`/`basesOf`/`staleFiles`, what a plan does to each file `dreamChanges`, `dreamIndex`,
  `dreamSources`, backups `backupName`/`latestBackup`, the pane's line helpers, the trigger helpers `parseEveryTurns`,
  `dreamOnCompact`). `memory.ts` is unchanged. `register.tsx` still the only file with `$`.
- `types/index.d.ts`: `DreamAction` (flat: action, files, into, reason, name, description, type, body), `DreamView`, and the
  new atom `dream` beside `view` and `summary`.
- Plugin: option `dreamEveryTurns` (default 20, 0 = off), command `/dream [apply | undo | status]`, a second pane `bws-dream`
  (its own matched `ui.render`; `requestId` must stay a literal in register.tsx), a `session.compact` hook (observe only),
  the `ui.close` hook now also handles `bws-dream` (person close = Dismiss), `turn.complete` still the one hook.
- Flow: `/dream` -> `runDream` -> `planDream` (reads files + sources.json, `askText`: fork, or `$.model.complete` on
  `nothing-to-fork`; M4's `askForced` now delegates to the same `askText`) -> parse -> validate -> clean -> preview (pane) or
  apply. `applyDream`: re-validates, checks fingerprints (preview only), copies every `.md`, `MEMORY.md`, `sources.json`
  to `<memoryDir>/.dream-backup/<UTC stamp>/`, writes the files (removed / merged-away = emptied: no fs delete), the
  index, sources (merged-away rows re-pointed to the target), clears M4's `.undo/last.json`. `/dream undo` restores the
  newest backup once (`restored.json` marker inside it).
- Trigger: `afterTurn` (deferred from `turn.complete`) counts answered main-loop turns on a screen (`noteTurn`); at N or at
  a compaction `markDue` sets `due` and `autoPending` (needs 2 live files and no waiting plan); `maybeAutoDream` starts the
  preview when `running` is false, at the end of every turn and after a compaction. Automatic runs only preview. The shared
  `running` guard also keeps a dream and a memory fork off each other's files.
- Sessions: a file's sessions are its rows in `sources.json`; the pane shows the union per action (`from: ...`).
- Summary atom: memory's chips first, then `dreaming` (busy), `dream due` / `dream preview` (ok), `dream applied` (ok),
  `dream failed` (warn). bws-cockpit already lists `bws-memory`; no cockpit change.
- Tests added to `bws-memory/tests/`: `dream.test.ts`, `dreamapply.test.ts`, `dreamcmd.test.ts`, `dreampane.test.ts`,
  `dreamtrigger.test.ts`, `dreamsources.test.ts`, helper `dreamworld.ts` (stubbed engine with an in-memory folder; not a
  test file). `mem.test.ts` and `memory.test.ts` are untouched. Total 136 pass (54 before).

## Tests that prove each requirement (`claude plugin test`: 136 pass, 0 fail)
- FR-DP-01: `dream.test.ts` "FR-DP-01: what the fork is shown / parsing the plan / validating the plan (the two-file merge
  passes; more than 40% removed, unknown file, a file twice, rejected) / redaction and plan text"; `dreamcmd.test.ts`
  "FR-DP-01: /dream asks for a plan" (reads files and sources, one fork, `$.model.complete` fallback, tidy, 40% and unknown
  file rejected with nothing written, fork error / unreadable reply / api error fail open with one debug line, running guard).
- FR-DP-02: `dreamapply.test.ts` "FR-DP-02: what applying a plan does...", "fingerprints and backups"; `dreampane.test.ts`
  "FR-DP-02: preview first" (pane, dreaming, Dismiss, long plan) and "Apply writes the changes after a backup" (backup
  first, merge, remove and rewrite, stale refusal, `/dream apply` with a preview waiting, headless apply and plan-only,
  failed `/dream` pane, usage) and "/dream undo" (once, none, newest of several, clears /memory-undo, emptied files
  invisible).
- FR-DP-03: `dreamtrigger.test.ts` "FR-DP-03: every N turns" (default 20, Nth turn previews and applies nothing,
  status, no replace while waiting, only answered main turns on a screen count, headless, 0 = off, fewer than two files,
  silent failure, waits for a running memory fork) and "before a compaction" (`dreamOnCompact`, behind not blocking, fewer
  than two files, plan already waiting, headless); `dreampane.test.ts` "FR-DP-03: /clear, /resume, /branch".
- FR-DP-04: `dreamsources.test.ts` "FR-DP-04: sources" (union shown, unknown session, the fork is told the sessions, a
  merge moves rows so the next dream sees the union, remove drops rows, undo restores, result pane).
- FR-DP-05: README, version 0.2.0 (plugin.json); `dreamapply.test.ts` "FR-DP-05: the summary atom" (`dream due`, preview,
  dreaming, failed, applied, precedence).
- FR-ALL-02 "does not intercept unrelated events": `dreamcmd.test.ts` "does not intercept other commands"; the `session.compact`
  hook returns `next(e)` untouched (`dreamtrigger.test.ts` "behind: not held up and returns its own result"). Known gaps:
  (a) the write-error branch of `applyShown` (a thrown `$.fs.write`) cannot be reproduced with the test stubs (a throwing
  hook is skipped by the engine, not turned into a rejection); the code logs one line and shows `Dream: write: <reason>`;
  (b) the test `$.session.compact` forwarded `manual` only; `auto`, `plugin` and `precompute` are covered through the pure
  `dreamOnCompact`.
- AC-DP-01: `receipts/m6-probe.json`, `receipts/m6-probe.md`, `receipts/m6-probe-fixture/` (before),
  `receipts/m6-probe-memdir/` (after): headless `/dream apply` merged the two near-duplicates (exit 0).

## Decisions you must know (assumptions A1 to A7 on the dashboard; D1 to D7 in DECISIONS.md)
- A1 only `remove` counts toward the 40% cap. A2 removed = emptied (no fs delete); M4's `loadExisting` unchanged, so an
  emptied file still shows in the memory fork's "existing files" list. A3 `/dream apply` plans and applies in one command.
  A4 sessions come from `sources.json`, not frontmatter. A5 compaction triggers manual / auto / plugin; `dreamEveryTurns` 0
  turns both off. A6 pane id `bws-dream`; chip precedence. A7 automatic dream quiet rules.
- The compaction event exists (`session.compact`): D1.
- The turn counter is a module variable (resets on reload, /clear, /resume, /branch); the `dream` atom survives a reload.
- Version: bws-memory 0.2.0 (minor). No other plugin changed; `bws-kit` unchanged; `hooks/kit/` regenerated nothing.

## Watch out for
- `claude plugin validate` reports `gating hook without .catch: session.compact` and `ui.close` (their handlers do not
  throw into the engine; session.compact returns `next(e)` and defers its work with an own `.catch`). Verdict unchanged.
- The validator reads a matcher's `requestId` from the file's own source: keep `const DREAM_PANE = 'bws-dream'` in
  register.tsx (an imported constant made the hook show as `requestId=?`).
- Test engine: `$.session.compact` needs a non-empty `messages` list; a world must be created once per test.
- Unverified live: the pane as drawn and its keys (`a`, `d`, `c`), the cockpit chip, the trigger on real turns, a real
  compaction, resume, branch, Desktop (MANUAL-CHECKS 2 to 15). The live model's plan quality beyond one probe.
- Probe note: headless `/dream apply` has no conversation to fork, so it used `$.model.complete` (the documented fallback).

## Next step
Brian runs MANUAL-CHECKS.md. The next mod in the order is M7 (decision tree, extends bws-sidechat).
