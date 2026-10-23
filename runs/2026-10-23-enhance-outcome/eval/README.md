# Eval: old (0.4.4) vs new (0.5.0) /enhance rewriter

**Question:** does the new rewriter produce goal-and-outcome prompts (end state, finish line, method left to the model)
without losing intent, grounding or a runnable check?

**Setup.** Two copies of bws-enhance that differ only in `hooks/lib.ts`, driven through the real pipeline from the repo
root: `claude -p "/enhance <rough>" --plugin-dir <copy>`. The mod collects its usual context (AGENTS.md, a 2-level tree,
commands, MCP servers, the conversation); the enhancer model is haiku, the default. 10 rough requests in `cases.json`
(trivial, bug, vague "fix it" after a real earlier turn, pasted error, large feature, a method the developer chose,
perf, read-only question, new mod, docs) x 3 samples. Opus judges each old/new pair blind, A/B shuffled, on a 1–5
rubric plus a preference. `python eval.py gen|judge|report` (env: `EVAL_MODS`, `EVAL_CWD`, `EVAL_SAMPLES`).

## Result (final prompt, `out/`)

Pairwise: **new 29, old 1** (of 30).

| Rubric (1–5, mean) | old | new |
| --- | --- | --- |
| outcome | 3.30 | 4.67 |
| method_left | 2.13 | 4.53 |
| intent | 3.73 | 4.57 |
| grounded | 2.50 | 4.47 |
| verifiable | 4.00 | 4.10 |
| concise | 2.43 | 4.63 |

| Mechanical (30 rewrites each) | old | new |
| --- | --- | --- |
| mean words | 193 | 101 |
| mean step-list lines | 3.5 | 0.0 |
| mean file paths named | 2.6 | 1.2 |
| has a Steps header | 9/30 | 0/30 |
| has Done when | 29/30 | 29/30 |

Full per-case table and every rewrite: `out/report.md`.

## Rounds
1. `out-rawharness/`: first try fed the system prompt straight to `claude -p --system-prompt`. Not valid: the CLI
   adds an environment block to the message, and haiku answered it with fake `<system-reminder>` notes and echoed tags
   (both variants). Replaced by the real-mod harness.
2. `out-round2/`: real mod, 2 samples. New 20–0, but 4/20 new rewrites had no Done when (while the Sonnet note says
   "until the Done-when checks pass") and some still ordered the work ("start by…").
3. `out/`: prompt now always ends with Done when and forbids sequencing the work. New 29–1, Done when 29/30.

## Limits
- One judge model, 10 hand-written cases, one repo. The judge saw a 3-level tree, the rewriter a 2-level one, so some
  "invented path" calls are the rewriter guessing at files it could not see (the one loss, linux-tests s0, is this).
- Verifiable barely moves: the old prompt already ended with Done when.
- Not measured: whether the downstream agent does better work from the new prompts.
