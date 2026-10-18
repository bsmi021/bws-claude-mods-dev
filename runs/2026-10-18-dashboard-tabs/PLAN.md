# Every mod as a dashboard tab

Brian (2026-10-18): all mods load as tabs in the dashboard, like Assumptions, Shelf and Board.
Scope chosen: the pane mods, status tabs for the guard mods, and bar chips moved onto tab labels. Secrets keeps
its own pane (masked entry takes the keyboard). design-picker stays in the question dialog (it is part of it).

## Finish line (whole feature)
1. With every mod loaded, `/dashboard` shows one tab per mod: Assumptions, Shelf, Board, Loop, plus Diagram,
   Memory, Dream, Enhance, Better, Side chat, Notify, Shell lint, Skillgate (only loaded mods appear).
2. No mod in scope opens its own pane any more. Where it used to, it raises its dashboard tab.
3. Tab labels carry the counts/state the bar chips carried; the bar keeps run, devices, cache, loop and actions.
4. Each released mod: validate + `claude plugin test` + tsc 5.8.3 clean; live screenshot of its tab.
5. Secrets' entry pane and design-picker's dialog are unchanged.

## Design
- **Protocol in bws-kit/tab.ts (vendored by sync-kit):** each mod publishes `{ plugin: <mod>, key: 'tab' }`:
  `{ title, badge?, state, body: TabNode[], raise? }`. `TabNode` is plain data: text rows (color/dim/bold/wrap),
  buttons `{ id, label, hotkey? }`, an input `{ id, placeholder, value? }`, a raster/svg picture, a box with a
  border. Rendering knows nothing mod-specific.
- **Events back:** cockpit writes its own atom `{ plugin: 'bws-cockpit', key: 'tabEvent' }` =
  `{ seq, plugin, id, value? }`; each mod handles a `state.set` hook on it, filtered to its own plugin.
- **Raise:** a mod bumps `raise` in its tab; cockpit's `state.set` hook on that key opens/switches the dashboard
  (same rule as board asks: only when the person is not using the pane).
- **Cockpit:** one literal read per mod (the validator needs literal sources), a generic `TabNode` renderer,
  dynamic tab strip after the built-in tabs, mobile/headless text fallback.

## Milestones (one release each)
- M1: protocol + cockpit renderer/event relay + raise; guard status tabs (notify, shell-lint, skillgate); chips -> tab badges.
- M2: diagram. M3: memory + dream. M4: enhance. M5: better. M6: sidechat.

## Out of scope
secrets entry pane, design-picker dialog, board's existing pane view (already a tab), new mod features.
