# bws-interview

A record of every question-and-answer round. Each time Claude asks through `AskUserQuestion` (the `interview` skill
does it in rounds), the mod keeps the question, the options, what you picked or typed and your notes, per project.
Page back through them any time, and give them back to Claude when the context lost what was agreed.

## Use

| | |
|---|---|
| `/qa` | The record as text: the newest 20 rounds, numbered. |
| `/qa show` | Opens the dashboard on the **Interview** tab: one round per page, Older / Newer / Newest. |
| `/qa send` | Gives this session's rounds back to Claude as your own turn ("treat these answers as decided"). |
| `/qa send all` · `/qa send 5` | The whole project record, or the newest 5 rounds. |
| Tab: **Send this round** · **Send session** | The same, from the tab. |
| Tool `mcp__bws-interview__qa_history` | Claude reads the record itself (`scope: session/all`, `last: N`). |

The interview skill tags its rounds with `metadata.source: "interview:<slug>"`, calls `qa_history` during intake so
a resumed interview does not re-ask, and names the tag in its RUNLOG.

## Options

- `pinDigest` (off): a digest of this session's answers (2,000 characters at most) rides in Claude's context every
  turn, so it survives a compaction. Costs tokens each turn.

## Capabilities

Reads AskUserQuestion input and results; writes its own plugin store (`p:<project folder>`, newest 400 rounds per
project, long text capped); registers `/qa` and one tool; submits a prompt only when you ask (`/qa send`, a Send
button). No network, no files, no model calls.

## Load

```bash
claude --plugin-dir ./bws-interview
```

The Interview tab needs bws-cockpit to list `bws-interview` among its mod tabs; without it `/qa show` prints the
record as text.

## Tested

Claude Code 2.1.296 (local types): `claude plugin validate`, `claude plugin test` (16 tests), tsc strict, and a
headless `claude -p "/qa"` run. The dashboard tab and a real interview round were not verified interactively yet.
