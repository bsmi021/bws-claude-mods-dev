# Handoff: M4 memory (bws-memory 0.1.0, new plugin)

Status: all code tasks done and committed on `feat/video-mods`; the gate result is in RUNLOG.md. Brian's interactive
checks are in MANUAL-CHECKS.md (15 checks; the worker only ran headless).

## What exists (later mods: read this)
- `bws-memory/` is a new plugin (0.1.0). Files: `.claude-plugin/plugin.json` (options `memoryDir` empty, `minWords` 8,
  `model` haiku), `hooks/register.tsx` (the only file with `$`), `hooks/memory.ts` (pure), `hooks/kit/` (generated from
  bws-kit via `kit.json`: classify-fork, summary, transcript), `types/index.d.ts` (atoms `view` and `summary`, shapes
  inline), `tests/memory.test.ts` (pure) and `tests/mem.test.ts` (hooks, stubbed engine with an in-memory folder),
  `README.md`.
- Hooks (validator inventory): `session.start` (registers `/remember`, `/memories`, `/memory-undo`), three
  `command.run` (matched), one `turn.complete`, `session.end`, `ui.close`, `ui.render{Pane, bws-memory}`.
- Flow: `turn.complete` returns `next(e)` at once and defers the work with `$.clock.after(10, ...)`. `afterTurn` skips
  (`skipReason`) headless / subagent / non-`answer` reasons / a running guard / a user message under `minWords` with no
  tool calls, then `runMemory`: `classifyThenFork` (kit; classify 15 s, fork 90 s) -> `parseEntries` -> `cleanEntries`
  (redact; a mostly-secrets reply is dropped) -> `planWrites` (new / update / duplicate) -> `writePlan` (undo record
  first, then files, `MEMORY.md`, `sources.json`).
- Memory folder (default `<cwd>/.claude/bws-memory`): `<slug>.md` files with this repo's frontmatter, `MEMORY.md` (one
  line each, replaced in place on update), `sources.json` (last 200 writes: file, session, at, kind), `.undo/last.json`
  (one-deep backup: previous text per file, previous index and sources).
- `/remember <text>`: no classifier. Interactive: deferred, returns "Remembering...". Headless: awaited inline. With
  nothing to fork it calls `$.model.complete` with the text alone (`askForced`). `/memories`: last 20 writes.
  `/memory-undo`: restores from `.undo/last.json`; a file the write created is emptied (no fs delete exists), then the
  record is cleared (one deep).
- Guard and generations: module `running`, `generation`, `lastSession`. `session.end` with reason `clear` or `resume`,
  or a changed `$.session.id()` on the next turn or command (that is how `/branch` is seen: it has no event), calls
  `resetWork` (generation++, running=false, view idle, pane closed). A run whose generation moved never writes.
  `register` resets `running` and `lastSession` on every load.
- Summary atom `{ plugin: 'bws-memory', key: 'summary' }`: null idle; `memory updating` (busy); `memory: N files` (ok)
  while the pane is open; `memory not saved` (warn) after a failure. bws-cockpit lists `bws-memory` in its default
  `modSummaries` already, so the chip needs no cockpit change.

## Tests that prove each requirement (`claude plugin test`: 54 pass, 0 fail)
- FR-MEM-01: `mem.test.ts` "FR-MEM-01: classify the last exchange after a turn" (remember path, "no", each skip: short
  turn, headless, subagent, aborted, running fork; tools make a short turn count; `minWords` and `model` options; does not
  intercept unrelated events) and `memory.test.ts` "skipReason...", "exchangeOf...".
- FR-MEM-02: "FR-MEM-02: files, MEMORY.md, update and duplicate" (new file + index line + sources; update by file name;
  update by name under another file name; duplicate refused with no write; `memoryDir` option), plus pure `planWrites`,
  `parseEntries`, `upsertIndex`, `memoryFile` tests.
- FR-MEM-03: "FR-MEM-03: redaction" (secret redacted in file, description and index; mostly-secrets reply dropped, debug
  line has no secret) and pure `redact` / `cleanEntries` tests.
- FR-MEM-04: "FR-MEM-04: chip and pane" (working view says `memory updating`; done view lists `+9 -0` with a Close
  button; pane closed before opened; Close clears it; a failed run shows a warning) and pure `memorySummary`.
- FR-MEM-05: "FR-MEM-05: /remember, /memories, /memory-undo" (usage, forced path with no classifier, headless inline with
  the text-only fallback, refused while running, last-20 list, undo one deep).
- FR-MEM-06: "FR-MEM-06: /clear, /resume, /branch" (/clear drops the late reply and resets the guard; /clear starts no
  work; /resume resets, exit does not; a new session id resets).
- FR-ALL-03: "FR-ALL-03: fails open" (classifier error, fork error, unreadable reply, 90 s timeout with late reply
  ignored; one debug line each, no prompt text).
- FR-MEM-07 / FR-ALL-04/05: README, version 0.1.0, `kit.json`, `python tools/sync-kit.py --check` passes; the summary
  atom shape tests above.
- AC-MEM-01: `receipts/m4-probe.json` + `receipts/m4-probe.md` + the files in `receipts/m4-probe-memdir/` (headless
  `/remember`, two files written, exit 0).

## Decisions you must know (assumptions A1 to A4 on the dashboard)
- A1 headless: FR-MEM-01 skips headless runs, so AC-MEM-01's probe uses `/remember` (the forced path), not a plain
  "remember that X" prompt, which only the classifier path would handle.
- A2 undo cannot delete: a created file is emptied and its index line removed.
- A3 `/branch` is seen as a session-id change on the next turn or command; a fork reply from a conversation that was
  cleared, resumed or replaced is dropped, not written.
- A4 the chip is the summary atom; the pane opens only when files changed; "under minWords" counts the user's words.
- The fork has no signal: `bound` stops waiting at 90 s and the guard releases; the fork itself keeps running.
- The classifier sees the user message plus the final answer (not tool results), 6,000 chars at most.
- The writing fork uses the session's model (the kit's fork); only the classifier uses the `model` option.
- At most 5 entries per run; an entry with an unknown `type` is dropped; the slug `memory` becomes `memory-note`.

## Watch out for (also for M6 DreamPath, which extends this plugin)
- `sources.json` rows are per write (file, session, at, kind). M6's "union of sessions on merge" can read a file's
  sessions as `writes.filter(file)`. The file listing ignores dot-folders and non-`.md` names, so `.undo/` and a
  `.dream-backup/` folder are safe.
- Unverified live: the classifier path on a real turn, the pane and its `c` key, the cockpit chip, resume, branch,
  Desktop (MANUAL-CHECKS 2 to 15). Headless `claude -p` does not run the `turn.complete` work (no surface).
- `claude plugin validate` reports `gating hook without .catch: ui.close`; its handler only reads its own atom. Verdict
  unchanged.
- A test world must be created once per test (a second `world(on)` in one test stacks stubs).
- `hooks/kit/` is generated; never edit it.

## Next step
Brian runs MANUAL-CHECKS.md (checks 1 to 13 and 15 in Windows Terminal, 14 in Desktop). The next mod in the order is
M5 (diagram pane, a new plugin, starts with its spike), then M6 (DreamPath, extends bws-memory).
