# Board tab as cards (bws-board 0.6.0, bws-cockpit 0.18.0)

## Finish line
1. The dashboard's Board tab draws one bordered card per live session (this session first, accent border) and one card per shown ask, with emoji glyphs for status, run, claims, git lease and ask state.
2. Headless `/board` text and `board_status` output unchanged (`lines` atom kept; cockpit falls back to it when `pane` is absent).
3. `claude plugin validate` + `claude plugin test` pass for bws-board and bws-cockpit; tsc 5.8.3 clean for both.

## Design
- bws-board: pure `paneView(b, self, now, lim)` in board.ts, pre-stringified. New state key `pane`, written beside `lines` in `sync`.
- bws-cockpit: reads `pane`; renders `Box borderStyle="round"` cards. Emoji only at line starts.
- Glyphs: 🟢 busy · ⚪ idle · 📝 task · 📂 run · 👀 seen · 🔒 claims · 🔑 git lease · asks ❓ open / 🙋 taken / ✅ done / 🚫 declined / 🔙 withdrawn (0.18.1; was ↩, one column narrow) · 🔥 urgent.

## Out of scope
statusText / board_status text, band chip, marketplace version.
