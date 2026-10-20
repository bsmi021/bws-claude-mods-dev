# bws-sidechat

> Ask side questions in a copy of your conversation, and explore the options in Claude's last reply as a decision tree, without touching the main conversation.

Interrupting a long session to ask "wait, what about X?" muddies the context. `/fork`, `/branch` and `/btw` open a copy
of the current conversation in the **Side chat** tab of the dashboard, answered by a forked headless session, so the
main conversation is never changed. `/explain` turns the options in Claude's last reply into a tree you explore branch
by branch in forks, then sends your decision back.

## Install

```sh
claude plugin marketplace add bsmi021/bws-claude-mods
claude plugin install bws-sidechat@bws-mods
```

Then `/reload-plugins`. Requires Claude Code 2.1.296 or later, and [bws-cockpit](../bws-cockpit/README.md) 0.21.1 or
later, which draws the tab. The repository is private, so the computer needs GitHub access first (`gh auth login` or an
SSH key). It shares the prompt footer with [bws-enhance](../bws-enhance/README.md).

## Use

| Command | What it does |
| --- | --- |
| `/fork`, `/branch` | Open a new side chat forked from the conversation as it stands. Text after the command is sent as the first message. Replaces Claude Code's own fork and branch; `/fork native` runs the built-in one. |
| `/btw <question>` | Answer in the side chat. Continues an open side chat, or forks one if none is open. |
| `/side [message]` | Open the tab and continue the side chat. With text, sends it. |
| `/side new [message]` | Start a new fork. |
| `/side close` | Close the side chat and end its process. |
| `/side model [name]` | Set the open side chat's model from the next message: `opus`, `sonnet`, `haiku`, any model id, or `default`. Bare, it reports the current one. |
| `/side refresh` | Fork again from the main conversation as it stands now. The transcript stays, and the next message carries a short replay of the earlier questions. |
| `/side pull [question]` | Add the main conversation's latest reply to the side chat as a message, with your question or a default one. |
| `/side send-back` | Send the side chat's latest answer into the main conversation, as you. |
| `/explain [decide \| close \| text]` | Build a decision tree from the last reply's options. With text, reads that text instead. `decide` and `close` act on the open tree. |
| `/side --<id> [text]` | The command twin of any button or box in the tab. |

### The Side chat tab

- Buttons: **New fork**, **Refresh**, **Pull**, **Close**, **Stop** (while it is answering), and an **Ask** box.
- A `model` row: default, opus, sonnet, haiku. The one in use is marked. **New fork** keeps it, and the decision tree's forks follow it.
- A `main:` status: `busy`, `N ahead` (main turns finished since the fork) or `in sync`.
- **Send to main** under every answer.
- Up and down buttons scroll the transcript.
- A command opens the tab with the keyboard on the Ask box, so you can type at once, during an answer and after it. A long answer never pushes the Ask box or Stop out of view.
- **Decision tree** switches to the tree view once `/explain` has built one; **Side chat** switches back.

The button ids behind the `/side --<id>` twins are `new`, `refresh`, `pull`, `end`, `older`, `newer`, `stop`,
`model-<name>`, `send-<message index>`, `ask-<n> <text>` and `tree` in the chat view; and `chat`, `map`, `back`,
`decide`, `tree-close`, `older-t`, `newer-t`, `opt-<option>`, `node-<id>` and `answer-<n> <text>` in the tree view.

### The footer button

The terminal footer shows a small `◨ side` button. Press it, or a chord bound to it, to open the side chat (the open
one, or an empty one) and take the keyboard, with no command typed. Mods cannot define keybinding actions, so the button
borrows one of Claude Code's own (`chordAction`, default `app:cycleDiffBase`, which only the diff pane handles). Bind a
chord to it in `~/.claude/keybindings.json` on each computer:

```json
{
  "bindings": [
    { "context": "Global", "bindings": { "ctrl+x ctrl+o": "app:cycleDiffBase" } }
  ]
}
```

`ctrl+x ctrl+o` is free in Claude Code 2.1.296; any chord works. While the `/diff` pane is open the chord belongs to it.
With text in the prompt box the dashboard opens but the keyboard stays with you (`ctrl+x tab` or a click moves it).
Setting `chordAction` to empty hides the button.

## What it does

### How the side chat works

Each side message runs a headless `claude -p`. The first one forks the main session (`--resume <main> --fork-session
--session-id <new>`); later ones resume the fork. So the side chat has the full context, history included, and its own
tools. Streamed text shows live in the tab.

- The child runs with `CLAUDE_CODE_PLUGIN_DIRS` emptied, so it starts faster and cannot open a side chat of its own.
- By default it loads no MCP servers (`--strict-mcp-config`). Turn on `loadMcpServers` to load them all.
- It may use only the tools in `sideTools` (default `Read,Glob,Grep,WebFetch,WebSearch`). It cannot ask permission, so anything else is denied.
- **Stop**, **New fork** and **Close** end the child at once, even while it is still thinking.
- The fork sees the main session as last written to disk, so a turn still in flight is seen up to its last saved message.
- Each fork is a real session file (`claude --resume <id>` opens it), and it may also appear on the session board.
- In headless runs the built-in `/fork`, `/branch` and `/btw` are left alone.

### Decision tree (`/explain`)

When a reply lists options (`1.` `2.`, `a)` `b)`, or `Option A:` headings), `/explain` reads them and switches the tab to
its **Decision tree** view at the root: the question and one button per option.

- **Explore** (press an option): a fork answers the follow-up questions about that option and asks the next decision, if there is one. Its reply becomes the next node: options again, or a free answer. The root's options fork the main conversation; deeper ones fork the fork that wrote their node, so branches never share a session. At most two explorations run at once. The **Or ›** box takes your own answer, which is explored like an option.
- **Back** goes to the earlier question. Picking another option grows a sibling branch and keeps the first. An option already explored is shown, not explored again; a failed one can be explored again.
- **Map** shows the whole tree, with the current node marked `>`; pick a node to go there. **Node** returns.
- **Decide** sends one paragraph into the main session, as you: each question on the path, the option taken, what exploring found, and any question still open. It is not offered while an option is still being explored.
- **Close** (or `/explain close`) ends any running exploration and clears the tree. A new `/explain` replaces the tree.

A reply counts as offering a choice only when it asks something or talks about options; plain numbered steps are not
read. The tree holds at most 30 nodes, 6 questions deep. A failed or timed-out exploration marks its node failed with the
reason and writes one line to the debug log (no prompt text). Headless, `/explain` answers with the root and its options
as text and explores nothing.

## Options

Set in `/plugin`, or under `pluginConfigs["bws-sidechat"].options` in `settings.json`.

| Option | Default | What it does |
| --- | --- | --- |
| `takeOverFork` | `true` | `/fork` and `/branch` open the side chat. Off: they stay Claude Code's own fork. `/side` always opens the side chat, and `/fork native` always runs the built-in fork. |
| `takeOverBtw` | `true` | `/btw` answers in the side chat. Off: `/btw` stays Claude Code's own side question. |
| `sideTools` | `Read,Glob,Grep,WebFetch,WebSearch` | Comma-separated tool names the side chat may use without asking. Anything else is denied. Read-only by default. |
| `sideModel` | empty | Default model alias or id for the side chat and its decision-tree forks. Empty: the session's model. The tab's model buttons (or `/side model <name>`) override it for the open side chat. |
| `loadMcpServers` | `false` | Off: the side chat starts with no MCP servers, which is much faster. On: it loads every configured server. |
| `claudePath` | `claude` | Path or name of the `claude` executable the side chat runs (not the npm `.cmd` shim). |
| `chordAction` | `app:cycleDiffBase` | The engine keybinding action the footer's side button borrows. Empty hides the button. |
| `exploreTimeoutSeconds` | `180` | Decision tree: an Explore fork that has not answered by then is ended and its node marked failed. |
| `treeDumpFile` | empty | Decision tree: empty is off. A path: the tree is written there as JSON after every change (for checks and probes). |

Decision-tree forks use `sideModel`, `sideTools`, `loadMcpServers` and `claudePath` like the side chat.

## Permissions and data

- **Runs** the `claude` executable named by `claudePath` as a child process for every side message and every Explore, with the tools in `sideTools` allowed. The default tools are read-only; the child can read files in your project and fetch web pages. It cannot ask permission, so nothing else runs. If you add write or shell tools to `sideTools`, the side chat can use them without asking.
- **Reads** the conversation, through the forked session, so the side chat sees everything the main conversation does.
- **Writes** a session file for each fork, in Claude Code's usual session store. It writes the state dump file only if you set `treeDumpFile`.
- **Ends processes**: Stop, New fork and Close kill the side chat's own child, found by its session id (`pkill -f` on macOS and Linux, a PowerShell `Stop-Process` on Windows).
- **Sends to the main conversation** only when you press **Send to main**, **Decide**, or use `/side send-back` or `/explain decide`. It is sent as a message from you.
- **Network**: only what the child's tools and model calls do. The mod makes no requests of its own.
- **Never** changes the main conversation otherwise.

## Compatibility

Checked on Claude Code 2.1.296 to 2.1.300 on Windows 11, in Windows Terminal. Live checks covered the side chat on
another model, the `main:` status, refresh, send-back, pull and a click on **Send to main**. Automated tests cover the
commands, the transcript window, Stop, the footer button and the decision tree with stubbed children.

- **Claude Code Desktop has its own native side chat.** There, `/side` opens the app's built-in fork and this mod's command never runs. Since 0.4.3 the footer `◨ side` button is drawn on Desktop and a click opens this mod's Side chat tab (automated tests; not yet checked live). The mod otherwise targets the terminal.
- Not checked by hand: the Decision tree in a live terminal (the automated tests and a headless `/explain` probe cover it), the chord in a live terminal, clicks on the model buttons, narrow terminals.
- The transcript is drawn as a fixed window of rows, laid out for 100 columns.

## License

MIT. Version history: [CHANGELOG.md](CHANGELOG.md).
