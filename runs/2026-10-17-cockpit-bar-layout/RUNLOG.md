# RUNLOG: cockpit bar layout
- 2026-10-17: Brian (Desktop screenshot): "the cockpit is a mess, needs to be more organized and easier to follow". The bar was one wrapping row mixing status chips, signal chips and 10 buttons, with digit and letter hotkeys interleaved; the run name was cut to 8 chars ("publi...").
- Finish line: the bar reads top-down as status → signals → grouped actions; hotkeys and button keys unchanged; checks green.
- Done (bws-cockpit 0.20.0): three rows. Status (run, devices, loop, cache); signals only when present (board, mod chips, `⚑ N assumptions`, `💡 N ideas`); actions `do: resume handoff idea enhance · open: dash asm shelf board loop · hide`. Run name cap now max(12, min(28, width-30)).
- The "next: 1 2 3 0 dismiss" list under the bar is not drawn by any mod in this repo (the Desktop app's own suggestions); untouched (assumption A2).
- Checks: plugin test 211 pass / 0 fail (layout test rewritten to pin the rows and action order); validate passed; tsc 5.8.3 clean.
- Not checked live: this Desktop session runs the installed 0.19.0 (marketplace); Brian sees the new bar after a publish + `/plugin` update + `/reload-plugins`.
- Next: publish bws-cockpit 0.20.0 (marketplace bump, publish branch per AGENTS.md) when Brian says so.
