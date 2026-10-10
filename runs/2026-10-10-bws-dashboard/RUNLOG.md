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
- Steps 2–8 (worktree branch `bws-dashboard`, commits c34d4d3, 6d28a8f):
  - bws-cockpit 0.15.0: `hooks/assumptions.ts` and `hooks/shelf.ts` moved in (status-line helpers dropped);
    register.tsx gains the `dashboard` pane (tab strip + Assumptions / Shelf / Board / Loop bodies), the one-row bar
    (chips: run, live devices, loop, board, ⚑, 💡; buttons 1 resume, 2 dash, a asm, s shelf, b board, 4 loop,
    h handoff, i idea, e enhance, 3 hide), `/dashboard`, `/assumptions`, `/idea`, `/shelf`, `/loop-watch` → Loop tab,
    the four tools renamed `mcp__bws-cockpit__*`, `prompt.compose` guide, shelf line in `prompt.context`,
    `ui.close` (person close), `state.set` observer on `bws-board.summary` (T2), T1/T4/T5, `/handoff` logic moved to
    `writeHandoff` so the bar can call it. Tiles and grid removed; Refresh removed from the bar. Options `shelfPath`,
    `shelfNudge`, `handoffNudgePercent` (70). Types contract gains the state keys and the four tool inputs.
  - One change beyond the layout table: the Loop tab also shows for a quiet loop once the person picks it
    (`/loop-watch`), else picking a stopped loop in its Select hid the tab (caught by the moved test).
  - bws-board 0.5.0: own pane removed; `/board pane` runs `/dashboard board` 10 ms later when `dashboard` is listed,
    else prints the board. `summary` and `lines` still written.
  - Tests: cockpit 161/161 (new `tests/dashboard.test.ts`: moved assumption + shelf tests, tabs, counts, raise vs
    focused, closed-from-bar, T4, T5, bar idea/enhance/tab/dash buttons; band tests rewritten for the bar;
    loop tests on the dashboard pane). Board 83/83 (+1: redirect and fallback).
  - Checks (`receipts/`): validate passed both; tsc 5.8.3 exit 0 both; tests as above.
- Step 9 live (tmux 170x50, Sonnet, worktree cockpit + board via `live/settings.json`, scratch shelf, nudge at 1%):
  - Headless `/dashboard` (`receipts/headless-dashboard.jsonl`): worktree plugins loaded, bws-assumptions/bws-shelf
    absent, tools `mcp__bws-cockpit__{record_assumption,shelve_idea,list_ideas,close_idea}`, all three tabs as text.
  - Seen working: T5 (opened docked on Shelf at start; nothing opened when nothing waited), T1 (Claude's two
    record_assumption calls switched Shelf → Assumptions 2), T4 (toast at 7%, `[ handoff ]` highlighted), T2 (an ask
    from this session switched Shelf → Board 1, "1 for you"), tab hotkeys 1/2/3 in the pane, Right / Wrong / Instead /
    Send (review arrived as a user message with the correction) / Clear sent, Shelf scope toggle, ✗ drop, ▶ resume,
    `/board pane` → Board tab, bar 2 (open with keys, close, reopen), a / s / b, i (shelved draft, box cleared),
    e (bws-enhance rewrote the draft; its pane tabs beside Dashboard), h (HANDOFF.md written,
    `receipts/ui-13-HANDOFF.md`), 3 hide. Captures `receipts/ui-*.txt`.
  - Not exercised live: bar 1 resume (unchanged code; would start a run), 4 / Loop tab and T3 (no loop in this repo;
    covered by tests), ✓ done in the pane (tests), the Desktop app, mobile.
  - Pre-existing, parked (FOLLOWUPS.md): Hide has no way back in a session; the bar stays undrawn after start until
    the first turn or /cockpit in these tmux sessions (same with 0.14).
  - Slips: a stray `1` typed while focus was on the composer went in as a prompt; three Shift-Tabs hit ✗ instead of ▶
    (scratch idea #1 dropped). `ctrl+x tab` toggles focus band ↔ pane ↔ prompt, which made keyboard driving fiddly.

## 2026-10-10 session 2, continued: D4 and step 10
- D4: Brian checked the dashboard live in his own session: "looks good". Go for step 10.
- Gap found while writing the README: T3 (a loop alert raises the Loop tab) was in the plan but not wired. Added to
  `refreshLoops` (selects the alerting loop, then `raise`), with a test; cockpit 162/162.
- Step 10, in this order:
  1. `claude plugin uninstall bws-assumptions@bws-mods` and `bws-shelf@bws-mods` (`receipts/step10-uninstall.txt`;
     their `enabledPlugins` entries went with them).
  2. Removed both from `CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json` and from `.claude-plugin/marketplace.json`.
  3. Deleted `bws-assumptions/` and `bws-shelf/` (git rm on the branch; the gitignored generated types left behind in
     the main tree were removed after the merge).
  4. READMEs: bws-cockpit (Dashboard, Action bar, Assumptions and Shelf tabs, Loop tab, handoff nudge, the three new
     options, capabilities, 0.15.0 test row) and bws-board (`/board pane` → the Board tab, 0.5.0 notes).
  5. Checks again on the branch: validate passed both, tsc 5.8.3 exit 0 both, cockpit 162/162, board 83/83.
     Merged `bws-dashboard` into main (b0a1375), then removed the worktree and the local branch.
- Fresh `claude -p "/dashboard"` from the real settings (`receipts/step10-fresh-load.jsonl`): bws-cockpit, board,
  shell-lint, notify, design-picker, enhance loaded from source; no bws-assumptions or bws-shelf; tools
  `mcp__bws-cockpit__{record_assumption,shelve_idea,list_ideas,close_idea,find_project}`; the real shelf read.

## What changed (summary)
- bws-cockpit 0.14.0 → 0.15.0: Dashboard pane with its own tabs (Assumptions, Shelf, Board, Loop), one-row action
  bar replacing the tile band, triggers T1–T6, `/dashboard`, bws-assumptions and bws-shelf folded in (tools renamed
  `mcp__bws-cockpit__*`; same shelf file), status lines removed, Refresh off the bar.
- bws-board 0.4.0 → 0.5.0: own pane removed; `/board pane` opens the dashboard's Board tab.
- bws-assumptions and bws-shelf: uninstalled, off the plugin path and marketplace, folders deleted.

## Parked (FOLLOWUPS.md)
- Activity tab; Run & devices tab; folding bws-enhance; Board actions from the tab; Send review and Refresh on the
  bar; custom tab order; Hide has no way back (shelved #11); the bar undrawn until the first refresh in tmux sessions.
- Added now: the `--settings` live-check recipe (env DIRS override + `enabledPlugins: false` for installed copies)
  belongs in AGENTS.md's live-check notes, once it is checked whether a flag `enabledPlugins` map merges with or
  replaces the user's.
- Added now: the `publish` branch (and so the public `bws-mods` marketplace) still lists bws-assumptions and bws-shelf;
  publishing was not part of this task. The pushed `bws-dashboard` branch on `private` can be deleted.

## Next step
None for this feature. Publishing cockpit 0.15.0 / board 0.5.0 to `mods` is Brian's call.
