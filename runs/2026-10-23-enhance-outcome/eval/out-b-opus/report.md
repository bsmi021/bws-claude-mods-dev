# Eval: old vs new /enhance rewriter

10 rough requests x 3 samples, through the real mod (`claude -p "/enhance ..." --plugin-dir`, enhancer model opus). Blind pairwise judge opus (A/B shuffled).

**Pairwise:** new 30, old 0, tie 0 (of 30)

| Rubric (1-5, mean) | old | new |
| --- | --- | --- |
| outcome | 3.50 | 4.90 |
| method_left | 1.97 | 4.60 |
| intent | 3.93 | 4.50 |
| grounded | 3.50 | 4.43 |
| verifiable | 4.27 | 4.10 |
| concise | 2.33 | 4.53 |

| Mechanical (all rewrites) | old | new |
| --- | --- | --- |
| mean words | 277.5 | 166.4 |
| mean step_lines | 13.0 | 3.2 |
| mean paths | 3.8 | 1.7 |
| has steps_header | 15/30 | 0/30 |
| has done_when | 30/30 | 30/30 |
| has meta | 0/30 | 0/30 |

## Per case

| case | kind | winners | judge's reason (s0) |
| --- | --- | --- | --- |
| typo | trivial | new, new, new | A states the end state and a runnable grep check briefly, while B adds step-by-step search instructions and extra prohibitions that pad a one-word typo fix. |
| linux-tests | bug | new, new, new | A states the end state and leaves the method to Claude. B prescribes a numbered step plan and wrongly claims the bouncer isn't in the tree, even though bws-enhance/hooks/bounce.ts and its test are listed. |
| it-ref | vague reference | new, new, new | A centres the end state and leaves the method to Claude; B prescribes where to look and the likely cause, and invents a `tsc` check instead of the repo's documented gate. |
| pasted-error | pasted error | new, new, new | A states the end state and leaves the fix to Claude. B prescribes investigation steps and fix options, treats the known gate (tools/mods-gate.py) as something to find, and invents a `bws-board/types/` path. |
| dark-mode | large, unclear feature | new, new, new | A centres the end state and leaves the method to Claude, with a clear finish line; B is a numbered step plan that prescribes files, handlers and an invalidation approach, and runs much longer. |
| method-given | developer chose the method | new, new, new | A keeps the developer's chosen comparator and gives a clear, observable finish line concisely, while B adds a step-by-step plan, prescribes localeCompare and guesses where the code and test command live. |
| perf | performance | new, new, new | B opens with the end state of a faster mod with identical output, leaves the method to Claude, and requires a measurable before/after timing, while A prescribes a numbered step plan, lists a `types/` folder that is not in the tree, and has a vaguer finish line. |
| investigate | question / investigation | new, new, new | A keeps the read-only diagnosis scope, gives useful context without dictating steps, and has a clear finish line; B prescribes grep commands and an investigation order, adds a fix sketch the developer didn't ask for, and is longer than it needs to be. |
| new-mod | new feature | new, new, new | A leads with the end state and leaves the approach to Claude, with clear constraints and a finish line. B prescribes numbered steps and files and lists a `types/` folder in the mod layout, although the generated types actually live under `.claude-plugin/`. |
| docs | docs | new, new, new | B centres the end state and leaves the method to Claude, while A imposes a four-step plan and asserts unverified facts about bws-kit's structure. |

## Rewrites (sample 0)

### typo: `fix the typo teh in the enhance readme`

**old** (85 words)

> Fix the "teh" typo in `bws-enhance/README.md`, changing it to "the".
> 
> Search the file for every occurrence of "teh", matching it as a whole word. That way words that happen to contain those letters are left alone. Correct each occurrence. Change nothing else in the file or the repo. Don't touch other READMEs, the CHANGELOG or code. Don't add tests or docs.
> 
> Done when running `grep -nw teh bws-enhance/README.md` returns nothing and `git diff` shows only the typo fixes. Then stop and report which lines changed.

**new** (42 words)

> Fix the "teh" typo in bws-enhance/README.md so it reads "the", and leave the rest of the file unchanged.
> 
> Done when: no "teh" remains in bws-enhance/README.md (`grep -n '\bteh\b' bws-enhance/README.md` returns nothing). Don't add anything else; stop and report once that check passes.

### linux-tests: `make the bouncer tests pass on linux too`

**old** (329 words)

> Make the bouncer mod's tests pass on Linux. They presumably already pass on another platform, macOS or Windows.
> 
> **Context**
> - The bouncer is likely the mod behind the `/bounce` command, which holds a vague prompt before it is sent and has off / warn / block modes. It isn't in the visible part of the project tree, which was truncated. Search the repo (for example `grep -ril bounce --include=*.ts`) to find its folder and its `tests/` directory before changing anything.
> - Find how its tests are run from that mod's README, the other mods' `tests/`, or `tools/`. Use the same runner.
> 
> **Steps**
> 1. Run `claude --version` and note the result. AGENTS.md asks for this because behavior is checked against the installed release.
> 2. Run the bouncer tests on this Linux machine and capture the actual failures.
> 3. Find the root cause of each failure. Likely suspects are path separators or case sensitivity, line endings, shell or process differences, timing, or `$HOME` and temp-dir assumptions. Confirm the cause rather than guessing.
> 4. Fix the code or the test so it behaves the same on every platform.
> 
> **Constraints**
> - Don't skip, platform-gate, or loosen assertions just to get green. Don't hard-code Linux-specific values.
> - If the fix touches the mod module itself, follow AGENTS.md:
>   - Keep it statically inspectable: literal event names, direct `$.namespace.method(...)` calls, no Node built-ins or dynamic imports.
>   - Use the mods API for files and processes.
> - Don't touch other mods or add tests or docs beyond what the fix needs.
> - If a failure turns out to be a real Linux bug in Claude Code itself rather than in the mod, stop and report it instead of working around it.
> 
> **Done when**
> The bouncer test suite passes on Linux, and nothing in the fix would break it on the other platform. Keep working until that check passes, then stop and report:
> - the root cause of each failure
> - what you changed
> - the test output

**new** (219 words)

> Make the tests for the bouncer mod (the one behind `/bounce`, which holds vague prompts before they're sent) pass on Linux, without breaking them on the platforms where they already pass.
> 
> Context: find the mod and its tests yourself, then reproduce the Linux failures before changing anything.
> 
> Constraints:
> - Fix the actual cause, whether it's in the mod or in a test's platform assumption. Don't skip tests on Linux, loosen assertions until they pass, or hard-code expected values.
> - Keep the mod's behaviour the same unless the behaviour itself is the Linux bug.
> - Follow AGENTS.md: keep the module statically inspectable, and treat the generated `.claude-plugin/types/` as the source of truth for API shapes.
> - Touch only the bouncer mod, unless the cause is in shared code like `bws-kit`. If it is, say so and check the other mods that use it.
> - Don't add new tests or docs beyond what the fix needs.
> - If a failure comes from Claude Code itself behaving differently on Linux and the mod can't reasonably fix it, stop and report what you found.
> 
> Keep working until the Done-when checks pass, then stop and report.
> 
> Done when: the bouncer mod's full test suite passes on Linux, nothing that passed before now fails, and you've summarised what was platform-specific and how you fixed it.

### it-ref: `ok fix it`

**old** (290 words)

> Fix the bws-cockpit footer so that below 100 terminal columns (e.g. at 99) it keeps the button and shortens its label, instead of dropping the button entirely.
> 
> Context: This is the bug from earlier in this session. The footer row renders correctly at 100+ columns. At 99 columns the button vanishes, and the expected behavior is a shortened label. Start in `bws-cockpit/hooks/` and find where the footer row is built and where terminal width drives layout decisions. The likely suspect is a width threshold or overflow check that removes the button when it could truncate or abbreviate the label instead. Confirm the actual cause before changing anything. Don't assume it.
> 
> Constraints (per AGENTS.md):
> - Run `claude --version` first. Check render and width APIs against the generated `.claude-plugin/types/` declarations, not online examples.
> - Keep the module statically inspectable. Use literal event names and direct `$.namespace.method(...)` calls, with no aliasing or destructuring of `$`.
> - Keep the button's control identifier stable so its click handling still works with the shorter label.
> - When extending a component, reuse Claude Code's rendering through `next`.
> - Fix the layout logic at its root. Don't hard-code a special case for 99 columns.
> - Don't add tests or docs beyond what's needed, though an existing test covering footer width may be updated. Use `/plugin-authoring` if you need mod guidance.
> 
> Done when:
> - At 99 columns and at narrower widths, the footer shows the button with a shortened label.
> - At 100+ columns, the footer is unchanged.
> - The existing tests in `bws-cockpit/tests/` and the TypeScript check (`tsc -p bws-cockpit/tsconfig.json --noEmit`) pass.
> - Mod validation lists the expected hooks after `/reload-plugins`.
> 
> Keep working until these checks pass, then stop and report the root cause and what you changed.

**new** (231 words)

> In the bws-cockpit mod, the footer button should stay visible when the terminal is narrower than 100 columns. Right now at 99 columns the footer row drops the button entirely. It should shorten the button's label instead, so the button remains usable at narrow widths.
> 
> Constraints:
> - Fix the root cause in how the footer lays out at narrow widths. Don't special-case 99 columns.
> - At 100 columns and wider, the footer should render as it does today.
> - Follow AGENTS.md:
>   - Treat the generated `.claude-plugin/types/` as authoritative for `ui.render` and the element APIs.
>   - Keep the module statically inspectable.
>   - Use `/plugin-authoring` if you need guidance.
> - If the types offer no reliable way to learn the available width, or to shorten a label, stop and report that instead of hard-coding widths.
> - If there is a width so narrow that even the shortest label can't fit, say what happens there rather than inventing new behaviour.
> - Don't add tests or docs beyond what the fix needs.
> 
> Keep working until the Done-when checks pass, then stop and report.
> 
> Done when:
> - At 99 columns, and at a few narrower widths, the footer shows the button with a shortened label.
> - At 100 columns and above, the footer is unchanged.
> - The existing bws-cockpit tests pass.
> - You have confirmed the behaviour by resizing a running session, using `/verify` or `/run`.

### pasted-error: `getting this when I run the gate, fix`

**old** (276 words)

> Fix the TypeScript error that makes the gate fail for `bws-board`.
> 
> <error>
> bws-board: tsc failed
> hooks/register.tsx(212,15): error TS2589: Type instantiation is excessively deep and possibly infinite.
> </error>
> 
> Context:
> - First find out what "the gate" is: look in `tools/` and the root config for the script that runs `tsc` across the mods. Run it to reproduce the failure before changing anything.
> - The error is in `bws-board/hooks/register.tsx`, line 212. TS2589 usually comes from a large or recursive generic being inferred. In a mod this is often a `ui.render` element tree or a `$` API call whose type is computed from a deeply nested literal.
> - Per AGENTS.md, the locally generated declarations in `bws-board/types/` and `.claude-plugin/types/` are authoritative. Check the real signature there, not online examples. If those declarations look stale, reload the dev mod to regenerate them rather than editing them by hand.
> - Other mods may build similar trees without this error. Look at how they type them and follow the same pattern.
> 
> Constraints:
> - Fix the root cause. Good options are an explicit type annotation, splitting the expression, or naming an intermediate type. Do not use `// @ts-ignore`, `@ts-expect-error`, `as any`, or loosen `tsconfig.json`.
> - Keep the module statically inspectable (AGENTS.md):
>   - literal event names
>   - direct `$.namespace.method(...)` calls
>   - no aliasing or destructuring of `$`
> - Don't change runtime behavior or touch other mods. Don't add tests or docs.
> 
> Done when: the gate passes for `bws-board` with no new errors in other mods, and `tsc` succeeds using `bws-board/tsconfig.json`. Keep working until those checks pass, then stop and report:
> - what caused the deep instantiation
> - the change you made
> - the gate output

**new** (157 words)

> The bws-board type check passes again under the project's gate, without changing the mod's behaviour. Right now the gate fails with:
> 
> <error>
> bws-board: tsc failed
> hooks/register.tsx(212,15): error TS2589: Type instantiation is excessively deep and possibly infinite.
> </error>
> 
> Fix the cause of the deep instantiation. Do not use `@ts-ignore`, `any` casts, or loosened compiler settings just to quiet the error. Treat the generated `.claude-plugin/types/` declarations as authoritative, and don't edit them. Keep the module statically inspectable as AGENTS.md describes: literal event names, direct `$.namespace.method(...)` calls, and no aliasing or destructuring of `$`. If the error comes from the generated declarations and can't be avoided in the mod's code, stop and report what you found instead of working around it.
> 
> Done when: the gate runs clean for bws-board, and bws-board's existing tests still pass. Keep working until those checks pass, then stop and report what caused the error and what changed. Don't add tests or docs beyond the fix.

### dark-mode: `add a light/dark theme toggle to the cockpit dashboard`

**old** (300 words)

> Add a light/dark theme toggle to the cockpit dashboard in the `bws-cockpit` mod.
> 
> **Context**
> - I haven't said where the dashboard renders or how it is styled now. Before editing, read `bws-cockpit/` (`hooks/`, `kit.json`, `README.md`, `CHANGELOG.md`) and the generated `.claude-plugin/types/` declarations.
> - Find the `ui.render` handler that draws the dashboard and how its colors are currently set.
> - Check whether `bws-kit/` or another mod already has a toggle, button, or theme pattern you can follow.
> - Use `/plugin-authoring` while working.
> 
> **Steps**
> 1. Run `claude --version`. Following AGENTS.md, state the visible behavior and the smallest acceptance check before you edit.
> 2. If the dashboard has no central place for colors, or the right control isn't clear, stop and ask me. Do that before restructuring anything.
> 3. Add the toggle with a stable control identifier and wire it to the matching event.
> 4. When the theme changes, redraw using the documented invalidation API.
> 5. Choose the state lifetime on purpose and say which one you chose and why. If you persist the choice beyond a module variable, define what happens after `/clear`, `/resume`, and `/branch`.
> 
> **Constraints**
> - Follow AGENTS.md's static-analysis rules: literal event names, direct `$.namespace.method(...)` calls, and no aliasing or destructuring of `$`.
> - Use no Node built-ins or npm imports.
> - Leave unrelated cockpit behavior and other mods untouched.
> - Don't add other theme options or settings.
> - Don't add tests or docs beyond a CHANGELOG entry, if that file is how this mod records changes.
> 
> **Done when**
> - Mod validation lists every intended hook and API call.
> - The existing tests in `bws-cockpit/tests/` pass. Find out how they run first.
> - After `/reload-plugins`, the toggle switches the dashboard between light and dark.
> 
> Keep working until these checks pass, then stop and report what changed and how you verified it.

**new** (177 words)

> Give the bws-cockpit dashboard a control that switches it between a light and a dark theme. The dashboard should redraw in the chosen theme straight away.
> 
> Context: this is a Claude Code mod. AGENTS.md covers the rules for interface, state and static inspection. Treat the generated `.claude-plugin/types/` declarations as the authority on what mod elements can style. Use /plugin-authoring if it helps.
> 
> Constraints:
> - If the types don't let a mod control colours or styling in a way that makes a real light and dark difference, stop and report what is supported. Don't fake it.
> - Choose how long the theme choice lasts on purpose, and say what you chose.
> - Keep the dashboard's existing content and behaviour unchanged, and leave other mods alone.
> - Don't add tests or docs beyond what the project requires.
> 
> Done when:
> - The toggle switches the theme both ways and the dashboard redraws each time.
> - The mod's validation lists the intended hooks and API calls.
> - The bws-cockpit tests pass.
> 
> Keep working until these checks pass, then stop and report.

### method-given: `in bws-enhance commandsText, sort with a single comparator that ranks by source then name instead of the current rank-only sort`

**old** (253 words)

> In bws-enhance, change `commandsText` to sort with one comparator that orders by source first, then by name, instead of the current sort that only uses rank.
> 
> Context: `commandsText` lives somewhere in `bws-enhance/` (probably under `hooks/`). Find it first, along with the current rank-only sort. Read how source is represented on each command entry. If it is a field with its own ordering, such as a rank map or a list of source kinds, reuse that existing order for the primary key. Don't invent a new one. Then break ties by name. Use the comparison style the file already uses, or `localeCompare`, so the order is deterministic.
> 
> Constraints:
> - Keep the change scoped to the sort. Leave the output format, filtering and unrelated code alone.
> - Leave the module statically inspectable as AGENTS.md requires. That means top-level relative imports only, with no Node built-ins and no dynamic imports.
> - Ask me before changing behavior if "source" isn't a clear property, or if the current rank already folds source in some other way.
> - Don't add tests or docs beyond what's needed. If `bws-enhance/tests/` already covers `commandsText` ordering, update those expectations to the new order.
> 
> Done when:
> - `commandsText` uses a single comparator: source first, then name.
> - The existing `bws-enhance/tests/` suite passes. Find the test command from the repo, such as `package.json` or the README.
> - TypeScript type-checks against `bws-enhance/tsconfig.json`.
> 
> Keep working until those checks pass, then stop and report. Include the old and new comparator and a short example of the resulting order.

**new** (143 words)

> In bws-enhance, make `commandsText` order its commands with a single comparator that ranks by source first, then by name, replacing the current rank-only sort. This way commands that share a source come out in a stable, alphabetical order.
> 
> The developer chose this method (one comparator: source, then name), so keep it. Keep the existing source ranking as the primary key. Don't change which commands are included or how each one is formatted.
> 
> If `commandsText` or a source rank isn't where the request implies, stop and report what you found instead of guessing.
> 
> Don't add tests or docs beyond what the change requires. Keep working until the checks pass, then stop and report.
> 
> Done when:
> - `commandsText` output is grouped by source in the same rank order as before, and alphabetical by name within each source.
> - bws-enhance's existing tests and type check pass.

### perf: `enhance feels slow, speed it up`

**old** (329 words)

> Find out why the `bws-enhance` mod feels slow, then make it faster by fixing the actual source of the delay.
> 
> **Context**
> - The mod lives in `bws-enhance/`: `hooks/`, `tests/`, `types/`, `kit.json`, `README.md`.
> - It may use shared helpers from `bws-kit/` (e.g. `transcript.ts`, `summary.ts`, `runfolder.ts`). Check what it imports before assuming where the time goes.
> - I haven't pinned down which part feels slow. It could be startup in `session.start`, the hook that runs on submit or command, a model call, or rendering.
> 
> **Steps**
> 1. Read `bws-enhance/README.md` and the hook modules to understand the flow.
> 2. Run `claude --version` and check event and API signatures against the generated `.claude-plugin/types/` declarations. These are authoritative over online examples, per AGENTS.md.
> 3. Measure or reason concretely about where the latency is. Look for:
>    - work repeated on every event or render
>    - sequential awaits that could run in parallel
>    - oversized transcript or context reads
>    - handlers firing on unrelated events because matchers are missing
>    - a heavier model or longer prompt than needed
> 4. Fix the main cause. If the real fix is a trade-off I should decide, such as switching models or dropping context the output depends on, stop and explain it instead.
> 
> **Constraints (from AGENTS.md)**
> - Keep the module statically inspectable: literal event names, direct `$.namespace.method(...)` calls, and no Node built-ins or dynamic imports.
> - Preserve event behavior. Still call or return `next` as before, and respect `next.signal`.
> - Don't change what enhance outputs; only how fast it gets there.
> - Don't add tests or docs beyond what's needed. Add a `CHANGELOG.md` entry only if that matches how other changes are recorded.
> 
> **Done when**
> - The existing tests in `bws-enhance/tests/` pass. Find how the repo runs them first.
> - Validation still lists every intended hook and API call.
> - You can state what was slow and roughly how much faster it is now.
> 
> Keep working until these checks pass, then stop and report the cause, the change, and the evidence.

**new** (231 words)

> Make the bws-enhance mod noticeably faster without changing what it produces, because it currently feels slow in use.
> 
> It is not yet known where the time goes. It could be the mod's own handlers, rendering, repeated work, or a model or network call it waits on. Measure the slow path before changing anything. If most of the delay comes from something the mod cannot control, such as model response time, stop and report what you measured and what the options are. Do not trade away output quality or features to get speed.
> 
> Constraints:
> - Keep the mod's visible behaviour and output the same.
> - Follow AGENTS.md:
>   - Keep the module statically inspectable.
>   - Preserve `next` and event semantics.
>   - Use the generated `.claude-plugin/types/` as the source of truth for the API.
> - Leave other mods and `bws-kit` alone, unless the slowness is clearly in shared `bws-kit` code. If so, say so before changing it.
> - Do not add tests or docs beyond what the fix needs.
> 
> Done when:
> - You can show a before and after timing for the slow path, with a clear improvement.
> - bws-enhance's existing tests pass.
> - The mod still loads and validates with all its hooks listed.
> - Use /verify to confirm enhance still works end to end.
> 
> Keep working until these checks pass, then stop and report the cause, the change, and the measured gain.

### investigate: `why does $.model.fork fail on resumed sessions? just tell me, don't change anything`

**old** (257 words)

> Find out why `$.model.fork` fails on resumed sessions and explain the cause. This is investigation only: do not edit, create or delete any files.
> 
> Context:
> - Start by locating every call to `$.model.fork` across the mods (`grep -rn "model.fork"`). `bws-kit/classify-fork.ts` is a likely place to look, but confirm that from the code.
> - Check the exact signature and documented behaviour of `$.model.fork` in the locally generated `.claude-plugin/types/` declarations. AGENTS.md treats these as authoritative over online examples. Run `claude --version` too, since behaviour can differ from the 2.1.296 baseline.
> - AGENTS.md notes that `session.start` runs on mod start and reload but not after `/clear`, `/resume` or `/branch`. It also says module variables are temporary. Check whether the fork path depends on something initialised in `session.start` or held in module state. On resume, that state would be missing or stale, such as a session or transcript reference. Don't assume this is the cause; confirm or rule it out.
> - If the failure has a recorded error or a failing test under a mod's `tests/` folder, read it. You may run existing tests to observe the failure, but don't modify them.
> 
> Constraints:
> - Make no changes, and don't add tests or docs.
> - Separate what you confirmed from the code or types from what you are inferring.
> 
> Done when: you can name the root cause with file and line references, show the code path that breaks on `/resume`, and briefly say what a fix would involve without applying it. Keep working until you reach that point, then stop and report.

**new** (173 words)

> Find out why `$.model.fork` fails in sessions that have been resumed with `/resume`, and explain the cause. This is a diagnosis only, so don't edit any files.
> 
> Context: the generated `.claude-plugin/types/` declarations are authoritative over online docs. AGENTS.md notes that `session.start` does not run after `/resume`. Any state that is set up there or held in module variables may be missing in a resumed session. Check whether that applies here, but don't assume it. `bws-kit/classify-fork.ts` and the mods that call `$.model.fork` show how it is used in this repo. Note the installed `claude --version`, because behaviour may differ by release.
> 
> If you can't confirm the cause from the code and the types, say what you could establish and what is still unconfirmed. Don't guess.
> 
> Done when: you have reported the failure as it shows up (error or behaviour), the root cause with file and line references or type evidence, and the Claude Code version it applies to. Keep going until you have that, then stop and report. No code changes, tests or docs.

### new-mod: `new mod that shows how many tokens the current turn used in the status line`

**old** (333 words)

> Create a new mod in this repo that shows, in the status line, how many tokens the current turn has used.
> 
> Context
> - Each mod is a sibling folder at the repo root, such as `bws-notify/` or `bws-summary/`. Pick one or two that render UI and follow their layout: `.claude-plugin/`, `hooks/`, `tests/`, `types/`, `kit.json`, README, CHANGELOG, tsconfig. Check `.claude-plugin/marketplace.json` for how mods are registered, and add the new one the same way.
> - Use a descriptive `bws-` name (for example `bws-turn-tokens`), checked against existing names.
> - Use `/plugin-authoring` to guide the build.
> 
> Steps
> 1. Run `claude --version`. Read the generated `.claude-plugin/types/` declarations, which take precedence over online examples. From them, find:
>    - the `ui.render` site for the status line
>    - which event exposes per-turn token usage (for example `turn.step` or `turn.complete`)
>    - the invalidation API for redrawing
> 
>    If no event exposes token counts, stop and report that.
> 2. Before editing, state the visible behavior and the smallest acceptance check (AGENTS.md "Establish the contract"). Assumption to confirm in your report: the count updates live during a turn, resets when a new turn starts, and shows the last turn's total while idle.
> 3. Implement it in `hooks/register.ts`.
> 
> Constraints (from AGENTS.md)
> - Keep the module statically inspectable: literal event names, direct `$.namespace.method(...)` calls, and no Node or npm imports.
> - Observe-only hooks return `next(e)`. Extend the existing status line through `next` instead of replacing it, so other mods and the default content still render.
> - Keep state in module scope or `$.state` deliberately. Decide what happens after `/clear`, `/resume` and `/branch`, given that `session.start` doesn't rerun after those.
> - Don't add tests or docs beyond what the existing mods' conventions require.
> 
> Done when
> - Validation lists every intended hook and API call.
> - Any tests you added, following the pattern of other mods' `tests/`, pass.
> - After `/reload-plugins`, the status line shows a token count that changes across a turn.
> 
> Keep working until these checks pass, then stop and report what you verified and any assumptions.

**new** (186 words)

> Add a new mod to this repo that shows, in Claude Code's status line, how many tokens the current turn has used. This lets the user see turn cost at a glance.
> 
> Context: follow AGENTS.md. Use `/plugin-authoring`, and treat the generated `.claude-plugin/types/` declarations as authoritative. Check `claude --version` against the requirements. Match the layout and naming of the existing `bws-*` mods.
> 
> Constraints:
> - Read-only: observe events and pass them through, so other mods and normal behaviour are unaffected.
> - Request no capabilities beyond what this needs.
> - Define what the display shows between turns and after `/clear`, `/resume` and `/branch`.
> - If the types do not expose per-turn token usage, or do not offer a status-line render site, stop and say so rather than estimating or building around it.
> - Don't add tests or docs beyond what the existing mods' conventions require.
> 
> Done when:
> - The mod loads after `/reload-plugins`, and validation lists every intended hook and API call.
> - During and after a turn, the status line shows that turn's token count.
> 
> Keep working until these checks pass, then stop and report what you verified.

### docs: `the bws-kit readme is out of date, update it`

**old** (287 words)

> Bring `bws-kit/README.md` up to date with what `bws-kit/` actually contains and does today.
> 
> Context: `bws-kit/` is the shared library the other `bws-*` mods use. It has no `.claude-plugin/` or `kit.json`. It holds `classify-fork.ts`, `raster.ts`, `runfolder.ts`, `summary.ts`, `tab.ts`, `transcript.ts`, plus `hooks/` and `tests/`. I haven't said what's stale, so you'll need to find that yourself.
> 
> Steps:
> 1. Read the current README. Then read each module in `bws-kit/` and note what it exports and what it's for.
> 2. Find out which mods use which modules. Grep for imports of `bws-kit` across the `bws-*` directories, and check any `kit.json` files to see what they reference. The README should describe real usage.
> 3. Compare the README against the code. Look for modules it doesn't mention, sections about modules or exports that no longer exist, and signatures or examples that have changed.
> 4. Fix those gaps in place. Keep the README's existing structure and tone where they still work.
> 
> Constraints:
> - Only describe what the code actually does. If something's purpose isn't clear from the source or its callers, mark it as unclear in your report instead of guessing.
> - Keep any statements about mod rules consistent with AGENTS.md. In particular, modules use only relative imports or `claude-code`, with no Node built-ins or npm packages.
> - Change only `bws-kit/README.md`. Don't edit code, other READMEs, or CHANGELOGs, and don't add tests or other docs.
> 
> Done when: every exported module and function in `bws-kit/` is described accurately, nothing in the README refers to code that no longer exists, and any code examples match the current signatures. Keep working until those checks pass, then stop and report. In the report, list what was out of date, what you changed, and anything you marked as unclear.

**new** (205 words)

> Bring bws-kit/README.md up to date so it accurately describes what bws-kit currently contains and how the mods in this repo use it. Someone reading it should get a correct picture without having to open the source.
> 
> Context: bws-kit is the shared code used by the other bws-* mods. It holds modules such as classify-fork.ts, raster.ts, runfolder.ts, summary.ts, tab.ts and transcript.ts, plus its own hooks/ and tests/. Treat the code as the source of truth. Where the README describes something that no longer exists, remove it or correct it. Where code exists that the README does not mention, add it.
> 
> Constraints:
> - Change only the README. Do not edit code to make it match the docs.
> - Keep the existing tone and structure where they still fit.
> - If you can't tell from the code whether something is intended, deprecated or internal, don't guess. Flag it in your report.
> - Don't add other docs or tests.
> - Keep working until the README matches the code, then stop and report.
> 
> Done when: every module, export and usage the README describes exists in bws-kit as described, and nothing significant in bws-kit is missing from it. Finish by reporting a short list of what changed and any open questions.
