# bws-interview: a Q&A record for the interview skill

## Finish line

A round asked through AskUserQuestion (by the interview skill or anything else) is recorded with its answers,
shows in an "Interview" tab of the cockpit dashboard where Prev/Next page through every round of this project,
and `/qa send` puts the agreed Q&A back into the chat as a user turn. Proof:

1. `claude plugin test` covers: record a round, skip a denied call, page the tab, digest text, send defers the submit.
2. `claude plugin validate ./bws-interview` and tsc (strict) pass.
3. Live `claude -p` run: `/qa` prints the recorded rounds (stream-json receipt in `receipts/`).
4. The interview skill tags its rounds (`metadata.source: "interview"`) and points at `/qa` for recovery.

## Design

- **Record**: `tool.call` on `AskUserQuestion`, observe the result. Questions, options, the chosen answer, free text,
  notes, follow-up/AFK flags. Denied or errored calls are skipped.
- **Keep**: `$.store`, keyed per project (`p:<cwd>`), every round with its session id and time. Pruned to the newest
  400 rounds per project and long text capped, so the 4 MiB plugin store holds.
- **View**: dashboard tab (bws-kit tab protocol). One card per round, newest first page, Prev/Next/Send buttons.
  `/qa` prints the record as text (headless, mobile, no cockpit).
- **Backfeed**:
  - `/qa send [all|N]`: digest of this session's rounds (or all / last N) submitted as a user turn (deferred).
  - Tool `mcp__bws-interview__qa_history`: Claude reads the record itself after compaction.
  - Option `pinDigest` (off by default): a bounded digest in `prompt.context`, re-read after compaction.
- **Skill**: `~/.claude/skills/interview/SKILL.md` gains `metadata.source: "interview"` and a recovery line.
- **Cockpit**: `bws-interview` added to KNOWN_MODS + one atom (other session owns cockpit right now: done last or asked).

## Out of scope

Editing past answers, exporting to HTML, cross-project search.
