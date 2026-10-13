# M5 manual checks: diagram pane (bws-diagram 0.1.0)

Run these in a real interactive session. The worker could only run headless `claude -p`, which runs one turn and has no
screen, so the pane as drawn, docking, keys, resizing, the classifier path after a real turn, the cockpit chip,
`/clear`, `/resume`, `/branch` and Desktop are unverified until you do them.

**Tested by the worker:** Claude Code 2.1.296, Windows 11. Surface: headless `claude -p` only (receipts
`receipts/m5-probe.json`, `receipts/m5-probe-dump.json`, `receipts/m5-probe.md`). Automated: `claude plugin test` in
`bws-diagram/` (stubbed engine). The PNGs in `receipts/` (`spike-*.png`, `preview-60.png`, `preview-100.png`,
`preview-svg.png`) are painted from the Raster cells and the Svg source, not captured from a terminal or Desktop.
**Not tested:** interactive Windows Terminal, Desktop app, the classifier on a real turn, resume, branch.

Before you start, run `python tools/mods-gate.py --plugin bws-diagram`. It must print `ok   bws-diagram`.

Setup (from the repo root, Windows Terminal, maximised so it is at least 144 columns wide, the default fullscreen
layout). The settings file sets `dumpFile` to `runs/2026-10-13-mods-m5-diagram/receipts/manual-dump.json`, so you can
see the list as JSON after each change:

```
claude --plugin-dir ./bws-diagram --settings runs/2026-10-13-mods-m5-diagram/receipts/manual-settings.json
```

Your own `CLAUDE_CODE_PLUGIN_DIRS` stays as it is, so bws-cockpit loads too (it draws the chip).

1. **Empty.** Type `/diagram status`. Expected: `Diagram: autoDiagram on; 0 drawn, 0 pinned.` Type `/diagram show`.
   Expected: a pane opens, docked right of the transcript, reading `No diagrams yet. /diagram draws the session.` Press
   Esc (or `c`); it closes.

2. **A pinned mermaid block.** Type: `Reply with only a mermaid flowchart (graph LR) of making tea: boil water, a decision "milk?", two outcomes, labelled yes and no edges.`
   Expected: right after the reply the pane opens, docked right: a bold heading `Pinned: ... 1/1  (pinned)`, the legend in
   four colours (`[] file`, `() new component`, `[[]] step`, `<> decision`), the drawing (coloured boxes with ASCII
   `-`, `|`, `+` edges and `>` heads, compare `receipts/preview-100.png`), the labelled edges listed as `A -> B: yes`
   under it, then `Pinned diagrams:` with `> 1. Pinned: ...`, and the buttons `< Prev`, `Next >`, `Close`. The decision
   is an oval; plain `[..]` nodes are blue squares. No glyph is garbled; the box labels are plain ASCII.

3. **Inline layout.** Quit, then start again with `set CLAUDE_CODE_NO_FLICKER=0` (main screen) before the setup command,
   and repeat check 2. Expected: the pane sits above the prompt, not docked; the same drawing.

4. **Resize.** Back in the fullscreen layout with the pane open (`/diagram show`), drag the dock narrower (or make the
   window narrower). Expected: the drawing is redrawn narrower each time: nodes shrink to 10 columns and labels are cut;
   below that it switches to `Too narrow to draw; widen the pane. The outline:` and one text line per layer. Widen it
   again: the drawing comes back. Nothing wraps into a mess or overflows the frame.

5. **A big turn.** Type: `Create three small Python files in runs/2026-10-13-mods-m5-diagram/receipts/manual-scratch: a.py, b.py that imports a, and c.py that imports b. Then read them back and run c.py.`
   Expected: the turn runs normally and is not held up. After it ends, the cockpit action bar shows the chip
   `diagram drawing`, then the pane opens with a diagram of the turn: heading `<title>  2/2  (last turn)`, nodes for
   the steps taken and the files (shapes and colours as in the legend). The chip then reads `1 diagram, 1 pinned`.
   (Run `/debug` or check the debug log: no `bws-diagram: ... failed` line.)

6. **A small turn is skipped.** Type `what is 2 + 2?`. Expected: no chip, no pane change, `/diagram status` still lists two.

7. **Prev / Next / Close.** Focus the pane (ctrl+x tab). Press `p`: the pinned diagram shows, heading `1/2`, and the
   `Pinned diagrams` line gets the `>` marker. Press `p` again: nothing changes. Press `n`: back to `2/2`. Press `c`: the
   pane closes. `/diagram show` brings it back on the same diagram.

8. **/diagram.** Type `/diagram`. Expected at once: `Drawing the session... the pane shows it when done.` The chip shows
   `diagram drawing`; then the pane shows a diagram of the whole session, heading `(session)`, `3/3`.

9. **An unsupported block.** Type: `Reply with only a mermaid sequenceDiagram of a browser calling a server.`
   Expected: the pane shows `Pinned mermaid (sequenceDiagram)` with `Not a flowchart this pane can draw; the source:` and
   the source lines. `/diagram status` lists it under `Pinned diagrams:` as `(source text, not drawable)`.

10. **Reload.** Run `/reload-plugins`. Then `/diagram status`. Expected: the same list as before the reload.

11. **/clear.** Type `/clear`, then `/diagram status`. Expected: the pane closed; `0 drawn, 0 pinned`; the chip gone.

12. **/resume.** Type `/resume` and pick the conversation from before the `/clear`. Then `/diagram status`. Expected:
    the list from checks 2 to 9 is back. `/diagram show` draws it.

13. **/branch.** Type `/branch`, then `/diagram status`. Expected: the same list in the branch.

14. **An unasked open in a narrow terminal.** In a new session in a terminal under 144 columns that has never opened the
    pane, repeat check 2. Expected: no pane appears; a toast says `Diagram ready, pane not shown (...). /diagram show opens it.`
    `/diagram show` opens it. Also: with the pane already open (from `/diagram show`) in a terminal under 110 columns,
    a new pin or auto diagram re-opens the pane (close, then open); that unasked open may be refused, so the pane can
    vanish with only the toast. `/diagram show` brings it back. Note whether this happens.

15. **autoDiagram off.** Start with `--settings runs/2026-10-13-mods-m5-diagram/receipts/manual-off-settings.json` and
    repeat check 5. Expected: no chip, no diagram after the turn; check 2 still pins; `/diagram status` says
    `autoDiagram off`.

16. **Desktop.** In Claude Code Desktop with this plugin loaded, repeat checks 2 and 5. Expected: the pane draws an
    image (the Svg) of the same diagram, compare `receipts/preview-svg.png`; the legend and the edge lines are text; no
    stretched or clipped labels.
