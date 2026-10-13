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
| `/explain [decide \| close \| text]` | Decision tree of the last reply's options (see below). With text, reads the text instead of the last reply. |

The pane has New fork, Close, Stop, an Ask box, and ↑/↓ buttons that scroll the transcript half a pane at a time. It takes the keyboard when it opens (so you can type at once), and a long answer never pushes the Ask box or Stop out of view: the transcript is drawn as rows sized to the pane. Stop (and New fork or Close mid-answer) ends the child process at once, even while it is still thinking. In headless runs the built-in commands are left alone.

## Decision tree (`/explain`)
When a reply lists options (`1.` `2.`, `a)` `b)`, `Option A:` headings), `/explain` reads them and opens the **Decision tree** pane at the root: the question and one button per option.

- **Explore** (press an option): a fork answers the follow-up questions about that option and asks the next decision, if there is one. Its reply becomes the next node: options again, or a free answer. The fork is the side chat's own child (`claude -p --resume <id> --fork-session`, no mods, `sideTools` only): the root's options fork the main conversation, deeper ones fork the fork that wrote their node, so branches never share a session. At most two explorations run at once. The **Or ›** box takes your own answer, which is explored like an option.
- **Back** goes to the earlier question; picking another option grows a sibling branch and keeps the first. An option already explored is shown, not explored again; a failed one can be explored again.
- **Map** shows the whole tree (the current node marked `>`); pick a node to go there. **Node** returns.
- **Decide** sends one paragraph into the main session: each question on the path, the option taken, what exploring found, and a question still open. It is sent as you, just after the press (or `/explain decide`) returns.
- **Close** (or `/explain close`) ends any running exploration and clears the tree. A new `/explain` replaces the tree.

A reply counts as offering a choice only when it asks something or talks about options; plain numbered steps are not read. The tree holds at most 30 nodes, 6 questions deep. A failed or timed-out exploration marks its node failed with the reason and writes one line to the debug log (no prompt text). Headless, `/explain` answers with the root and its options as text; nothing is explored. The summary atom (`bws-sidechat` / `summary`) reads `tree N nodes`, or `tree exploring N` while forks run.

## Hotkey
The terminal footer carries a small `◨ side` button. Press it, or a chord bound to it, to open the side chat (the one that is there, or an empty one) and take the keyboard, with no command typed. A mod cannot bind a chord itself; the button borrows one of Claude Code's keybinding actions (`chordAction`, default `app:cycleDiffBase`, which only the diff pane handles), and you bind a chord to that action. Add this to `~/.claude/keybindings.json` on each computer:

```json
{
  "bindings": [
    { "context": "Global", "bindings": { "ctrl+x ctrl+o": "app:cycleDiffBase" } }
  ]
}
```

(merge it into the file if you already have bindings). `ctrl+x ctrl+o` is free in Claude Code 2.1.296; any chord works. While the `/diff` pane is open the chord belongs to it. The footer is shared with other mods: bws-enhance 0.2.1 or later draws its `✦ enhance` button beside `◨ side` (older bws-enhance drew its own footer and hid it). With text in the prompt box the pane opens but the keyboard stays with you (`ctrl+x tab` or a click moves it). `chordAction` empty hides the button.

## Install on another computer
The repository is private, so the computer needs GitHub access first (`gh auth login`, or an SSH key). Then:

```bash
claude plugin marketplace add bsmi021/bws-claude-mods
claude plugin install bws-sidechat@bws-mods
```

## Options (`/plugin` config)
`takeOverFork`, `takeOverBtw` (off = built-in command), `sideTools`, `sideModel`, `loadMcpServers`, `claudePath`, `chordAction`. Decision tree: `exploreTimeoutSeconds` (default 180: an exploration that has not answered by then is ended and its node marked failed), `treeDumpFile` (default empty; a path: the tree is written there as JSON after every change, for checks and probes). Explorations use `sideModel`, `sideTools`, `loadMcpServers` and `claudePath` like the side chat.

## Notes
- The fork sees the main session as last written to disk, so a turn still in flight is seen up to its last saved message.
- Each fork is a real session file (`claude --resume <id>` opens it). It may also appear on the session board.
- Tested on Claude Code 2.1.296, Windows 11, Windows Terminal at 120 columns. By hand (0.1.0): `/btw`, `/fork` and `/side` opening the pane beside another pane and answering from the fork. Automated (0.1.3: 57 tests): commands, focus requests, the row-windowed transcript, scroll steps, Stop killing the child, and the hotkey button (its action, press, and absence when off, headless or on the desktop). The Stop kill command was also run against a real long `claude -p` child. Not checked by hand: the footer button and chord in a live terminal, keyboard focus on open, scroll on a long answer, narrow terminals, the desktop app.
- 0.2.0 (decision tree), Claude Code 2.1.296, Windows 11: static validation; automated tests (118, the 58 earlier ones unchanged): the parser on reply samples, the tree, `/explain` (pane and headless text), Explore with stubbed children (next node, free answer, fork of the parent's fork, two at most, error / exit / timeout), Back, branch, Map, Close, scrolling, Decide's deferred send, the desktop pane in the test engine; a headless `claude -p "/explain ..."` probe (state dump). Not checked by hand: the pane in a live terminal or the desktop app, the focus ring on open, a real Explore fork's reply, Decide in a live session.
