# PLAN — bws-cockpit mod (Run Cockpit band + Editor & Device Guard)

Source: [usage review](../2026-10-02-usage-analysis/RUNLOG.md), mods #1 and #2.
Plugin dir: `C:\Projects\bws.mods.claude-code\bws-cockpit\`

## Finish line (all must be true, with receipts in this folder)
1. `claude plugin validate ./bws-cockpit` passes with no errors. The hook/call inventory is saved to `receipts/validate.txt`.
2. `claude plugin test` passes in `bws-cockpit/`, covering every feature below, pass-through for unrelated tools, and safe commands. Output saved to `receipts/test.txt`.
3. Live, interactive: a screenshot of the band in a real terminal session (`--plugin-dir`) shows the run line and the editor/device row. Saved to `receipts/band.png`.
4. Live, headless (`claude -p --plugin-dir`): at least one real block (adb with no device, or unreal-mcp with the editor down) and one real rewrite (Unity `-automated` or UE low-VRAM flags), shown in transcript output. Saved to `receipts/live-guard.txt`.
5. A README with purpose, loading commands, configuration, capabilities and the tested surfaces and version.
6. RUNLOG.md updated. Local git commit, no push.

## Features
### Run Cockpit
- **R1 Band (AbovePrompt):**
  - Shows the newest run folder under `<cwd>/runs/` (newest RUNLOG/PLAN/TASKS mtime) and its next-step line from RUNLOG.
  - Shows the open-item count (`- [ ]` in PLAN.md and TASKS.md).
  - Adds an editor/device status row: UE process and MCP port, Unity, Blender, adb devices, VRAM used/total.
  - Also shows the last action the guard took.
- **R2 `/resume-run`:** submits a resume prompt that names the run folder and its files.
- **R3 `/cockpit`:** a plain-text status reply. This is the fallback where nothing draws.
- **R4 `prompt.context`:** one short block with the newest run folder and its next step. Runs headless too.

### Editor & Device Guard (fix mode: blocks and rewrites)
- **G1 Unreal MCP:** block `mcp__unreal-mcp__*` when the project's unreal-mcp port (from `.mcp.json`) is unreachable. The block message includes the fix hint.
- **G2 adb:** block `adb` commands that need a device when no device is in `device` state. Allowed through: `devices`, `start-server`, `kill-server`, `connect`, `pair`, `version`.
- **G3 Unity pipeline:** block `unity ... command ...` CLI calls when no Unity editor process is running.
- **G4 Unity launch:** a launch (`unity open <path>`, or `Unity.exe ... -projectPath`) without `-automated` gets `-automated` added.
- **G5 Unreal launch:**
  - A GUI `UnrealEditor.exe` launch (not `-Cmd`, `-nullrhi`, `-run=` or `-game`) gets the low-VRAM `-ExecCmds` when there is pressure. Pressure means another UE editor or Blender is running, or VRAM used ≥ the threshold.
  - A second GUI launch of a `.uproject` that is already open is blocked.
  - `Start-Process -ArgumentList` forms are not parsed safely, so they get a block with the corrected command shape.
- Every block or rewrite shows a toast and is recorded for the band.

## Out of scope (parked)
- Re-injecting state after compaction. Check the types for a route, and park it if none is clean.
- Dev-server tracker, Loop Watch pane, Shell Lint (mods #3–#7).
- Installing into the user scope, and pushing.
