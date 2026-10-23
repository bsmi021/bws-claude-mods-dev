# Eval: old vs new /enhance rewriter

10 rough requests x 3 samples, through the real mod (`claude -p "/enhance ..." --plugin-dir`, enhancer model sonnet). Blind pairwise judge opus (A/B shuffled).

**Pairwise:** new 30, old 0, tie 0 (of 30)

| Rubric (1-5, mean) | old | new |
| --- | --- | --- |
| outcome | 3.53 | 4.93 |
| method_left | 1.97 | 4.47 |
| intent | 3.63 | 4.70 |
| grounded | 2.90 | 4.27 |
| verifiable | 4.13 | 4.17 |
| concise | 2.20 | 4.57 |

| Mechanical (all rewrites) | old | new |
| --- | --- | --- |
| mean words | 257.7 | 158.5 |
| mean step_lines | 9.0 | 3.0 |
| mean paths | 3.8 | 1.2 |
| has steps_header | 16/30 | 0/30 |
| has done_when | 30/30 | 30/30 |
| has meta | 0/30 | 0/30 |

## Per case

| case | kind | winners | judge's reason (s0) |
| --- | --- | --- | --- |
| typo | trivial | new, new, new | A opens with the end state and stays short with a clear finish line; B opens with the action, prescribes search steps, and adds a CHANGELOG rule the developer never asked for, which is too much for a one-word typo fix. |
| linux-tests | bug | new, new, new | A states the end state, constraints and finish line without prescribing method, while B adds a numbered step list, a speculative list of likely causes and a `claude --version` step the developer never asked for. |
| it-ref | vague reference | new, new, new | A states the end state and the unchanged 100+ column behavior concisely and leaves the method to Claude. B prescribes investigation steps and assumes a bws-cockpit/.claude-plugin/types/ path. B also wrongly expects a shortened label at 100 columns and adds an odd `claude --version` check. |
| pasted-error | pasted error | new, new, new | A opens with the end state, leaves the fix approach to Claude, and gives a firm finish line. B prescribes investigation steps and fix strategies, treats the gate command as unknown when it is documented, invents details about regenerated declarations, and hedges its done-condition. |
| dark-mode | large, unclear feature | new, new, new | A opens with the end state and leaves the design to Claude, while B is a numbered step plan that prescribes APIs like ui.render and $.state and invents paths such as bws-cockpit/types/. |
| method-given | developer chose the method | new, new, new | A keeps the developer's chosen single source-then-name comparator, states the end state, and gives clear checks. B adds a numbered step plan and invents paths that are not in the tree (`types/`, `.claude-plugin/types/`). |
| perf | performance | new, new, new | B leads with the end state, leaves the approach to Claude, and gives a clear before/after finish line, while A includes a numbered step plan, prescribed fix options and invented details like `.claude-plugin/types/` and `/plugin-authoring`. |
| investigate | question / investigation | new, new, new | A is a tight read-only brief with a checkable finish line (root cause with file/declaration, exact error, clean git status); B prescribes investigation steps, adds speculative hypotheses and unrequested fix suggestions, and runs long. |
| new-mod | new feature | new, new, new | A states the end result and leaves the approach to Claude, while B prescribes numbered steps, file structure and design choices, and adds marketplace and /clear handling the developer never asked for. |
| docs | docs | new, new, new | A lays out a numbered step plan, asserts unverified facts (no .claude-plugin/, kit.json or CHANGELOG), and widens scope to docs/mods.md, while B states the end state, keeps to the README, and leaves the method to Claude. |

## Rewrites (sample 0)

### typo: `fix the typo teh in the enhance readme`

**old** (104 words)

> Fix the typo "teh" (should be "the") in the bws-enhance README.
> 
> Context: the file is `bws-enhance/README.md`. Search it for "teh" and check for other occurrences of the same typo in that file. Don't assume there is only one.
> 
> Constraints:
> - Change only the misspelled word. Leave all other wording, formatting and files untouched, including the CHANGELOG, since this is a trivial docs fix.
> - Do not add tests or extra docs.
> 
> Done when: `grep -n "teh" bws-enhance/README.md` returns no matches, and `git diff` shows only the typo correction(s) in that file. Keep working until that check passes, then stop and report what you changed.

**new** (66 words)

> The bws-enhance README no longer contains the typo "teh" where "the" was meant. Fix only that typo, and leave any other wording or formatting as is.
> 
> Done when: searching `bws-enhance/README.md` for "teh" finds no remaining instances of the typo (leave intentional uses, if any), and the diff shows only that correction. Keep working until this holds, then stop and report. Do not add tests or docs.

### linux-tests: `make the bouncer tests pass on linux too`

**old** (267 words)

> Make the "bouncer" tests pass on Linux, the platform this environment runs on, without breaking them on the platform they already pass on.
> 
> Context:
> - No directory is named "bouncer" in the project tree. Find which mod owns it first. The `/bounce` command (holds a vague prompt before sending, with off/warn/block modes) is the likely feature. Search the `bws-*/hooks/` and `bws-*/tests/` directories, `docs/mods.md` and `bws-kit/` for "bounce" to confirm.
> - Find the test command in that mod's README, the `tools/` directory or the project's instructions. Don't guess a runner.
> 
> Steps:
> 1. Run `claude --version` and note it, since the mod's behavior depends on the installed release.
> 2. Run the bouncer tests on this machine and capture the actual failures.
> 3. Find the root cause of each failure. Likely Linux-specific causes include path separators, case-sensitive filenames, macOS-only commands or paths, temp-directory assumptions, shell differences and line endings. Fix the code or the test setup, whichever is actually wrong.
> 
> Constraints:
> - Don't skip, delete or loosen tests, and don't hard-code values to get a pass.
> - Keep the mod's module statically inspectable as AGENTS.md requires: literal event names, direct `$.namespace.method(...)` calls, no Node built-ins or dynamic imports in hook modules. A portability fix must not break that.
> - Don't change behavior beyond what Linux compatibility needs.
> - Don't add new tests or docs beyond what the project requires.
> 
> Done when: the bouncer tests pass on Linux with the project's own test command, and you have confirmed no other mod's tests regressed. Keep working until those checks pass, then stop and report the root causes and the files you changed.

**new** (180 words)

> The bouncer tests should pass on Linux as well as on the platform where they already pass. First find which package and tests "bouncer" refers to, and run them on this machine to see what fails.
> 
> Constraints:
> - Fix the root cause of each Linux failure, whether that is the code or a platform-specific assumption in the test. Don't skip, loosen or delete tests, and don't hard-code values to get them green.
> - Behaviour on the platforms that already pass must stay the same.
> - If the failures come from something that can't be reproduced or fixed here, such as a missing system dependency, stop and report instead of working around it.
> - Keep the mod's handler code within the project's rules (statically inspectable module, no new Node built-in or npm imports in hook modules). Don't add tests or docs beyond what the fix requires.
> 
> Done when: the bouncer package's test suite runs green on this Linux machine, and its other tests still pass. Keep working until that holds, then stop and report what was wrong and what you changed.

### it-ref: `ok fix it`

**old** (295 words)

> Fix the bws-cockpit footer so that below 100 terminal columns it shortens the button label instead of dropping the button entirely.
> 
> Context
> - Symptom: at 99 columns the footer row omits the button completely. The expected behavior is that the button stays visible with a shorter label.
> - The mod lives in `bws-cockpit/`. Find the footer render logic, most likely a `ui.render` handler under `bws-cockpit/hooks/`. Locate the width threshold and the branch that omits the button, then work out why the label is not shortened there.
> - Check the generated declarations in `bws-cockpit/.claude-plugin/types/` for how render width is exposed. They are authoritative over online examples.
> 
> Constraints
> - Fix the root cause in the width handling. Do not hard-code a column value just to make the 99-column case pass.
> - Keep the module statically inspectable: literal event names, direct `$.namespace.method(...)` calls, and no aliasing of `$`. Preserve unrelated fields when rewriting render output and call `next` as the existing code does.
> - Make no changes outside `bws-cockpit` unless the cause is in shared code in `bws-kit`. If it is, say so in your report.
> - Do not add tests or docs beyond what the fix needs. Add a regression test in `bws-cockpit/tests/` only if one is the natural way to verify the fix. Update `CHANGELOG.md` only if the project's convention requires it for a fix.
> 
> Done when
> - Run `claude --version` and reload the mod. Confirm the footer at 99 columns, and also at 100 and at a very narrow width, shows a shortened button label, not a missing button.
> - The existing `bws-cockpit` tests pass. Find the test command in the repo and run it.
> 
> Keep working until these checks pass, then stop and report what the cause was, what you changed, and the results.

**new** (144 words)

> Make the bws-cockpit footer button stay visible when the terminal is narrower than 100 columns, shortening its label to fit instead of disappearing. Right now at 99 columns the footer row drops the button entirely. Find and fix the root cause in how the footer is rendered.
> 
> Constraints:
> - At 100 columns and wider, the footer should look and behave exactly as it does now.
> - Follow the project's mod rules in AGENTS.md (static inspectability, `ui.render` conventions, generated types in `.claude-plugin/types/` as the authority).
> - Keep the change within bws-cockpit and do not add tests or docs beyond what the project requires.
> 
> Done when: at 99 columns and at narrower widths the footer shows the button with a shortened label, at 100+ columns it is unchanged, and the bws-cockpit tests and type check pass. Keep working until those checks pass, then stop and report.

### pasted-error: `getting this when I run the gate, fix`

**old** (266 words)

> Fix the TS2589 error that makes the gate fail for bws-board, and get the gate passing again.
> 
> <error>
> bws-board: tsc failed
> hooks/register.tsx(212,15): error TS2589: Type instantiation is excessively deep and possibly infinite.
> </error>
> 
> Context:
> - The error is in `bws-board/hooks/register.tsx` at line 212, column 15. Start by reading that line and the code around it.
> - Work out which generic type is blowing up (for example, a deeply nested element type, a recursive type, or an API call whose types are inferred). Check the generated declarations in `bws-board/.claude-plugin/types/`. Treat them as authoritative, and don't edit them because Claude Code regenerates them.
> - Find how "the gate" is run (check AGENTS.md, `tools/`, and any scripts). Use that command to reproduce the failure first. If you can't find it, run `tsc --noEmit` with `bws-board/tsconfig.json`.
> 
> Constraints:
> - Fix the root cause, for example by simplifying the expression, splitting it into smaller steps, or adding an explicit type annotation at the right spot. Don't use `@ts-ignore`, `@ts-expect-error`, or `any` casts, and don't loosen `tsconfig.json`.
> - Keep the module statically inspectable per AGENTS.md: literal event names, direct `$.namespace.method(...)` calls, no aliasing or destructuring `$`, and no dynamic imports. The rewrite must not change the mod's visible behavior.
> - Keep the change minimal and leave unrelated code alone. Don't add tests or docs beyond what the project's instructions require.
> 
> Done when: the gate passes for bws-board, or at least `tsc` reports no errors there, and `bws-board/tests` still pass if they run as part of the gate. Keep working until those checks pass, then stop and report the cause and what you changed.

**new** (141 words)

> Make `bws-board` type-check cleanly again by fixing the TS2589 error at `hooks/register.tsx` line 212 at its root cause, without suppressing it.
> 
> Context: the gate fails with this error.
> 
> <error>
> bws-board: tsc failed
> hooks/register.tsx(212,15): error TS2589: Type instantiation is excessively deep and possibly infinite.
> </error>
> 
> Constraints:
> - Don't silence it with `@ts-ignore`, `@ts-expect-error`, or blanket `any` casts. Keep the board's rendering and event behavior unchanged.
> - Follow the project's AGENTS.md rules for mods. The module must stay statically inspectable, and the locally generated `.claude-plugin/types/` declarations are authoritative.
> - Don't add tests or docs beyond what the project requires, and keep the change scoped to this error.
> 
> Done when: the gate's `bws-board` tsc step passes with no TS2589 or new type errors, and `bws-board/tests` still pass. Keep working until those checks pass, then stop and report what caused the error and what changed.

### dark-mode: `add a light/dark theme toggle to the cockpit dashboard`

**old** (298 words)

> Add a light/dark theme toggle to the bws-cockpit dashboard.
> 
> Context
> - bws-cockpit is a mod in this repo (`bws-cockpit/hooks/`, `bws-cockpit/tests/`, `bws-cockpit/types/`). Read its README.md, kit.json and existing hooks first to find where the dashboard is rendered and how it is styled. If there is no obvious theme mechanism yet, say so and propose the smallest approach before editing.
> - Follow AGENTS.md. Run `claude --version` and use `/plugin-authoring` if available. Treat the generated declarations in `bws-cockpit/.claude-plugin/types/` as authoritative for event and API signatures, not online examples.
> 
> Steps
> 1. State the visible behavior and the smallest acceptance check before editing. Ask the developer only if the dashboard's render site can't be found.
> 2. Add a toggle control to the dashboard using `ui.render`, with a stable control identifier wired to the matching event. Redraw when the theme changes, using the documented invalidation API.
> 3. Decide the state lifetime on purpose. A theme preference should likely persist across reloads, so check the state guide and choose between `$.state` and persistent storage. Define the behavior after `/clear`, `/resume` and `/branch`.
> 4. Keep the module statically inspectable: literal event names, direct `$.namespace.method(...)` calls, no aliasing of `$`. Preserve unrelated fields when rewriting render output and pass through to `next` so other mods keep working.
> 
> Constraints
> - Implement only the toggle. Don't add other settings or change unrelated dashboard behavior.
> - Don't add tests or docs beyond what the project requires. Update `bws-cockpit/CHANGELOG.md` only if the project's convention calls for it.
> 
> Done when
> - Validation lists every intended hook and API call, and `bws-cockpit/tests/` passes (find the project's test command first).
> - You have reloaded the mod with `/reload-plugins` and confirmed the toggle switches themes and keeps the choice across a reload.
> 
> Keep working until these checks pass, then stop and report what you verified.

**new** (220 words)

> The bws-cockpit mod's dashboard has a light/dark theme toggle the user can switch at any time, and the chosen theme is applied across the whole dashboard.
> 
> Context: bws-cockpit is one of the mods in this repo. Follow the project's mod rules in AGENTS.md: keep the module statically inspectable, use only the requested capabilities, and treat the locally generated `.claude-plugin/types/` declarations as authoritative for event and API signatures. Use /plugin-authoring for the mod conventions. Find how the dashboard currently renders and handles its colors, and decide where the toggle fits and how long the choice should persist (at least across reloads, with defined behavior after `/clear`, `/resume` and `/branch`).
> 
> Constraints:
> - Keep existing cockpit behavior and unrelated work unchanged.
> - Don't add tests or docs beyond what is asked, unless the project requires them (for example a CHANGELOG entry, if the repo's conventions call for one).
> - If the dashboard has no way to render a clickable control or to read or change its colors, stop and report instead of building around it.
> 
> Done when: toggling switches the dashboard between light and dark and every part of it is readable in both themes, the choice persists as designed above, and the existing bws-cockpit tests and type check pass. Keep working until those checks pass, then stop and report what you verified.

### method-given: `in bws-enhance commandsText, sort with a single comparator that ranks by source then name instead of the current rank-only sort`

**old** (261 words)

> Update the `commandsText` sort in the `bws-enhance` mod to use a single comparator that ranks by source, then by name, instead of the current rank-only sort.
> 
> Context
> - `bws-enhance/` is a mod with `hooks/`, `tests/`, and `types/`. I haven't pointed you to the file, so find where `commandsText` is defined (search under `bws-enhance/hooks/`) and read the current sort before changing it.
> - Find out what "source" and "rank" mean for the items being sorted, and what order the source values should take. Use the existing rank logic, the types in `bws-enhance/.claude-plugin/types/`, and any existing tests as the reference. If the source order is not clear from the code, state your assumption in the report and don't invent a new order.
> 
> Steps
> 1. Replace the rank-only sort with one comparator function: compare by source rank first, and break ties by name. Keep the comparison deterministic and don't call `sort` more than once.
> 2. Keep the module statically inspectable, following AGENTS.md: no new imports from Node built-ins or npm, and no changes to how `$` is used.
> 3. Leave unrelated behavior and output format unchanged.
> 
> Constraints
> - Don't add tests or docs beyond what's asked, unless an existing test already covers this ordering and needs updating. Add a CHANGELOG.md entry only if the project's convention for `bws-enhance` calls for one.
> 
> Done when
> - Run the `bws-enhance/tests/` suite and confirm it passes. If a test already covers `commandsText` ordering, it should reflect the source-then-name order.
> - Keep working until those checks pass, then stop and report what changed and any assumptions about source order.

**new** (168 words)

> In bws-enhance, make the `commandsText` listing order entries with a single comparator that ranks by source first and then by name, replacing the current rank-only sort. Entries from the same source should come out in a stable, name-sorted order instead of whatever order they arrive in.
> 
> Constraints:
> - Keep the output format of `commandsText` and its contents unchanged; only the ordering changes.
> - Follow the mod conventions in AGENTS.md (statically inspectable module, no new Node built-ins or npm imports).
> - Do not add tests or docs beyond what is needed to cover the new ordering, unless the project requires them. Keep working until the checks below pass, then stop and report.
> 
> Done when:
> - `commandsText` lists entries sorted by source, then by name, using one comparator, with no leftover rank-only sort.
> - The existing bws-enhance tests pass, and the ordering is confirmed by a test or a quick run showing entries with the same source in name order.
> - `tsc` for bws-enhance (its `tsconfig.json`) reports no new errors.

### perf: `enhance feels slow, speed it up`

**old** (265 words)

> Find out why the bws-enhance mod feels slow and make it faster without changing what it does.
> 
> Context
> - The mod lives in `bws-enhance/` (hooks in `hooks/`, tests in `tests/`, generated types in `.claude-plugin/types/`). I'm assuming "enhance" means this mod. Read its README.md and hooks first to see what it does and where the delay could come from, such as model calls, shared helpers in `bws-kit/`, repeated work in a handler, or slow rendering.
> - Run `claude --version` and use `/plugin-authoring` for the mod conventions in AGENTS.md.
> 
> Steps
> 1. Before editing, state where you think the time goes and how you'll measure it. Add temporary timing or run the existing tests to get a baseline, and remove any temporary instrumentation afterwards.
> 2. Fix the main cause of the delay. Options include removing redundant work, caching, avoiding blocking awaits, or narrowing matchers so the handler only runs when needed.
> 3. Keep the output the same, and keep the module statically inspectable, with literal event names and direct `$.` calls. Respect `next` and `next.signal`, and don't log secrets.
> 
> Constraints
> - Don't drop features, lower output quality or skip steps just to look faster. If the main cost is an unavoidable model call, say so and propose options rather than changing behavior.
> - Don't add tests or docs beyond what the project requires.
> 
> Done when
> - The existing `bws-enhance/tests` pass. Find the test command in the README or the repo config.
> - You've shown a before/after measurement of the slow path.
> - You've summarized what changed and why.
> 
> Keep working until these checks pass, then stop and report.

**new** (151 words)

> The bws-enhance mod should respond noticeably faster, from the moment it is triggered to the result appearing, with the same output as today. Find out where the time goes and fix that, rather than masking it with spinners or shortened output.
> 
> Constraints:
> - Behaviour stays the same. The mod must remain statically inspectable under the rules in AGENTS.md.
> - Leave other mods and unrelated changes alone.
> - Don't add tests or docs beyond what the project requires.
> - If most of the delay is the model call itself and can't be cut without changing what enhance produces, stop and report that instead of degrading the result.
> 
> Done when: you can show before and after timings for the same input with a clear improvement, the existing bws-enhance tests and type check pass, and you've reported what was slow and what you changed. Keep working until those checks pass, then stop and report.

### investigate: `why does $.model.fork fail on resumed sessions? just tell me, don't change anything`

**old** (256 words)

> Find out why `$.model.fork` fails on resumed sessions in this project's mods, and explain the cause to me. This is read-only investigation: do not edit, create, or delete any files.
> 
> Context
> - The mods live in sibling plugin directories (e.g. `bws-sidechat`, `bws-summary`, `bws-kit`). `bws-kit/classify-fork.ts` looks like a likely place that uses fork, but confirm by searching for `$.model.fork` across the repo rather than assuming.
> - Each plugin's `.claude-plugin/types/` holds locally generated declarations. Treat them as authoritative over online docs, and read the signature and documented behavior of `model.fork` there first.
> - Run `claude --version` so you can say which release the behavior applies to. AGENTS.md notes the documented baseline is 2.1.296.
> - AGENTS.md says `session.start` does not re-run after `/clear`, `/resume`, or `/branch`. Check whether a fork handle, cached transcript, or session ID created in `session.start` goes stale after a resume. Also check module state versus `$.state` lifetime.
> 
> What to report
> - The actual failure: the error message or symptom, where in the code it arises, and which of the call sites are affected.
> - The root cause, supported by file and line references and the relevant type declarations.
> - If you cannot reproduce it or are unsure, say so and mark which parts are inference. Do not guess.
> - Optionally, one or two suggested fixes in words only, without applying them.
> 
> Done when you have given a written explanation backed by specific evidence from the code and types. Keep working until you have reached that, then stop and report. Do not add tests or docs.

**new** (175 words)

> Explain why `$.model.fork` fails when a mod runs in a resumed session (after `/resume`), grounded in what the code and the generated types in `.claude-plugin/types/` actually show. This is read-only: do not change any files.
> 
> Context: look at the mods here that call `$.model.fork` (`bws-kit/classify-fork.ts` may be relevant) and at the declared contract for `model.fork`. Note that `session.start` does not run again after `/clear`, `/resume` or `/branch`, so check whether state or setup the fork depends on is missing in that case. If you can reproduce the failure safely without editing anything, do so; otherwise reason from the code and types.
> 
> Done when: you have given me the root cause in a few sentences, with the file and declaration it comes from and the exact error or behaviour on resume. If the cause cannot be established from the code and types, say what you checked and what remains unknown instead of guessing. `git status` shows no changes. Keep working until you can say this, then stop and report. Do not add tests, docs or fixes.

### new-mod: `new mod that shows how many tokens the current turn used in the status line`

**old** (284 words)

> Create a new mod that shows how many tokens the current turn used in Claude Code's status line.
> 
> Context
> - Follow AGENTS.md. Run `claude --version` first and use `/plugin-authoring`. Treat the generated `.claude-plugin/types/` declarations as authoritative over online examples.
> - Look at a sibling mod such as `bws-summary` or `bws-notify` for layout, `kit.json`, tests and manifest conventions. Name the new mod in the same `bws-*` style, for example `bws-tokens`. Also check whether `.claude-plugin/marketplace.json` lists the siblings, and add this mod if they are listed.
> - Structure: `.claude-plugin/plugin.json`, `hooks/hooks.json` pointing to `./register.ts`, and `hooks/register.ts`.
> 
> Steps
> 1. Before editing, state the visible behavior and the smallest acceptance check.
> 2. In the generated types, find the event or field that exposes per-turn token usage, and the render site for the status line. Do not guess names. If the usage data isn't exposed, stop and report that rather than estimating.
> 3. Implement the mod. Keep `register(on, options)` statically inspectable: literal event names, direct `$.namespace.method(...)` calls, no aliasing. Use `next` to extend the existing status line rather than replacing it, and preserve other mods' output.
> 4. Decide what the count does after `/clear`, `/resume` and `/branch`. Choose the state lifetime deliberately, and use the documented redraw/invalidation API when the count changes.
> 
> Constraints
> - Request only the capabilities needed. Don't log session content.
> - Don't add tests or docs beyond what the project's conventions require.
> 
> Done when
> - Validation lists every intended hook and API call.
> - After `/reload-plugins`, the status line shows the token count for a real turn and it updates on the next turn.
> - Any existing test command used by sibling mods passes.
> 
> Keep working until these checks pass, then stop and report what you verified.

**new** (187 words)

> Add a new mod, in the same layout as the other `bws-*` mods, that shows how many tokens the current turn has used in the status line, so the developer can see usage as they work.
> 
> Context:
> - Whether the mods API exposes per-turn token counts, and what the status line render site accepts, is not confirmed. Check the locally generated `.claude-plugin/types/` declarations for this. If per-turn token counts are not available, stop and report what is exposed instead of estimating or working around it.
> - Use `/plugin-authoring` to follow the mod conventions in AGENTS.md (statically inspectable module, matchers limited to relevant events, no secrets logged).
> 
> Constraints:
> - Do not change existing mods. Request only the capabilities this feature needs.
> - Do not add tests or docs beyond what AGENTS.md or the other mods require.
> 
> Done when: the mod loads without validation errors after a reload, and the status line shows the token count for the current turn and updates as the turn progresses or completes. State the visible behavior you checked and how you checked it. Keep working until these checks pass, then stop and report.

### docs: `the bws-kit readme is out of date, update it`

**old** (255 words)

> Update bws-kit/README.md so it accurately describes what bws-kit contains and how the other mods use it today.
> 
> Context:
> - bws-kit is a shared helper directory, not a standalone plugin. It has no `.claude-plugin/`, `kit.json` or CHANGELOG. Its top-level files include `classify-fork.ts`, `raster.ts`, `runfolder.ts`, `summary.ts`, `tab.ts` and `transcript.ts`, plus `hooks/` and `tests/`.
> - Many mods have a `kit.json`. Read a few of them, and grep for imports from `bws-kit`, to see how the kit is consumed.
> 
> Steps:
> 1. Read bws-kit/README.md, then each module in bws-kit and the contents of `hooks/` and `tests/`. Note each module's exports and purpose.
> 2. Compare the README to the code. List what is missing, wrong or removed: modules, exports, usage instructions, file layout, and mentions of mods that use the kit.
> 3. Edit the README to match the code as it is now. Keep its existing structure and tone, and change only what is stale.
> 4. If `docs/mods.md` describes bws-kit, check it for the same drift and tell me what you find. Do not edit it unless it directly contradicts the README you wrote.
> 
> Constraints:
> - Describe only what exists in the code. Do not guess at behavior; read the source.
> - Change no code, add no tests, and do not touch other mods' READMEs or CHANGELOGs.
> 
> Done when: every module and public export in bws-kit is accurately covered, and every file, path or mod named in the README exists (check with `ls` or grep). Keep working until those checks pass, then stop and report a short summary of what changed.

**new** (167 words)

> Bring bws-kit/README.md up to date so it accurately describes what bws-kit contains and does today. The shared modules at the top of bws-kit (classify-fork, raster, runfolder, summary, tab, transcript) and its hooks and tests are the source of truth. Find where the README has drifted from them, and check how other bws-* plugins use the kit if that clarifies its purpose.
> 
> Constraints:
> - Edit only the README, and keep its existing structure and tone unless a section is wrong or missing.
> - Do not add tests or other docs beyond what the README needs.
> - If something is ambiguous and the code doesn't settle it, leave it out and mention it in your report instead of guessing.
> 
> Done when: every module, export and usage claim in the README matches the current code (spot-check each against the source), nothing in the code that a consumer needs is undocumented, and any commands or paths it mentions exist. Keep working until those checks hold, then stop and report what changed.
