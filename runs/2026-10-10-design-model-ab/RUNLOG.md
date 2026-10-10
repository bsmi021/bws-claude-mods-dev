# RUNLOG: Opus vs Fable A/B for generated mockups

## Brief
Brian wants to A/B Fable against Opus as the model that draws bws-design-picker's generated mockups.

## Done
- eval-mod: `/design-eval` runs 6 generic design questions x 2 runs x {opus, fable} through `$.model.complete`
  with the exact production request. It uses copies of the shipped `lib.ts` + types, made by `run-eval.sh`,
  picker at the commit in `receipts/picker-commit.txt`. Opus and Fable go concurrently per pair. Headless
  run: 565 s, 24/24 answered.
- score.ts imports the real `bws-design-picker/hooks/lib` and measures clipping/overlap with the renderer's
  own box maths at 170 columns (40x10 cards).
- build-page.ts -> mockup-ab.html (Precog), published privately: https://claude.ai/artifact/TJ55KsydgzHjD9eQhSgVR4
  - Blind pairs, sides shuffled with a fixed seed, votes in localStorage, a "Reveal models" switch.
  - Galleries are painted on canvas from the Raster cells. The first build used ▀ glyphs in HTML, and they
    didn't tile in the web font.

## Results (receipts/scored.json)
| | Opus | Fable |
|---|---|---|
| Mockups drawn | 40/40 | 40/40 |
| Clipped / overlapping labels | 0 / 0 | 0 / 0 |
| Text blocks under h 12 | 0 | 0 |
| Ink/fill contrast < 3:1 | 6 | 12 |
| Median / slowest wait | 27.5 s / 40.5 s | 44.9 s / 77.9 s |
| Output tokens (12 calls) | 39,958 | 47,973 |

## Next
Brian votes on the page. Decision rule in PLAN.md: Fable becomes default only on a clear majority of blind
votes; latency favours Opus. The default stays `opus` until then (a one-line change to the manifest + fallback).
