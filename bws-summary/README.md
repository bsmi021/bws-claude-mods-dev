# bws-summary

> A rolling summary of the conversation, one keypress away in the dashboard.

Long sessions get hard to follow. Each time Claude stops, bws-summary has Haiku update a short summary of the whole
conversation (Goal, Key decisions, Done so far, Open items / next steps, under ~350 words) and shows it in the
**Summary** tab of [bws-cockpit](../bws-cockpit/README.md)'s dashboard. Earlier summaries are kept, so a rollback
never loses one. The summary is for you only: it never enters Claude's context.

## Install

```sh
claude plugin marketplace add bsmi021/bws-claude-mods
claude plugin install bws-summary@bws-mods
```

Then `/reload-plugins`. Needs bws-cockpit 0.25.0 or later for the tab. If you set cockpit's `modSummaries` option
yourself, add `bws-summary` to it.

## Use

| Command | What it does |
| --- | --- |
| `/summary` | Opens the dashboard on the Summary tab (headless: prints the summary). |
| `/summary refresh` | Rebuilds the summary from the whole transcript. |
| `/summary text` | Prints the shown summary in the transcript. |
| `/summary older`, `newer`, `latest` | Steps through earlier summaries. |

The tab shows `n/total · turn · time`, then **◀ Older** (`o`), **Newer ▶** (`n`), **Latest** (`l`) and
**Refresh** (`r`), then the summary. "Updating…" shows while one is written, "↺ made after a rollback" marks a summary
built after earlier turns were undone, and a failed call shows its reason in red while the last good summary stays.

## How it works

- After a main-conversation turn that ends with an answer or an interruption, one summary runs in the background; the
  turn never waits. Subagent turns, error turns and headless sessions (`claude -p`, harness workers) are skipped.
- One summary at a time: a turn that ends while one runs gets one more after it. A transcript whose last message the
  newest summary already covers is skipped.
- Incremental: the newest summary whose last message is still in the transcript is sent with only the messages after
  it. After a rollback that is an older one; after a compaction it is the newest, with the whole compacted transcript.
- Messages are cut to 4,000 characters, tool inputs to 300 and the transcript to 180,000.
- At most 50 summaries, in session state only: nothing is written to disk. `/clear` and `/resume` start afresh.

## Capabilities

Reads the session transcript; calls `$.model.complete` (haiku, low effort, 1,500 tokens, 90 s) once per summary.
No files, processes or network of its own.

## Cost

One Haiku call per finished turn; Refresh sends the whole transcript.

## Tested

Claude Code 2.1.307: `claude plugin validate`, `claude plugin test` (12 tests), tsc strict, and the terminal dashboard
through `tools/live.py`. Desktop not checked yet. Ported from a standalone convo-summary mod that drew its own pane.
