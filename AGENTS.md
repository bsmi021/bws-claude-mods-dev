# Claude Code Mod Development

These instructions apply when creating or changing Claude Code mods in this project. Build the requested feature, preserve unrelated work, and report verified results. Place this file at the mod project's root. Claude Code's built-in `cc-plugin-agents-md` plugin loads `AGENTS.md`; keep it enabled.

## Choose the implementation

A mod runs JavaScript or TypeScript handlers inside Claude Code for UI, event interception, or direct commands. Consider settings hooks for scripts, skills for instructions, or MCP for external integrations.

Mods are not sandboxed; their processes run outside the Bash sandbox. Design access to secrets, files, session content, permissions, network, and model usage deliberately. Implement only requested capabilities. Never log secrets. Automatic tool approval requires an explicit feature request. Permission prompts cannot be restyled.

Source: [Mods overview](https://code.claude.com/docs/en/plugins/mods/overview).

## Establish the contract

- State the visible behavior and the smallest acceptance check before editing.
- Run `claude --version`. The documented baseline is **2.1.296**; verify requirements against the installed release.
- Use `/plugin-authoring` when available.
- Treat locally generated `.claude-plugin/types/` declarations as authoritative over online examples. Claude Code generates them when loading or reloading development mods.
- Prefer TypeScript when it clarifies event inputs and results; JavaScript is also supported.
- Claude Code loads JavaScript and TypeScript directly; no bundler is needed.

Create this structure:

```text
my-mod/
  .claude-plugin/plugin.json
  hooks/hooks.json
  hooks/register.ts
```

Use a descriptive plugin name and version in the manifest. In `hooks/hooks.json`, point to one module relative to that file:

```json
{ "modules": ["./register.ts"] }
```

Sources: [Overview](https://code.claude.com/docs/en/plugins/mods/overview), [Files and versioned types](https://code.claude.com/docs/en/plugins/mods/reference), [Creation guide](https://code.claude.com/docs/en/plugins/mods/create).

## Keep the module statically inspectable

Export `register(on, options)`. Use literal event names and direct `$.namespace.method(...)` calls. Do not alias, destructure, dynamically index `$`, or shadow `on`.

Use top-level ES module imports, with relative paths inside the plugin or the supported `claude-code` import. Avoid Node built-ins, npm imports, `require`, and dynamic imports. Pass `$` only to same-file, top-level helpers, apart from documented `$.state` callbacks.

Verify that validation lists every intended hook and API call.

Source: [Static analysis rules](https://code.claude.com/docs/en/plugins/mods/create#check-what-claude-code-reads-from-your-mod).

## Preserve event behavior

Each hook receives the mods API `$`, event `e`, and continuation `next`.

- **Observe:** perform the observation, then return `next(e)`.
- **Observe the result:** await `next(e)`, inspect its result, and return that result.
- **Rewrite:** pass a modified copy to `next`. Events are deeply frozen; preserve unrelated fields and nested properties.
- **Handle completely:** return the event's documented result without calling `next`. This prevents later handlers and Claude Code's normal behavior from running.

Use matchers to restrict handlers to relevant commands, tools, or components. Do not intercept unrelated events. Plan for other mods in the middleware chain. Verify the exact input and result types before implementing a denial, replacement result, prompt rewrite, or permission decision.

Source: [React to events](https://code.claude.com/docs/en/plugins/mods/events).

## Use the appropriate API

Use the mods API for effects outside the module: interface operations, files, processes, network requests, models, storage, and timers. Look up each method's actual signature in the generated declarations.

Register user commands and Claude-callable tools in `session.start`. For a command, pair `$.command.register(...)` with a `command.run` handler filtered to its name. Return `{ text }` for a transcript reply or `{}` when no reply is needed. Choose a name that does not collide with a built-in command. Use `immediate: true` only when the command should run while Claude is working.

For a tool, register its description and JSON Schema, then handle its fully qualified name: `mcp__<plugin-name>__<tool-name>`. Validate arguments and handle failures with a useful result.

Source: [Mods API](https://code.claude.com/docs/en/plugins/mods/api).

## Design the interface and state

Use `ui.render` for the intended render site. Return supported mod elements as plain data, or follow the documented JSX approach. Reuse Claude Code's existing rendering through `next` when extending a component.

Keep control identifiers stable and connect buttons, inputs, and selections to the corresponding events. Redraw when displayed data changes, using the documented invalidation API. Keep rendering fast and avoid unnecessary repeated work.

Choose state lifetime deliberately. Module variables are temporary. Consult the state guide for values that must survive reloads or sessions, and define behavior after `/clear`, `/resume`, and `/branch`. Use `$.state` or persistent storage according to the required lifetime, not as interchangeable mechanisms.

Source: [Interface and state guide](https://code.claude.com/docs/en/plugins/mods/interface).

## Check exact event contracts

Consult the generated types before selecting an event. Common choices include `tool.call`, `prompt.submit`, `command.run`, `turn.complete`, `session.start`, and `ui.render`.

`session.start` runs when the mod starts and after reloads, but not after `/clear`, `/resume`, or `/branch`. Design initialization accordingly. `turn.step` and `process.spawn` handlers are async generators; other event handlers are async functions. Respect `next.signal` cancellation and the available time budget. Do not invent a return shape from another event's example.

If using `$.state` or extending the mods API, provide the required type declarations and reference them in the manifest.

Source: [Mods reference](https://code.claude.com/docs/en/plugins/mods/reference).

## Develop and validate

Develop from the source directory with `claude --plugin-dir ./my-mod`. Check `/plugin` to confirm loading, then exercise the requested behavior. Development modules hot-reload; verify initialization and state after an edit. Respect Claude Code's protected-path and hot-reload approval prompts.

Run `claude plugin validate ./my-mod` and fix reported errors. Review its hook and API-call inventory. Validation proves static loading requirements, not runtime correctness.

For behavioral changes, add focused `.test.ts` tests importing `test` and `expect` from `claude-code/testing`. Run `claude plugin test` from the plugin directory. Stub downstream events and API calls; register stubs before the first test `$` call. Fire `session.start` explicitly when initialization matters. API stubs return `{ value }`; event stubs return the event's own result shape. Test normal behavior, the relevant failure branch, and unintended interception where applicable.

Source: [Testing guide](https://code.claude.com/docs/en/plugins/mods/test).

## Troubleshoot and hand off

If behavior is missing, check validation, module paths, the active-mod listing, and skip/refusal messages. Use `claude --debug` for diagnostics. Check workspace trust, disabled hooks, safe/bare mode, and organization policy. Report a policy block; do not alter settings to bypass it.

Verify drawings in the target app. Terminal and Desktop support mod UI with surface-specific limits; VS Code chat, noninteractive runs, and cloud sessions do not display it. Supply a useful text fallback when the feature needs one.

Keep source in a durable directory; session-created mods are temporary. Installed copies are version-cached: develop against source and bump the version for updates. Install with `claude plugin install <plugin>@<marketplace>`; run `/reload-plugins` in an existing session after shell installation or update.

Include a README stating purpose, loading commands, configuration, capabilities, and the Claude Code version and surfaces actually tested. Report static validation, automated tests, and interactive verification separately. Do not claim an untested surface works or publish without authorization.

Sources: [Troubleshooting](https://code.claude.com/docs/en/plugins/mods/troubleshoot), [Overview](https://code.claude.com/docs/en/plugins/mods/overview), [Creation and distribution](https://code.claude.com/docs/en/plugins/mods/create).

Documentation checked: 2026-10-02. Recheck local types and current official documentation when APIs differ.

Local Doc: ./docs/mods.md

## This repo

- `bws-cockpit/` is one plugin with many features. `hooks/register.tsx` is the only file that uses `$`; `lib.ts`, `shell.ts`, `loop.ts`, `finish.ts`, `projects.ts` and `handoff.ts` are pure and tested directly. `bws-shell-lint/` is separate.
- Each feature gets `runs/<date>-<slug>/` with PLAN.md (finish line first), RUNLOG.md and `receipts/`.
- Checks, all three before ending a turn: `claude plugin validate ./<plugin>`, `cd <plugin> && claude plugin test`, and tsc 5.x (strict, noUncheckedIndexedAccess) against `.claude-plugin/types/`. Validate does not type-check.
- Both plugins load in every session through `CLAUDE_CODE_PLUGIN_DIRS`, so a broken `register.tsx` breaks every new session.
- Validator rules: one unmatched hook per event, so merge into the existing `turn.complete` or `prompt.context` hook. Never name a local `next`.
- `$.prompt.submit` inside a `command.run` hook deadlocks: defer it with `$.clock.after`.
- `$.model.fork` gives `nothing-to-fork` on a resumed session's first command: fall back to `$.session.messages()` + `$.model.complete`.
- Wrapping the AskUserQuestion dialog in `ui.render`, the engine refuses `width` on any Box around it and more than 12 rows. It counts side-by-side siblings as stacked and the dialog itself as one row. Draw one Raster/Svg.
- A render rewrite of AskUserQuestion may not change previews; strip them from the input in `tool.call` instead.
- `Select` and `Input` are missing on mobile, but `'Input' in table` can still be true there at runtime: narrow with `e.surface !== 'mobile' && 'Input' in table`.
- Test stubs:
  - `fs.*` paths arrive with backslashes: normalize them.
  - A bottom `prompt.submit` stub must return `{ text }`.
  - `classic.Stop` and `turn.complete` need bottom stubs.
  - Unmount a pane before mounting it again.
  - `$.model.complete` stubs answer `{ value: { isAnswered, text, usage } }`. The stub's `next.signal` aborts with the caller's AbortController.
  - The test `$` has no `state` noun, and test hooks can't call `$.state`. Assert plugin state through `$.ui.mount` + `find`.
- Git Bash here halves backslash runs before bash sees them. Never put Windows backslash paths in heredoc or inline Python strings; use forward slashes, or the Edit/Write tools.
- Live checks: `claude -p "..." --plugin-dir ./<plugin> --output-format stream-json --verbose`.
  - Prefix slash commands with `MSYS_NO_PATHCONV=1`.
  - Pass plugin options with `--settings <file>` (`pluginConfigs`); it merges with user settings.
- Test terminals: the tool shell sets `NO_COLOR=1`, so clear it to see band colors. Launch `wt.exe` through a `.ps1` file, since `wt` splits commands on `;`.
- Guard and lint rules that block or rewrite match the command position only. Replay them over the real-command corpus before shipping.
- Generated `.claude-plugin/types/claude-code-mcp` is rewritten only on an interactive save; for a new plugin, copy a sibling's types and add its own `mcp__<plugin>__*` tool inputs by hand so tsc accepts the matchers.
  - `claude plugin test` regenerates that folder too and drops hand edits. Declare a plugin's own tool inputs instead as an `interface McpToolInputs` augmentation in its `types/index.d.ts` (bws-cockpit does).
- In the manifest's types contract (`types/index.d.ts`), an `import('…')` type makes the validator report every `PluginState` key as not declared. Write the shapes inline.
- Never push `main`: its `runs/` holds private prompts and transcripts. Publish only the orphan `publish` branch:
  - Refresh it in a scratch worktree with `git checkout main -- bws-cockpit bws-shell-lint`.
  - That checkout never deletes files the source commit dropped. Use `git restore --source=<commit> --staged --worktree -- <dirs>` instead, then confirm with `git ls-files` vs `git ls-tree -r --name-only <commit>` and `git diff --cached --quiet <commit> -- <dirs>`.
  - A fresh worktree has no `.claude-plugin/types/` (gitignored), so tsc fails with TS5083. Copy each mod's generated types folder in from the working tree first.
- Install: the published repo is the `bws-mods` marketplace (`.claude-plugin/marketplace.json`, installed from `bsmi021/bws-claude-mods`). While `CLAUDE_CODE_PLUGIN_DIRS` lists a mod's source folder, that source copy shadows the installed copy, so nothing loads twice.
  - Remote `mods` is the private repo github.com/bsmi021/bws-claude-mods. Its push rule maps only `publish` to `main`, so `git push mods` never sends this repo's `main`.
  - Scan for names, project and game names, serials and paths first.
