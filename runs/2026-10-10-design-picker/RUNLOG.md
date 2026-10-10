# RUNLOG: bws-design-picker

## Brief
A mod that runs whenever a Claude session asks for design direction and shows each direction as a
rendered visual to choose from, not just text.

## What was done
- Explored the mod API (2.1.296). The terminal `Image` element needs kitty or Ghostty, so it isn't usable
  in Windows Terminal. `Raster` (true-colour cells) is, so mockups are rasterized as upper half-blocks.
- v1 shape: `prompt.compose` section (Claude writes `design:{json}` specs into AskUserQuestion previews),
  plus `ui.render` on AskUserQuestion wrapping the engine's dialog with a gallery.
- Engine limits found by test and live run, none of them documented in the types:
  - no `width` on Boxes around the dialog
  - at most 12 rows around it, side-by-side siblings counted as stacked, the dialog counting as one,
    so ours is held to 11
  - a render rewrite may not change previews (`[WARN] ui.render (AskUserQuestion): a rewrite may
    relabel the questions but not change question 1's previews`)
- Fixes: the whole gallery is drawn as one Raster (or one Svg on desktop). A `tool.call` hook strips
  the specs from the tool input and keeps them in `$.state` (family `galleries` by tool_use_id) for the
  render.
- Added to `CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json`.

## Evidence (receipts/)
- `plugin-test.txt`: plugin tests
- `live-1.png`: first live run, gallery drawn but raw JSON still in the native preview pane (the bug)
- `live-2.png`: after the fix, gallery above a plain native picker
- `live-3-answered.png`: option 1 chosen, and Claude continued with "Warm Editorial"
- `live-debug.log`: debug log of the final live run

Checks: `claude plugin validate` passed; `claude plugin test` 15/15; `tsc` (strict) clean.

## Parked
- Model-generated specs when Claude asks a design question without them.
- `Image` element at higher resolution for kitty/Ghostty.
- Live check of the desktop `Svg` path.
