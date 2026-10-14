# Prompt Upgrade (bws-better): plan

## Finish line
- `bws-better/` mod: `/better <prompt>`, `/better`, `/better on|off`, `/better history`; four-step pane (Your prompt, Questions, Rewrite, Review); nothing runs until Run.
- Auto mode intercepts composer prompts; slash commands, attachments, mid-turn prompts, short replies, `>`-prefixed (stripped) and the mod's own submits pass.
- Tests: intercept/pass, parse questions, parse rewrite, /better to Run, Cancel restores, on/off. Also: error card, history reopen, layout rows at 40 and 160 columns.
- `claude plugin validate`, `claude plugin test` and tsc are clean. Added to `.claude-plugin/marketplace.json`. README.

## Shape
- `hooks/lib.ts`: pure code for interception, prompts, reply parsing, big digits, rows sized to the width, and history.
- `hooks/register.tsx`: the only file that uses `$`. State is in `$.state` (flow, auto, history, armed). Auto mode and history persist in `$.store`.
- Model: the `model` option (default `haiku`). Two calls: questions as JSON, then the rewrite as JSON.
- Loop guard: only `origin.kind === 'composer'` is intercepted, and Run submits as the plugin (`asUser`).
- Edit: the upgrade goes into the prompt box, and the pane closes. A one-shot `armed` flag lets the next Enter through.
- Reload: on `session.start`, a flow in `reading` or `rewrite` restarts its model call. An attempt counter discards stale replies.
