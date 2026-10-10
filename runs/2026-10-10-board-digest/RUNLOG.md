# RUNLOG: bws-board 0.2.0, board history and team digest

## Brief
Shelf idea #7: a team digest page per repo, an HTML timeline of who held which files, what was asked and done, and how
many wakes were sent. It is built from a history the 24 h card sweep doesn't delete. The goal is to show whether the
team setup pays off and where agents block each other. PLAN.md has the finish line.

## 2026-10-10
- Oriented on bws-board 0.1.0. Confirmed in the generated types:
  - `$.fs.write` creates directories.
  - `$.fs.list` reports subfolders as `kind: 'dir'`.

  So a `history/` subfolder is invisible to the card sweep and to `readFolder`.
- Advisor before building. I took its advice on:
  - one history file per session
  - a `deny` event (the "block each other" signal, not on any card)
  - no "time saved" number
  - escaping peer text
  - not opening a browser

  Busy and idle turns are kept (advisor said skip) because they're what makes overlap measurable. Assumptions A9–A13
  are recorded.
- Built:
  - `hooks/history.ts`: the format, parse, a 5000-event cap, and expiry.
  - `hooks/digest.ts`: the lanes, holds (lapse at last edit + claimMs, release, end), asks, refused edits, wakes, and
    overlap through `coverage`. The HTML uses inline CSS with light and dark themes; its one script localizes times.
  - register.tsx:
    - a serialized history writer (cache plus whole-file rewrite, failures dropped)
    - logging at every mutation site
    - a history sweep
    - `/board digest [days]`
  - Option `historyDays`. Version 0.2.0.
- Tests: 61 pass (16 new: 10 pure, 5 plugin, plus the first test's helper fix). The world stub's `live()` now skips
  nested paths, and `turn.complete` takes the full event shape.
- Live run (`live-digest.sh`, haiku, headless):
  - Both history files recorded the claim, deny, ask, take, done, urgent ask and wake (delivered: true), plus busy,
    idle and end.
  - Message text was absent.
  - Found: the session that only ran `/board digest` counted as a third agent. Fixed: sessions with only start and end
    are left out.
  - Found: the axis ticks on a 1-minute run all read "02:37". Fixed: seconds for windows under 30 min.
- Screenshots: `receipts/digest-light.png` and `digest-dark.png` (headless Edge, 1280 px), checked by eye. A phone-width
  shot was dropped as invalid (headless Edge's minimum window is about 500 px). A wrap rule was added for the long path.
- Checks in receipts: `validate.txt` (passed), `plugin-test.txt` (61/61), `tsc.txt` (exit 0), `claude-version.txt`
  (2.1.296).

## Outcome
Every finish-line item is met. Not verified: phone width, and the history sweep live (tests only).
`receipts/live/digest.html` predates the last CSS-only tweak (path wrapping).

## Next
None required. Open sessions pick up 0.2.0 on restart or `/reload-plugins`. Publish only when Brian asks.
