# bws-summary: rolling conversation summary in the cockpit dashboard

## Finish line
- [x] Brian's convo-summary mod (zip, own pane) ported into the repo as `bws-summary` 0.1.0, publishing a kit `tab`
- [x] bws-cockpit 0.25.0 lists it among the mod tabs (default `modSummaries`); marketplace 1.11.0 lists the mod
- [x] Full gate green; live terminal check: tab shows the summary, Older/Latest work
- [x] Released v1.11.0 (publish.py --push, Brian's go) and installed here
- [ ] Seen in Desktop after `/reload-plugins` (needs Brian: run `/reload-plugins`, then `/summary` or the dashboard's Summary tab in Desktop; I can't drive the Claude app itself)

## Scope (no extensions)
Same behaviour as the original spec (UPD/SUM/HIS/UI), except: drawn as a dashboard tab instead of its own pane;
buttons above the summary; headless sessions skipped; /clear and /resume clear the history; command twins.
Original §7 ideas (model option, word limit, clipboard) are out.
