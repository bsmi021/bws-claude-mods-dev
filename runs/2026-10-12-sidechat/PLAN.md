# bws-sidechat: side chat in the right-hand pane

## Finish line (done = all true)
1. `/fork` (and `/branch`) opens a pane on the right with a fresh side chat forked from the current conversation. The main conversation gets no new messages.
2. `/btw <question>` opens the same pane and the answer shows there, not in the main transcript.
3. In the pane I can type follow-ups (Input) and each gets answered in the fork, with its context (history, project files) and read-only tools.
4. `/side [new|close]` is the plugin's own entry point; `/fork native` passes through to the built-in fork.
5. `claude plugin validate`, `claude plugin test`, tsc 5.x all pass. Live check with `claude -p` proves the fork turn works (fork session id differs, main transcript unchanged).
6. Added to CLAUDE_CODE_PLUGIN_DIRS only after the above (user's settings.json: ask first or tell).

## Design
- Backend = real fork, not `$.model.fork`: `claude -p <msg> --resume <mainId> --fork-session --output-format stream-json --verbose --include-partial-messages` (first turn), then `--resume <sideId>` (later turns). Gives full prior context + tools; main session untouched. Spawned with `$.process.spawn` (claude.exe, no shell).
- Tools in the side chat: `--allowedTools Read,Glob,Grep,WebFetch,WebSearch` (userConfig `sideTools`). Anything else is denied (headless, no prompt).
- Pure module `side.ts` (arg builders, stream-json line parser, transcript reducer) tested directly; `register.tsx` is the only file using `$`.
- State via atoms (`PluginState` contract in types/index.d.ts).

## Out of scope
Session-bus integration, persisting side chats across restarts, permission prompts inside the pane.
