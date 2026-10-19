# Handoff: Manual checks of bws-secrets and the plugin cache decision

## Objective
This session ran manual checks of the `bws-secrets` `request_secret` tool and the numbered-option/decision flow. One real decision came out of it: a plugin's cache location. No plugin has been chosen to apply it to yet.

## Finish line
No checklist was agreed. What was asked:
- [done] Call `request_secret` with name `DEMO_TOKEN` and purpose "manual check".
- [done] Offer three cache-location options and record the user's choice. They chose option 1.
- [open] Apply the cache location to a plugin. Waiting on the user to name which one.
- [open] Shed colour question. Three options were offered and the user hasn't answered.

## Done so far
- `request_secret` (DEMO_TOKEN): the first call failed with "unasked below 144 columns (120 now)". After the user widened the terminal, the retry returned `saved as DEMO_TOKEN; use {{secret:DEMO_TOKEN}}`.
- Cache decision: option 1, the plugin's data folder (`${CLAUDE_PLUGIN_DATA}`), proposed as `${CLAUDE_PLUGIN_DATA}/cache/`.
- A Mermaid tea flowchart was given in chat. No file was written.
- No files were edited and no commits were made this session. The branch is `feat/video-mods`, with HEAD at `629144c` ("M8 T09, T11: harness gate passed at a46ea21; mod DONE"), from an earlier session.

## Next step
Ask the user which plugin should get the cache: `bws-cockpit`, `bws-shell-lint`, `bws-secrets`, or a new one. Then plan where it writes under `${CLAUDE_PLUGIN_DATA}/cache/`.

## Open items
- Plugin for the cache (waiting on the user).
- Shed colour choice: 1 sage green, 2 charcoal grey, 3 barn red (waiting on the user; not project work).

## Key files and commands
- Repo (worktree): `C:\Projects\bws.mods.claude-code-loop`
- Most recent run folder: `runs/2026-10-13-mods-m8-secrets`
- Checks before ending a turn (from `AGENTS.md`):
  - `claude plugin validate ./<plugin>`
  - `cd <plugin> && claude plugin test`
  - tsc 5.x (strict, noUncheckedIndexedAccess) against `.claude-plugin/types/`. Use the pnpm global typescript@5.8.3; the `tsc` on PATH is a bogus package.

## Decisions and constraints
- The cache goes in `${CLAUDE_PLUGIN_DATA}` (user's choice, option 1).
- Only `hooks/register.tsx` uses `$`; the other modules are pure and tested directly.
- Never push `main` to the `mods` remote. `git push private main` is fine.
- Keep to the task: no extra improvements. Write state to the run folder's `RUNLOG.md`.

## Watch out for
- `request_secret` needs a terminal at least 144 columns wide. If it's narrower, ask the user to widen it and call again.
- The user's messages sometimes arrive twice (mid-turn repeats, or /explain decision echoes). Don't repeat an action that already succeeded: calling `request_secret` again would overwrite the saved value.
- Another session (0b7f9c35) has claimed `bws-cockpit/hooks/register.tsx`. Check with `mcp__bws-board__board_status` before editing it.
