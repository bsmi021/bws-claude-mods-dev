# PLAN: bws dashboard (folded into bws-cockpit)

Status: **awaiting Brian's approval.** No code changes until approved. Steps become checkboxes once approved.

## Finish line (Definition of done)
| # | Check | Proof |
|---|---|---|
| D1 | bws-cockpit and bws-board (the two touched mods) each pass tsc 5.8 strict + noUncheckedIndexedAccess against its tsconfig.json | `receipts/tsc.txt`, exit 0 |
| D2 | Claude Code loads both with no validation errors; validate lists every new hook and API call | `receipts/validate.txt`; `/plugin` shows bws-cockpit active and no bws-assumptions / bws-shelf |
| D3 | `claude plugin test` passes, including moved assumption and shelf tests and new dashboard tests | `receipts/test.txt` |
| D4 | Brian has seen each tab (Assumptions, Shelf, Board, Loop) and each bar item render and respond, plus the proactive triggers | his confirmation + screenshots in `receipts/ui/` |
| D5 | RUNLOG.md lists what changed and what was parked | the file |

## Decisions (from the interview, 2 rounds)
- **Architecture: fold into bws-cockpit.** bws-assumptions and bws-shelf move in whole and are retired. bws-board stays separate (it owns the guards); cockpit draws a read-only Board tab from its state.
- **Board pane (A8 corrected):** bws-board drops its own pane; `/board pane` redirects to the dashboard's Board tab, falling back to the text listing when cockpit is absent. One board view.
- **Tabs:** Assumptions, Shelf, Board, plus Loop only while a harness loop is live. No Run tab.
- **Action bar:** cockpit's tile band becomes one slim row above the prompt: status chips + actions. Run/device detail lives in the chips and in `/cockpit`.
- **Bar actions:** Dashboard + tab keys, Resume run, Handoff, Idea, Enhance.
- **Proactive:** raise tab on news for you, handoff nudge, open at session start, chips recolor.
- **Width:** Brian runs fullscreen at 144+ columns, so unasked pane opens are placed.

## Current surface of each mod (before)
| Mod | On screen | Commands | State | Events | After this plan |
|---|---|---|---|---|---|
| bws-assumptions 0.1.0 | Pane "Assumptions" (collapse/expand, Right/Wrong/Instead/Send/Clear sent); status line | /assumptions | `items`, `view` | session.start, prompt.compose, tool.call(record_assumption), command.run, ui.render Pane, ui.close | **moved into cockpit, plugin retired** |
| bws-shelf 0.1.2 | Pane "Shelf" (▶ ✓ ✗, a scope, c close); status line | /idea, /shelf [all] | `view`; data in `~/.claude/idea-shelf/shelf.json` | session.start, prompt.context, turn.complete, tool.call ×3, command.run ×2, ui.render Pane | **moved into cockpit, plugin retired** (same shelf.json, no data migration) |
| bws-cockpit 0.14.0 | AbovePrompt tile band (Run/Devices/Loop/Guard, board chip, 1 Resume 2 Refresh 3 Hide 4 Loop); Pane "Loop · name" | /cockpit /resume-run /loop-watch /projects /handoff | view, isHidden, loops, loopSelected, loopAction, stopArmedAt, touched; reads `bws-board.summary` | many (see README) | **hosts the dashboard + slim bar** → 0.15.0 |
| bws-board 0.4.0 | Pane "Board" (read-only + Close); toasts | /board [role/pane/digest] | role, own, summary, lines | — | **0.5.0: own pane removed; `/board pane` → dashboard Board tab**; keeps writing `summary` + `lines` for cockpit |
| bws-enhance 0.2.0 | transient Pane, footer ✦ button | /enhance (immediate, needs args) | view | — | untouched; bar's Enhance runs `/enhance <draft>` |
| bws-design-picker, bws-notify, bws-shell-lint | overlay / toasts only | none | — | — | untouched, no tab |

## Layout (after)

**Slim bar** (AbovePrompt, one row; low-priority chips drop first when narrow):
```
run 3 open · UE● VRAM 5.1/8 · loop running · board 2·1 for you · ⚑ 2 · 💡 3 │ 1 Resume 2 Dash a Asm s Shelf b Board h Handoff i Idea e Enhance 3 Hide
```
- Chips: run (open items), devices/VRAM (`pressure` in warning color), loop state, board (agents · for-you), ⚑ unsent assumptions, 💡 open ideas. A chip turns warning-colored while something waits on you.
- Hotkeys keep the old digits where the action survives (1 Resume, 3 Hide, 4 Loop → Loop tab when a loop is live); 2 becomes Dashboard (Refresh leaves the bar: the timer, the per-turn refresh and `/cockpit` still probe). New actions use letters.
- Hidden (3) hands the slot on, as today. Another mod's band still draws under it.

**Dashboard pane** (`id: dashboard`, title "Dashboard", docked right):
```
┌ 1 Assumptions 2 · 2 Shelf 3 · 3 Board 1 · 4 Loop ┐   ← tab strip (Buttons); selected tab bold; counts = waiting items
│ <tab body>                                       │
```
- **Assumptions** body: today's expanded list (A<n>, reason, Right / Wrong, Instead field, Send N, Clear sent). The collapsed one-line mode goes (the tab count replaces it).
- **Shelf** body: today's list (▶ ✓ ✗, `a` project/all, eight at a time).
- **Board** body: bws-board's `lines` state, read-only (verified: bws-board rewrites `lines` and `summary` on every heartbeat, pane open or not); "bws-board not loaded" when absent.
- **Loop** body: today's Loop Watch body (units, needs with answer inputs, r/s/g). Tab shown only while a loop exists.
- Inside the focused pane: `1`–`4` switch tabs; each tab keeps its own keys (Assumptions `s` send, `c` clear; Shelf `a` scope; Loop `r` `s` `g`).

## Commands (after)
| Command | Behavior |
|---|---|
| `/dashboard [assumptions\|shelf\|board\|loop]` | **new.** Opens the pane on that tab (default: the tab with something waiting, else the last one) |
| `/assumptions` | Opens the dashboard on Assumptions. Headless: prints the list (unchanged) |
| `/shelf [all]` | Opens the dashboard on Shelf (scope all with `all`). Headless: prints (unchanged) |
| `/idea <text>` | Unchanged (immediate, toast only) |
| `/loop-watch` | Opens the dashboard on Loop. Headless: text (unchanged) |
| `/cockpit`, `/resume-run`, `/handoff`, `/projects` | Unchanged |
| `/board pane` | Opens the dashboard on Board (bws-board runs `/dashboard board`, deferred with `$.clock.after`). Without cockpit loaded: prints the board as `/board` does |
| `/board`, `/board role`, `/board digest`, `/enhance …` | Unchanged (their own plugins) |

Tools after the move: `mcp__bws-cockpit__record_assumption`, `…__shelve_idea`, `…__list_ideas`, `…__close_idea` (were `mcp__bws-assumptions__*` / `mcp__bws-shelf__*`). The system-prompt sections and first-message lines name the new tools.

## Proactive triggers
"Raise" means: if the dashboard is closed, open it unasked on that tab; if open but **not focused**, switch to that tab; if focused (Brian is using it), leave it and bump the tab's count. If Brian closed the dashboard by hand this session, triggers only light chips and counts (today's assumptions rule, now for the whole dashboard); `/dashboard` or `2` clears that.

| # | Trigger | Detected in | Action |
|---|---|---|---|
| T1 | Claude records an assumption | `tool.call` record_assumption | raise Assumptions; ⚑ chip warning |
| T2 | An ask addressed to this session appears (`bws-board.summary.askedOfMe` rises) | `on('state.set', { plugin: 'bws-board', key: 'summary' })` if the spike shows it fires for an observer; else cockpit's refresh tick + turn.complete | raise Board; board chip warning (exists) |
| T3 | Loop alert: needs you, stalled, driver dead, all done | existing loop alert code | raise Loop (toast stays) |
| T4 | Context use ≥ `handoffNudgePercent` (default 70) | `turn.complete` via `$.session.usage().context` | one toast per session; Handoff button warning-colored until run |
| T5 | Session start with open ideas, unsent assumptions, or asks for this session | `session.start` (+ first `turn.complete` for the board summary) | open the dashboard on the first such tab. Does not fire after `/clear`, `/resume` or `/branch` (no `session.start` there) |
| T6 | Anything waiting on Brian | render | chip recolors (always, independent of the others) |

## Steps
0. **Isolation.** All code work happens in a git worktree (`../bws.mods.wt-dashboard`, branch `bws-dashboard`), so the cockpit on `CLAUDE_CODE_PLUGIN_DIRS` stays on the last good commit and other sessions never hot-reload a half-done register.tsx. Copy `bws-cockpit/.claude-plugin/types/` into the worktree for tsc. Merge to main only after D1–D4 pass.
1. **Spike (throwaway scratch mod in the run folder, deleted after):** confirm
   (a) a band Button press can run `$.command.run({ command: 'enhance', args: draft })`, idle and mid-turn, and the rewrite lands in the box (bws-enhance replaces a box that still equals the draft, so no clearing should be needed);
   (b) the field for context percent in `$.session.usage().context`;
   (c) a Button press that switches the tab key in `$.state` redraws the pane;
   (d) re-`$.ui.open` of an open, unfocused pane raises it after an unasked open;
   (e) how a test session loads the worktree cockpit without the DIRS copy (shell-level `CLAUDE_CODE_PLUGIN_DIRS` vs the settings `env` block);
   (f) `on('state.set', { plugin: 'bws-board', key: 'summary' })` passes validate and fires in cockpit;
   (g) a `command.run` hook can start another plugin's command via `$.command.run` deferred with `$.clock.after` (a direct call may deadlock, as `$.prompt.submit` does), and `$.command.list()` tells whether `dashboard` exists for the fallback.
   Record results in RUNLOG. If (a) fails mid-turn, Enhance shows dim and inactive while Claude works.
2. **Move code:** `bws-assumptions/hooks/lib.ts` → `bws-cockpit/hooks/assumptions.ts`; `bws-shelf/hooks/lib.ts` → `bws-cockpit/hooks/shelf.ts`; their tests → `bws-cockpit/tests/`. Pure modules, same rules as lib.ts.
3. **Merge hooks into `register.tsx`** under the validator's one-unmatched-hook-per-event rule: fold into the existing session.start, prompt.context, turn.complete; add prompt.compose and ui.close once; matched tool.call/command.run hooks per tool/command. Replace the Loop pane render with the `dashboard` pane render (tab strip + four bodies). Drop the two status lines.
4. **Slim bar:** rewrite the AbovePrompt render as one row of chips + buttons (tiles and grid removed; their content stays in `/cockpit`). Keep the shared-slot behavior.
5. **Proactive T1–T6** as tabled, with a module `raise(tab)` helper in register.tsx (the only new helper).
6. **Types + config:** `types/index.d.ts` gains the assumption/shelf/dashboard state keys and the four tool inputs (McpToolInputs augmentation). `plugin.json` userConfig gains `shelfPath`, `shelfNudge`, `handoffNudgePercent`; version 0.15.0.
6b. **bws-board 0.5.0:** remove the Board pane render, its `ui.open`/`ui.close` calls and the pane-only code; `/board pane` → deferred `$.command.run({ command: 'dashboard', args: 'board' })` when `dashboard` is listed, else the `/board` text. `summary` and `lines` stay. README: pane section rewritten.
7. **Tests:** moved tests green; new: tab switch, counts, raise-vs-focused, closed-by-hand suppression, T4 once, T5 conditions, each bar button's effect (stubs), board tab absent/present. bws-board: pane tests replaced by redirect + fallback tests.
8. **Checks:** validate, test, tsc for both mods → receipts.
9. **Live:** the worktree's cockpit via `--plugin-dir` (old two plugins and the DIRS cockpit excluded, per spike e) in a fresh fullscreen session; Brian checks each tab, each bar item, T1–T5; screenshots to `receipts/ui/`.
10. **Retire** (after D4 passes): `claude plugin uninstall bws-assumptions@bws-mods` and `bws-shelf@bws-mods`; remove both from `CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json` and from `.claude-plugin/marketplace.json`; delete both folders (git keeps history); update cockpit README (dashboard, bar, moved features, tested surfaces). Merge the worktree branch to main, remove the worktree. Commit; push `private`.
11. RUNLOG: what changed, what was parked.

## Risks
- register.tsx grows by ~500 lines and loads in every session: a break kills every new session. Step 0's worktree keeps main untouched until D1–D4 pass.
- Between the merge and step 10's uninstall, a session would load both old plugins and the new cockpit and register `/idea`, `/shelf`, `/assumptions` twice. Step 10 runs in the same sitting as the merge.
- On the fallback path T2 can lag up to one cockpit refresh tick (30 s); spike (f) decides.

## Assumptions (confirm or correct in the pane)
- A2 one `dashboard` pane with its own tab strip (not engine-tabbed separate panes)
- A3 chips recolor in addition to the pane triggers
- A4 assumptions + shelf status lines removed
- A5 Hide stays on the bar, Refresh leaves it
- A6 handoff nudge once per session at 70%
- A7 retirement = uninstall + DIRS + marketplace + delete folders
- A8 (corrected by Brian: bws-board drops its pane; `/board pane` redirects)
- Hotkeys as in the layout above (digits kept where the action survives, letters for new)
- The Assumptions collapsed one-line mode is removed (tab count replaces it)
- Idea shelves the prompt-box draft and clears the box; an empty box toasts "type the idea first"
- No settings permission rules name the old tool ids (checked: none), so the rename needs no permission edits

## Out of scope (parked)
See `FOLLOWUPS.md`.

## Progress (approved 2026-10-10; Brian: stop before step 10)
- [x] 0 worktree `../bws.mods.wt-dashboard`, branch `bws-dashboard`, types copied
- [x] 1 spike (results in RUNLOG)
- [x] 2 move assumptions + shelf code and tests into bws-cockpit
- [x] 3 merge hooks; dashboard pane render
- [x] 4 slim bar
- [x] 5 proactive T1–T6
- [x] 6 types + config, cockpit 0.15.0
- [x] 6b bws-board 0.5.0
- [x] 7 tests
- [x] 8 checks → receipts
- [x] 9 live (Claude's own tmux check done; Brian's own look is D4, pending)
- [x] 10 retire old plugins (Brian's go after his live check)
- [x] 11 RUNLOG final
