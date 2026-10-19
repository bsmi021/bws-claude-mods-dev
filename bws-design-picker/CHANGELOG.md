# Changelog

## 0.2.3
- A label now sits on a cell row its block covers whole. A text block too short for one grows to the cell edges around it, by at most a pixel.

## 0.2.2
- Text blocks are widened to fit their labels, so labels are not clipped.

## 0.2.1
- Generated mockups are drawn by Opus by default (was Haiku). The `model` option still changes it.
- The prompts tell the model the frame size and a rule to make text fit.

## 0.2.0
- A design-direction question that comes without specs now gets mockups: a small model writes them while the picker is open, and the gallery appears when it answers. Answering first cancels the call.
- New options `autoGenerate` and `model`.
- Checked live in Windows Terminal.

## 0.1.0
- First release. Design-direction questions draw each option as a small mockup above the picker, from a `design:` preview spec Claude writes.
- Terminal draws one half-block image; desktop draws one SVG.
- Checked live in Windows Terminal.
