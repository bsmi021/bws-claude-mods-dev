# Handoff: M0 suite kit (bws-kit)

Status: all code tasks done and committed on `feat/video-mods`; gate result is in RUNLOG.md.

## What exists (later mods: read this)
- `bws-kit/` is a folder, not a plugin (no `plugin.json`). It has a no-op `hooks/hooks.json` + `hooks/register.ts` ONLY because `claude plugin test` refuses a folder with no hooks module. Deviation from the spec's wording: none visible to users, but do not add a manifest.
- Pure modules (no `$`), sibling imports only (`./transcript`), so a flat vendored copy works:
  - `classify-fork.ts`: `classifyThenFork(model, { gate, fork })` -> `{kind:'no'} | {kind:'done', text, via:'fork'|'complete'} | {kind:'failed', step, reason, error}`; also `classifyGate`, `runFork`, `bound`, `gateInput`, `parseYesNo`, `failLine` (the one debug-log line; carries no prompt text). It takes a `KitModel` adapter you build in `register.tsx` from `$`: `classify: (t,l,o)=>$.model.classify(t,l,o)`, `complete: (r,o)=>$.model.complete(r,o)`, `fork: r=>$.model.fork(r)`, `messages: ()=>$.session.messages()`, `sessionModel: ()=>$.session.model()`, `after: (ms,fn)=>$.clock.after(ms,fn)`. `$.model.classify` REJECTS on failure (the kit catches it). `$.model.fork` has no signal or timeout: the kit races it against `after`, so a timeout stops waiting but the fork keeps running. Fail open: any `failed` outcome means leave the turn/prompt/tool call unchanged and log `failLine`.
  - `summary.ts`: `ModSummary = { state: 'idle'|'busy'|'ok'|'warn'|'bad', label (<=40), detail? (<=200) }`; `makeSummary`, `parseSummary(unknown)->ModSummary|null`, `isShown`. Each mod writes `atom({ plugin: '<name>', key: 'summary' } as const, null)`; `null` or `idle` draws no chip. Declare it in the mod's `types/index.d.ts` inline: `'bws-memory': { summary: ModSummary | null }` (see cockpit's types; no `import()`).
  - `transcript.ts` (`TranscriptRow`, `transcriptText`, `words`), `runfolder.ts` (`handoffFolder`, `keptName`, `joinPath`, `handoffPrompt`, `startPrompt`, `transcriptPrompt`): copies of cockpit's `handoff.ts` pieces; cockpit keeps its own.
  - `raster.ts`: copy of design-picker's `lib.ts` colors/Raster/SVG section with `Spec/Block/Shape/Font/Card` types inlined. Design-picker untouched.
- `tools/sync-kit.py`: a plugin lists modules in `<plugin>/kit.json` (`{ "modules": ["classify-fork", "summary"] }`); sibling imports come along. `python tools/sync-kit.py` writes `<plugin>/hooks/kit/*.ts` with a "vendored ... do not edit" header (LF); `--check` exits 1 for a differing, missing or stale copy (line endings compared as LF); `--plugin NAME`, `--root DIR` exist. Import vendored code as `./kit/summary` from `hooks/`. Tests: `python tools/test_sync_kit.py` (8 tests, receipt `receipts/sync-kit-tests.txt`).
- `tools/mods-gate.py` (additive): also runs the kit's tests and tsc (`bws-kit/tsconfig.json` extends cockpit's generated types; the gate bootstraps them in a worktree), accepts `--plugin bws-kit`, and runs `tools/test_sync_kit.py` after `sync-kit.py --check` in the full gate. A NEW plugin still needs its own `.claude-plugin/types/` copied from a sibling.
- bws-cockpit 0.16.0: option `modSummaries` (default the four names; closed list because atoms are typed per plugin and the validator needs literal `read` sources, so `register.tsx` has one read per mod), `hooks/modchips.ts` (pure: `parseMods`, `modChips`), chip key `chip-mod-<plugin>` after the board chip, vendors `summary.ts` through its own `kit.json`. Tests: `tests/modchips.test.ts` (5) and `action bar > mod chips ...` in `cockpit.test.ts`; 162 existing tests untouched, now 168.

## Tests that prove each requirement
- FR-KIT-01: `bws-kit/tests/classify-fork.test.ts`, `bws-kit/tests/kit.test.ts` (26 tests).
- FR-KIT-02: `tools/test_sync_kit.py` (tamper -> `--check` fails: `test_check_fails_when_a_copy_is_tampered`).
- FR-KIT-03: `modchips.test.ts`, `cockpit.test.ts` "mod chips" test (stubbed atoms, terminal and desktop).
- AC-KIT-01: the gate receipt (see RUNLOG.md).

## Next step
M0 is finished. The next mod starts from M1 (cache clock, bws-cockpit) or M3/M4 (new plugins vendoring the kit: add `kit.json`, run `python tools/sync-kit.py`, copy types from a sibling).

## Watch out for
- `claude plugin test` needs a hooks module even for the kit; the validator/static scan rejects `read($, obj[name])`: write one literal read per atom.
- Working-tree files are CRLF (autocrlf); the sync check normalizes to LF. Write files with the Edit/Write tools or `newline='\n'`.
- Cockpit's `hooks/kit/summary.ts` is generated: never edit it.
