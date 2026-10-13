# M0 — manual checks for Brian

Tested by me: Claude Code 2.1.296, Windows 11, test runner (`claude plugin test`), `claude plugin validate`, tsc 5.8.3 strict.
Not tested: any live interactive surface. No mod publishes a `summary` atom yet, so a real mod chip cannot be seen until M3/M4/M5/M8 land.

1. **Cockpit still loads and the bar is unchanged.** In an interactive session with bws-cockpit loaded (your normal `CLAUDE_CODE_PLUGIN_DIRS` setup, after a `/reload-plugins`): run `/plugin`, expect `bws-cockpit` 0.16.0 loaded; the action bar looks exactly as before (run chip, devices, board chip, buttons). Expected: no extra chip, no error toast.
2. **Option present.** `/plugin` → bws-cockpit → configure: a `Mod chips` text option, default `bws-memory,bws-diagram,bws-skillgate,bws-secrets`.
3. **Chip appears (do this when the first mod that publishes a summary ships, M3 or M4).** Load that mod with cockpit, trigger its work, and look at the bar: one chip `● <label>` after the board chip while the mod is not idle. It disappears when the mod goes idle or is unloaded.
4. **Kit sync catches a hand edit.** In the repo:
   `python tools/sync-kit.py --check` → exit 0, "checked 1 plugin(s) with a kit.json".
   Append a comment to `bws-cockpit/hooks/kit/summary.ts`, run it again → exit 1, "differs from the kit". Then `python tools/sync-kit.py` restores it (or `git checkout bws-cockpit/hooks/kit/summary.ts`).
5. **Gate.** `python tools/mods-gate.py` → every plugin `ok`, then `ok   bws-kit`, `ok   kit sync`, `ok   kit sync tests`.
