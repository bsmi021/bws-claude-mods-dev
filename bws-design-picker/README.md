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

4. A design-direction question that came **without** specs (Claude ignored the section, or another tool
   asked): the dialog opens at once with a "drawing mockups of these directions…" line, and a small model
   (`$.model.complete`, Opus by default) writes the specs from the question and option descriptions. The
   gallery appears when it answers (about 10 s live). Answering first aborts the call.

Detection for step 4 is a regex on the header and question. It needs a visual word (visual, look and feel,
palette, colour scheme, theme, layout, typography, mockup, aesthetic, branding, wireframe), or "design"
next to a surface (page, site, app, screen, landing, UI, logo, brand, dashboard...). Wording about code is
left alone (API, schema, architecture, code style). Other questions pass through untouched with no model call.

## Load

```
claude --plugin-dir ./bws-design-picker
```

or, to load it in every session, add the folder's absolute path to `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json` (`;`-separated on Windows).

## Configuration

`pluginConfigs["bws-design-picker"]` in settings, or `/config`:

| Option | Default | |
|---|---|---|
| `autoGenerate` | `true` | Generate specs for design questions that have none (one model call each) |
| `model` | `opus` | Alias or model id used for generated specs |

## Limits

- The engine allows 12 rows around its dialog, counts side-by-side boxes as if stacked, and refuses
  fixed widths there. So the gallery is one Raster under one header line: about 10 rows, one row of
  cards. Under roughly 50 columns for 4 options, the gallery is skipped.
- One gallery per dialog: the first design question's. The section asks Claude for one design question per call.
- Thumbnails cannot be clicked; the numbers match the picker's options.
- Text inside the terminal mockups is ASCII only (the Raster refuses wide glyphs).
- A text block narrower than its label is widened to fit it (growing left at the right edge), so labels
  aren't clipped. A widened block can cover a neighbour, and a label longer than the whole card is cut at
  the card's edge.
- Generated mockups come from the option descriptions only, without your project's context.
- Opus is slower than Haiku: the picker shows the "drawing" line until it answers.

## Tested

Claude Code 2.1.296, Windows 11, Windows Terminal (terminal surface):
- Claude-written specs: three directions drawn, option chosen in the picker, answer reached Claude.
- Generated specs (0.2.0): "drawing" line shown, gallery drawn when Haiku answered (10.6 s). In a second
  run, answering first aborted the call and the answer reached Claude.
- The desktop `Svg` path has unit tests only, with no live check.
