# bws-notify

A Claude Code mod that sends Windows toasts saying which project and what happened, with the text of the conversation in them. It replaces a bare "Claude Code needs your attention" message box.

| Event | Toast title | Toast body |
|---|---|---|
| Permission ask, question or idle prompt | `<project> · needs you` (`waiting for you` when idle) | the text Claude is waiting on |
| Turn finished | `<project> · done (1m 35s)` | first line of Claude's last reply |
| Subagent finished | `<project> · <agent type> finished` | first line of its report |
| API error ended the turn | `<project> · error: <kind>` | the error details |

`<project>` is the last folder of the session's working directory. Markdown in the reply is stripped, and the body is cut to `maxBodyChars`.

It sends nothing for: turns shorter than `minTurnSeconds`, a stop while background tasks are pending, the same toast within 8 seconds, headless sessions (`claude -p`, SDK), and internal forks such as prompt suggestions (a subagent stop with no agent type, or a JSON suggestion body).

## How it launches a toast

The engine's `$.process.run` has no hide-window option, so a direct `powershell` call flashes a console window. The mod runs `wscript.exe //B bin/notify.vbs <base64 JSON>` instead. `wscript` is a GUI program, and the script starts `powershell.exe` at window style 0, which runs `bin/toast.ps1` (Windows PowerShell 5.1, WinRT toast API). The text travels as base64, so nothing is quoted or escaped through a shell. A failure writes one line to `%TEMP%\bws-notify.err` and never touches the turn.

Toasts show as "Windows PowerShell". Windows Do Not Disturb and Focus rules apply to them: a toast Windows accepted but did not show as a banner is still in Action Center (Win+N).

## Load

```bash
claude --plugin-dir path/to/bws-notify
```

To load it in every session, add its absolute path to `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json`, separated by `;`. Remove any old `Notification` hook that shows a message box, or you get both.

## Options

| Option | Default | What it does |
|---|---|---|
| `needsInput` | `true` | Toast when Claude needs you |
| `turnDone` | `true` | Toast when a turn finishes |
| `minTurnSeconds` | `20` | Skip the finished-turn toast for shorter turns |
| `subagentDone` | `true` | Toast when a subagent finishes |
| `errors` | `true` | Toast when the turn ended on an API error |
| `maxBodyChars` | `160` | Characters of text kept in a toast |

## Tested

Claude Code 2.1.289, Windows 11, fullscreen terminal layout.

- **Static:** `claude plugin validate` passes.
- **Automated:** `claude plugin test` passes 12 of 12 (wordings, the base64 round trip, the hidden launch's arguments, duration and minimum length, background-task stops, repeat suppression, headless, the switches, suggestion forks).
- **Live:** the toast script ran with no error, and Windows listed the toasts in Action Center, including real ones the loaded mod sent for a permission wait, a finished turn and subagent stops.
- **Not verified:** that a banner is drawn on screen. On the test machine no banner was seen while Do Not Disturb or Focus rules may have applied, and the cause was not isolated. The desktop app, VS Code and mobile surfaces were not tried; the toast is a Windows feature and does not use the mod's pane or band drawing.
