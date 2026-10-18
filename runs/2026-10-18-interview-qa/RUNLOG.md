# RUNLOG: bws-interview (Q&A record for the interview skill)

## Goal
Record every AskUserQuestion round (question, options, answer, notes), page back through them, and feed the agreed
answers back into the chat when context is lost. Work hand in hand with the `interview` skill. See PLAN.md.

## Done (2026-10-18)
- New mod `bws-interview/` 0.1.0: `hooks/qa.ts` (pure), `hooks/register.ts` (only `$` user), kit `tab`.
  - Records on `tool.call` AskUserQuestion (observes the result, passes it through untouched). Denied, errored and
    unanswered rounds are skipped; AFK rounds flagged.
  - Keeps rounds in the plugin store per project (`p:<cwd>`), newest 400.
  - `/qa`, `/qa show`, `/qa send [all|N]`, tab presses older/newer/newest/send-round/send-session (also `/qa <press>`).
  - Tool `mcp__bws-interview__qa_history`; option `pinDigest` (off) puts this session's digest in prompt.context.
- bws-cockpit: `bws-interview` added to KNOWN_MODS/MOD_TITLE ("Interview"), tab atom, tabs map, noteModTab hook,
  types, `modSummaries` default; modtabs test list updated. (Asked session 4a9d9f07 first; it declined, tree was clean
  after its M4 commit, so done here.)
- Interview skill (`~/.agents/skills/interview/SKILL.md`, outside this repo): intake calls `qa_history`; every call
  tags `metadata.source: "interview:<slug>"`; RUNLOG names the tag and `/qa send all`.

## Evidence (receipts/)
- validate.txt: bws-interview validation passed. bws-cockpit validation passed.
- test.txt: 16/16 bws-interview tests. bws-cockpit 211/211.
- tsc.txt: empty (tsc 5.8.3 strict clean) for bws-interview and bws-cockpit.
- live-qa.jsonl: headless `claude -p "/qa" --plugin-dir ./bws-interview` (Claude Code 2.1.302): plugin loads, `/qa`
  answers, `qa_history` registered.

## Not verified
- Interactive: a real interview round landing in the Interview tab, paging, Send. Needs a terminal/desktop session
  with `--plugin-dir ./bws-interview` (the installed mods come from the bws-mods marketplace; bws-interview is not
  published yet).

## Next
- Brian: try it live (`claude --plugin-dir ./bws-interview`, run `/interview`, then `/qa show`, `/qa send`).
- Publish to the bws-mods marketplace with the cockpit 0.21.0 release when Brian says.
