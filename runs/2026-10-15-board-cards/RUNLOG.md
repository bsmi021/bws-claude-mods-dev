# RUNLOG: Board tab as cards

## 2026-10-15
- Ask: the board (service bus) screen should use emoji and card-style separation between items.
- The screen is bws-cockpit's dashboard Board tab, which drew bws-board's flat `lines` atom.
- bws-board 0.6.0: pure `paneView()` in hooks/board.ts (self, live peers, shown asks, all pre-worded), written to a new `pane` state key beside `lines` in `sync`. Types in types/index.d.ts (inline).
- bws-cockpit 0.18.0: Board tab draws round-bordered cards per session (self first, `claude` border; busy `success`, idle `subtle`) and per ask (open `warning`, urgent `error`, taken `suggestion`, done `success`, withdrawn `subtle`). Emoji only at line starts. Falls back to `lines` when `pane` is null.
- Glyphs and scope recorded as assumptions A1, A2.
- Checks: tsc 5.8.3 clean (both); `claude plugin validate` passed (both); `claude plugin test` bws-board 86/0, bws-cockpit 204/0 (one new test each side).
- Not done: interactive look in a real terminal. Screen driving needs Brian's handover; left to him (`/dashboard board`, mods hot-reload).

- Live check (Brian handed over the keyboard): scratch git repo; headless `tests` peer (haiku, sleeping, live); interactive `api` session in Windows Terminal posted urgent ask e5df35d7-1; `/dashboard board` drew the self, peer and ask cards correctly. Receipts: receipts/00-start.png, 01-session.png, 02-board-cards.png. Test window closed; headless peer exits by itself after its sleep.

## Next
- Brian eyeballs `/dashboard board`; retune glyphs/colours if wanted. Release (marketplace bump, publish branch) is a separate step.

## Release
- Released as bws-mods 1.4.0 (bws-board 0.6.0, bws-cockpit 0.18.0). The marketplace went from 1.3.1 to 1.4.0 (c33d546). feat/board-cards merged into main with --no-ff (caf2688), which also brought in release/1.3.1. Gate on main: tsc clean, validate passed, tests 86/0 and 204/0. Pushed to private main.
- Publish: the scratch worktree was restored from main for bws-board, bws-cockpit and marketplace.json. File lists and content matched main. The root README's cockpit row now says the Board tab is cards. Scan of the added lines: clean (only generic `c:/proj` test fixtures). The gate passed again in the worktree. Commit 32a9d59 pushed `publish -> mods main`, tag v1.4.0.
