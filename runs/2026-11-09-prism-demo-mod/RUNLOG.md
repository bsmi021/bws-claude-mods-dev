Status: done
Finish line: `/prism` opens animated art (Raster in the terminal, Svg on Desktop) with working controls; gate passes; live terminal session animates.
Next step: Brian tries it in Desktop with `claude --plugin-dir`-style loading, or asks for a release.
Open: Svg not seen inside the real Desktop app. Not in the marketplace, by scope.

## Summary

New mod `bws-prism` at version 0.1.0: four scenes, four palettes, 20 fps `$.ui.blit` in the terminal, SMIL in the Svg.

## Verified

- `python tools/mods-gate.py --plugin bws-prism`: ok (validate, 15 tests, tsc).
- Live on Claude Code 2.1.318 at 170x50 (`live-steps.txt`, `receipts/live/`): pane docks at 75x78 px, frames differ after 1 s, stay identical while paused, `scene`, `palette` and `close` work.
- Widest frame (160x96 px) costs about 9 ms to compute, inside the 50 ms tick.
- `receipts/gallery.jpg`: Raster pixels drawn to a canvas in the browser pane. The four SVG scenes rendered and animated in the same page, with no console errors.

## Not verified

- Svg inside the Desktop app: covered only by a `$.ui.mount` test on the desktop surface and the browser render. The app may scrub filters or blend modes differently.
- True terminal colors: the live harness reads characters, so color is checked from the gallery, not a terminal screenshot.
