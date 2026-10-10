# A/B: Opus vs Fable for generated design mockups

## Finish line
A published, blind-by-default report page comparing Opus and Fable on the plugin's real generation
path (`$.model.complete`, exact production request), 6 questions x 2 reps x 2 models = 24 calls, with
per-reply metrics and terminal-faithful galleries. Brian votes; the default flips only after that (separate one-line change).

## Decision rule
Fable replaces Opus as the default if Brian prefers it in a clear majority of blind pairs and it is no
worse on clipped/overlap counts. Latency is the tiebreaker (the picker waits on it). A near-even split
means run more, not a call.

## Method
- eval-mod: `/design-eval` command; copies of the shipped `lib.ts` + `types/index.d.ts` taken by the runner
  at start, so the prompt can't drift. Request = `{ model, system: GEN_SYSTEM, prompt: genPrompt(q),
  maxTokens: 6000, timeoutMs: 120000 }`, no effort. Opus and Fable fire concurrently per (question, rep).
- scorer (tsx) imports the real `bws-design-picker/hooks/lib`: parse failures, spec-count mismatch, clipped
  labels at the 40-col card, text overlaps, text blocks h<12, ink/fill contrast < 3:1, unused palette colours.
- Caveat: GEN_SYSTEM was tuned with Opus in the loop (one run). Not tuned per model mid-test.
- `bws-design-picker/` is not touched by this task.
