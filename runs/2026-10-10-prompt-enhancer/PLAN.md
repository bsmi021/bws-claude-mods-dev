# bws-enhance: prompt enhancer mod

## Finish line
- `/enhance <rough prompt>` (runs even mid-turn) asks a model to rewrite the rough prompt into a specific, actionable one,
  grounded in this session's instruction files (CLAUDE.md / AGENTS.md as loaded), the installed skills + slash commands,
  connected MCP servers, the project root and the recent conversation.
- The enhanced text replaces the prompt box draft. A band above the prompt shows `Send`, `Revert`, `Dismiss`.
- `Send` submits whatever is in the box now (so edits survive) as the user's own words, then clears the band.
  Pressing Enter yourself also works and clears the band.
- Headless (`claude -p "/enhance ..."`): prints the enhanced prompt as the command's output.
- Checks green: `claude plugin validate`, `claude plugin test`, tsc strict. One live `-p` run receipt.

## Out of scope (parked)
- Enhancing the draft already in the box without retyping (needs a key chord / band button on any draft).
- Auto-enhance on every submit.

## Design
- New plugin `bws-enhance/` (separate from cockpit so a break can't take cockpit down).
- `hooks/lib.ts` pure: context assembly, system prompt, reply cleanup. `hooks/register.tsx` only file using `$`.
- State in `$.state` atom `bws-enhance.view` {phase, original, enhanced, error}.
- Model: option `model` (default `sonnet`), 60 s timeout.
