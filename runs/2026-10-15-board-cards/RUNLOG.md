# RUNLOG: Board tab as cards

## 2026-10-15
- Ask: the board (service bus) screen should use emoji and card-style separation between items.
- The screen is bws-cockpit's dashboard Board tab, which drew bws-board's flat `lines` atom.
- bws-board 0.6.0: pure `paneView()` in hooks/board.ts (self, live peers, shown asks, all pre-worded), written to a new `pane` state key beside `lines` in `sync`. Types in types/index.d.ts (inline).
- bws-cockpit 0.18.0: Board tab draws round-bordered cards per session (self first, `claude` border; busy `success`, idle `subtle`) and per ask (open `warning`, urgent `error`, taken `suggestion`, done `success`, withdrawn `subtle`). Emoji only at line starts. Falls back to `lines` when `pane` is null.
- Glyphs and scope recorded as assumptions A1, A2.
- Checks: tsc 5.8.3 clean (both); `claude plugin validate` passed (both); `claude plugin test` bws-board 86/0, bws-cockpit 204/0 (one new test each side).
- Not done: interactive look in a real terminal (dev mods hot-reload, so `/dashboard board` in a live session shows it).

## Next
- Brian eyeballs `/dashboard board`; retune glyphs/colours if wanted. Release (marketplace bump, publish branch) is a separate step.
