# bws-shelf: idea shelf mod

## Finish line
- `/idea <text>` (runs mid-turn) shelves an idea without touching the transcript: toast only. Headless: prints a line.
- Claude has `mcp__bws-shelf__shelve_idea`, `list_ideas`, `close_idea`; a one-line `prompt.context` nudge (attended
  sessions) tells it to shelve tangents instead of following them. The tool result says to continue the current task.
- `/shelf` opens a pane with this project's open ideas: Resume (fills the prompt box, no submit), Done, Drop.
  `/shelf all` shows every project. Headless: text list.
- One JSON file shared by every session: `<CLAUDE_CONFIG_DIR or ~/.claude>/idea-shelf/shelf.json`, re-read before every write.
- Checks green: validate, plugin test, tsc strict. One live `-p` receipt. Then added to user `CLAUDE_CODE_PLUGIN_DIRS`.

## Parked
- ~~Band/footer indicator with the open count~~: done in 0.1.2 as `$.ui.status`.
- Auto-detecting tangents in the user's prompt.
- Cross-machine sync.

## Design
- New plugin `bws-shelf/` (separate so a break can't take cockpit down). `hooks/lib.ts` pure; `hooks/register.tsx` the only `$` user.
- `$.fs` over `$.store`: the types don't promise concurrent sessions see each other's `$.store` writes.
- Pane state: `$.state` atom `bws-shelf.view` {scope, ideas, root}, reloaded on open and after each change.
