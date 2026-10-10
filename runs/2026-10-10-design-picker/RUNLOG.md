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
- ~~Model-generated specs~~ done in 0.2.0.
- `Image` element at higher resolution for kitty/Ghostty.
- Live check of the desktop `Svg` path.

## Follow-up 1 (0.2.0): generated specs
- `tool.call`: no specs and `isDesignQuestion` -> set `pending`, start `$.model.complete` (haiku, abortable),
  `await next(e)` (the dialog), then abort and await the drawing. The gallery goes to state when the model
  answers, and the render redraws.
- `ui.render`: no gallery but pending -> one dim "drawing mockups of these directions…" line above the dialog.
- userConfig `autoGenerate` (true), `model` (haiku). Version 0.2.0.
- Test-kit notes: API stubs (`model.complete`) answer `{ value }`. The test `$` has no `state` noun, so
  assert through `$.ui.mount`. A stub's `next.signal` aborts when the caller's AbortController does.
- Generation prompt tightened after the first live run (text blocks overlapped): short text, no overlapping text blocks.

Evidence:
- `live-gen-2-drawn.png`: gallery from generated specs (`claude-haiku-5-5 answered in 10564ms`, live-gen-debug.log)
- `live-gen-3-pending.png`: the "drawing" line with the dialog open. Enter pressed about 4 s in, and
  live-gen2-debug.log shows `claude-haiku-5-5 aborted` 27 ms after the dialog closed. Claude answered
  "You picked Warm craft".

Checks: validate passed; plugin test 24/24; tsc clean.

## Recheck: tightened GEN_SYSTEM (2026-10-10)
- One live run, `live-gen-4-tightened.png` / `live-gen3-debug.log` (Haiku answered in 11025 ms, 2443 chars).
- No text block overlaps another in any of the three cards (before: "ShoVis", "RoOrder photo").
- Still seen: labels clipped to their block's width ("Shop b", "ORDER N", "Ethiop", "Colomb", "Brazi"). That's
  width truncation, not overlap; possible follow-up to pick a smaller font/shorter label or widen text blocks.
- Sample size is one run; Haiku output varies.

## 0.2.1: Opus for generated specs, prompts reviewed (2026-10-10)
- Brian didn't like Haiku's mockups. Default `model` is now `opus` (manifest + fallback); timeout 120 s.
- Root cause of clipped labels: the model was never told the frame size. GEN_SYSTEM now says ~32x9 cells,
  paint order, where text is drawn, the fit rule (at most w/3 - 2 characters, h >= 12), contrast, and to
  stay true to each description. SECTION (Claude's own specs) gets the same fit rule in one sentence.
- Live run (`live-gen-5-opus.png`, `live-gen4-opus-debug.log`): claude-opus-5-5 answered in 27275 ms.
  No clipped labels, no overlaps, every mockup matches its description. The cost is about 2.5x Haiku's
  wait (11 s), with the "drawing" line showing meanwhile.
- Checks: plugin test 24/24, tsc clean, validate passed.

## 0.2.2: text blocks never clip their labels (2026-10-10)
- `box()` in lib.ts widens a text-bearing block to `textWidth(label)` (characters + 1 cell padding each side),
  capped at the card width, growing left when it would pass the right edge. Fill and label grow together.
  Blocks without text are unchanged.
- Tests: narrow block widened with its fill (Ethiopia in 4 cells), right-edge pill shifted left, a block
  without text keeps its width, a label longer than the frame is cut at the frame. 26/26, tsc clean, validate passed.
- Trade-off: a widened block can cover a neighbour; prompts still ask for labels that fit.
