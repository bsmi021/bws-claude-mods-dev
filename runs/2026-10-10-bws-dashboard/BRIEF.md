# BRIEF: bws dashboard (interview evidence map)

Goal (user): one dashboard replacing the mix of slash commands and standalone on-screen items for the bws mods:
tabbed right-hand content pane, an action bar, more proactive behavior. Plan + approval before code.

## Definition of done (user-stated, draft)
1. Each touched mod passes tsc against its tsconfig.json (proof: tsc output in receipts/).
2. Claude Code loads the dashboard with no validation errors (proof: `claude plugin validate` output per touched mod).
3. Brian has seen each tab and each action-bar item render and respond (proof: his confirmation + screenshots in receipts/ui/).
4. RUNLOG.md lists what changed and what was parked.

## Evidence map

### Engine facts (Known, from `.claude-plugin/types/claude-code/index.d.ts`, 2.1.296)
- K1 Panes are per plugin, one per id. With >1 pane open the engine draws its own tab row: one shown, rest tabs (Pane props `title`, `$.ui.panes()` `isShown`). Tab row hidden with one pane. (~L10311, L14186)
- K2 Placement: docked right of the transcript in fullscreen from 110 cols, else inline above the prompt. An *unasked* open (timer, session.start, tool result) is placed only from 144 cols (110 if the person opened that id before); below that it waits undrawn. (~L14128)
- K3 `$.state.get` may read another plugin's declared state (cockpit already reads `bws-board.summary`). `$.state.set` on another plugin's key is refused. (~L3410)
- K4 `$.command.run` runs another plugin's slash command as if typed; queued until idle; rejected inside a hook the turn is waiting on. (~L3070)
- K5 `$.ui.panes()` lists only this plugin's panes. Imports are relative inside one plugin: no shared code across plugins.
- K6 Focus is granted only over an empty composer; `focus` is otherwise refused.

### Current surfaces (Known, from READMEs + register files)
| Mod | On screen today | Commands | State ($.state keys) | Proactive today |
|---|---|---|---|---|
| bws-assumptions | Pane "Assumptions" (collapsed/expanded, Right/Wrong/Send), status line count | /assumptions | items, view | pane auto-opens on first assumption; status line |
| bws-board | Pane "Board" (live, heartbeat redraw), toasts | /board, /board role, /board pane, /board digest | role, own, summary, lines | toasts on news; urgent wake |
| bws-cockpit | AbovePrompt band (Run/Devices/Loop/Guard tiles, board chip, buttons 1 Resume 2 Refresh 3 Hide 4 Loop); Pane "Loop · <name>" | /cockpit, /resume-run, /loop-watch, /projects, /handoff | view, isHidden, loops, loopSelected, loopAction, stopArmedAt, touched | loop alerts toast + chip; first-message run context; finish-line guard |
| bws-design-picker | Gallery over AskUserQuestion only | none | galleries, pending | n/a |
| bws-enhance | Pane "Enhance"/"Enhanced prompt" (transient), footer "✦ enhance" button | /enhance | view | none |
| bws-notify | Windows toasts only | none | none | toasts |
| bws-shelf | Pane "Shelf" (▶ ✓ ✗, scope toggle), status line count | /idea, /shelf | view | first-message nudge; status line |
| bws-shell-lint | toasts on refusal | none | none | n/a |

### Decided (interview, 2 rounds, quick)
- Read-back confirmed; DoD as drafted.
- Architecture: fold bws-assumptions + bws-shelf into bws-cockpit; Board is a read-only tab over bws-board state.
- Width: fullscreen 144+ cols.
- Tabs: Assumptions, Shelf, Board (+ Loop when live). No Run tab.
- Action bar: slim one-row band; run/device info as chips.
- Bar actions: Dashboard + tab keys, Resume, Handoff, Idea, Enhance.
- Proactive: raise tab on news, handoff nudge, open at session start, chips recolor.
- Checkpoint: write the plan; remaining items assumed (A1-A8 in PLAN.md).

Result: PLAN.md. Follow-ups: FOLLOWUPS.md.
