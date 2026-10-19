# bws-shell-lint

> Refuses Bash commands that would fail on Windows Git Bash and tells Claude the exact fix.

Some Bash commands are certain to fail on Windows because of a quoting or length problem. The mod refuses those commands
before they run and gives Claude the fix, so its next try is right. It never rewrites a command, and a command it does
not recognise runs as usual.

## Install

```
claude plugin marketplace add bsmi021/bws-claude-mods
claude plugin install bws-shell-lint@bws-mods
```

Then `/reload-plugins`. Requires Claude Code 2.1.296 or later and Git Bash on Windows. It pairs with
[bws-cockpit](../bws-cockpit/README.md) 0.21.1 or later, which shows a Shell lint tab in its dashboard. The mod works
without it.

## Use

There are no commands. The mod acts on every Bash tool call.

**Dashboard tab.** The Shell lint tab in bws-cockpit's dashboard lists the active rules and the last five commands
refused in this session.

## What it does

Each refusal reaches Claude as the tool's error text, in the form `bws-shell-lint [<rule>]: <why>. Fix: <what to do>`.
Where something can draw, a short toast also appears.

| Rule | Refuses | Why it fails | Fix it gives |
| --- | --- | --- | --- |
| `long-command` | A Bash command whose size is 7,800 or more, counting each `'` as 4 and each double quote and backslash as 2. | The Bash tool on Windows cuts long commands short, so bash fails with `unexpected EOF while looking for matching`. Most of these are long `python - <<'EOF'` edit scripts. | Write the script to a file with the Write tool, then run the file, or split the command. |
| `dq-trailing-backslash` | `"C:\some\dir\"`: a double-quoted Windows path ending in an odd backslash. | The backslash escapes the closing quote and the rest of the command is swallowed. | Use the forward-slash path with no trailing slash, given in the message (`"C:/some/dir"`). |
| `py-backslash` | Inline Python (a quoted heredoc fed to `python` or `py`, a heredoc written to a `.py` file, or `python -c`) that is valid as written but breaks after the shell's extra backslash round. | A run of n backslashes not followed by `"` reaches bash as ceil(n/2), even inside single quotes and quoted heredocs. So `.replace('\\', '/')` reaches Python as `.replace('\', '/')`, which is unterminated. A run followed by `"` arrives untouched, so `"\\"` is fine. | Keep backslashes out of inline Python: use `/` paths, `os.sep` or `chr(92)`. Or write the script with the Write tool and run the file. |

PowerShell commands are not checked. A replay of real commands held no PowerShell quoting failures that a rule could
catch, and long PowerShell commands (up to 9.3k characters) ran fine.

How the backslash round looks in Git Bash:

```
$ echo 'A: p\\q  B: x\\"y  E: end\\'
A: p\q  B: x\\"y  E: end\
```

### Measured numbers

These come from replays of real Bash calls on one Windows machine (Git Bash under Claude Code 2.1.287 and 2.1.296).
The length limit and the backslash round may differ on another machine or a later Claude Code release, so re-measure
before trusting them elsewhere.

- A 30-day replay of about 66k commands: the rules catch 239 of 300 quoting and parse failures (80%). None of the 64.6k
  commands that worked would have been refused.
- A later replay of 73,857 commands for the length rule: 154 failed with `unexpected EOF` at 7,000 or more characters.
  The size metric at a limit of 7,800 refuses 152 of them and 10 of the 73,470 commands that ran. The earlier metric
  (length plus 3 per `'`, limit 7,850) refused 142 of the failures and 4 that ran.

## Options

Set in `/plugin`, or under `pluginConfigs["bws-shell-lint"].options` in settings.json.

| Option | Default | What it does |
| --- | --- | --- |
| `enabled` | `true` | Refuse Bash commands that would fail for quoting or length reasons, and say how to fix them. `false` turns every rule off. |
| `disabledRules` | empty | Comma-separated rule names to skip: `long-command`, `dq-trailing-backslash`, `py-backslash`. |

## Permissions and data

- It hooks `tool.call` for `Bash` only, reads the command text, and either denies it or lets it through unchanged.
- The only effect is a toast. It reads and writes no files, runs no processes, makes no network calls, calls no models
  and stores nothing.
- The tab keeps the last five refusals in session memory.

## Compatibility

- Checked on Claude Code 2.1.296, Windows 11, with the Bash tool running Git Bash.
- A headless `claude -p` run: the model ran `ls -la "C:\...\runs\"`, the mod refused it and gave the forward-slash fix,
  and the retry succeeded.
- The interactive terminal, Desktop and VS Code have not been tried. The hook only answers `tool.call`, so it should
  behave the same there, but the toast has not been seen on any surface.
- Built for Windows Git Bash. The thresholds are not meant for other shells or systems.

## License

MIT. Version history: [CHANGELOG.md](CHANGELOG.md).
