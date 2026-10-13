# M8 secret box (bws-secrets) run log

## Session 1 (2026-10-13)
Brief: build bws-secrets (FR-SB-01 to 06, AC-SB-01) per docs/SPEC-VIDEO-MODS.md, spike first.

- T01 spike: four arms in a throwaway plugin (`spike/spike-register.ts`), one probe (`receipts/spike-probe-1*`, $0.155).
  Inline rewrite, file read in the shell and `$.env.set` all kept the value out of the stream, `$.session.messages` and
  the transcript file. A `session.append`-only scrub leaked through the structured `toolUseResult`. Chosen: the shell
  reads the file (D1); threat note D2. No blocker.
- T02 skeleton and pure rewrite/scrub (`hooks/secrets.ts`), 12 tests.
- T03 request_secret: spike 2 (`receipts/spike-probe-2.json`, $0.146) showed that a hook awaiting a plain promise is
  dropped at its 10 s budget, and that a loop of sleeper processes holds it (D6). Masked entry as a `Client` surface
  module (D7). 30 tests.
- T04 read guard; replay over 64,110 real Bash commands, 0 refused (`receipts/t04-corpus-replay.txt`, D8).
- T05 injection and scrub in the Bash hook, fail closed; T06 `/secrets`; T07 README threat model and summary atom.
  53 tests in all.
- T08 AC-SB-01 probe (`receipts/m8-probe.json`, `m8-probe-greps.txt`, $0.148): no value or base64 in the stream or the
  transcript file.
- T10 MANUAL-CHECKS.md (13 checks). T11 HANDOFF.md.
- Assumptions recorded: A1 to A7. Plugin version: bws-secrets 0.1.0 (new). No other plugin changed.
- Chronicler: not consulted (no TMS content).
- T09 harness gate (`python tools/mods-harness/harness.py gate`): PASS at a46ea21, 2026-10-13 11:23 (all plugins: validate,
  plugin test, tsc strict, kit sync). Status DONE.
