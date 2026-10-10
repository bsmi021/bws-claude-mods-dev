# bws-design-picker — PLAN

## Finish line
In a wt.exe session with the plugin loaded, a design-direction question shows colored Raster
thumbnails above the native AskUserQuestion picker, numbered to match the options, and choosing
one works as before. Non-design questions render unchanged. validate + plugin test + tsc green.
Plugin added to CLAUDE_CODE_PLUGIN_DIRS so every session gets it.

## Shape (v1)
- `prompt.compose`: one short session section telling Claude to put `design:{json}` mockup specs in
  each AskUserQuestion option's `preview` when asking for visual/design direction.
- `ui.render` on `AskUserQuestion`: parse specs; none -> `next(e)` untouched. Else draw a gallery
  (terminal: Raster half-block cells; desktop/remote: Svg) above `await next(e')`, with the raw
  specs stripped from the previews the native dialog draws.
- Selection stays in the native picker (no API lets a hook answer the dialog; tool.call can't wait
  on a press inside its 10 s budget). Thumbnails are captioned "1 · Label" to match.
- `hooks/lib.ts` pure: parseSpec, rasterize, toSvg, layout. Tested directly.

## Parked (follow-ups)
- Model-generated specs for design questions Claude asked without specs (tool.call + $.state + model.complete).
- Image element for kitty/Ghostty (higher res); Windows Terminal can't show it.

## Follow-up 1 (2026-10-10): generate specs when Claude gave none
Finish line: a design-direction AskUserQuestion with no `design:` previews opens the native dialog at
once with a "drawing mockups" line; the gallery appears when `$.model.complete` returns specs; an answer
before then aborts the call. Non-design questions make no model call. Three checks green, live-verified.
- Detection: header/question regex (visual, look and feel, palette, colour scheme, theme, layout,
  typography, mockup, aesthetic, branding, "design" next to page/site/screen/app/landing/ui/logo/brand).
  Negatives: API design, code style, schema/architecture design.
- userConfig: `autoGenerate` (default true), `model` (default haiku).
- State: `pending: StateFamily<boolean>` beside `galleries`.
