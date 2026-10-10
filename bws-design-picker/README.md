# bws-design-picker

When Claude asks you to choose a design direction, each option is drawn as a small rendered mockup
(layout, colours, palette strip) above Claude Code's own picker. You still pick with the picker.

## How it works

1. `prompt.compose` adds one short system-prompt section: when asking for a visual or design direction,
   use AskUserQuestion and give each option a `preview` of `design:{json}`, a mockup spec of
   blocks (percent coordinates, fill, text, shape `rect|pill|circle`), palette and font.
2. `tool.call` on AskUserQuestion lifts those specs out of the previews before the dialog opens and keeps
   them in session state under the call's id. The engine refuses render rewrites that change previews,
   so this is the only place to keep the JSON out of the dialog.
3. `ui.render` on AskUserQuestion draws the gallery above the native dialog:
   - terminal: one `Raster` of half-block cells (two pixels a cell), works in any true-colour terminal
   - desktop and other remote surfaces: one `Svg`

Questions without `design:` previews pass through untouched.

## Load

```
claude --plugin-dir ./bws-design-picker
```

or add the folder to `CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json` (Brian's machine does this).

## Limits

- The engine allows 12 rows around its dialog, counts side-by-side boxes as if stacked, and refuses
  fixed widths there. So the gallery is one Raster under one header line: about 10 rows, one row of
  cards. Under roughly 50 columns for 4 options, the gallery is skipped.
- One gallery per dialog: the first design question's. The section asks Claude for one design question per call.
- Thumbnails cannot be clicked; the numbers match the picker's options.
- Text inside the terminal mockups is ASCII only (the Raster refuses wide glyphs).
- No configuration.

## Tested

Claude Code 2.1.296, Windows 11, Windows Terminal (terminal surface): live session, three directions drawn,
option chosen in the picker, answer reached Claude. The desktop `Svg` path has unit tests only, with no
live check.
