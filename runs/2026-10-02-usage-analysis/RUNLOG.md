# RUNLOG — 2026-10-02 usage analysis

## Objective
Analyze the last 30 days (2026-09-02 → 2026-10-02) of Claude Code transcripts. Propose Claude Code **mods** (in-process JS/TS plugins) for Unreal, Unity, web and local-app work. Discussion only: build nothing until Brian picks.

## Actions
- `analyze.py` reads every `~/.claude/projects/**/*.jsonl` changed in the last 30 days: 2,033 files, about 3.8 GB, including subagent logs. Output: `usage.json`, `prompts.jsonl`, `corrections.jsonl`, `error_samples.json`.
- `errors.py` classifies every tool error, plus build commands, polling and runs over 5 minutes. Output: `errors.json`.
- Ad-hoc probes:
  - Glob-timeout inputs
  - Unity pipeline error messages
  - Blender/nvidia-smi co-usage
  - settings diff against `settings.json.bak-doctor-2026-10-02`
- A subagent grouped interactive prompts into themes. It also produced friction counts.
- Read the mods reference (code.claude.com/docs/en/plugins/mods/reference) to check that each candidate is feasible.

## Key numbers
- 1,210 top-level sessions:
  - about 357 interactive
  - 853 headless/SDK (harness loops)
  - 455 of those 853 are skill-trigger evals
- Separately, there are about 1,000 subagent logs.
- 2,331 prompts, 104.6k tool calls, 3,002 tool errors (2.9%).
- About $12.9k API-equivalent cost, read from cost-state. It is cumulative for sessions that started before the window.
- By domain:

| Domain | Tool calls | Cost |
|---|---|---|
| Unreal | 48.6k | $5.0k |
| Unity | 27.7k | $4.9k |
| Apps/tools | 14.9k | $1.5k |
| Web | 12.3k | $1.3k |

- Clean error signals:
  - 351 Glob/Grep timeouts at 20 s. Most come from home-dir sessions scanning `C:\Projects` for `*.uproject`.
  - About 201 Bash quoting/heredoc failures.
  - 95 unreal-mcp errors: connection refused, session expired, schema defaults, Python failures.
  - 22 Unity pipeline "400 / main thread timed out" errors, plus about 20 pipeline command timeouts.
- Shell polling (`sleep`/`until`/`while`) appeared in about 4.7k shell calls. There were 462 commands over 5 minutes.
- 76 compactions, 31 of them in tmsUnreal.
- About 70 hook cancellations (`unreal-context.sh` SessionStart, `codegraph prompt-hook`).
- Blender MCP was used in about 57 UE-project sessions. nvidia-smi was run by hand in 33 sessions.

## Flag
- `cc-plugin-agents-md@builtin` was disabled in `~/.claude/settings.json` at 06:40 today. The `bak-doctor` backup does not have that entry.
- These projects have only an AGENTS.md: tmsUnreal, animation.station, iron-canopy, android-scribe, axo, pinkgill. Their project instructions will no longer load.
- Not changed. Asking Brian.

## Status / next step
- Report HTML: `report.html`, published at https://claude.ai/artifact/VRtfEFAEtMhdhzp7BJSwSK
- Prompt themes from the subagent:

| Theme | Count |
|---|---|
| Commit/push/PR ("ship") | 122 |
| Resume/crash | 94 |
| Status asks | 47 |
| "Use the MCP" reminders | 37 |
| Device handshakes | ~35 |
| Handoffs | 21 |
| "Don't stop" | ~19 |
| Trust checks | ~10 |

- Ranked mods:
  1. Run Cockpit
  2. Editor & Device Guard
  3. Windows Shell Lint
  4. Finish-Line Guard
  5. Loop Watch
  6. Project Locator
  7. /handoff + model pin
- Next: Brian picks 2–3 mods. Then pin the finish line and build them in this repo against locally generated `.claude-plugin/types`.
