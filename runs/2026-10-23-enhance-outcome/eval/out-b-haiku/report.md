# Eval: old vs new /enhance rewriter

10 rough requests x 3 samples, through the real mod (`claude -p "/enhance ..." --plugin-dir`, enhancer model haiku). Blind pairwise judge opus (A/B shuffled).

**Pairwise:** new 27, old 3, tie 0 (of 30)

| Rubric (1-5, mean) | old | new |
| --- | --- | --- |
| outcome | 3.53 | 4.73 |
| method_left | 2.37 | 4.67 |
| intent | 4.07 | 4.57 |
| grounded | 3.53 | 4.70 |
| verifiable | 4.07 | 4.03 |
| concise | 2.73 | 4.47 |

| Mechanical (all rewrites) | old | new |
| --- | --- | --- |
| mean words | 185.4 | 118.8 |
| mean step_lines | 2.7 | 0.0 |
| mean paths | 2.8 | 0.7 |
| has steps_header | 7/30 | 0/30 |
| has done_when | 25/30 | 30/30 |
| has meta | 1/30 | 1/30 |

## Per case

| case | kind | winners | judge's reason (s0) |
| --- | --- | --- | --- |
| typo | trivial | new, new, new | A is a tight, outcome-focused prompt with a clear finish line; B invents an absolute path that was not in the context and adds padding and extra restrictions to a trivial typo fix. |
| linux-tests | bug | new, old, new | A keeps the focus on the Linux pass and leaves the approach to Claude, while B prescribes a search-and-diagnose procedure and invents facts: an absolute repo path, macOS as the working platform (bws-notify's .vbs/.ps1 files suggest Windows), and what /bounce does. |
| it-ref | vague reference | new, new, new | A centres the end state and leaves the method to Claude, though it adds a light method hint and a conditional test addition; B adds a step list, presumes a width check exists, and pads with AGENTS.md boilerplate. |
| pasted-error | pasted error | new, new, new | A centres the end state and ends on the gate passing while leaving the method to Claude; B scripts the investigation, suggests specific fixes, and swaps the known gate command (`python tools/mods-gate.py --plugin bws-board`) for a guessed tsc invocation, though it does usefully quote the error verbatim. |
| dark-mode | large, unclear feature | new, new, new | A states the end state and checkable finish line without prescribing steps, while B adds a step list and reading order, cites a types/ directory not in the tree, and uses a vague validation command instead of the project's gate. |
| method-given | developer chose the method | old, new, new | A drops the `commandsText` function the developer named and replaces it with a vague 'commands list'. B keeps that target and a sound stop-if-fields-missing guard, despite a prescribed opening step, an added tiebreak, and a hedged reference to the gate rather than naming `python tools/mods-gate.py --plugin bws-enhance`. |
| perf | performance | new, new, new | B leads with the end state, leaves the approach to Claude and invents nothing, while A prescribes investigation steps, invents a `bws-enhance/types/` directory, package scripts and a `tsc` command, and omits the project's real gate. |
| investigate | question / investigation | new, new, new | A keeps the investigation-only scope, leaves the method to Claude and has a clear finish line with a fallback; B adds a prescriptive step list, steers toward a hypothesis, and demands quoted error text that may not be obtainable. |
| new-mod | new feature | new, old, new | A is built around the end state and a clear finish line and leaves the design to Claude, while B prescribes steps, a template mod, and how to store state. |
| docs | docs | new, new, new | B states a checkable end state and leaves the approach to Claude. A prescribes reading steps, attributes a rule to AGENTS.md that it does not contain, and uses a tsc check that cannot verify a README edit. |

## Rewrites (sample 0)

### typo: `fix the typo teh in the enhance readme`

**old** (83 words)

> Fix the typo "teh" in the bws-enhance README at /home/user/bws-claude-mods-dev/bws-enhance/README.md, changing it to "the". Search that file for other occurrences of "teh" and correct only the ones that are that typo, leaving the rest of the file unchanged. Do not edit other READMEs or any other files, and do not add tests or docs.
> 
> Done when `grep -n "teh" bws-enhance/README.md` returns no matches for the typo and `git diff --stat` shows only that README changed. Then stop and report the lines you changed.

**new** (44 words)

> Fix the typo "teh" in the bws-enhance README (bws-enhance/README.md) so it reads "the". Change nothing else in the file.
> 
> Done when: the word "teh" no longer appears in bws-enhance/README.md, the rest of the file is unchanged, and `git diff` shows only that one-word correction.

### linux-tests: `make the bouncer tests pass on linux too`

**old** (158 words)

> Make the bouncer mod's tests pass on Linux. The `/bounce` command holds a vague prompt before it is sent, so start by locating its module and tests with a search for "bounce" or "bouncer" under the mod directories in `/home/user/bws-claude-mods-dev`, since no directory has that exact name. Run the tests on this Linux machine to see which ones fail and read the errors. Find the root cause of each failure, such as a macOS-only command, a path or separator assumption, case-sensitive filenames, line endings, or a shell-dependent call, and fix it in the mod's source so the code works on both Linux and macOS. Don't skip or stub the tests, and don't hard-code values to make them pass. Follow `AGENTS.md` for the mod's conventions. Keep working until the test run passes on Linux, then stop and report what was broken, what you changed, and the final test output. Don't add tests or docs beyond what the fix needs.

**new** (115 words)

> Make the bouncer (`/bounce`) test suite pass on Linux, as it does on the platform where it passes now. Find which tests fail on Linux and why, and fix the underlying cause so the behaviour is correct on both platforms.
> 
> Don't skip, delete or loosen tests, and don't hard-code results to make them pass. Don't add tests or docs beyond what's asked unless the project requires them. Keep working until the checks pass, then stop and report what changed.
> 
> Done when: the bouncer tests pass on Linux using the project's test setup, with none skipped or weakened. If a failure depends on something Linux cannot provide, stop and report it instead of working around it.

### it-ref: `ok fix it`

**old** (205 words)

> Fix the bws-cockpit footer so its button stays visible below 100 columns by shortening the label instead of removing the button. Right now at 99 columns the footer row drops the button entirely. At 100 columns and above, the full label should still show.
> 
> Context: Find the footer row rendering in bws-cockpit and locate the width check that decides which footer elements to show. Follow AGENTS.md: return the mod's elements as plain data from `ui.render`, keep control identifiers stable, and use the method signatures from the generated declarations in `.claude-plugin/types/`.
> 
> Steps:
> - Read the footer code and confirm the width threshold before editing.
> - At widths under 100 columns, render the button with a shorter label. Keep the button in the row.
> - Leave the button's identifier and its click or command behavior unchanged.
> - Don't change other footer items unless they must move to fit.
> 
> Constraints: Don't add features, tests, or docs beyond this fix, unless the project requires them.
> 
> Done when: the footer shows the button at 99 columns with the short label and at 100 columns with the full label. The existing bws-cockpit tests in `tests/` pass. Keep working until those checks pass, then stop and report what changed and the results.

**new** (114 words)

> Fix the bws-cockpit footer so the button stays visible below 100 columns: at 99 columns the footer row should shorten the button's label rather than dropping the button entirely. Look at how the footer row lays out its controls when the terminal narrows. Keep the button at 100+ columns unchanged.
> 
> Done when: the footer button is present at 99 columns with a shortened label, the layout is unchanged at 100 columns and wider, and the bws-cockpit tests pass. Add a width check at 99 and 100 columns if the existing tests already cover footer layout; otherwise keep changes to the code itself. Keep working until the checks pass, then stop and report what changed.

### pasted-error: `getting this when I run the gate, fix`

**old** (182 words)

> Fix the TypeScript error that fails the gate for the bws-board mod. The gate reported:
> 
> <error>
> bws-board: tsc failed
> hooks/register.tsx(212,15): error TS2589: Type instantiation is excessively deep and possibly infinite.
> </error>
> 
> Open bws-board/hooks/register.tsx around line 212, column 15, and find what triggers the deep type instantiation. Fix the root cause, for example by adding an explicit type annotation or simplifying a generic or inferred type. Check mods API types against the generated declarations in .claude-plugin/types/, which AGENTS.md treats as authoritative.
> 
> Constraints: Do not silence the error with @ts-ignore, @ts-expect-error, or a blanket `any` cast. Do not change runtime behavior or add features. Keep `$` calls and the `on` handler statically inspectable, as AGENTS.md requires, so do not alias or destructure them. Do not add tests or docs beyond what this fix needs.
> 
> Done when: tsc reports no errors for bws-board. Find the gate's exact tsc command first if you can, and otherwise run tsc --noEmit with bws-board's tsconfig.json. The existing bws-board tests also still pass. Keep working until these checks pass, then stop and report the cause and the change you made.

**new** (160 words)

> Fix the TypeScript error that makes the bws-board gate fail: `hooks/register.tsx` line 212 reports TS2589 ("Type instantiation is excessively deep and possibly infinite"). The tsc check for bws-board should pass with the error resolved.
> 
> Context: the failing check is the gate's tsc run in bws-board. The error points at a type instantiation, so look at the types involved at that location rather than suppressing the error.
> 
> Constraints: keep the module's runtime behaviour unchanged, and fix the cause in the types or code rather than casting to `any` or adding a `@ts-ignore`. Keep the mod's hook registration statically inspectable as AGENTS.md requires.
> 
> Done when: the bws-board tsc check runs clean with no TS2589 error, and the gate command that reported the failure passes. If the fix would require changing behaviour or the type contract, stop and report what you found instead. Keep working until these checks pass, then stop and report. Do not add tests or docs beyond what is needed.

### dark-mode: `add a light/dark theme toggle to the cockpit dashboard`

**old** (254 words)

> Add a light/dark theme toggle to the bws-cockpit mod's dashboard. Start by reading bws-cockpit/README.md, its hooks/ and types/ directories, and the AGENTS.md at the project root to find where the dashboard UI is rendered and how existing mod UI is registered. Don't assume the file names; locate them first.
> 
> Context:
> - Follow AGENTS.md: use `ui.render` at the intended render site, keep control identifiers stable, and choose state lifetime deliberately. Decide whether the chosen theme must persist across reloads (`$.state`) or can stay in module memory, and say which you picked and why.
> - Use the generated declarations in the mod's types/ folder for exact method signatures. Don't guess them.
> - Keep the module statically inspectable: literal event names, direct `$.namespace.method(...)` calls, no aliasing or dynamic imports.
> 
> Steps:
> 1. Find the cockpit dashboard's render code and its current colors or styling.
> 2. Add a toggle control that switches between light and dark themes and applies them to the dashboard.
> 3. Wire the toggle to its event handler and make the render update when the theme changes.
> 
> Scope: only the light/dark toggle for the cockpit dashboard. Don't change other mods or add unrelated styling. Don't add tests or docs beyond what the project requires.
> 
> Done when: the `claude --version` check is recorded, the mod's TypeScript validation or build command (from the project's instructions or package config) passes, and the toggle switches the dashboard between themes in a running session. Keep working until these checks pass, then stop and report what changed and the checks you ran.

**new** (111 words)

> Add a light/dark theme toggle to the bws-cockpit dashboard so the user can switch the dashboard's colors between light and dark from a control in the dashboard. Follow the rendering and state conventions in AGENTS.md, and leave the rest of the cockpit's behavior unchanged. Choose whether the selected theme survives a reload or session, and say what you chose in the report.
> 
> Done when: the toggle is visible in the dashboard, switching it changes the colors between light and dark, and the bws-cockpit tests and the mod's static validation pass. Keep working until those checks pass, then stop and report. Do not add tests or docs beyond what the project requires.

### method-given: `in bws-enhance commandsText, sort with a single comparator that ranks by source then name instead of the current rank-only sort`

**old** (154 words)

> Change the sort in `commandsText` in the bws-enhance mod so that it uses one comparator that orders items by `source`, then by `name`, replacing the current rank-only sort. Start by finding `commandsText` in `bws-enhance/` and reading how items are sorted there, along with the item shape and the fields involved. If `source` or `name` doesn't exist on those items, stop and report what is there instead of inventing a field. Use a single comparator function with a deterministic tiebreak, and keep the rest of the output format and any unrelated code unchanged. Follow the mod conventions in `AGENTS.md`, and preserve unrelated work in the tree. Don't add tests or docs beyond what the project already requires. Keep working until the checks below pass, then stop and report what changed and the results. Run the existing tests in `bws-enhance/tests/` and a typecheck against `bws-enhance/tsconfig.json`. If the project has a named check command, use that instead.

**new** (74 words)

> Make the commands list in bws-enhance order its entries with one comparator that sorts by source and then by name, replacing the current rank-only sort. Done when the sort is a single comparator that orders by source, then name, the bws-enhance tests pass, and the type check for that package is clean. Keep the working until those checks pass, then stop and report. Do not add tests or docs beyond what the project requires.

### perf: `enhance feels slow, speed it up`

**old** (184 words)

> Find out why the bws-enhance mod feels slow, then make the enhance flow noticeably faster without changing what it does.
> 
> Context: The mod lives in `bws-enhance/`, which has `hooks/`, `tests/`, `types/`, and a `tsconfig.json`. Read `bws-enhance/README.md` and the hook handlers to locate the enhance path. Measure where the time goes, for example by timing the suspect steps, before changing any code. Look for work repeated on every event or render, uncached calls, or blocking operations.
> 
> Constraints: Keep behavior and output identical. Fix the root cause rather than skipping steps or hard-coding results. Follow `AGENTS.md`: keep the module statically inspectable, avoid Node built-ins and dynamic imports, and do not intercept events the enhance flow does not need. Do not add tests or docs beyond what is asked unless the project requires them.
> 
> Done when: you have before and after timings for the enhance path showing the improvement, the bws-enhance tests pass using the project's test command (check the README or package scripts), and `tsc -p bws-enhance/tsconfig.json` passes. Keep working until those checks pass, then stop and report the cause, the change, and the measured numbers.

**new** (106 words)

> Make the bws-enhance mod respond noticeably faster when enhance runs, without changing what it produces or how it behaves. Find out where the time goes and fix the cause, not a symptom.
> 
> Done when: enhance's end-to-end time on the same input is measurably lower than before, the bws-enhance tests pass, and before and after timings are reported. If the delay comes from the model call or an external service rather than the mod's own code, stop and report that instead of changing behaviour to hide it. Keep working until the checks pass, then stop and report. Don't add tests or docs beyond what the project requires.

### investigate: `why does $.model.fork fail on resumed sessions? just tell me, don't change anything`

**old** (178 words)

> Find out why `$.model.fork` fails in resumed sessions and explain the root cause. Make no code, config, or file changes; this is investigation only.
> 
> Context:
> - Search the repo for `$.model.fork` calls, and check the generated mods API declarations in `.claude-plugin/types/` for its exact signature and any documented session or state requirements. Treat those declarations as authoritative.
> - Compare the resumed-session path with a fresh session. AGENTS.md notes that `session.start` does not run after `/resume`, so any setup the fork depends on may be missing there.
> - Run `claude --version` and compare it with the baseline in AGENTS.md (2.1.296).
> - If you can reproduce the failure with an existing test or the affected flow, run it without adding new tests, and capture the exact error.
> 
> Done when: you can name the root cause with file and line references, quote the error text, and say whether the failure reproduces. Keep working until those checks are complete, then stop and report. Do not propose or apply a fix unless I ask for one, and do not add tests or docs.

**new** (97 words)

> Find out why `$.model.fork` fails on resumed sessions in this mod project, and report the cause in plain terms. Do not change any code or files. Done when: the report names the specific failure (the error or condition observed when calling `$.model.fork` on a resumed session), explains the cause with a reference to where it happens in the code, and says whether it was reproduced or only inferred from reading the code. If the failure cannot be reproduced or the cause cannot be confirmed from the code and generated types, stop and say so rather than guessing.

### new-mod: `new mod that shows how many tokens the current turn used in the status line`

**old** (272 words)

> Create a new Claude Code mod in this project that shows the number of tokens used by the current turn in the status line.
> 
> Context:
> - Follow the mod layout in AGENTS.md: `.claude-plugin/plugin.json`, `hooks/hooks.json` pointing to a single `./register.ts` module, and a static `register(on, options)` export with literal event names and direct `$.namespace.method(...)` calls.
> - Create the new mod as its own top-level folder next to the existing `bws-*` mods, following the layout of an existing mod such as `bws-summary/`.
> - Run `claude --version` first, then check the generated `.claude-plugin/types/` declarations for the status line and turn-related events and APIs before choosing them. Do not guess their names.
> 
> Steps:
> - Confirm the event that exposes per-turn token usage and the UI API that renders into the status line. Use the generated types, not online examples.
> - Implement the handler with the narrowest matcher possible. Observe with `next(e)` and do not rewrite unrelated events.
> - Keep state for the current turn in module variables only, and reset it when a new turn starts.
> 
> Constraints:
> - Do not log or persist session content.
> - Do not add features beyond the token count for the current turn.
> - Do not add tests or docs beyond what is needed, unless the project requires them.
> 
> Done when:
> - The mod validates with the project's mod validation step, and the validation output lists every hook and API call used.
> - Loading the mod in a dev session shows the current turn's token count in the status line, and it updates on the next turn.
> - Keep working until these checks pass, then stop and report what you verified.

**new** (157 words)

> Create a new mod in this project, as a `bws-*` folder that follows the existing mods' layout, that shows the token count of the current turn in Claude Code's status line. The count should update while the turn runs and show the final total once it completes. Check the installed Claude Code version and the generated type declarations for whether per-turn token usage is exposed; if it is not, stop and report what is available instead of estimating. Follow the project's mod rules in AGENTS.md, and keep the mod to this one feature.
> 
> Done when: the mod passes the static validation that lists its hooks and API calls, its typecheck passes, and running Claude Code with the mod loaded shows a turn's token count in the status line that matches the total after that turn finishes. Keep working until these checks pass, then stop and report. Do not add tests or docs beyond what the project requires.

### docs: `the bws-kit readme is out of date, update it`

**old** (204 words)

> Update bws-kit/README.md so it matches the current bws-kit code. Start by reading the README and the bws-kit source files (classify-fork.ts, raster.ts, runfolder.ts, summary.ts, tab.ts, transcript.ts) and the bws-kit tests, then list each place where the README describes behavior, exports, file names, or usage that no longer matches the code.
> 
> Scope: edit only bws-kit/README.md. Keep its existing structure and tone, and correct or remove outdated statements rather than rewriting sections that are still accurate. Do not change code, tests, CHANGELOG.md, or other mods' docs. Do not add new sections or examples beyond what is needed to fix stale content.
> 
> Constraints: AGENTS.md at the project root says to verify against the installed Claude Code release and to avoid invented APIs, so only document symbols and behavior you can find in the source. If a claim cannot be confirmed from the code, remove it or flag it in your report instead of guessing.
> 
> Done when: every function, file, and command named in the README exists in bws-kit, and the tsc check passes with `npx tsc --noEmit -p bws-kit/tsconfig.json`. Keep working until those checks pass, then stop and report what you changed and anything you could not verify. Do not add tests or docs beyond what is asked.

**new** (108 words)

> Update bws-kit/README.md so it matches what the bws-kit code and files actually do today, with nothing stale left in it. Check the README against the current source in bws-kit/ (the .ts modules, hooks/, and tests/), and fix any description, command, option, or example that no longer matches. Keep the existing structure and tone, and do not add new sections or features the code does not have.
> 
> Done when: every statement in bws-kit/README.md is supported by the current code, nothing in the README refers to removed or renamed items, and the README's own code examples run as written or match the current signatures. Report which sections changed and why.
