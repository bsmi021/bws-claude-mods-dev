# RUNLOG: bws-diagram 0.2.0

- Went back to the video (Diagram Pane chapter, frame at 5:25): his pane is thin box-drawing text, top to bottom, `▼ label` edges, a legend, a footer, in a tab. Ours drew filled raster blocks left to right.
- Replaced hooks/render.ts (text rows from layered()), dropped hooks/draw.ts and the placement code in layout.ts, new tests/render.test.ts (exact rows), pane tests read the rows back, unplaced pin writes the diagram into the transcript.
- Found: the engine places an unasked pane only from 144 columns (110 once asked); `$.ui.log` appends to the transcript, so that is the fallback.
- Gate: `python tools/mods-gate.py` green (see below). Live check still Brian's: post the tea mermaid and read `/diagram status`.
