# RUNLOG: bws-cockpit 0.11.0, the band as bento tiles with a grid fallback

## Brief
Brian picked option A, three bordered tiles (run, devices, loop), falling back automatically to option C, a borderless grid, under about 90 columns.

## Done
- `register.tsx` AbovePrompt hook rewritten around shared pieces:
  - the run parts, the device chip, the loop mark, the board link, the buttons, the guard row
  - another mod's band still goes under ours (`band-below`)
- **Tiles**, when `bodyColumns >= 90` and `maxRows >= 6`:
  - `tile-run` takes the remaining width: name and date; open count › next step; the resume button.
  - `tile-devices` is 30 columns: UE+Unity, Blender+adb, VRAM, one pair per row.
  - `tile-loop` is 30 columns, only while a loop is live: ● loop + name and unit; the state word; the board link.
  - All are `borderStyle="round"`, `borderDimColor`, `paddingX={1}`. Content is cut to `width - 4`.
  - The buttons (refresh, hide, loop) and the guard note go under the tiles.
- **Grid** otherwise: a 9-column dim label (RUN, DEVICES, LOOP) and one row per topic. The buttons sit at the end of the devices row; the LOOP row carries the chip and board link on one line.
- Box borders take no title, so the mockup's titled borders were not drawable and the tiles carry no title.
- Bug caught by a test: `fit` trims, so `fit(' kit W2c')` lost its space and drew `loopkit W2c`. The space now goes outside `fit`.
- Tests:
  - new in `cockpit.test.ts`:
    - tiles at 120 columns: round borders, widths 88 and 30, content, buttons, no grid labels, no loop tile without a loop
    - grid at 89 columns: labels, `grid-*` rows, content
    - grid when wide but only 4 band rows
    - tiles on desktop with no run folder
  - updated in `loop.test.ts`: the band's loop shape at 120 (tile) and at 80 (grid row with the board link)
- README band section; version 0.11.0.

## Checks (receipts/)
- `claude plugin validate ./bws-cockpit`: passed (`validate.txt`)
- `claude plugin test`: 121/121 (`test.txt`)
- tsc 5.9.3, strict + noUncheckedIndexedAccess: clean (`tsc.txt`)
- Not checked live: no screenshot of the tiles yet. This session's band hot-reloads, so the tiles show in any terminal 90+ columns wide with a live band.

## Next step
Brian looks at the band. A screenshot pass (drive-screen) only if he wants a receipt. The publish branch is still on 0.10.2.
