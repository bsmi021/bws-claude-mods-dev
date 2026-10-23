# Eval: old vs new /enhance rewriter

10 rough requests x 3 samples, through the real mod (`claude -p "/enhance ..." --plugin-dir`, enhancer model haiku, the default). Blind pairwise judge opus (A/B shuffled).

**Pairwise:** new 29, old 1, tie 0 (of 30)

| Rubric (1-5, mean) | old | new |
| --- | --- | --- |
| outcome | 3.30 | 4.67 |
| method_left | 2.13 | 4.53 |
| intent | 3.73 | 4.57 |
| grounded | 2.50 | 4.47 |
| verifiable | 4.00 | 4.10 |
| concise | 2.43 | 4.63 |

| Mechanical (all rewrites) | old | new |
| --- | --- | --- |
| mean words | 193.0 | 101.3 |
| mean step_lines | 3.5 | 0.0 |
| mean paths | 2.6 | 1.2 |
| has steps_header | 9/30 | 0/30 |
| has done_when | 29/30 | 29/30 |
| has meta | 0/30 | 0/30 |

## Per case

| case | kind | winners | judge's reason (s0) |
| --- | --- | --- | --- |
| typo | trivial | new, new, new | A states the end state and a checkable diff-based finish line in two lines. B adds a step list for a trivial edit, names a repo ('bws-claude-mods-dev') that was not in the context, and pads the prompt with boilerplate. |
| linux-tests | bug | old, new, new | B opens on the end state and keeps the developer's scope, though it adds a Steps list and misses the bounce.test.ts that is visible in the file tree; A invents facts ('bws-better-style', off/warn/block modes, macOS/Windows) and wrongly bars fixing the test setup. |
| it-ref | vague reference | new, new, new | A states the end state and a runnable check without prescribing a method, while B lays out investigation steps, restricts the scope of the fix, and invents details such as `$` calls, literal event names and click handling. |
| pasted-error | pasted error | new, new, new | A states the end state and a clear finish line and leaves the fix to Claude; B prescribes reading and fix steps, sends Claude to hunt for a gate command that AGENTS.md already gives, and is padded. |
| dark-mode | large, unclear feature | new, new, new | A opens with the end state and leaves the design to Claude. B is a step-by-step plan that prescribes `ui.render`, `$.state` and a stable control identifier, none of which appear in the given context, and it assumes persistence the developer never asked for. |
| method-given | developer chose the method | new, new, new | A keeps the developer's chosen single source-then-name comparator and gives a clear finish line in two sentences, while B adds search steps, invented assumptions and an unsupplied `tsc --noEmit` command, and still omits the repo's real gate. |
| perf | performance | new, new, new | A prescribes a step sequence, bans caching and timeouts though the developer never did, and cites a `types/` directory and a `package.json` that aren't in the tree; B states the speed-up goal and a before/after timing finish line without inventing anything. |
| investigate | question / investigation | new, new, new | A stays read-only and outcome-focused with only vague unverified references, while B prescribes steps, invents a `.claude-plugin/types/` path and a session.start fact, and adds a suggested fix the developer did not ask for. |
| new-mod | new feature | new, new, new | A states the end state and a runnable finish line while leaving the design to Claude, whereas B prescribes numbered steps and file layout, cites paths and APIs not in the context (plugin.json, types/ declarations, register(on, options), $.namespace.method), and adds a reset-per-turn requirement and constraints the developer never asked for. |
| docs | docs | new, new, new | B leads with the end state and leaves the approach to Claude, while A lays out a read-then-list procedure, points at a bws-kit CHANGELOG that the file tree shows does not exist, and uses a tsc check that is invented and irrelevant to a README-only edit. |

## Rewrites (sample 0)

### typo: `fix the typo teh in the enhance readme`

**old** (136 words)

> Fix the typo "teh" in the README for the bws-enhance mod at bws-enhance/README.md, changing it to "the" wherever it appears as a standalone word.
> 
> Context: this is a documentation-only edit in the bws-claude-mods-dev repo. Limit changes to that file and leave the rest of the README's wording and formatting as it is.
> 
> Steps:
> 1. Open bws-enhance/README.md and find each occurrence of "teh" (search case-insensitively, and check that it is not part of a longer word or a code identifier).
> 2. Replace each real typo with "the" and keep the surrounding text unchanged.
> 
> Done when:
> - No "teh" remains in bws-enhance/README.md as a typo.
> - `git diff --stat` shows changes only to bws-enhance/README.md.
> 
> Do not add tests, docs, or other edits beyond this fix. Keep working until the checks pass, then stop and report which lines changed.

**new** (56 words)

> Fix the typo "teh" in the bws-enhance README (bws-enhance/README.md), changing it to "the" wherever it appears as a standalone word, and leave the rest of the file as it is.
> 
> Done when: the README contains no "teh" as a word, the diff touches only that typo, and `git diff` shows the change with no other edits.

### linux-tests: `make the bouncer tests pass on linux too`

**old** (221 words)

> Make the bouncer tests pass on Linux as well as on the platform where they already pass, without changing what they check.
> 
> Context: The bouncer is the mod behind `/bounce`, which holds a vague prompt before it is sent. Its tests are in that mod's `tests/` folder. Find them by searching the repo for "bounce" or "bouncer", since the exact location is not confirmed here. Run them on Linux first to see which fail and why.
> 
> Steps:
> - Find the root cause of each Linux failure, such as a macOS-only path or command, a hard-coded home directory, line-ending or case-sensitivity assumptions, or platform-specific test setup.
> - Fix the code or test setup so the suite runs on both platforms. Follow the approach the other mods' tests already use, if one exists.
> 
> Constraints:
> - Do not skip, delete, or weaken assertions, and do not hard-code expected values to make tests pass.
> - Do not add tests or docs beyond what this fix needs, unless the project requires them.
> - Follow the conventions in AGENTS.md.
> 
> Done when: the bouncer test suite passes on Linux using the project's test command (check the mod's package config or README for it), and its behavior on the existing platform is unchanged. Keep working until these checks pass, then stop and report the root cause and what changed.

**new** (154 words)

> The bouncer tests in the bws-better-style mods are not passing on Linux, and the goal is to make them pass there. The "bouncer" feature is the `/bounce` command (off, warn, block modes) from the mods listed in the project, so the tests most likely live under the bws-* mod that implements it. Find the mod and its tests, work out why they fail on Linux, and fix the cause in the code rather than skipping or special-casing the tests. Keep the behaviour on macOS and Windows unchanged.
> 
> Done when: the bouncer test suite passes on Linux with the project's test command, the same tests still pass on the other platforms if they can be checked here, and no tests are removed or skipped to get there. Keep working until those checks pass, then stop and report what was wrong and what changed. Do not add new tests or docs beyond what the fix needs.

### it-ref: `ok fix it`

**old** (213 words)

> Fix the bws-cockpit footer so its button stays visible below 100 columns by shortening its label instead of removing the button. At 99 columns the footer row currently drops the button entirely.
> 
> Context:
> - Find where the cockpit footer row is rendered and how the button's label and width are chosen. Start in bws-cockpit's hooks/ directory.
> - Reproduce the bug first: confirm the button is missing at 99 columns and present at 100.
> 
> Scope:
> - Change only the width-dependent logic for the footer button's label so a shorter label is used when space is tight.
> - Keep the layout at 100 columns and above unchanged, and keep the button's click handling and the other footer items as they are.
> 
> Constraints:
> - Follow AGENTS.md. Keep the module statically inspectable, use literal event names and direct `$` calls, and fix the cause rather than hard-coding a width.
> - Do not add new tests or docs unless the project requires them.
> 
> Done when:
> - At 99 columns the button is visible with a shortened label, and at 100 and above it looks as before.
> - The bws-cockpit test suite and type check pass. Find the commands in the project config.
> - Keep working until those checks pass, then stop and report what changed and the results.

**new** (97 words)

> The cockpit footer should keep its button visible when the terminal is narrower than 100 columns, shortening the button's label instead of dropping the button. Right now at 99 columns the footer row removes the button entirely.
> 
> Done when: at widths from 99 columns down to the narrowest the footer supports, the button stays rendered with a shortened label and the footer does not overflow; at 100 columns and wider the label is unchanged. Check this with the bws-cockpit tests, plus a test or render check covering the 99-column case, and confirm the bws-cockpit TypeScript build passes.

### pasted-error: `getting this when I run the gate, fix`

**old** (185 words)

> Fix the TypeScript error that fails the gate for the bws-board mod.
> 
> <error>
> bws-board: tsc failed
> hooks/register.tsx(212,15): error TS2589: Type instantiation is excessively deep and possibly infinite.
> </error>
> 
> Start by reading `bws-board/hooks/register.tsx` around line 212 and identifying the type or generic instantiation that recurses. Then fix the root cause, for example by simplifying the type or giving it an explicit annotation. Do not silence the error with `any`, a `@ts-ignore` comment, or a loosened tsconfig.
> 
> Constraints:
> - Keep the module statically inspectable, as `AGENTS.md` requires: the `register(on, options)` export, literal event names, and direct `$.namespace.method(...)` calls. Do not alias or wrap `$` to work around the type error.
> - Change only what this error needs. Do not refactor other hooks, and do not add tests or docs unless the project requires them.
> 
> Steps: find the gate command in the project's scripts or the bws-board README and run it. Also run tsc for `bws-board/tsconfig.json`.
> 
> Done when: tsc reports no errors for bws-board and the gate passes. Keep working until those checks pass, then stop and report the cause of the error and the change you made.

**new** (91 words)

> The bws-board TypeScript check fails with error TS2589 ("Type instantiation is excessively deep and possibly infinite") at hooks/register.tsx line 212, column 15. Fix the type error so the bws-board typecheck passes, without suppressing the error or loosening types to force it through. Keep the mod's behaviour unchanged.
> 
> <error>
> bws-board: tsc failed
> hooks/register.tsx(212,15): error TS2589: Type instantiation is excessively deep and possibly infinite.
> </error>
> 
> Done when: the TypeScript check for bws-board (the same `tsc` run as the gate, using the bws-board tsconfig.json) exits with no errors, and the bws-board tests still pass.

### dark-mode: `add a light/dark theme toggle to the cockpit dashboard`

**old** (178 words)

> Add a light/dark theme toggle to the bws-cockpit mod's dashboard. First, find where the cockpit renders its UI and how its colors are defined in `bws-cockpit/` and read `AGENTS.md` for the interface and state rules. Then add a control that switches the dashboard between light and dark, with the current appearance as the default. Assume the chosen theme should persist across reloads, using `$.state` or storage as the state guide directs. Keep the change limited to the theme: don't restyle unrelated components or add other settings.
> 
> Use `ui.render` for the toggle, keep its control identifier stable, and redraw when the theme changes. Follow the existing patterns in the cockpit's code.
> 
> Done when the project's module validation passes, the TypeScript build for `bws-cockpit` succeeds, and the existing `bws-cockpit/tests` still pass. Then run `/run` to launch the dashboard and confirm that the toggle switches both themes and the choice survives a reload. Keep working until these checks pass, then stop and report what you changed and what you verified. Don't add new tests or docs beyond what the project requires.

**new** (129 words)

> The bws-cockpit dashboard has a toggle that switches between light and dark themes, and the chosen theme is applied across the whole dashboard. Before editing, state the visible behavior and the acceptance check, following the mod guidance in AGENTS.md. Decide how long the chosen theme should last (for the current session only, or across reloads) and apply the matching state approach. Match the existing cockpit UI patterns and don't add features beyond the toggle.
> 
> Done when: the toggle switches the dashboard between light and dark, the project's bws-cockpit tests and type checks pass, and the mod loads after `/reload-plugins` with the toggle working in a screenshot or `/verify` run. Keep working until those checks pass, then stop and report. Don't add tests or docs beyond what the project requires.

### method-given: `in bws-enhance commandsText, sort with a single comparator that ranks by source then name instead of the current rank-only sort`

**old** (178 words)

> In `bws-enhance`, change the sort in `commandsText` to use one comparator that orders entries by source, then by name, replacing the current rank-only sort. Find the `commandsText` sort first by searching the mod's source, since I haven't confirmed where it lives. Assume source and name sort ascending by plain string comparison, and that rank is no longer a sort key. If rank is used anywhere else in that code, leave that use alone and say so in your report.
> 
> Keep the change limited to the comparator and its direct callers. Don't alter the output format or other commands.
> 
> Constraints:
> - Use one comparator with a source-then-name chain, not two sequential sorts.
> - Don't add tests or docs beyond what the project requires.
> 
> Done when:
> - The existing bws-enhance tests pass. Find the test command in the mod's README or config, and don't guess.
> - `tsc --noEmit` passes with the mod's `tsconfig.json`.
> - Keep working until those checks pass, then stop and report what changed, the comparator you wrote, and any assumptions you made about source order or rank.

**new** (67 words)

> In the bws-enhance mod, change the sorting of commandsText so that it uses one comparator ordering entries by source, then by name, in place of the current sort that orders only by rank. Keep the existing display output otherwise the same.
> 
> Done when: commandsText lists its entries ordered by source and then by name, with no separate rank-based sort remaining, and bws-enhance's tests and type check pass.

### perf: `enhance feels slow, speed it up`

**old** (172 words)

> Speed up the bws-enhance mod, which feels slow in use. Assuming "enhance" refers to the `bws-enhance/` plugin, start by reading its README, `hooks/`, and `types/` to see what it does. Then time a representative run to get a baseline and find where the time goes. Fix the root cause of the slow path. Don't hide it with caching or timeouts, and keep behavior identical.
> 
> Constraints from the project's AGENTS.md: keep the handlers statically inspectable (literal event names, direct `$.namespace.method(...)` calls, no aliasing, dynamic imports, or Node built-ins). Follow the `next(e)` and rewrite rules for events. Never log secrets. Don't add features or change public behavior.
> 
> Done when:
> - You report the baseline and the new timing for the same run.
> - The existing bws-enhance tests pass. Find the test runner in `bws-enhance/package.json` or `bws-enhance/tests/`.
> - The TypeScript check for bws-enhance passes using its `tsconfig.json`.
> 
> Don't add tests or docs beyond what's needed to verify the change. Keep working until those checks pass, then stop and report what was slow and what changed.

**new** (86 words)

> Make the bws-enhance mod respond noticeably faster, since it currently feels slow. Work out where the time goes before changing code, and keep the visible behaviour and output the same. Don't add tests or docs beyond what the project requires.
> 
> Done when: timings for the slow path are measured before and after and show a clear improvement, the existing tests in bws-enhance/tests and the type check from its tsconfig pass, and the report states the cause. Keep working until those checks pass, then stop and report.

### investigate: `why does $.model.fork fail on resumed sessions? just tell me, don't change anything`

**old** (183 words)

> Find out why `$.model.fork` fails on resumed sessions and report the root cause. Do not change any files.
> 
> Context: Check the exact signature and return type of `$.model.fork` in the generated declarations under `.claude-plugin/types/`, which AGENTS.md treats as authoritative. Note that `session.start` does not run after `/resume`, so any state or setup the fork depends on may be missing. Start from the mod's handlers that call `$.model.fork` and trace where their inputs come from.
> 
> Steps: Trace the call path from the handler to the failing call, identify what differs on a resumed session, and reproduce the failure if you can do so without editing project files. Quote any error text exactly.
> 
> Constraints: Read-only. Make no edits, commits, or new files, and do not add tests or docs. If something cannot be confirmed from the code, types, or a reproduction, say so rather than guessing.
> 
> Done when: you have a report that names the root cause with file paths and line references, the evidence behind it, and a suggested fix described in prose. Keep working until the report is complete, then stop and report.

**new** (125 words)

> Find out why `$.model.fork` fails on resumed sessions in this mod project, and report the cause with the evidence for it. Make no code changes.
> 
> Context: the failure only appears on resumed sessions, so the cause likely depends on how session state is restored after `/resume`. Check the generated declarations for the `$.model.fork` signature and the state guide's rules for session lifetime, and confirm the failure from the code and, if practical, a reproduction.
> 
> Constraints: do not edit, add, or delete any files, and do not run anything that changes project state.
> 
> Done when: you report the root cause, which file and line it comes from, the exact error or behavior observed, and the evidence that supports it, with no changes made to the repository.

### new-mod: `new mod that shows how many tokens the current turn used in the status line`

**old** (273 words)

> Create a new Claude Code mod in this project that shows the token count used by the current turn in the status line. Follow the mod layout in AGENTS.md: a new plugin folder with `.claude-plugin/plugin.json`, `hooks/hooks.json` pointing to a single `register.ts` module, and a static `register(on, options)` export.
> 
> Context:
> - Read `AGENTS.md` and `/plugin-authoring` first, and run `claude --version` to confirm the installed release.
> - Look at the existing mods in this repo (for example `bws-summary` or `bws-cockpit`) and match their layout and naming. Pick a plugin name that does not collide with them.
> - Before editing, find the event and status-line API in the generated `.claude-plugin/types/` declarations. Do not rely on online examples for signatures. If the API for reading per-turn token usage is not in those declarations, stop and report that instead of guessing.
> 
> Steps:
> 1. State the visible behavior and the acceptance check you will use.
> 2. Create the plugin structure and register the handlers using literal event names and direct `$.namespace.method(...)` calls.
> 3. Show the turn's token count in the status line, and reset it when a new turn starts.
> 
> Constraints:
> - Do not log session content or secrets.
> - Do not intercept events unrelated to the status line.
> - Implement only the token count; no extra features or settings.
> 
> Done when the mod validates without errors in Claude Code, the status line shows the current turn's token count during a test turn, and the count resets on the next turn. Keep working until these checks pass, then stop and report what you verified. Do not add tests or docs beyond what is asked unless the project requires them.

**new** (89 words)

> Build a new mod in this project that shows the token count for the current turn in the status line. Create it as its own plugin folder alongside the existing mods, following the mod conventions in AGENTS.md. Use `/plugin-authoring` if it helps.
> 
> Done when: the new mod loads in a development session, the status line shows the current turn's token usage and updates during the turn, and the mod's type-check and test commands pass. Confirm the display by running the mod in a session and observing the status line.

### docs: `the bws-kit readme is out of date, update it`

**old** (196 words)

> Update bws-kit/README.md so it matches the current state of the bws-kit module. Start by reading the README alongside the module's source files (classify-fork.ts, raster.ts, runfolder.ts, summary.ts, tab.ts, transcript.ts) and its tests and hooks directories, then list every exported function, command, or behavior the README describes that no longer matches the code, and every public capability the code provides that the README omits. Check the CHANGELOG.md in bws-kit as well, if present in the tree, for recent changes.
> 
> Scope: edit only bws-kit/README.md. Keep its existing structure and tone, and do not rewrite sections that are already accurate. Do not change any source, test, or config files, and do not add new documentation files or tests.
> 
> Where a claim cannot be confirmed from the code, leave it out rather than guessing, and mention it in your report.
> 
> Done when: every statement in the README can be traced to the current code, any names, paths, and signatures quoted in it exist in bws-kit, and running `npx tsc --noEmit -p bws-kit/tsconfig.json` (or the project's existing type-check script, if one is defined) passes. Keep working until these checks pass, then stop and report what changed and anything you could not verify.

**new** (118 words)

> The bws-kit README no longer matches the code in bws-kit/. Update it so every section describes the current modules and behavior (classify-fork.ts, raster.ts, runfolder.ts, summary.ts, tab.ts, transcript.ts, and the hooks/ and tests/ folders), and remove anything that refers to code that no longer exists. Keep the existing README structure and tone, and do not change any code.
> 
> Done when: each documented function, option, and file in bws-kit/README.md matches the current source, nothing in the README refers to removed code, and any tests or docs checks the project requires still pass. Keep working until those checks pass, then stop and report what changed. Do not add tests or docs beyond the README update unless the project's instructions require them.
