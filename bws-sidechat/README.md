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

## Hotkey
The terminal footer carries a small `◨ side` button. Press it, or a chord bound to it, to open the side chat (the one that is there, or an empty one) and take the keyboard, with no command typed. A mod cannot bind a chord itself; the button borrows one of Claude Code's keybinding actions (`chordAction`, default `app:cycleDiffBase`, which only the diff pane handles), and you bind a chord to that action. Add this to `~/.claude/keybindings.json` on each computer:

```json
{
  "bindings": [
    { "context": "Global", "bindings": { "ctrl+x ctrl+o": "app:cycleDiffBase" } }
  ]
}
```

(merge it into the file if you already have bindings). `ctrl+x ctrl+o` is free in Claude Code 2.1.296; any chord works. While the `/diff` pane is open the chord belongs to it. With text in the prompt box the pane opens but the keyboard stays with you (`ctrl+x tab` or a click moves it). `chordAction` empty hides the button.

## Install on another computer
The repository is private, so the computer needs GitHub access first (`gh auth login`, or an SSH key). Then:

```bash
claude plugin marketplace add bsmi021/bws-claude-mods
claude plugin install bws-sidechat@bws-mods
```

## Options (`/plugin` config)
`takeOverFork`, `takeOverBtw` (off = built-in command), `sideTools`, `sideModel`, `loadMcpServers`, `claudePath`, `chordAction`.

## Notes
- The fork sees the main session as last written to disk, so a turn still in flight is seen up to its last saved message.
- Each fork is a real session file (`claude --resume <id>` opens it). It may also appear on the session board.
- Tested on Claude Code 2.1.296, Windows 11, Windows Terminal at 120 columns. By hand (0.1.0): `/btw`, `/fork` and `/side` opening the pane beside another pane and answering from the fork. Automated (0.1.2: 56 tests): commands, focus requests, the row-windowed transcript, scroll steps, Stop killing the child, and the hotkey button (its action, press, and absence when off, headless or on the desktop). The Stop kill command was also run against a real long `claude -p` child. Not checked by hand: the footer button and chord in a live terminal, keyboard focus on open, scroll on a long answer, narrow terminals, the desktop app.
