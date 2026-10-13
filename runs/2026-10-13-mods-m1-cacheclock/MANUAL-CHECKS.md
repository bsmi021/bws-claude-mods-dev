# M1 cache clock: manual checks

Run these in a real interactive session from the repo root (`C:\Projects\bws.mods.claude-code-loop`). Each check
gives the command and the expected result. The fast settings file (`cache-fast.settings.json` in this folder) sets
the TTL to 3 minutes and the low threshold to 2 minutes, so the window runs out in a few minutes.

**Versions and surfaces.** Claude Code 2.1.296 (`claude --version`). Tested live: headless `claude -p` only (the
probe in `receipts/m1-probe.json`, `/cacheclock status`, no model call). Terminal bar and Desktop bar: tested by
render tests with a mock clock (`tests/dashboard.test.ts`, "cache clock"), not seen live. Live terminal and
Desktop checks are below.

1. **Loads.** Command: `claude --plugin-dir ./bws-cockpit`, then `/plugin`.
   Expected: bws-cockpit 0.17.0 is listed as loaded, with no error.

2. **Hidden before the first reply.** Command: in the session from check 1, look at the action bar.
   Expected: no `cache` chip.

3. **`/cacheclock` before a reply.** Command: `/cacheclock`.
   Expected: `Cache clock: no request yet in this session, so nothing to count from. It starts at the first reply.`
   then `Auto handoff: none this session.`

4. **Chip after a reply.** Command: send any short prompt and wait for the reply.
   Expected: the bar shows `cache 60m` (or `59m`) in plain text, and the number drops by one about each minute.

5. **Warning and cold (fast window).** Command: `claude --plugin-dir ./bws-cockpit --settings runs/2026-10-13-mods-m1-cacheclock/cache-fast.settings.json`,
   then send a short prompt.
   Expected: `cache 3m` plain at once; `cache 2m` plain about one minute later (2 minutes left is not under 2);
   `cache 1m` in warning colour between one and two minutes after the reply; `cache cold` in warning colour after
   three minutes. Each number moves on at the next minute tick, so it can be up to a minute late.

6. **Auto handoff, once.** Command: same fast session. After the reply, leave it idle for three minutes.
   Expected: one toast, `cache clock: Handoff written: runs/<date>-handoff/HANDOFF.md (N words).` (or the current
   run folder's HANDOFF.md), between one and two minutes after the reply (the first tick under 2 minutes left). The
   clipboard is not changed. Wait for the cache to run out: no second toast in that window.

7. **Not mid-turn.** Command: in the fast session, send a prompt that takes more than two minutes, such as
   `list every .md file under docs/ and summarise each one in a line`. Let it run while the chip is `cache 2m`.
   Expected: no auto-handoff toast until the reply has finished. After it finishes the chip reads `cache 3m` again.

8. **New turn, new window.** Command: after check 6, send another prompt and leave it idle for two minutes.
   Expected: one more auto-handoff toast and file update (a new window, one handoff).

9. **Manual handoff counts.** Command: after a reply in the fast session, run `/handoff` at about one minute in,
   then leave it idle.
   Expected: no auto-handoff toast for that window. Note whether the chip shows `cache cold` while the cache is in
   fact warm after the handoff: the clock does not count the handoff's own request (see README, Cache clock).

10. **`/clear` hides it.** Command: `/clear`, then wait about a minute.
    Expected: the chip disappears. `/cacheclock` says there is no request yet.

11. **`/cacheclock` while Claude works.** Command: type `/cacheclock` during a long reply.
    Expected: it prints the clock at once, without waiting for the reply.

12. **Auto handoff off.** Command: as check 5, but with `"autoHandoff": false` added to the `options` object in a
    copy of the settings file.
    Expected: the chip still counts down and warns; no auto-handoff toast and no file is written.

13. **Headless.** Command: `claude -p "/cacheclock status" --plugin-dir ./bws-cockpit`.
    Expected: the same text as check 3, printed, with no model call.

14. **A slash command between turns does not block auto handoff.** Command: in the fast session, after a reply, run
    `/cacheclock` at about one minute, then leave it idle.
    Expected: the auto-handoff toast still comes between one and two minutes after the reply. If it does not, a
    slash command probably passes through `prompt.submit` and leaves the turn flag set (HANDOFF.md, "Watch out for").
    Report which.

15. **Desktop bar (if you use the Desktop app).** Command: load the plugin in Claude Desktop the same way as check 1
    (or from the installed marketplace copy), send a prompt.
    Expected: the same `cache NNm` chip on the Desktop bar. Not tested live by the worker.
