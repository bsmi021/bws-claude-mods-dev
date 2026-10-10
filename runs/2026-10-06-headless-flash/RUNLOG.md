# 2026-10-06 headless window flashes

**Brief:** windows still pop up on the PC while `claude -p` sessions run.

## Result
The mods are not the cause. The harness-loop `harness.py` is.

## Evidence (receipts/)
- `probe.log`: in `claude -p`, `$.session.surfaces()` is empty (so cockpit's probes/refresh and notify are all gated off), and a console child spawned by a mod (`powershell` via `$.process.run`) gets `GetConsoleWindow() == 0`: no console, no window. Same from the tool shell and from a detached, no-console parent.
- `windows-plain.log` / `windows-nowin.log` (watcher logs every new visible window, with its client process): a new Windows Terminal window (default-terminal handoff) opens each time a console exe starts without a console.
  - `git.exe` every ~30 s, parent `python.exe` pid 41792 = `bws.game.pit-maneuver/tools/pitu-harness/harness.py run --resume`, a live loop whose watchdog (`checkSeconds` 30) runs `git` via `subprocess.run` with no `CREATE_NO_WINDOW`. Present in both runs.
  - `claude.exe` itself gets a window when a detached parent starts it with plain `Popen` (harness.py:636). With `CREATE_NO_WINDOW` it gets none, and its Bash/PowerShell tool children (and the mod's) open nothing.

## Correction to the last commit
`backgroundProbe` could never have helped `claude -p`: both sites it gates were already behind `surfaces.length > 0`. It only covers interactive sessions.

## Fix (not applied)
`~/.agents/skills/harness-loop/templates/harness.py`: pass `creationflags=0x08000000` (CREATE_NO_WINDOW) on every `subprocess.run/Popen` on Windows (lines 299, 308, 636, 730, 756, 804-812, 1358-1370; the detached spawn at 1268 already uses DETACHED_PROCESS and its child must also get it). Generated copies in project `tools/*-harness/` need the same patch; the running pitu loop needs a restart to pick it up.

## Applied (2026-10-06, on Brian's go)
- `patch_harness.py` adds one shim after the import block: on Windows, `subprocess.Popen` is wrapped so every child (run/Popen/shell) gets CREATE_NO_WINDOW, unless the call already passes DETACHED_PROCESS / CREATE_NEW_CONSOLE (the flag is ignored with those; the detached driver's own children are covered). One point instead of 17 call sites, and it works on the older copies whose call sites differ.
- Patched: the template + m4, m5, m7 (bws.android.scribe), axo-core-loop (bws.game.axo), canopy-delta, canopy (bws.iron-canopy), pitm (prototype.pit-manuever), greybox (street-war). All `py_compile` clean; template's `scripts/test_harness.py` all passed (receipts/test_harness.out).
- NOT patched: `bws.game.pit-maneuver/tools/pitu-harness` (live loop, pid 41792 `run --resume`). Its board `serve` (pid 15668) also runs the old code.
- Window check (receipts/windows-shim.log): a detached no-console parent running git x3 and powershell through the shim opened no window. Before the patch the same shape opened a window per call.
- Patched files are uncommitted edits in those repos.

## pitu loop restart (2026-10-06 02:58)
- `harness.py stop` (driver 54164 stopped), `patch_harness.py` applied to `bws.game.pit-maneuver/tools/pitu-harness/harness.py` (compiles), `start --resume` -> driver 14148, worker claude 84944 (WLD-08 session 3). The board (pid 15668) was left on the old code.
- receipts/windows-pitu.log (150 s watch from before the start): no console/Windows Terminal window opened. The 30 s git cadence that showed before would have produced ~4-5. One non-terminal window: `Unity.exe` dialog (class #32770) at +98 s, from the worker's editor, not the harness.

## pitu board restart
Killed board pid 15668 (old code), relaunched `harness.py serve` detached the way `_spawn_detached` does (start_board.py) -> pid 52580, LISTENING 127.0.0.1:8771, status.html HTTP 200. 25 s watch (receipts/windows-board.log): no new windows. Driver 14148 unaffected.

## Skill docs + generator check
- `~/.agents/skills/harness-loop/SKILL.md`: "Windows windows" note in Phase 3 and a line on `new_harness.py` in the file list.
- `scripts/new_harness.py`: `SHIM_MARK` + `check_shim()`. Generate and `--upgrade` check the template before writing anything and the written `harness.py` after.
- `scripts/test_harness.py`: new `nowindow` case (generated copy has the shim; a copy without it is refused). Full suite: all passed.
