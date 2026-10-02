# bws Claude Code mods

Two [Claude Code mods](https://code.claude.com/docs/en/plugins/mods/overview) for game and app development on Windows. Each is a plugin of function hooks: JavaScript/TypeScript that runs inside Claude Code.

| Mod | What it does |
|---|---|
| [`bws-cockpit`](bws-cockpit/README.md) | A band above the prompt: the newest run folder and its next step, plus live Unreal, Unity, Blender, adb and VRAM state, with `/resume-run` and `/cockpit`. An Editor & Device Guard that blocks Unreal MCP, adb and Unity CLI calls that cannot work, and adds `-automated` and low-VRAM flags to editor launches. A Loop Watch pane for harness loops, with stall alerts, stop and resume, and answering a paused loop's questions. A Finish-Line Guard that keeps Claude working while the session's checklist has open items, and asks for evidence when it claims done without any. A Project Locator: a `find_project` tool and `/projects`, plus searches for `.uproject` and Unity project files answered from an index instead of a disk scan that times out. `/handoff`, which writes a HANDOFF.md for a fresh agent from the session and copies its start prompt, and a worker model pin that runs subagents on a chosen model when the Agent call names none. |
| [`bws-shell-lint`](bws-shell-lint/README.md) | Refuses Bash commands that will fail on Windows Git Bash (over-long commands, a backslash before a closing quote, backslashes that reach Python halved) and gives the corrected form. |

## Load

```bash
claude --plugin-dir path/to/bws-cockpit --plugin-dir path/to/bws-shell-lint
```

To load them in every session, list both absolute paths, separated by `;` on Windows, in `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json`.

Built and tested on Claude Code 2.1.287 (Windows 11, Git Bash and PowerShell 7.6). Each plugin's README lists exactly what was verified and what was not. Run `claude plugin validate <dir>` and `claude plugin test` in each folder.
