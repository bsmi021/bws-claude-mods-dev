# bws-diagram 0.2.0: the pane draws the diagram the way the video's does

## Finish line
- The pane draws top to bottom, in thin box-drawing characters, as plain text rows on every surface: a box per node
  (corners say file / component / step / decision), `▼ label` where an edge arrives, a legend, a footer
  `map drawn at turn N` / `pinned at turn N`. No Raster, no Svg.
- A pin or a drawn diagram opens the pane. When the engine will not place it (under 144 columns unasked), the diagram is
  written into the transcript instead, so it is seen anyway.
- bws-diagram 0.2.0, marketplace 1.1.0; gate green for every plugin; PR merged; published to `mods`; tag/release v1.1.0.

## Source
Ray Amjad's video (Od9706XIXcc), Diagram Pane chapter, 4:20 to 6:26; the frame at 5:25 shows the pane: thin boxes,
`▼ scores`-style edge labels, legend `┌ file ╭ component ╔ step ▶ now`, footer `map drawn at turn 7`, in a tab strip.

## Decisions (assumptions, recorded)
- Turn number = count of the person's messages when the diagram is drawn (`Entry.turn`, optional so 0.1.0 boards load).
- `Diagram.now` is an optional node id the fork may give; drawn `▶ label`; legend shows `▶ now` only then.
- Decision glyph (his legend has none): corners `╱ ╲ ╲ ╱`.
- One ink colour for the drawing (the video's is one colour), not a colour per kind.
- `kit/raster.ts` stays in place (only `printable` is used): removing it means touching `kit.json` and the sync check.
- The 144-column rule is the engine's; the mod cannot change it, so the transcript copy is the fallback.
