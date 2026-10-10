# PLAN: bws-cockpit band as bento tiles (option A) with grid fallback (option C)

## Finish line
bws-cockpit 0.11.0: at 90+ body columns (and room for the rows) the band draws three round-bordered
tiles side by side (run, devices, loop; the loop tile only while a loop is live), with the buttons
and guard note under them. Narrower, it draws the borderless grid: a dim label column (RUN, DEVICES,
LOOP) with one row per topic. Another mod's band still draws under ours. Tests cover both layouts;
validate, tests and tsc pass; committed on main.

Box borders take no title, so the tiles carry none (the mockup's border titles are not drawable).

## Tasks
- [x] T1 Shared pieces: chip, loop chip, run row parts; tiles layout; grid layout; switch on bodyColumns >= 90 and maxRows >= 6
- [x] T2 Tests: tiles at 120 columns (three bordered tiles, content, buttons, no loop tile without a loop); grid at 80 (labels, one row per topic, cut next step); the fallback on few rows; existing band/loop tests updated to the new shapes
- [x] T3 Version 0.11.0, README band section, three checks, receipts, commit
