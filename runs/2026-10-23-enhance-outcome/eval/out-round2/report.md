# Eval: old vs new /enhance rewriter

10 rough requests x 2 samples, through the real mod (`claude -p "/enhance ..." --plugin-dir`, enhancer model haiku, the default). Blind pairwise judge opus (A/B shuffled).

**Pairwise:** new 20, old 0, tie 0 (of 20)

| Rubric (1-5, mean) | old | new |
| --- | --- | --- |
| outcome | 3.30 | 4.65 |
| method_left | 2.00 | 4.30 |
| intent | 3.70 | 4.65 |
| grounded | 2.55 | 4.40 |
| verifiable | 4.15 | 4.05 |
| concise | 2.30 | 4.50 |

| Mechanical (all rewrites) | old | new |
| --- | --- | --- |
| mean words | 192.8 | 109.8 |
| mean step_lines | 2.8 | 0.3 |
| mean paths | 2.7 | 1.4 |
| has steps_header | 7/20 | 0/20 |
| has done_when | 18/20 | 16/20 |
| has meta | 0/20 | 0/20 |

## Per case

| case | kind | winner (s0, s1) | judge's reason (s0) |
| --- | --- | --- | --- |
| typo | trivial | new, new | A states the end state and a clear finish line in two sentences. B invents an absolute path that was not in the context, prescribes a search-first step, widens the scope to other occurrences, and pads a trivial task. |
| linux-tests | bug | new, new | B leads with the end state and leaves the method to Claude. A prescribes a run, capture and diagnose sequence, invents a description of the bouncer mod and a 'package file', and still skips the AGENTS.md gate. B's weaknesses are smaller: a dangling 'Done-when' reference and a vague 'usual test command'. |
| it-ref | vague reference | new, new | A prescribes steps and invents a bws-cockpit/AGENTS.md that does not exist in the tree, while B states the end state and finish line concisely and leaves the method to Claude. |
| pasted-error | pasted error | new, new | A leads with the end state, leaves the approach to Claude and stays concise; B prescribes investigation steps and fix strategies, and cites a `.claude-plugin/types/` path that is not in the given tree. |
| dark-mode | large, unclear feature | new, new | A states the end state and leaves the approach to Claude. B prescribes steps, invents APIs and paths not in the context (`ui.render`, `$.namespace`, `$.state`, absolute paths), and adds theme persistence the developer never asked for. |
| method-given | developer chose the method | new, new | A keeps the developer's chosen single source-then-name comparator, states the end state and a test check, and stays short. B invents a rank function and AGENTS.md rules, assumes the existing source order should be kept, and adds steps and padding. |
| perf | performance | new, new | A centres the outcome with a light measure-first nudge, while B prescribes steps and likely causes, invents AGENTS.md details (statically inspectable rules, `$.namespace.method`, a state guide, `next` behavior), and skips the real gate `python tools/mods-gate.py --plugin bws-enhance`. |
| investigate | question / investigation | new, new | A centres the explanation and its finish line while leaving the method to Claude; B prescribes a step-by-step trace, invents a `.claude-plugin/types/` path that is not in the tree, and adds an unrequested proposed fix. |
| new-mod | new feature | new, new | B states the end result and a checkable finish line without prescribing an approach, while A adds a step list, dictates a module-variable design, and cites layout and API specifics that may not be grounded. |
| docs | docs | new, new | B opens with the end state and leaves the approach to Claude, while A prescribes a read-then-correct procedure and test-command hunting and is padded with constraints. |

## Rewrites (sample 0)

### typo: `fix the typo teh in the enhance readme`

**old** (93 words)

> Fix the typo "teh" in the README of the bws-enhance mod, at /home/user/bws-claude-mods-dev/bws-enhance/README.md. Change only that word to "the" and leave the rest of the file unchanged. Search the file for any other "teh" occurrences first; if there are more, fix each one and list them in your report.
> 
> Done when a search of that README for "teh" returns no matches and `git diff` shows only the corrected word(s). Do not add tests, docs, or other edits beyond this fix. Keep working until the check passes, then stop and report the changed lines.

**new** (37 words)

> Fix the typo "teh" in the bws-enhance README (bws-enhance/README.md) so the word reads "the", and change nothing else in the file. Done when the file contains no remaining "teh" typo and the diff touches only that word.

### linux-tests: `make the bouncer tests pass on linux too`

**old** (197 words)

> Make the bouncer tests pass on Linux. The bouncer is the `/bounce` mod, which holds a vague prompt before it is sent. Find its test directory by searching for "bounce" under the `bws-*` mod folders before changing anything.
> 
> Run that mod's test suite on this Linux machine and capture the failing output. Find the root cause of each failure. It may be a platform assumption such as a macOS-only command, path separators, case-sensitive paths, or line endings, but confirm this from the output rather than assuming it. Fix the code or the test setup so the behavior is correct on Linux and still correct on other platforms. Follow the conventions in `AGENTS.md`.
> 
> Do not hard-code expected values, skip tests, or loosen assertions to get green. Keep the change limited to what the failures require. Do not add new tests or docs beyond what the project requires.
> 
> Done when the bouncer test suite passes on Linux using the test command the mod already defines (check its package file or README), and the other mods' tests still pass. Keep working until those checks pass, then stop and report what was broken, what you changed, and the final test output.

**new** (112 words)

> The bouncer tests currently fail on Linux (they pass on the developer's other platform), and the goal is for them to pass on Linux too without changing what they check. Find the cause of the Linux-specific failure in the bouncer mod's tests and fix it in the code or test setup, not by skipping, loosening, or hard-coding around the failing assertions. Check that the tests run on Linux with the project's usual test command, and that nothing already passing on other platforms breaks. Don't add new tests or docs beyond what the fix needs. Keep working until the Done-when checks pass, then stop and report what the cause was and what changed.

### it-ref: `ok fix it`

**old** (178 words)

> Fix the bws-cockpit footer so its button stays visible when the terminal is narrower than 100 columns. At 99 columns the footer row currently drops the button entirely; instead, keep the button and shorten its label.
> 
> Context: Find the footer rendering in bws-cockpit, searching for the footer and the 100-column breakpoint, before editing. Check bws-cockpit/AGENTS.md and the project's AGENTS.md for conventions that apply, and look at the existing tests in bws-cockpit/tests for how footer layout is covered.
> 
> Steps: Confirm why the button is dropped at 99 columns, then change the layout logic so the button remains and its label shortens at narrow widths. Fix the layout logic itself rather than special-casing the 99-column value.
> 
> Done when: at 99 columns the button is visible with a shortened label; at 100 columns and wider the footer looks as it did before; the bws-cockpit test suite passes and the TypeScript check (tsconfig.json) is clean. Keep working until these checks pass, then stop and report what changed and the results. Do not add new tests or docs beyond what the project requires.

**new** (121 words)

> Fix the bws-cockpit footer so the button stays visible when the terminal is narrower than 100 columns. At 99 columns the footer row currently drops the button entirely; it should shorten the button's label to fit instead. Find the footer's width handling in bws-cockpit and fix the root cause rather than special-casing the 99-column width.
> 
> Done when a footer test or render check at 99 columns and at 100 columns shows the button present, with the label shortened below 100, and the existing bws-cockpit tests still pass. Run the bws-cockpit test suite and report the result. Keep working until those checks pass, then stop and report. Don't add tests or docs beyond what the fix needs unless the project requires them.

### pasted-error: `getting this when I run the gate, fix`

**old** (201 words)

> Fix the TypeScript error that the gate reports for the bws-board mod. The compiler fails at `hooks/register.tsx` line 212, column 15:
> 
> <error>
> bws-board: tsc failed
> hooks/register.tsx(212,15): error TS2589: Type instantiation is excessively deep and possibly infinite.
> </error>
> 
> Start by reading the code around line 212 and working out which expression triggers the deep instantiation. It is often a recursive or very large generic, such as a JSX or element type, or a mods API type that is being inferred through a long chain. Fix the root cause with a narrower type, an explicit annotation, or a simpler expression. Do not silence the error with `@ts-ignore`, a blanket `any` cast, or by weakening the tsconfig. Where the type comes from the mods API, check the generated declarations in `.claude-plugin/types/` for the real signature, as AGENTS.md directs. Keep the change limited to what this error needs, and leave the component's behavior unchanged.
> 
> Verification: rerun the same gate command that produced the failure, and confirm `tsc` passes for bws-board with its `tsconfig.json`. Keep working until those checks pass, then stop and report what caused the error, what you changed, and the check results. Do not add tests or docs unless the project requires them.

**new** (107 words)

> Make the bws-board TypeScript check pass so the gate goes green. The gate currently fails with:
> 
> <error>
> bws-board: tsc failed
> hooks/register.tsx(212,15): error TS2589: Type instantiation is excessively deep and possibly infinite.
> </error>
> 
> Find the root cause of this type instantiation at that location and fix it so the hook's runtime behaviour stays the same. Don't suppress the error with `@ts-ignore` or loosen the types to `any` to get past it.
> 
> Done when the gate passes with no tsc errors for bws-board. Keep working until that check passes, then stop and report what was wrong and what changed. Don't add tests or docs beyond what the project requires.

### dark-mode: `add a light/dark theme toggle to the cockpit dashboard`

**old** (193 words)

> Add a light/dark theme toggle to the bws-cockpit dashboard in /home/user/bws-claude-mods-dev/bws-cockpit.
> 
> Follow the mod rules in /home/user/bws-claude-mods-dev/AGENTS.md. Read bws-cockpit/README.md and its hooks/ directory to find the existing dashboard `ui.render` site and how it styles its elements. Before editing, state the visible behavior and the smallest acceptance check.
> 
> Steps:
> - Add a toggle control to the dashboard that switches all of its existing elements between light and dark colors.
> - Give the control a stable identifier and handle its click with a literal event name, using direct `$.namespace` calls.
> - Keep the chosen theme in `$.state` so it survives reloads. Default to the dashboard's current appearance. Note this choice in your summary.
> 
> Constraints:
> - Change only the bws-cockpit mod. Leave other mods untouched.
> - Do not add tests or docs beyond what is asked, unless the project requires them.
> 
> Done when:
> - The bws-cockpit type check (tsconfig.json) and its existing tests pass.
> - In a dev session, `/reload-plugins` loads the mod, the toggle switches to each theme and back, and the selected theme persists after a reload.
> 
> Keep working until these checks pass, then stop and report what changed and any assumptions you made.

**new** (99 words)

> Add a light/dark theme toggle to the bws-cockpit dashboard. Users can switch the dashboard between light and dark, and both themes stay readable across all cockpit views. Follow the mod rules in AGENTS.md, and match how cockpit already renders and stores state. Leave existing cockpit behaviour unchanged. Don't add features, tests, or docs beyond the toggle unless the project requires them. Done when the toggle switches both themes, the bws-cockpit tests and type check pass using the project's commands, and you report what you changed and what you verified. Keep working until those checks pass, then stop and report.

### method-given: `in bws-enhance commandsText, sort with a single comparator that ranks by source then name instead of the current rank-only sort`

**old** (199 words)

> Find `commandsText` in `bws-enhance` and replace its current rank-only sort with one comparator that orders entries by source rank first, then by name as the tie-breaker. Reuse the existing rank logic for source order and keep the current ordering of sources. Find the rank function and the sort call before editing, and confirm that `commandsText` is the only place this sort lives.
> 
> Context: `bws-enhance` is a mod. Follow `AGENTS.md` at the project root, which asks you to preserve unrelated code and keep the module statically inspectable. Do not change the event contract or any other handler.
> 
> Scope: only the comparator in `commandsText`. Do not change how the sources are ranked, how entries are collected, or how the output is rendered.
> 
> Done when:
> - Entries are grouped by source in the existing source order, and names within each source are sorted alphabetically.
> - The existing tests in `bws-enhance/tests` pass, and the project's type check for `bws-enhance` passes. Use the command named in its README or package scripts.
> - If there are no tests covering this sort, say so in your report rather than adding new tests or docs.
> 
> Keep working until those checks pass, then stop and report what changed.

**new** (86 words)

> Change the sort in bws-enhance's commandsText so it uses one comparator that orders entries by source, then by name, replacing the current rank-only sort. The output should be grouped by source with names alphabetical within each group. Read the existing sort and the code around it first, and keep the rest of the output format unchanged. Run the bws-enhance tests and confirm they pass; if an existing test asserts the old rank order, update it to match the new order and say so in your report.

### perf: `enhance feels slow, speed it up`

**old** (180 words)

> Find out why the bws-enhance mod feels slow, then make it faster without changing what it does. Before editing, measure the slow path and record a baseline. Start with the handlers in `bws-enhance/hooks/` and the notes in `bws-enhance/README.md`, and identify which events run on each interaction. Then find the redundant work, such as repeated file reads, uncached calls, or unnecessary re-renders, and remove it.
> 
> Constraints:
> - Keep the module statically inspectable, as AGENTS.md requires: top-level imports, literal event names, and direct `$.namespace.method(...)` calls.
> - Keep each handler's results and its `next` behavior the same. Don't add features or change output.
> - Cache only where the state guide in AGENTS.md allows it for the value's lifetime.
> - Don't add tests or docs beyond what the project requires.
> 
> Done when:
> - The test command from `bws-enhance/README.md` or its package config passes.
> - TypeScript checks against `bws-enhance/tsconfig.json` are clean.
> - The timing of the slow path, measured before and after, is lower, and you report both numbers.
> 
> Keep working until these checks pass, then stop and report what was slow and what changed.

**new** (111 words)

> Make the bws-enhance mod respond faster. Its current behavior should be unchanged, and the slowness should be fixed at its cause, not hidden.
> 
> Context: bws-enhance is the mod in this project that handles the enhance feature. Start by measuring how long it takes today and finding where that time goes. Then make the slow part faster.
> 
> Done when:
> - The bws-enhance tests pass, and any hook or API validation that AGENTS.md requires passes too.
> - You report before and after timings for the same run, with the slow part you changed.
> 
> Keep working until those checks pass, then stop and report. Don't add tests or docs beyond what the project requires.

### investigate: `why does $.model.fork fail on resumed sessions? just tell me, don't change anything`

**old** (174 words)

> Find out why `$.model.fork` fails in resumed sessions. Do not edit, create, or delete any files, and do not run commands that change state. Report the cause in your reply.
> 
> Start by finding every call to `$.model.fork` in this project's mod code. Check its signature in the generated declarations under `.claude-plugin/types/`. Then trace the code path for a resumed session. AGENTS.md says `session.start` does not run after `/resume`, so check whether anything the fork depends on (registration, state, or the model handle) is set up only in that hook. Also check whether `bws-kit/classify-fork.ts` is involved, and read the exact error or failing condition.
> 
> Done when you can name the root cause with file and line references, explain how you confirmed it (by reading code, types, or running a read-only check), and describe the fix you would make without applying it. If the code does not show the cause, say what information is missing instead of guessing. Keep working until you have a verified answer, then stop and report. Do not add tests or docs.

**new** (113 words)

> Find out why `$.model.fork` fails on resumed sessions in this mod project, and explain the cause to me. Do not change any code or files.
> 
> Context: the project's mod guidance in AGENTS.md covers the mods API and session lifecycle, including that `session.start` does not run after `/resume`. Look at how the failing call is made and what session state it depends on after a resume, and reproduce the failure if you can without editing anything.
> 
> Done when: you have a clear explanation of the root cause, with the relevant file and line references, and you have stated whether the failure was reproduced or inferred from the code. Stop after reporting; make no edits.

### new-mod: `new mod that shows how many tokens the current turn used in the status line`

**old** (276 words)

> Create a new Claude Code mod, in its own directory at the project root (for example `bws-turn-tokens/`, following the existing `bws-*` mod layout), that shows how many tokens the current turn used in the status line.
> 
> Context:
> - Follow the mod layout in AGENTS.md: `.claude-plugin/plugin.json`, `hooks/hooks.json` pointing to one `./register.ts` module, and `register(on, options)` using literal event names and direct `$.namespace.method(...)` calls.
> - Run `claude --version` first and check the generated `.claude-plugin/types/` declarations for the exact status line rendering API and the turn-complete or usage event fields before writing code. Do not guess these names.
> - Model the new directory on an existing mod such as `bws-cockpit/` or `bws-notify/` for manifest, tests, and tsconfig shape.
> 
> Steps:
> 1. Find the event and field that report token usage for a turn, and the status line render hook that can display text.
> 2. Keep the per-turn count in a module variable, since it only needs to live for the current session.
> 3. Render it in the status line as a short label, such as "Turn: 1,234 tokens".
> 
> Constraints:
> - Show only the current turn's usage. Do not add cost, totals across sessions, or other stats.
> - Do not log session content or secrets.
> - Do not add tests or docs beyond what the project requires; keep the README minimal if the other mods require one.
> 
> Done when:
> - The module validates against the generated declarations, and the project's mod validation passes.
> - Loading the mod in a dev session shows the turn token count in the status line and updates it after a turn completes.
> - Keep working until these checks pass, then stop and report what you verified.

**new** (160 words)

> Add a new mod to this repository, as a bws-* directory alongside the existing mods, that shows the number of tokens used by the current turn in Claude Code's status line. The count should reflect the turn in progress and start over on the next turn.
> 
> Follow the mod rules in AGENTS.md at the project root, including its structure, static-inspectability rules, and verification steps, and use /plugin-authoring. Check the installed Claude Code version first and confirm it supports the status line and per-turn token data you need.
> 
> Done when a development session loads the mod, the status line shows the current turn's token count, and the count restarts on the next turn. Confirm this by running a session and watching the status line, and run the type-check and the validation AGENTS.md describes. Keep working until those checks pass, then stop and report what you verified. Do not add tests or docs beyond what is asked unless the project requires them.

### docs: `the bws-kit readme is out of date, update it`

**old** (170 words)

> Update bws-kit/README.md so it matches the current code in bws-kit/. Start by reading the README and the bws-kit sources (classify-fork.ts, raster.ts, runfolder.ts, summary.ts, tab.ts, transcript.ts) and the hooks/ and tests/ folders to see what the module exports and does today. Then correct any out-of-date descriptions, file names, function names, usage examples or setup steps in the README. Keep the existing structure and tone, and don't add new sections beyond what is needed to reflect the code.
> 
> Constraints:
> - Only edit bws-kit/README.md. Don't change the code or the other mod READMEs.
> - Don't invent behavior; if something in the README can't be confirmed from the source, say so in your report rather than guessing.
> - Don't add tests or docs beyond this README update.
> 
> Done when: every file, function and command named in the README exists in bws-kit/ with the described behavior, and running the bws-kit tests (check bws-kit/tests/ and the package scripts for the test command) still passes. Keep working until those checks pass, then stop and report what changed.

**new** (100 words)

> The README for bws-kit (bws-kit/README.md) no longer matches the code in that directory. Bring it up to date with the current exports and behaviour of the kit's TypeScript modules (classify-fork.ts, raster.ts, runfolder.ts, summary.ts, tab.ts, transcript.ts) and its hooks, and leave the other mods' READMEs alone. Keep the existing README structure and tone, and describe only what the code does today.
> 
> Done when every statement in bws-kit/README.md is confirmed against the source, and the bws-kit tests still pass. Do not add tests or docs beyond the README itself, and keep working until those checks pass, then stop and report what changed.
