# Eval: old vs new /enhance rewriter

4 rough requests x 3 samples, through the real mod (`claude -p "/enhance ..." --plugin-dir`, enhancer model haiku (default)). Blind pairwise judge opus (A/B shuffled).

**Pairwise:** new 12, old 0, tie 0 (of 12)

| Rubric (1-5, mean) | old | new |
| --- | --- | --- |
| outcome | 3.50 | 4.83 |
| method_left | 2.33 | 4.33 |
| intent | 3.75 | 4.25 |
| grounded | 3.42 | 4.75 |
| verifiable | 4.17 | 4.00 |
| concise | 2.67 | 4.92 |

| Mechanical (all rewrites) | old | new |
| --- | --- | --- |
| mean words | 195.1 | 119.9 |
| mean step_lines | 2.5 | 0.0 |
| mean paths | 4.5 | 1.3 |
| has steps_header | 1/12 | 0/12 |
| has done_when | 12/12 | 12/12 |
| has meta | 0/12 | 0/12 |

## Per case

| case | kind | winners | judge's reason (s0) |
| --- | --- | --- | --- |
| tests-vague | vague bug | new, new, new | A states the end state and finish line and leaves the method to Claude; its only extra is a TypeScript check. B prescribes debugging steps, guesses at the cause and the Node/Bun runtime, and pads with an unrelated secrets rule. |
| sort-vague | vague change | new, new, new | A states the end state and finish line without telling Claude where to look or how to proceed. B prescribes investigation steps, points at a loosely referenced types/ directory, and restates AGENTS.md rules without need. |
| fork-vague | vague question | new, new, new | A states a concrete end state (a fork after /resume behaves like a fork in a fresh session) and stops if the bug can't be reproduced, while B lays out step-by-step method, guesses that fork means /branch, and defines success only as 'behaves correctly'. |
| docs-vague | vague docs | new, new, new | A opens with the end state and leaves the approach to Claude. B is a step-by-step comparison procedure, adds irrelevant AGENTS.md constraints such as secrets, and pads the prompt with a speculative CHANGELOG check and report requirements. |

## Rewrites (sample 0)

### tests-vague: `enhance tests are red on this machine, fix`

**old** (226 words)

> The bws-enhance mod's test suite is failing on this machine. Find out why, then fix the root cause so the tests pass here without changing their expectations to match.
> 
> Context:
> - The mod lives in `bws-enhance/` (hooks, tests, types, kit.json). Start by running its tests and reading the failure output before editing anything.
> - Check the local environment first: the installed Claude Code version (`claude --version`; the documented baseline is 2.1.296) and the Node/Bun runtime the tests use. A machine-specific difference is the likely cause, so compare it against what the tests assume.
> - Treat the generated `.claude-plugin/types/` declarations as authoritative if a failure involves API signatures.
> 
> Constraints:
> - Do not hard-code values, skip tests, or weaken assertions to make them pass.
> - Keep changes limited to what the failing tests need. Do not add new tests or docs unless a failing test requires it.
> - Mods are not sandboxed and must never log secrets, so do not print any secret-bearing values while debugging.
> 
> Done when:
> - The bws-enhance test command runs green on this machine, and the full output is included in your report.
> - If the root cause is environmental rather than in the code, say so and describe what needs to change on the machine.
> 
> Keep working until the Done-when checks pass, then stop and report what was wrong and what you changed.

**new** (99 words)

> Make the bws-enhance test suite pass on this machine. It fails here, and the cause may be specific to this environment or a real bug that only shows up locally. Find the root cause and fix it. Don't skip, delete, or loosen tests to get green. Keep working until the checks pass, then stop and report what was wrong and what changed. Don't add tests or docs beyond what the fix needs.
> 
> Done when: the tests in bws-enhance/tests pass locally, the bws-enhance TypeScript check against its tsconfig.json is clean, and no existing test has been removed, skipped, or weakened.

### sort-vague: `the command list enhance sends to the model is in a weird order, sort it properly`

**old** (170 words)

> In bws-enhance, fix the order of the command list the mod sends to the model. The list currently comes out in an odd order and should be sorted properly.
> 
> Context: Find where bws-enhance builds that command list for the model request, starting with its hooks/ and types/ directories. Read the current ordering logic before changing it. If the code, comments, existing tests, or a pattern elsewhere in the repo show an intended order, follow it. Otherwise, sort alphabetically by command name and state that assumption in your report.
> 
> Constraints: Change only the ordering. Keep the list's contents and format the same. Follow AGENTS.md: keep the hook module statically inspectable, with literal event names, direct `$` calls, and no aliasing. Do not add tests or docs beyond what the project requires.
> 
> Done when: the list is sorted as intended, the TypeScript check for bws-enhance/tsconfig.json passes, and the existing tests in bws-enhance/tests pass. Keep working until the Done-when checks pass, then stop and report what changed and the sort order you used.

**new** (105 words)

> The command list that the enhance mod sends to the model is out of order. Sort it so the model receives the commands in a consistent order: alphabetical by command name, unless the existing code or project docs define a different order that the mod should keep. If the intended order is unclear, stop and say so.
> 
> Done when the command list in the model request is sorted as described, the bws-enhance type check and existing tests pass, and you have reported what changed. Keep working until those checks pass, then stop and report. Do not add tests or docs beyond what the project requires.

### fork-vague: `fork seems broken after resume?`

**old** (164 words)

> Fix the bug where forking a conversation misbehaves after `/resume`. I'm assuming "fork" means the `/branch` flow and that the logic lives in `bws-kit/classify-fork.ts`. If the fork behavior is implemented elsewhere, follow it there.
> 
> Context: start by finding how a fork is classified in `classify-fork.ts` and how transcript state is read after a resume (see `bws-kit/transcript.ts`). Reproduce the failure, then identify the root cause. Fix that cause rather than special-casing the symptom. Follow the existing patterns in `bws-kit/tests`. Per the project's `AGENTS.md`, define the behavior after `/resume` and `/branch` explicitly.
> 
> Constraints: don't change unrelated behavior, don't log secrets, and don't add tests or docs beyond what the fix needs unless the project requires them.
> 
> Done when: a fork created after resume behaves correctly, the existing bws-kit tests pass (find the test command in the package or project config first), and the TypeScript check with `bws-kit/tsconfig.json` is clean. Keep working until those checks pass, then stop and report the root cause and the verification results.

**new** (122 words)

> Find out why forking a session stops working after it has been resumed, and fix the root cause so a fork taken after `/resume` behaves the same as a fork taken in a fresh session. The fork classification in `bws-kit` (`classify-fork.ts`) is a likely starting point. If the failure cannot be reproduced, or its cause lies outside this project, stop and report what you found instead of guessing.
> 
> Keep working until the Done-when checks pass, then stop and report. Do not add tests or docs beyond what the fix needs, unless the project requires them.
> 
> Done when: forking after a resume gives the same result as forking a new session, the existing `bws-kit` tests pass, and your report names the root cause.

### docs-vague: `kit docs are stale`

**old** (198 words)

> Update the stale documentation for the bws-kit mod to match its current code. Start by comparing bws-kit/README.md against the exported modules and their tests (classify-fork.ts, raster.ts, runfolder.ts, summary.ts, tab.ts, transcript.ts) and the bws-kit hooks, and list every place the README describes behavior, options, file names or commands that no longer match the code. Also check bws-kit/CHANGELOG.md if one exists, and any other doc pages under docs/ that mention bws-kit.
> 
> Scope: edit only documentation text. Do not change code, tests, or manifests, and do not add new sections beyond correcting what is stale. Use the names and signatures found in the source; if something cannot be confirmed from the code, leave it out and say so in your report rather than guessing.
> 
> Project constraints from AGENTS.md: never log secrets, and keep all examples consistent with the documented mods API.
> 
> Done when: every claim in the updated docs maps to something you confirmed in the source, you have run the existing bws-kit test suite (or the project's documented check) to confirm nothing else changed, and you report a short list of what was corrected and anything you could not verify. Keep working until those checks pass, then stop and report.

**new** (135 words)

> Bring the documentation for the bws-kit mod up to date with its current code, so the README and any other docs that describe bws-kit match what it actually does. The docs are out of date; find where they diverge from the code and correct them.
> 
> Context: bws-kit is the shared utility module in this repo (classify-fork.ts, raster.ts, runfolder.ts, summary.ts, tab.ts, transcript.ts). Start from its README.md and check each described export, behaviour, and usage example against the source and tests in bws-kit/.
> 
> Constraints: change documentation only, not the code. Do not add new docs or tests beyond what is needed to correct the existing ones.
> 
> Done when: every statement in bws-kit's docs matches the current source, no documented function, option, or example refers to something that no longer exists, and the tests in bws-kit/tests still pass.
