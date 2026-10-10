# bws-shelf: idea shelf

Park tangents instead of following them. You shelve an idea with `/idea`; Claude shelves its own through a tool.
`/shelf` brings the list back up in any later session.

## What it does
- `/idea <text>`: adds the idea to this project's shelf. It runs mid-turn and only shows a toast. Nothing goes to
  Claude or the transcript. A headless run prints `Shelved #N: ...`.
- `/shelf`: a pane listing this project's open ideas, newest first, eight at a time. Each row has three buttons:
  - `▶` puts the idea in the prompt box, unsent so you can edit it. The idea stays open.
  - `✓` marks the idea done.
  - `✗` drops it.

  Idea text wraps to the pane's width. Opened over an empty prompt box, the pane takes the keys: `a` toggles between
  this project and all projects, `c` or Esc closes it. Over a half-typed draft it opens without focus.
  `/shelf all` opens the pane with every project. A headless run prints the list.
- Claude's tools:
  - `mcp__bws-shelf__shelve_idea {text, detail?}` is always loaded. Its result tells Claude to carry on with the
    current task, and you get a toast.
  - `mcp__bws-shelf__list_ideas {scope?}` and `mcp__bws-shelf__close_idea {id, status}` load through ToolSearch.
- An attended conversation gets one line of context with its first message: the open-idea count at that moment, and
  the instruction to shelve tangents rather than follow them.

## Storage
One JSON file holds every project's ideas, so all sessions share the same shelf:
`<CLAUDE_CONFIG_DIR or ~/.claude>/idea-shelf/shelf.json`.
- Each idea records the session root as its `project`. "This project" compares paths without regard to case.
- Every change re-reads the file before writing it. Ideas another session added in the meantime are kept.
- Done and dropped ideas stay in the file with `closedAt`.

## Options (`pluginConfigs["bws-shelf"].options`)
- `shelfPath`: the shelf file. Empty uses the default above.
- `nudge` (default true): the per-prompt context line.

## Load
- Development: `claude --plugin-dir ./bws-shelf`. It is also listed in the user `CLAUDE_CODE_PLUGIN_DIRS`.
- Checks: `claude plugin validate ./bws-shelf`, `cd bws-shelf && claude plugin test`, and tsc 5.x strict against
  `.claude-plugin/types/`.

## Tested
Claude Code 2.1.296 on Windows.
- Static: validate passes and tsc strict is clean.
- Automated: 20 tests cover lib, both commands, all three tools, the context line and the pane buttons.
- Live headless (`claude -p`):
  - `/idea` saved without starting a model turn.
  - Asked to shelve a tangent, Claude called `shelve_idea` with no permission prompt or denial, then finished
    the task.
  - `/shelf` printed the list.
- Interactive terminal, checked by eye: the pane, ▶ ✓ ✗ and the scope toggle (0.1.0); wrapped text, focus on open,
  and `a`/Esc without a click (0.1.1). Not checked: Desktop. Mod UI does not show in VS Code chat or
  cloud sessions; there, ask Claude to list ideas.
