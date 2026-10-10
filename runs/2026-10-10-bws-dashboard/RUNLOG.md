# RUNLOG: bws dashboard

## Objective
Unified dashboard replacing the mix of slash commands and standalone on-screen items for the bws mods: tabbed
right-hand pane, action bar, proactive behavior. Plan and get approval before code.

## 2026-10-10 session 1: intake + interview + plan
- Read all 8 READMEs and register files; inventoried hooks, API calls, commands and state (BRIEF.md table).
- Engine facts from the 2.1.296 types: panes from any plugin already tab in the dock; cross-plugin `$.state.set`
  refused, `$.state.get` allowed; `$.command.run` exists; unasked pane opens placed only from 144 columns.
- /interview, quick depth, 2 rounds. Decisions: fold bws-assumptions + bws-shelf into bws-cockpit; tabs
  Assumptions / Shelf / Board (+ Loop when live); slim one-row bar with chips; actions Dashboard+tabs, Resume,
  Handoff, Idea, Enhance; all proactive triggers.
- Wrote PLAN.md (finish line, layout, commands, triggers T1–T6, 11 steps), FOLLOWUPS.md, BRIEF.md.
- No code changed.

## Assumption review
- A1–A7 right. A8 wrong: Brian chose "redirect, drop own pane": bws-board 0.5.0 removes its pane and `/board pane`
  opens the dashboard's Board tab (text fallback without cockpit). PLAN.md updated (D1/D2, table, commands, spike g,
  step 6b); the matching follow-up removed from FOLLOWUPS.md.

## Next step
Brian approves PLAN.md. Then step 0 (worktree) and step 1 (spike).
