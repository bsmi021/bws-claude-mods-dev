# bws-mods

Thirteen [Claude Code mods](https://code.claude.com/docs/en/plugins/mods/overview) for game and app development on
Windows. Each is a plugin of TypeScript hooks that runs inside Claude Code. Most of them show up as a tab in one place:
**bws-cockpit**'s dashboard, beside the transcript.

## The mods

### The dashboard and the team
| Mod | What it does |
|---|---|
| [bws-cockpit](bws-cockpit/README.md) | The dashboard pane (Assumptions, Shelf, Board, Loop, then a tab per loaded mod), an action bar above the prompt with the active run and live editor and device state, guards for Unreal, Unity and adb calls, a finish-line guard, a project locator, `/handoff` and a prompt-cache clock. |
| [bws-board](bws-board/README.md) | A blackboard for several Claude Code sessions in one repository: each posts what it works on, claims the files it edits, and asks the others for help. One session at a time runs git; commits and git commands that would clobber a peer's work are refused. |

### Better prompts
| Mod | What it does |
|---|---|
| [bws-enhance](bws-enhance/README.md) | `/enhance` rewrites a rough prompt into a specific one, grounded in the project's instructions; `/bounce` holds vague prompts before they are sent. |
| [bws-better](bws-better/README.md) | `/better` asks up to three quick questions, rewrites the prompt with a goal, audience, format and finish line, and shows the original and the upgrade side by side. Nothing runs until you press Run. |
| [bws-skillgate](bws-skillgate/README.md) | Cuts the skill listing the model reads down to the skills that fit your prompt, saving context on every request. Off by default. |

### Working beside the conversation
| Mod | What it does |
|---|---|
| [bws-sidechat](bws-sidechat/README.md) | A side chat in a forked session (full context, the main conversation untouched), with `/btw`, `/fork`, model choice, pull and send-back, and `/explain` decision trees. |
| [bws-diagram](bws-diagram/README.md) | After a big turn, a fork draws what happened as a flowchart in box-drawing characters; mermaid flowcharts in a reply are pinned there too. |
| [bws-memory](bws-memory/README.md) | Remembers what you said that is worth keeping, as memory files written by a fork in the background; `/dream` consolidates them with a preview, backups and undo. |
| [bws-interview](bws-interview/README.md) | Keeps every question-and-answer round with Claude per project; `/qa send` gives the agreed answers back after a compaction or in a new session. |
| [bws-design-picker](bws-design-picker/README.md) | When Claude asks you to choose a design direction, each option is drawn as a small colour mockup above the picker. |

### Guards and helpers
| Mod | What it does |
|---|---|
| [bws-secrets](bws-secrets/README.md) | A secret box: Claude asks with `request_secret`, you type the value into a masked pane, and Claude only ever sees `{{secret:NAME}}`. |
| [bws-shell-lint](bws-shell-lint/README.md) | Refuses Bash commands that will fail on Windows Git Bash (cut-off long commands, broken quoting, backslashes Python gets halved) and gives the exact fix. |
| [bws-notify](bws-notify/README.md) | Windows toasts that name the project and what happened: permission asks, finished turns, finished subagents, errors. |

## Install

The repository is a plugin marketplace named `bws-mods`. It is private, so the computer needs GitHub access to it first
(`gh auth login`, or an SSH key on the account). Add it once, then install the mods you want:

```bash
claude plugin marketplace add bsmi021/bws-claude-mods
claude plugin install bws-cockpit@bws-mods
claude plugin install bws-board@bws-mods
claude plugin install bws-enhance@bws-mods
claude plugin install bws-better@bws-mods
claude plugin install bws-skillgate@bws-mods
claude plugin install bws-sidechat@bws-mods
claude plugin install bws-diagram@bws-mods
claude plugin install bws-memory@bws-mods
claude plugin install bws-design-picker@bws-mods
claude plugin install bws-interview@bws-mods
claude plugin install bws-secrets@bws-mods
claude plugin install bws-shell-lint@bws-mods
claude plugin install bws-notify@bws-mods
```

Run `/reload-plugins` in any session that is already open. Install bws-cockpit with the others: their tabs live in its
dashboard.

### Update

```bash
claude plugin marketplace update bws-mods
claude plugin update bws-cockpit@bws-mods
```

Repeat the update line for each installed mod, then restart Claude Code or run `/reload-plugins`.

bws-assumptions and bws-shelf were folded into bws-cockpit (0.15.0). If you still have them, uninstall them first, or
`/idea`, `/shelf` and `/assumptions` are registered twice:

```bash
claude plugin uninstall bws-assumptions@bws-mods
claude plugin uninstall bws-shelf@bws-mods
```

### Load from source

```bash
claude --plugin-dir path/to/bws-cockpit --plugin-dir path/to/bws-board
```

Add one `--plugin-dir` per mod. To load them in every session, list the absolute paths (separated by `;` on Windows) in
`CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json`. A source folder listed there shadows the
installed copy of the same mod.

## Requirements

- Claude Code 2.1.296 or later (mods API). Checked up to 2.1.302.
- Windows 11, with Git Bash and PowerShell 7. bws-notify and bws-shell-lint are Windows-specific; the others are
  written for Windows and not checked elsewhere.
- Mod UI draws in the terminal and in the Desktop app; VS Code chat, headless (`claude -p`) and cloud sessions do not
  draw it, and the mods fall back to text there where they can.

## Develop

Each mod folder is a plugin (`.claude-plugin/plugin.json`, `hooks/register.ts[x]`, `tests/`). Check one with:

```bash
claude plugin validate ./bws-cockpit
cd bws-cockpit && claude plugin test
```

Each mod's README lists its commands, options, permissions and compatibility; its CHANGELOG lists the versions.

## License

[MIT](LICENSE)
