# Handoff: M8 secret box (bws-secrets 0.1.0, new plugin)

Status: DONE. All tasks committed on `feat/video-mods`; the harness gate passed at a46ea21 (RUNLOG.md). Brian's interactive
checks are in MANUAL-CHECKS.md (13 checks; the worker only ran headless). Decisions D1 to D8: DECISIONS.md.

## What exists (later mods: read this)
- `bws-secrets/` is a new plugin (0.1.0). Files: `.claude-plugin/plugin.json` (option `secretsDir`, empty =
  `~/.claude/bws-secrets`), `hooks/register.tsx` (the only file with `$`), pure modules `hooks/secrets.ts` (names,
  values, the dotenv file, the placeholder rewrite `injectCommand`, the scrub `scrub`/`scrubValue`/`encodings`,
  `injectionError`), `hooks/guard.ts` (the read guard: `touchesSecrets`, `bashTouches`, `dirForms`, `resolvePath`),
  `hooks/request.ts` (request_secret's arguments and texts, the wait `waitFor`, `/secrets` texts, `secretsSummary`),
  `hooks/entry.ts` (the `Client` surface module: the masked entry), `hooks/kit/summary.ts` (generated from bws-kit via
  `kit.json`; never edit), `types/index.d.ts` (atoms `entry`, `summary`; `McpToolInputs` for the tool), tests
  `secrets`, `request`, `guard`, `inject`, `command`, `summary` (`.test.ts`) and `tests/world.ts` (stubbed engine, not a
  test), `README.md` (threat model).
- Hooks (validator inventory): `session.start` (registers `/secrets` and the tool, publishes the summary),
  `tool.call{mcp__bws-secrets__request_secret}`, `command.run{secrets}`, `tool.call{Read}`, `{Grep}`, `{Glob}`,
  `{Bash}` (guard + injection + scrub), `ui.message{requestId=bws-secrets}`, `ui.close`, `ui.render{Pane, bws-secrets}`.
  Every `tool.call` hook has a `.catch` that refuses (fail closed); the Bash one withholds the result if the scrub fails
  after the command ran.
- Mechanism (spike, D1): a `{{secret:NAME}}` command is rewritten to
  `export NAME="$(sed -n 's/^NAME=//p' '<file>' | head -n 1 | tr -d '\r')"; <command with ${NAME}>`. Claude Code
  records only the model's own command, so neither the rewrite nor the value appears in the transcript. The result is
  scrubbed in the same hook after `next` and returned as a new `{ result }` (no `ref`). That is what core stores, both
  the `tool_result` and the structured `toolUseResult`. A `session.append` scrub alone leaks the structured record.
- request_secret waits for the person inside its hook by looping on a ~1 s sleeper process (`ping -n 2 127.0.0.1` /
  `sleep 1`). A hook awaiting a plain promise is dropped at its 10 s budget (spike 2, D6). It stops at the answer, an
  interrupt (`next.signal`), 10 minutes, or 900 sleeps. Headless, or a surface without `Client`: a saved name is
  reused, an unsaved one refused (A5). One request at a time (A6).
- Files: `<secretsDir>/<cwd slug>.env` (`C--Projects-app.env`), dotenv `NAME=value`, LF, a value one line of 4 to
  8,192 characters, names `^[A-Z][A-Z0-9_]{0,63}$` minus shell variables.
- Summary atom `{ plugin: 'bws-secrets', key: 'summary' }`: null with no names, `secrets N` (ok), `secret: asking for
  NAME` (busy). bws-cockpit already lists `bws-secrets` in `modSummaries`, so no cockpit change is needed.

## Tests that prove each requirement (`claude plugin test` in bws-secrets: 53 pass, 0 fail)
- FR-SB-01: DECISIONS.md D1 and D2 (threat note), `receipts/spike-probe-1.json` plus `-greps.txt` and `-dump.json`
  (four arms; only the session.append arm leaked, through the structured record); `tests/secrets.test.ts` "FR-SB-01:
  the spike mechanism..." (placeholder names, the quote-aware rewrite, the injected command holds no value, scrub of
  raw/base64/echo-newline base64/percent/hex, longest first) and "names, values and the secrets file".
- FR-SB-02: `tests/request.test.ts` "pure parts" (arguments, the exact result text, the wait's five outcomes, the
  sleeper), "the masked entry draws dots, never the value" (keys, and the surface module with a fake surface), "opens
  the entry and saves outside the project" (typed in the pane and saved; never drawn; others kept; Keep; too short then
  retyped; Cancel) and "when it cannot ask" (headless reuse or refuse, mobile, pane not placed, sleeper fails, bad
  name, a second request, other tools not intercepted). Spike 2: `receipts/spike-probe-2.json`.
- FR-SB-03: `tests/guard.test.ts` (paths; Read/Grep/Glob; 13 Bash forms refused; 24 clean commands near the name not
  refused; a custom folder; the refusal text names the placeholder; other calls pass through), plus the replay
  `replay_guard.py` with 0 refused of 64,110 real commands (`receipts/t04-corpus-replay.txt`).
- FR-SB-04: `tests/inject.test.ts` (the command run holds the file path, not the value; the echo test with base64;
  output without a placeholder scrubbed; an error result withheld scrubbed; a persisted large output scrubbed in its
  file; an unsaved, bad or background placeholder refused; results without a value returned as made, `ref` kept).
- FR-SB-05: `tests/command.test.ts` (arguments, names only, nothing saved, remove, usage, the pane never shows a kept
  value).
- FR-SB-06: `README.md` (threat model and what it does not protect); `tests/summary.test.ts` (atom shape and count).
- AC-SB-01: `receipts/m8-probe.json` and `receipts/m8-probe-greps.txt`. Headless, sonnet, $0.148: request_secret,
  then the placeholder command. The value and its base64 appear 0 times in the stream and in the transcript file. The
  base64 line proves the value was injected.

## Decisions you must know (assumptions A1 to A7 on the dashboard; D1 to D8 in DECISIONS.md)
- A1 injection by a shell read of the file (not `$.env.set`, not inline). A2 file name = cwd slug. A3 the scrub fails
  closed. A4 background placeholder commands are refused. A5 headless reuse. A6 one request at a time. A7 a `Client`
  masked entry (focus by click).
- Every Bash result is scrubbed once any secret is saved, placeholder or not (defence in depth, D5).
- Escape closes the entry pane (`closeOnEscape`), which cancels the request.
- The spec's "command position only" for a path rule: the folder's path in any shell form, anywhere in the command,
  never the bare name (D8).

## Watch out for
- **Unverified live (MANUAL-CHECKS 1):** whether a click gives the `Client` the keyboard in Windows Terminal. If it
  does not, the masked entry cannot be typed into. The types document no keyboard route into a `Client`. That would be a
  question for Brian, not a redesign.
- Unverified: what the interactive permission prompt shows for a rewritten command (check 8), the cockpit chip
  (check 11), Desktop (check 13).
- The probe's step 3 (`cat ~/.claude/bws-secrets/*.env`) was not refused because the probe's `secretsDir` was a temp
  folder: the guard protects the configured folder only.
- Not protected (README): PowerShell and other tools reading the folder, a recursive Bash search of a parent folder,
  transformed values, files the value is written to.
- `claude plugin validate` reports `gating hook without .catch: ui.close` (its handler only records a cancel).
- Test engine: `$` calls are slow; tests wait with `settle()` until the request's sleeper runs. The stub sleeper takes
  20 ms, so the 900-sleep cap is not reached while a test acts.
- Known test gap: the `.catch` paths (`GUARD_FAILED`, `WITHHELD`, `FAILED_TEXT`) are untested; the test engine skips a
  throwing stub instead of failing the hook (as M6 found). They refuse or withhold (fail closed).
- The `.catch` handlers write no debug line. FR-ALL-03's debug line is read as covering classifier and fork failures.
  This mod has neither.
- Decision: the scrub of a large output writes into Claude Code's own `tool-results` file (`persistedOutputPath`) to
  remove the leaked copy there. It is a deliberate write to an engine-owned file.
- `hooks/kit/` is generated; never edit it. New plugin: `.claude-plugin/types/` is gitignored (copied from a sibling).

## Next step
Brian runs MANUAL-CHECKS.md, check 1 first. M8 is the last mod in the spec's order, so there is no next mod.
