# bws-enhance 0.5.0: outcome-first rewrites

## Finish line
- `/enhance` rewrites a rough prompt into a goal-and-outcome prompt: what should be true when done, why (when not obvious), how to check it, and the constraints that bound it. The method is left to the running model.
- The rewriter no longer writes a Steps section, step lists, or names files/functions to change unless the developer did or a project rule requires it.
- Shorter target length (about 40–150 words); a trivial request stays one or two lines. Always ends with Done when.
- Eval vs 0.4.4 through the real mod shows it does this (eval/README.md).
- Kept: intent preserved, no added scope, no invented paths, a runnable check, plan-first for large/unclear work, per-model notes.
- Tests: a lib test pins the outcome-first rules. `mods-gate --plugin bws-enhance` green.
- Version 0.5.0 + CHANGELOG, README and manifest description updated. Release waits on Brian.

## Out of scope
- bws-better (question-driven upgrades) and the bouncer prompts are unchanged.
- No new option to switch between outcome and explicit styles; add one if the new style misfires.
