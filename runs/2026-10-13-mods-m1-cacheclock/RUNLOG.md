# M1 — Cache clock: RUNLOG

## Session 1
**Brief.** SPEC-VIDEO-MODS.md M1 (FR-CC-01..05, AC-CC-01), in bws-cockpit: a cache-clock chip on the action bar
(`cache 42m`, warning under `cacheLowMinutes`, `cache cold` after expiry), an auto handoff once per cache window when
the cache runs low while idle, and `/cacheclock [status]`. Version 0.16.0 → 0.17.0 (minor).

**Steps.**
- Oriented: AGENTS.md, the spec, TASKS.md, M0's HANDOFF. Checked the generated types for a per-request timestamp:
  none reaches mods (`SessionMessage`, `TurnCompleteInput`, `$.session.usage()` carry none; `seconds_since_last_response`
  is only on settings hooks). So the spec's fallback applies: the clock starts at each main-loop `turn.complete`.
  Checked `tools/mods-harness/loop.json` `widePaths`: none of this work's paths match (`README.md` matches the root
  file only).
- T01 `hooks/cacheclock.ts` (pure) + `tests/cacheclock.test.ts`. Commit 797a3ad. Cockpit tests 187 pass.
- T02 chip: `register.tsx` merged into the existing `turn.complete`, `session.start` and `AbovePrompt` hooks; atoms
  `cacheClock`/`cacheBar`; minute tick; tests in `dashboard.test.ts` "cache clock: bar chip". Commit 8bf1ae0. 190 pass.
- T03 auto handoff through the existing `writeHandoff` (new optional `how` argument: `isAuto` skips the clipboard
  copy and marks the window). Option `autoHandoff`. Tests "cache clock: auto handoff". Commit 5e5a64c. 196 pass.
- T04 `/cacheclock` (`command.run`, `immediate: true`), text from `statusText`. Tests "cache clock: /cacheclock".
  Commit ebf3857. 199 pass.
- T05 README "Cache clock" section, options rows, capabilities, a Tested row; version 0.17.0; plugin description.
  Commit 6528427. Gate passed (validate, tsc, tests).
- T06 live probe, no model call: `MSYS_NO_PATHCONV=1 python tools/probe.py --plugin bws-cockpit --prompt "/cacheclock status" --out runs/2026-10-13-mods-m1-cacheclock/receipts/m1-probe.json`
  (Claude Code 2.1.296, cost $0). The reply in the stream: "Cache clock: no request yet in this session, so nothing to
  count from. It starts at the first reply." and "Auto handoff: none this session." Commit e9811b5.
- T07 harness gate. The first `python tools/mods-harness/harness.py gate` was refused with "commit first": my own
  redirected log sat untracked in the repo (`receipts/t07-harness-gate.txt`). A refused gate does not count. I moved the
  log out and reran; the second run passed at HEAD 788cfde (the commit that started T07). Its log is saved as
  `receipts/t07-harness-gate.txt`. Gate runs charged this session: 1 of 3.
- T08 `MANUAL-CHECKS.md`: 14 checks for Brian (terminal and Desktop, a fast window with
  `cache-fast.settings.json`, auto handoff once, not mid-turn, `/clear`, `autoHandoff` off, headless). Surfaces tested
  live: headless only. Terminal and Desktop: render tests with a mock clock, not live.
- T09 `HANDOFF.md` (final) and this file. Committed with TASKS.md ticked and Status DONE.

**Verified outputs.**
- `claude plugin test` (bws-cockpit): 199 tests, 0 failing (last direct run: `receipts/t04-plugin-test.txt`). Started at
  168 with M0; 31 new (19 pure, 12 in `dashboard.test.ts`). The existing tests are unchanged, apart from the additive
  `usage` return of the test `world()`.
- `claude plugin validate` and tsc strict: passed in the gate runs (`receipts/t0*-gate.txt`).
- Harness gate: PASS at 788cfde (`receipts/t07-harness-gate.txt`).
- Live probe: `receipts/m1-probe.json`.

**Assumptions recorded (dashboard, A1–A9).** The clock counts from `turn.complete`; auto handoff only when `low`, not
after expiry; a manual `/handoff` counts as the window's handoff; chip colours (`low` and `cold` both warning); the auto
handoff only in attended sessions; no clipboard copy on auto; a failed auto attempt is not retried in its window; `startedAt`
identifies the window (so `/clear` resets it); whole minutes rounded down, `<1m` under one.

**Chronicler.** Not consulted: this is technical mod work in the mods repo. No TMS narrative or published artifact is in
scope. Pending jobs: none.

**Known limits and blockers.**
- Nothing is blocking. Brian runs `MANUAL-CHECKS.md` in an interactive session; the live cache TTL has not been measured.
- A handoff's own `$.model.fork` may re-read the main cache, but the clock does not count it. The chip can show cold
  while the cache is warm (the safe side; in the README).
- Each reload of the plugin adds another minute tick, as the existing refresh timer already does. Not fixed here.
- After a resume the engine gives no timestamp, so the chip is hidden until the next turn ends.

## Review pass (same session, after DONE)
An advisor review of the finished work raised four blocking items and some checks. Fixed in commit 5a99b2a:
- **Threshold wording.** `plugin.json` and the README said "this many minutes or fewer". The code uses `remaining < low`
  (with floor rounding, `cache 5m` is plain and `cache 4m` is warning), so the text now says "under this many minutes".
- **Manual checks 5 and 6 were wrong** for TTL 3 and low 2. Corrected; check 14 added (a slash command between turns
  must not block the auto handoff). Check numbering fixed.
- **FR-ALL-03.** An auto-handoff failure now writes one debug line (`$.ui.log(..., { to: 'debug' })`) as well as the
  toast. Asserted in "a failed attempt is not retried every minute, and leaves one debug line". Known gap: a throw inside
  `writeHandoff` (not a failed fork) is still swallowed by `settle` with no line.
- **FR-ALL-08.** `receipts/test-diff-additions-only.txt` is `git diff 92ad8d7 -- bws-cockpit/tests/`: 2 deletions, both
  in `dashboard.test.ts` `world()` (the `session.usage` stub and the `return`), each replaced to read a mutable
  `usage.startedAt` (default 5, as before). No existing test changed.
- **Unverified, now marked as such in HANDOFF.md:** whether atoms survive a resume (the chip after a resume), and whether a
  slash command passes through `prompt.submit` (which would leave `isTurnActive` set; the flag predates M1). Check 14
  tests the second one.

**Gate runs charged this session: 2 of 3.** The first passing harness gate was at 788cfde
(`receipts/t07-harness-gate.txt`); the second passed at 5a99b2a after the review fixes (`receipts/t07-harness-gate-2.txt`).
The refused run before the first pass was not charged. Cockpit tests after the review: 199 pass, 0 fail.

**Next step.** None for this session. Next mod: M2 (prompt bouncer, bws-enhance), from a clean tree on `feat/video-mods`.
