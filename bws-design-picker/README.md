# bws-design-picker

> Draws each design option as a small colour mockup above Claude Code's own picker.

When Claude asks you to choose a design direction, a text list is hard to judge. This mod draws each option as a small
rendered mockup (layout, colours, palette strip) above the picker. You still choose with the picker itself.

## Install

```
claude plugin marketplace add bsmi021/bws-claude-mods
claude plugin install bws-design-picker@bws-mods
```

Then `/reload-plugins`. Requires Claude Code 2.1.296 or later. It has no dashboard tab and does not depend on another
mod.

## Use

There are no commands. When Claude asks a design-direction question with `AskUserQuestion`, the mockups appear above the
dialog and the numbers under them match the picker's options. Pick with the picker as usual. The thumbnails cannot be
clicked.

## What it does

1. **Claude is told how to describe options.** The mod adds one short section to the system prompt: when asking for a
   visual or design direction, use `AskUserQuestion` and give each option a `preview` of `design:{json}`. The spec holds
   blocks (percent coordinates, fill, text, shape `rect`, `pill` or `circle`), a palette and a font.
2. **The specs are lifted out.** Before the dialog opens, the mod takes the specs out of the previews and keeps them for
   the session, so the JSON never shows in the dialog.
3. **The gallery is drawn above the dialog.**
   - Terminal: one image of half-block cells (two pixels per cell), which works in any true-colour terminal.
   - Desktop and other remote surfaces: one SVG.
4. **Questions that came without specs.** If a design-direction question arrives with no specs (Claude ignored the
   section, or another tool asked), the dialog opens at once with a "drawing mockups of these directions..." line. A
   small model writes the specs from the question and the option descriptions, and the gallery appears when it answers
   (about 10 seconds with Opus). Answering first cancels the call.

A question counts as a design question when its header or text has a visual word (visual, look and feel, palette,
colour scheme, theme, layout, typography, mockup, aesthetic, branding, wireframe), or "design" next to a surface (page,
site, app, screen, landing, UI, logo, brand, dashboard). Wording about code (API, schema, architecture, code style) is
left alone. Other questions pass through untouched with no model call.

### Limits

- Claude Code allows 12 rows around its dialog, counts side-by-side boxes as if stacked, and refuses fixed widths
  there. So the gallery is one image under one header line, about 10 rows, one row of cards. With fewer than roughly 50
  columns for 4 options, the gallery is skipped.
- One gallery per dialog: the first design question's. The prompt section asks Claude for one design question per call.
- Text inside the terminal mockups is ASCII only.
- A text block narrower than its label is widened to fit (growing left at the right edge), so labels are not clipped. A
  widened block can cover a neighbour, and a label longer than the whole card is cut at the card's edge.
- A label always sits on a cell row its block covers whole. A text block too short for one grows to the cell edges around
  it, by at most a pixel each way.
- Generated mockups come from the option descriptions only, without your project's context.
- Opus is slower than Haiku. The picker shows the "drawing" line until the model answers.

## Options

Set in `/plugin`, or under `pluginConfigs["bws-design-picker"].options` in settings.json.

| Option | Default | What it does |
| --- | --- | --- |
| `autoGenerate` | `true` | For a design-direction question without `design:` previews, ask a small model for mockup specs while the picker is open. One model call per such question. |
| `model` | `opus` | Alias or model id for the generated specs. Opus draws the best mockups; `haiku` is faster and cheaper. |

## Permissions and data

- It adds a section to the system prompt, reads `AskUserQuestion` inputs, and draws above the dialog.
- The only model call is the generation in step 4. It sends the question text and option descriptions, and only for a
  design-direction question without specs, with `autoGenerate` on.
- It keeps the specs in session state. It reads and writes no files, runs no processes and makes no network calls of its
  own.

## Compatibility

- Checked on Claude Code 2.1.296, Windows 11, Windows Terminal.
- Checked live there: Claude-written specs drew three directions and the chosen option reached Claude. Generated specs
  showed the "drawing" line and then the gallery; answering first cancelled the call and the answer still reached Claude.
- The desktop SVG path has unit tests only, with no live check.

## License

MIT. Version history: [CHANGELOG.md](CHANGELOG.md).
