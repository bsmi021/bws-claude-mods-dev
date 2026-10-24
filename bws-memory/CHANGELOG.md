# Changelog

## 0.3.2
- No behaviour change. Ships the shared tab module with the new markdown and picture nodes (bws-cockpit 0.27.0).

## 0.3.1
- No behaviour change. Ships the 1.7.0 README, this CHANGELOG and the full manifest (author, homepage,
  repository, license, keywords) to installed copies: `claude plugin update` keeps files by version.

## 0.3.0
- Memory updates and dream plans now show in one Memory tab of bws-cockpit's dashboard (0.21.0 or later) instead of two panes.
- New `/dream dismiss` closes the plan or result on screen.

## 0.2.0
- New DreamPath: `/dream` plans a consolidation (merge duplicates, drop stale entries, rewrite for clarity) and shows it before anything changes.
- `/dream apply` applies a plan, after copying the memory folder to a timestamped backup. `/dream undo` restores the newest backup. `/dream status` says what waits.
- The dream is due every `dreamEveryTurns` answered turns (default 20) and before a compaction. It only ever starts a preview.
- A plan that names an unknown file, uses a file twice or removes more than 40% of the files is rejected.
- Each memory file records the sessions it came from; a merge carries them to the surviving file and the plan shows them.

## 0.1.0
- First release: after a turn a small model decides whether you said something worth remembering; a fork writes entries as files in the background.
- Secrets are redacted and duplicates are refused before anything is written.
- `/remember <text>`, `/memories` and `/memory-undo`.
