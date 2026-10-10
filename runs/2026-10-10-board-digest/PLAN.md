# bws-board 0.2.0: board history and team digest page

Shelf idea #7: an HTML timeline per repository showing who held which files, what was asked and done, and how many wakes were sent. It is built from a history log that the 24 h card sweep does not delete. The point is to show whether the team setup pays off, and where agents block each other.

## Finish line

- [x] **History survives.** Every board action a session takes adds an event to `<board>/history/<sessionId>.json`, and that file outlives the session's exit and the 24 h card sweep. Files older than `historyDays` (default 14) are deleted. Only already-redacted text is logged (task, ask text, notes) plus file paths: no message text, no commands. Proof: unit tests, plus history files from a live run.
- [x] **The digest page.** `/board digest [days]` writes one self-contained `<board>/digest.html` for this repo and prints its path. The page shows:
  - one lane per session (busy spans, files held, asks, refused edits, wakes)
  - a table of files held, with contested files flagged
  - asks, with time to take and time to done
  - refused edits: who was blocked, by whom, and on which file
  - wake counts per sender→receiver pair
  - totals, including overlap: how long two or more agents were busy at once

  All peer text is HTML-escaped. Proof: unit tests, including a `<script>` ask text.
- [x] **Live run.** A two-session headless run (the live.sh pattern) yields a digest that shows the claim on `notes.txt`, B's refused edit, the ask → take → done, and the urgent wake. The HTML and a headless-browser screenshot of it go to `receipts/`.
- [x] **Never blocks.** A failed history write never blocks a tool call; with `history: off` nothing is written. Proof: test.
- [x] **Checks and docs.** validate, `claude plugin test` and tsc pass. README updated and version 0.2.0. Committed, and shelf #7 closed.

## Design

- **Storage:** `<config>/bws-board/<repo-key>/history/<sessionId>.json`, shaped `{ version: 1, sessionId, events: [...] }`.
  - Single writer, so it's read-modify-write (`$.fs` has no append), serialized per process through a promise chain, with a cache of the file's events.
  - Capped at 5000 events per session.
  - `$.fs.write` creates the `history/` folder. `$.fs.list` reports it as `dir`, so `sweepable` and `readFolder` (files named `<id>.json` only) never see it.
- **Events** are `{ at, kind, role, ... }`, written where the mutation happens:
  - `start` {cwd}, `end` {reason}
  - `busy` {task}, `idle`, `task` {task}
  - `claim` {file}, only when the file is newly claimed. `edit` {file} records later edits, so the digest knows when a claim lapses (last edit + claimMs).
  - `release` {files}
  - `deny` {file, holder, holderRole}: the "block each other" signal
  - `ask` {askId, to, urgent, text}
  - `take`/`done`/`decline` {askId, from, note}, `withdraw` {askId}
  - `send` {to}: no text
  - `wake` {askId, to, delivered}, `wakeHeld` {askId, to}
  - Every event carries the role at the time.
- **Digest:** pure `hooks/digest.ts`.
  - `parseHistory` → `buildDigest(histories, from, to, claimMs)` → `digestHtml(model)`.
  - Inline CSS with light and dark tokens. One inline script only rewrites `<time>` text to local time; the fallback is UTC.
  - `/board digest` reads every history file and keeps the sessions that overlap the window.
- **Options:** `historyDays` (default 14; 0 = no history). A separate `history` switch was dropped as redundant.

## Assumptions (A9–A13 in the pane)

- One history file per session, not one per day.
- History is kept 14 days, and `historyDays: 0` turns it off.
- Busy and idle turns are logged so the digest can show overlap. No "time saved" number is claimed.
- The digest is written to `<board>/digest.html`, its path is printed, and no browser is opened. The default window is 1 day.
- There is one tiny script, for local times only.

## Tasks

- [x] T1 `hooks/history.ts`: event types, parse, add (cap), and the pure digest model and HTML (`hooks/digest.ts`). Tests.
- [x] T2 register.tsx: history writer, logging at each site, the sweep of old history, and `/board digest`. Options in plugin.json. Plugin tests.
- [x] T3 validate, test and tsc → receipts.
- [x] T4 Live two-session run, then the digest, then a headless-Edge screenshot → receipts.
- [x] T5 README, version 0.2.0, RUNLOG, commit, close shelf #7.
