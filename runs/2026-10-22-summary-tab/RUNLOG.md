Status: active
Finish line: bws-summary released in bws-mods 1.11.0 and the Summary tab seen in Desktop
Next step: Brian approves `python tools/publish.py bws-summary bws-cockpit --version 1.11.0 --push`, then `claude plugin update` + `/reload-plugins`
Open: release push (needs Brian); Desktop check of `/summary` (Desktop may claim the name)

# RUNLOG: bws-summary (rolling conversation summary tab)

## Objective
Take the standalone convo-summary mod (C:/Users/bsmi0/Downloads/convo-summary.zip: own `Pane`, `/summary`) and show it
in the cockpit dashboard beside the other mods.

## Done
- `bws-summary/` 0.1.0: `hooks/digest.ts` (pure: transcript, base/rollback/compaction plan, tab, chip, text),
  `hooks/register.ts` (the only `$` user). Kit: summary, tab. 12 tests (5 pure, 7 stubbed engine incl. the original's
  rollback and compaction cases).
- Changes from the original: tab instead of own pane (no `$.ui.open` at start); buttons above the text; headless turns
  skipped (no paid call in `claude -p` workers); /clear and /resume clear history and drop in-flight work; `/summary
  --older|newer|latest|refresh` twins; `/summary text`; failures caught into the tab.
- bws-cockpit 0.25.0: KNOWN_MODS, atoms, readModTabs, state.set hook, types, default `modSummaries`, README, CHANGELOG.
  Marketplace 1.11.0. Brian's settings set no `modSummaries`, so the default list applies.

## Receipts
- Full `python tools/mods-gate.py`: 15 plugins + kit ok (108 s).
- receipts/live/: `tools/live.py --plugin bws-cockpit --plugin bws-summary` (2.1.307, terminal 170x50): two real turns,
  `/summary` opened the dashboard on `Summary · 2` showing `2/2 · turn 2`; click Older -> `1/2`, "Viewing an older
  summary"; `/summary latest` -> `2/2`.
