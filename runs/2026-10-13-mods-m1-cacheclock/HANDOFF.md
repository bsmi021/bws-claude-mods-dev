# Handoff: M1 cache clock (bws-cockpit 0.17.0)

Status: all nine tasks are done and committed on `feat/video-mods`. The gate result and commits are in RUNLOG.md.
Manual checks that need Brian's interactive session are in MANUAL-CHECKS.md.

## What exists (later mods: read this)
- `bws-cockpit/hooks/cacheclock.ts`: pure, no `$`. `cacheStatus` (remaining time, `fresh|low|expired`, or null with no
  request in this window), `cacheChip` (`cache 42m` / `cache <1m` / `cache cold`), `noteTurn`, `noteHandoff`,
  `shouldAutoHandoff`, `statusText` (the `/cacheclock` reply). Window identity is `startedAt` from
  `$.session.usage()`, so `/clear` starts it over with no extra event.
- `bws-cockpit/hooks/register.tsx`, all merged into existing hooks (no new hook events):
  - `turn.complete` (existing hook): `stampTurn` for a main-loop turn (`!e.agentId`).
  - `session.start` (existing hook): registers `cacheclock` (immediate) and a `$.clock.every(60_000)` tick, inside the
    `surfaces.length > 0` block. The tick runs `syncCache`.
  - `command.run { command: 'cacheclock' }`: `cacheText`.
  - `ui.render AbovePrompt` (existing hook): chip `chip-cache` after the loop chip, from atom `cacheBar`.
  - `syncCache` redraws the chip only when its text changes, then runs the auto handoff check.
  - `writeHandoff($, focus, how = {})`: additive. `how.isAuto` skips the clipboard copy and marks the handoff as auto.
    Every successful handoff (manual or auto) calls `noteHandoff`.
- Atoms (declared inline in `types/index.d.ts`, bws-cockpit state): `cacheClock` = `{startedAt, lastAt, turns,
  autoHandoffAt} | null`; `cacheBar` = `{text, state} | null`.
- Options (plugin.json userConfig): `cacheTtlMinutes` 60, `cacheLowMinutes` 5, `autoHandoff` true.
- README: "Cache clock" section, options table rows, Tested row for 0.17.0.

## Tests that prove each requirement (`claude plugin test`, 199/199 in the cockpit)
- FR-CC-01: `tests/cacheclock.test.ts`: "remaining time and state" (boundaries: exactly 5 min is fresh, expired at the
  TTL, never negative, a later turn restarts it), "the TTL and the low threshold are options", "records".
- FR-CC-02: `tests/dashboard.test.ts` "cache clock: bar chip": hidden before the first turn; counts down a minute at a
  time (`cache 60m`, `cache 5m` fresh, `cache 4m` warning, `cache cold` warning); hidden after a `/clear` within a
  minute; drawn on the desktop surface.
- FR-CC-03: `tests/dashboard.test.ts` "cache clock: auto handoff": fires once when low, idle, with a turn; not while a
  turn runs; a manual `/handoff` is the window's handoff; a failed attempt is not retried every minute; a new turn is
  a new window; off when `autoHandoff` is false. Pure table: `cacheclock.test.ts` "auto handoff decision".
- FR-CC-04: `tests/dashboard.test.ts` "cache clock: /cacheclock" (no request yet; time left and TTL, headless too; the
  last auto handoff time). Text: `cacheclock.test.ts` "/cacheclock text".
- FR-CC-05: README diff; version 0.17.0 in plugin.json (validate passes).
- AC-CC-01: `receipts/m1-probe.json`. Live `claude -p "/cacheclock status"` via `python tools/probe.py`, Claude Code
  2.1.296, no model call, $0. The reply is "Cache clock: no request yet in this session...", "Auto handoff: none this
  session."

## Decisions you must know (all also in RUNLOG.md)
- The engine exposes no per-request timestamp to mods (`SessionMessage`, `TurnCompleteInput`, `$.session.usage()`
  have none; `seconds_since_last_response` is only on settings hooks). So the clock starts at each main-loop
  `turn.complete` (the spec's fallback). **Unverified:** whether the `cacheClock` atom survives a resume. If it does
  not, the chip stays hidden until the next turn ends. If it does, the chip shows the time left from the earlier
  process's last turn. Brian's check 2 or 3 settles it.
- Auto handoff fires only in state `low`, never `expired`. A request after expiry re-caches the whole context at full
  price, which defeats the purpose. The tick runs every minute, so a `low` sample normally comes first.
- A manual `/handoff` counts as the window's handoff (it resets the turn gate).
- Chip colours: fresh is plain; `low` and `cold` are both `warning`. The spec gives no colour for cold.
- The auto handoff runs only in attended sessions (the tick is registered only with a surface). Headless runs never
  auto-handoff.
- A handoff's own `$.model.fork` may re-read the main cache, but the clock does not count it. So after a handoff the
  chip can show cold while the cache is warm. This errs on the safe side and is noted in the README.
- Auto handoff with no run folder writes `runs/<date>-handoff/HANDOFF.md`, like `/handoff`.

## Watch out for
- **Unverified: the turn flag.** `isTurnActive` is set by `prompt.submit` and cleared by the main-loop `turn.complete`.
  The generated types do not say whether a slash command (such as `/cacheclock`) passes through `prompt.submit`. If it
  does, and no turn ends after it, the flag stays true and the auto handoff never fires until the next real turn. The
  flag predates M1 (the Enhance button reads it too). Not changed under FR-ALL-08. MANUAL-CHECKS check 14 tests it.
- **Failure logging (FR-ALL-03).** A failed auto handoff (a fork that does not answer) writes one debug line, `cache
  clock: No handoff written: ...`, and one toast. Known gap: if `writeHandoff` throws (not a failed fork), `settle` in
  the timer swallows it and no line is logged.
- **Test-file changes (FR-ALL-08).** `receipts/test-diff-additions-only.txt` is `git diff 92ad8d7` for `bws-cockpit/tests/`.
  Existing tests are unchanged. In `dashboard.test.ts` `world()` two lines are replaced, not added: the `session.usage`
  stub (now reads a mutable `usage.startedAt`, which is 5 by default, as before) and the `return` (now also returns
  `usage`). Behaviour is the same for every existing test.
- `claude plugin test` runs the tests. `tests/dashboard.test.ts` `world()` now returns `usage` (a mutable
  `startedAt`); the existing tests are unchanged apart from that additive return.
- Timers: `session.start` registers one `$.clock.every(60_000)` tick, like the existing refresh. A reload registers
  another, as the refresh already does. Not fixed here.
- Do not write the gate's output file into the repo while a gate runs: the harness refuses a dirty tree.
- The chip is drawn from the `cacheBar` atom, which only `syncCache` writes (at each main-loop turn end and on the
  minute tick). The render does not compute time, so a chip can lag by up to a minute. The tests drive it with
  `$.turn.complete` and `clock.advance`.

## Next step
Brian runs MANUAL-CHECKS.md in a real terminal and Desktop session (checks 1 to 14). Nothing else is open for M1. The next
mod in the order is M2 (prompt bouncer, bws-enhance). M2 starts from a clean tree on `feat/video-mods`.
