# bws-notify

> Windows toasts that say which project needs you and what happened, with the first line of Claude's reply in them.

A bare "Claude Code needs your attention" box does not tell you which of several sessions is waiting, or why. bws-notify sends a Windows toast that names the project and carries the text Claude is waiting on or the start of its last reply. It replaces the modal message-box hook some setups use.

## Install

```bash
claude plugin marketplace add bsmi021/bws-claude-mods
claude plugin install bws-notify@bws-mods
```

Then `/reload-plugins`. Requires Claude Code 2.1.296 or later and Windows. With [bws-cockpit](../bws-cockpit/README.md) 0.21.1 or later, a Notify tab appears in its dashboard. If you have an old `Notification` hook that shows a message box, remove it, or you get both.

## Use

No commands. Toasts appear by themselves.

| Event | Toast title | Toast body |
|---|---|---|
| Permission ask, question or idle prompt | `<project> · needs you` (`waiting for you` when idle) | the text Claude is waiting on |
| Turn finished | `<project> · done (1m 35s)` | first line of Claude's last reply |
| Subagent finished | `<project> · <agent type> finished` | first line of its report |
| API error ended the turn | `<project> · error: <kind>` | the error details |

`<project>` is the last folder of the session's working directory. Markdown in the reply is stripped, and the body is cut to `maxBodyChars`.

**Dashboard tab.** With bws-cockpit, the Notify tab says which events toast and lists the last five toasts this session sent.

## What it does

It sends nothing for:
- turns shorter than `minTurnSeconds`
- a stop while background tasks are pending
- the same toast within 8 seconds
- headless sessions (`claude -p`, SDK)
- internal forks such as prompt suggestions (a subagent stop with no agent type, or a JSON suggestion body)

Toasts show as "Windows PowerShell". Windows Do Not Disturb and Focus rules apply to them. Do Not Disturb turns on by itself while an app is fullscreen, so a terminal in OS fullscreen (F11) shows no banner. The toast is still in Action Center (Win+N). To get banners in fullscreen, untick "When I'm using an app in full-screen mode" under Settings, System, Notifications, "Turn on do not disturb automatically".

If a toast cannot be sent, one line is written to `%TEMP%\bws-notify.err` and the turn is not affected.

## Options

Set these in `/plugin`, or under `pluginConfigs["bws-notify"].options` in settings.json.

| Option | Default | What it does |
|---|---|---|
| `needsInput` | `true` | Toast when Claude needs you: permission asks, questions and idle prompts, with the text Claude is waiting on. |
| `turnDone` | `true` | Toast when a turn finishes. The toast carries the first line of its last reply. |
| `minTurnSeconds` | `20` | Skip the finished-turn toast for turns shorter than this. |
| `subagentDone` | `true` | Toast when a subagent finishes: its type and the first line of its report. |
| `errors` | `true` | Toast when the turn ended on an API error (limit, overload, auth). |
| `maxBodyChars` | `160` | Characters of the reply or prompt text kept in a toast. |

## Permissions and data

- **Reads:** the text of the event that triggers a toast (the question Claude is waiting on, the start of its last reply or a subagent's report), and the session's working directory name.
- **Runs:** `wscript.exe //B bin/notify.vbs <base64 JSON>`. The engine's process call has no hide-window option, so a direct `powershell` call would flash a console window. `wscript` is a GUI program, and the script starts `powershell.exe` hidden, which runs `bin/toast.ps1` (Windows PowerShell 5.1, WinRT toast API). The text travels as base64, so nothing is quoted or escaped through a shell.
- **Writes:** `%TEMP%\bws-notify.err` on a failure. Nothing else.
- **Network and models:** none.
- It never approves a tool call or changes a turn.

## Compatibility

- Checked on Claude Code 2.1.289 and later, Windows 11, in a fullscreen terminal layout. Toasts and Action Center entries were seen for a permission wait, a finished turn and subagent stops.
- Windows only. The desktop app, VS Code and mobile were not tried; the toast is a Windows feature and does not use the mod's pane or bar drawing.

## License

MIT. Version history: [CHANGELOG.md](CHANGELOG.md).
