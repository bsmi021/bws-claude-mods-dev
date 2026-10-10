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

## 2026-10-10 session 2: approved, implementing steps 0–9
- Step 0: worktree `C:/Projects/bws.mods.wt-dashboard` on branch `bws-dashboard`; cockpit and board generated types copied in.
- Step 1 spike (scratch mod, deleted; `receipts/spike.log`, `receipts/spike-headless.jsonl`):
  - (a) A band Button press runs `$.command.run({ command: 'enhance', args: draft })` directly (no defer needed in a
    press). Idle: enhance starts at once and its rewrite replaces the box. Mid-turn: the command is queued
    ("Prompt from the <plugin> plugin" line) and runs as soon as the turn ends; the rewrite lands then. So Enhance stays
    active mid-turn and toasts that it runs when Claude finishes (instead of the planned dim fallback).
  - (b) `$.session.usage().context.percent` (0–100), absent before the first response.
  - (c) not spiked: a press that updates a `$.state` key redraws the pane (existing assumptions/shelf code relies on it).
  - (d) not spiked: with one dashboard pane, raising only matters next to another plugin's pane; checked live in step 9.
  - (e) A shell-level `CLAUDE_CODE_PLUGIN_DIRS` is overridden by the settings env block. `--settings <file>` with
    `env.CLAUDE_CODE_PLUGIN_DIRS` works. Without the source folders, the installed `@bws-mods` copies load, so the live
    settings file must also set `enabledPlugins` false for bws-cockpit/assumptions/shelf/board@bws-mods.
  - (f) `on('state.set', { plugin: 'bws-board', key: 'summary' })` passes validate and fires on every board heartbeat
    write: T2 uses it.
  - (g) `$.command.run` directly inside a `command.run` hook is refused by the host ("would wait on the turn this hook
    is holding"); headless, a deferred call has no session. `$.command.run` never reaches the calling plugin's own
    `command.run` hook. `$.command.list()` answers which commands exist. So `/board pane` defers with `$.clock.after`.
  - Slip: one `tmux send-keys "/spike-run"` without `MSYS_NO_PATHCONV=1` went in as a prompt ("C:/Program Files/Git/spike-run").
