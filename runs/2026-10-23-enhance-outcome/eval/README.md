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

---

# Round 4: stop conditions, enhancer models, agent outcomes

The prompt gained two rules first: keep a "stop and report if X isn't possible" line when the goal depends on something
unconfirmed, and name only commands from the installed list. Judges now also see AGENTS.md, as the rewriter does
(without it they marked real AGENTS.md rules and the gitignored `.claude-plugin/types/` as invented; the first
judgements are kept as `*-noagents*`).

## B. Old vs new, per enhancer model (`out-b-<model>/`, 10 cases x 3, blind pairwise)

| Enhancer | new preferred | old mean (1–5) | new mean (1–5) | old words | new words |
| --- | --- | --- | --- | --- | --- |
| haiku (default) | 27/30 | 3.56 | 4.53 | 185 | 119 |
| sonnet | 30/30 | 3.32 | 4.62 | 258 | 159 |
| opus | 30/30 | 3.25 | 4.51 | 277 | 166 |

## Which model writes the better new rewrite (`out-h2h/`, blind 3-way ranking, 30)

| Enhancer | 1st | 2nd | 3rd | mean rank |
| --- | --- | --- | --- | --- |
| sonnet | 15 | 9 | 6 | 1.70 |
| opus | 11 | 9 | 10 | 1.97 |
| haiku | 4 | 12 | 14 | 2.33 |

Before the judge saw AGENTS.md this was reversed (haiku 20 firsts): the ranking depends on judge context more than on
anything else here. Sonnet and Opus win by using the project's rules and adding stop conditions; Haiku wins trivial
requests by being short.

## A. Does the agent do better work? (`out-a/`, `outcome.py`)

4 checkable tasks (linux-tests, method-given, investigate, docs) x raw/old/new prompt x sonnet/opus agent, one run
each, each in a fresh worktree at main (b5f8015, 54 tests: 50 pass, 4 fail). Objective checks plus a blind opus
judge of the work against a reference (it never sees the prompt). The first judgement used a wrong baseline (51 pass,
this branch's count) and penalised old/new on method-given; kept as `*-wrongbaseline*`.

| Agent | prompt | mean (1–5) | turns | cost $ | minutes |
| --- | --- | --- | --- | --- | --- |
| sonnet | raw | 4.62 | 6 | 0.15 | 0.7 |
| sonnet | old | 4.75 | 10 | 0.20 | 1.1 |
| sonnet | new | 4.69 | 10 | 0.19 | 1.0 |
| opus | raw | 4.69 | 12 | 0.49 | 1.2 |
| opus | old | 4.69 | 21 | 0.83 | 2.8 |
| opus | new | 4.75 | 19 | 0.71 | 2.1 |

- **No measurable difference in the work** between raw, old and new on these tasks: all within 0.13, inside the noise
  of one run per cell.
- **Rewrites cost more.** The agent took more turns from either rewrite than from the raw prompt (old the most).
  New is cheaper than old on Opus (19 vs 21 turns, $0.71 vs $0.83), about equal on Sonnet.
- **New scored highest on scope and report** (it never wandered, and reports were rated 5 in 7 of 8 runs).
- **New narrowed one task.** On linux-tests, both new-prompt agents fixed the 3 bouncer tests and left the 4th
  failing test (same cause, but in enhance.test.ts), flagging it; raw and old agents fixed all 4. The rewrite said
  "the bouncer test suite passes", which is literally what was asked.
- All read-only runs stayed read-only; all docs runs touched only the README.

## Limits
- 4 tasks, 1 run per cell, one repo with a strong AGENTS.md, rough prompts that were already fairly specific.
- One judge family (opus). Judge context changed results twice; read the per-run reasons in `out-a/report.md`.
- Untested: haiku as the agent, and vaguer rough prompts, where a rewrite has more to add.
