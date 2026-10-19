# bws-interview

> Keeps every question-and-answer round with Claude, per project, and gives the agreed answers back when the context
> has lost them.

Each time Claude asks you something through `AskUserQuestion` (the `interview` skill does it in rounds), the mod keeps
the question, the options, what you picked or typed and your notes. Page back through them in the dashboard, and hand
them back to Claude with one command after a compaction or in a new session.

## Install

```bash
claude plugin marketplace add bsmi021/bws-claude-mods
claude plugin install bws-interview@bws-mods
```

Then `/reload-plugins`. Requires Claude Code 2.1.296 or later. The Interview tab needs
[bws-cockpit](../bws-cockpit/README.md) 0.21.1 or later; without it `/qa show` prints the record as text.

## Use

| Command | What it does |
|---|---|
| `/qa` | The record as text: the newest 20 rounds, numbered. |
| `/qa show` | Opens the dashboard on the Interview tab: one round per page, with Older, Newer and Newest. |
| `/qa send` | Gives this session's rounds back to Claude as your own turn, framed as decided answers. |
| `/qa send all`, `/qa send 5` | The whole project record, or the newest 5 rounds. |

In the Interview tab, **Send this round** and **Send session** do the same as `/qa send` for one round or the session.

Claude can read the record itself with the tool `mcp__bws-interview__qa_history` (`scope`: `session` or `all`;
`last`: how many rounds). The `interview` skill tags its rounds with `metadata.source: "interview:<slug>"` and reads the
record during intake, so a resumed interview does not ask again.

## What it does

- Records each `AskUserQuestion` round when its answer comes back: the questions, the options, your choices or typed
  answer, and your notes.
- Keeps the newest 400 rounds per project folder; very long text is cut.
- Sends nothing on its own: rounds go back to Claude only when you run `/qa send` or press a Send button.

## Options

| Option | Default | What it does |
|---|---|---|
| `pinDigest` | `false` | Adds a short digest of this session's answers (2,000 characters at most) to Claude's context every turn, so it survives a compaction. Costs tokens every turn. |

Set it in `/plugin`, or under `pluginConfigs["bws-interview"].options` in `~/.claude/settings.json`.

## Permissions and data

- Reads the input and result of `AskUserQuestion` tool calls.
- Writes only its own plugin store, keyed by project folder.
- Registers `/qa` and the `qa_history` tool; submits a prompt only when you ask for it.
- No network, no files of its own, no model calls.

## Compatibility

Built against Claude Code 2.1.296 on Windows 11. Checked with automated tests and a headless `/qa` run; the dashboard
tab and a live interview round have not been checked by hand yet.

## License

MIT. Version history: [CHANGELOG.md](CHANGELOG.md).
