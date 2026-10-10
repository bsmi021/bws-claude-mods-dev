# PLAN: bws-cockpit band shares the AbovePrompt slot

## Finish line
bws-cockpit 0.10.1 draws the tree that `next(e)` returns from another mod below its own band rows,
instead of taking the slot. A test with a second stub band proves both draw (and that the engine's
empty node adds nothing). validate, `claude plugin test` and tsc all pass; committed on main.

## Tasks
- [x] T1 AbovePrompt hook: await next(e) (guarded); a plugin tree (not `type: 'engine'`) goes in a keyed Box under our rows; hidden/survey/no-view paths unchanged
- [x] T2 Test: a stub band below shows its Text and Button alongside the cockpit rows; with no stub the band is as before
- [x] T3 Version 0.10.1, README line, three checks, receipts, commit
