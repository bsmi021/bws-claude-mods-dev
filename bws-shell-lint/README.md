# bws-shell-lint

A Claude Code mod for Windows (Git Bash). Some Bash commands are certain to fail because of a quoting or length problem. The mod refuses those commands before they run and tells Claude the exact fix, so the next try is right.

It never rewrites a command. A command it does not recognise runs as usual.

A 30-day replay of about 66k real Bash calls found that the rules catch 239 of 300 quoting/parse failures (80%). None of the 64.6k commands that worked would have been refused. The length limit and the backslash halving are behaviour measured on one Windows machine (Git Bash under Claude Code 2.1.287), so re-measure on yours.

- **Dashboard tab** (0.3.0): with bws-cockpit 0.21.0+, a Shell lint tab lists the active rules and the last five commands it refused this session.

## Load it

```
claude --plugin-dir path/to/bws-shell-lint
```

Run `/plugin` and check that `bws-shell-lint` is listed as an active mod. The mod is not installed anywhere. To keep it on, add it to a marketplace and run `claude plugin install bws-shell-lint@<marketplace>`.

## What it refuses

Each refusal reaches Claude as the tool's error text, in the form `bws-shell-lint [<rule>]: <why>. Fix: <what to do>`. Where something can draw, a short toast also appears.

| Rule | Refuses | Why it fails | Fix it gives |
|---|---|---|---|
| `long-command` | A Bash command whose size is 7,800 or more, counting each `'` as 4 and each double quote and backslash as 2 | The Bash tool on Windows cuts long commands short, so bash fails with `unexpected EOF while looking for matching`. Most of these are long `python - <<'EOF'` edit scripts. | Write the script to a file with the Write tool, then run the file, or split the command. |
| `dq-trailing-backslash` | `"C:\some\dir\"`: a double-quoted Windows path ending in an odd backslash | The backslash escapes the closing quote, and the rest of the command is swallowed. | Use the forward-slash path with no trailing slash, given in the message (`"C:/some/dir"`). |
| `py-backslash` | Inline Python (a quoted heredoc fed to `python`/`py`, a heredoc written to a `.py` file, or `python -c`) that is valid as written but breaks after the shell's extra backslash round | On this machine a run of n backslashes **not** followed by `"` reaches bash as ceil(n/2), even inside single quotes and quoted heredocs. So `.replace('\\', '/')` reaches Python as `.replace('\', '/')`, which is unterminated. A run followed by `"` arrives untouched, so `"\\"` is fine. | Keep backslashes out of inline Python: use `/` paths, `os.sep` or `chr(92)`. Or write the script with the Write tool and run the file. |

PowerShell is not hooked. The corpus held no PowerShell quoting failures that a rule could catch, and long PowerShell commands (up to 9.3k characters) ran fine.

Live probe of the backslash round (Claude Code 2.1.287, Git Bash):

```
$ echo 'A: p\\q  B: x\\"y  E: end\\'
A: p\q  B: x\\"y  E: end\
```

## Configuration

Two `userConfig` fields, shown in the `/plugin` config menu, or under `pluginConfigs.bws-shell-lint` in settings:

| Field | Type | Default | Meaning |
|---|---|---|---|
| `enabled` | boolean | `true` | `false` turns every rule off. |
| `disabledRules` | string | `""` | Comma-separated rule names to skip, for example `long-command, py-backslash`. |

## Capabilities

- **Hooks:** `tool.call` on `Bash` only.
- **API calls:** `$.ui.toast` only.
- **Not used:** files, network, processes, models or storage.

## Files

- `hooks/register.ts`: the hook. It reads the options, runs the rules, and denies or calls `next`.
- `hooks/lint.ts`: the rules, as pure functions. This is a 1:1 port of a Python reference implementation used for the corpus measurements.
- `tests/register.test.ts`: checks that each rule denies its examples. It also checks that look-alikes, 60 real OK commands, other tools and PowerShell all pass through unchanged, and that both options work.
- `tests/agreement.test.ts`: checks that the TS port gives the same rule and detail as the Python reference on every fixture entry.
- `tests/corpus-fixture.ts`: 82 entries.
  - Short real commands from the replay: 8 dq-trailing-backslash, 10 py-backslash and 60 clean. Usernames, paths, project and game names, session ids and device serials are scrubbed, and every entry was read by hand.
  - 4 synthetic commands around the length limit.
  - Since 0.2.0 the long-command details use the new size; one entry's detail moved (8013 to 8016).
  - Each verdict was recomputed with the Python reference on the scrubbed text.

## Tested

- **Claude Code** 2.1.287 (0.1.0) and 2.1.296 (0.2.0) on Windows 11, with the Bash tool running Git Bash.
- **Length metric replay (0.2.0):** over 73,857 real Bash commands, 154 failed with `unexpected EOF` at 7,000+ characters. The new size at 7,800 refuses 152 of them (the old one at 7,850: 142) and 10 of the 73,470 commands that ran (old: 4).
- **`claude plugin validate ./bws-shell-lint`:** passed. It lists `tool.call{tool=Bash}` and `$.ui.toast`.
- **`claude plugin test` (run from this folder):** 17 of 17 pass on Claude Code 2.1.296 (0.2.0 adds the metric test and fixes the toast stub, which 2.1.296 requires to return `{ value }`).
- **Headless `claude -p --plugin-dir`** with stream-json and Haiku 4.5:
  - The model ran `ls -la "C:\...\runs\"`.
  - The mod refused it and gave the forward-slash fix.
  - On the next call the model ran `ls -la "C:/.../runs"`, which succeeded.
- **Not tested:** the interactive terminal, the Desktop app and the VS Code extension. The hook should behave the same there, since it only answers `tool.call`, but the toast has not been seen on any surface.
- **Thresholds are specific to this machine.** The length limit and the backslash round were measured here. Another machine or a future Claude Code release may differ, so re-run the corpus scripts before trusting them elsewhere.
