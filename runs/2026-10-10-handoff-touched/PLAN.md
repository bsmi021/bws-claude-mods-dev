# PLAN: /handoff picks its folder from the touched state

## Finish line
bws-cockpit 0.10.2: /handoff writes into the newest run folder this session's own tool calls wrote to
(the `touched` state the Finish-Line Guard uses), never a folder a worker freshened; with none, a new
dated handoff folder. A test proves a worker-written folder is ignored. validate, tests and tsc pass;
committed on main.

## Tasks
- [x] T1 One `sessionRunFolder($)` helper over `touched`; /handoff and the Finish-Line Guard both use it
- [x] T2 Record touched folders even with finishLine off (the observer no longer gates on it)
- [x] T3 Tests: handoff world owns its folder through a Write; a fresh worker-written folder gets a new handoff folder
- [x] T4 Version 0.10.2, README line, three checks, receipts, commit
