# bws-sidechat

A side chat in the right-hand pane. `/fork`, `/branch` and `/btw` open a copy of the current conversation beside it; you ask in the pane, the main conversation is never touched.

## How it works
Each side message runs a headless `claude -p`. The first one forks the main session (`--resume <main> --fork-session --session-id <new>`); later ones resume the fork. So the side chat has the full context, history included, and its own tools. Streamed text shows live in the pane.

The child runs with `CLAUDE_CODE_PLUGIN_DIRS` emptied (faster start, no side-of-side) and, by default, no MCP servers (`--strict-mcp-config`). Tools it may use without asking: `Read,Glob,Grep,WebFetch,WebSearch`. It cannot ask permission, so anything else is denied.

## Commands
| Command | Does |
|---|---|
| `/fork`, `/branch` | (replaces the built-in background-agent fork and branch) New side chat forked from the conversation as it stands. Text after it is sent as the first message. `/fork native` runs the built-in fork. |
| `/btw <question>` | Answer in the side chat. Continues an open side chat; forks if none. |
| `/side [new [msg] \| close \| msg]` | The plugin's own entry point. |

The pane has New fork, Close, Stop, an Ask box, and ↑/↓ buttons that scroll the transcript half a pane at a time. It takes the keyboard when it opens (so you can type at once), and a long answer never pushes the Ask box or Stop out of view: the transcript is drawn as rows sized to the pane. Stop (and New fork or Close mid-answer) ends the child process at once, even while it is still thinking. In headless runs the built-in commands are left alone.

## Options (`/plugin` config)
`takeOverFork`, `takeOverBtw` (off = built-in command), `sideTools`, `sideModel`, `loadMcpServers`, `claudePath`.

## Notes
- The fork sees the main session as last written to disk, so a turn still in flight is seen up to its last saved message.
- Each fork is a real session file (`claude --resume <id>` opens it). It may also appear on the session board.
- Tested on Claude Code 2.1.296, Windows 11, Windows Terminal at 120 columns. 0.1.0 by hand: `/btw`, `/fork` and `/side` opening the pane beside another pane and answering from the fork. 0.1.1: 48 automated tests, plus the Stop kill command run against a real long `claude -p` child (found by session id, killed, output stopped). Not re-checked by hand in a terminal: keyboard focus on open, the scroll buttons on a long answer, narrow terminals, the desktop app.
