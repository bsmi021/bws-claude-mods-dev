# bws-sidechat

A side chat in the **Side chat tab** of bws-cockpit's dashboard (0.4.0; it was a pane of its own; needs bws-cockpit 0.21.0+). `/fork`, `/branch` and `/btw` open a copy of the current conversation beside it; you ask in the tab, the main conversation is never touched.

## How it works
Each side message runs a headless `claude -p`. The first one forks the main session (`--resume <main> --fork-session --session-id <new>`); later ones resume the fork. So the side chat has the full context, history included, and its own tools. Streamed text shows live in the tab.

The child runs with `CLAUDE_CODE_PLUGIN_DIRS` emptied (faster start, no side-of-side) and, by default, no MCP servers (`--strict-mcp-config`). Tools it may use without asking: `Read,Glob,Grep,WebFetch,WebSearch`. It cannot ask permission, so anything else is denied.

## Commands
| Command | Does |
|---|---|
| `/fork`, `/branch` | (replaces the built-in background-agent fork and branch) New side chat forked from the conversation as it stands. Text after it is sent as the first message. `/fork native` runs the built-in fork. |
| `/btw <question>` | Answer in the side chat. Continues an open side chat; forks if none. |
| `/side [new [msg] \| close \| model [name] \| refresh \| pull [question] \| send-back \| msg]` | The one door: everything the tab does has a `/side` form, and every button or box also has a twin `/side --<id> [text]`. `/fork`, `/branch` and `/btw` are shortcuts into it. |
| `/side model [name]` | The open side chat's model, from the next message: `opus`, `sonnet`, `haiku`, any model id, or `default` (the `sideModel` setting; empty there means the session's model). Bare, it reports the current one. |
| `/side refresh` | Re-fork from the main conversation as it stands now. The transcript stays; the next message carries a short replay of the earlier questions. |
| `/side pull [question]` | Add main's latest reply to the side chat as a message (with your question, or a default one). |
| `/side send-back` | Send the side chat's latest answer into the main conversation, as you. |
| `/explain [decide \| close \| text]` | Decision tree of the last reply's options (see below). With text, reads the text instead of the last reply. |

The tab has New fork, Refresh, Pull, Close, Stop, an Ask box, a `model` row (default, opus, sonnet, haiku; the one in use is marked; New fork keeps it; the decision tree's forks follow it), a `main:` status (`busy`, `N ahead`: main turns finished since the fork, or `in sync`), a `↩ Send to main` button under every answer, and ↑/↓ buttons that scroll the transcript half a window at a time. It asks for the keyboard when it opens (a fresh open of the dashboard) and the Ask box asks for the ring (so you can type at once; live in tmux on 2.1.302 the engine did not grant it, so typing went to the prompt box until the dashboard was focused), and a long answer never pushes the Ask box or Stop out of view: the transcript is drawn as a fixed window of rows, laid out for 100 columns. Stop (and New fork or Close mid-answer) ends the child process at once, even while it is still thinking. In headless runs the built-in commands are left alone.

## Decision tree (`/explain`)
When a reply lists options (`1.` `2.`, `a)` `b)`, `Option A:` headings), `/explain` reads them and switches the tab to its **Decision tree** view at the root: the question and one button per option (the tab's Side chat / Decision tree buttons switch views).

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

(merge it into the file if you already have bindings). `ctrl+x ctrl+o` is free in Claude Code 2.1.296; any chord works. While the `/diff` pane is open the chord belongs to it. The footer is shared with other mods: bws-enhance 0.2.1 or later draws its `✦ enhance` button beside `◨ side` (older bws-enhance drew its own footer and hid it). With text in the prompt box the dashboard opens but the keyboard stays with you (`ctrl+x tab` or a click moves it). `chordAction` empty hides the button.

## Install on another computer
The repository is private, so the computer needs GitHub access first (`gh auth login`, or an SSH key). Then:

```bash
claude plugin marketplace add bsmi021/bws-claude-mods
claude plugin install bws-sidechat@bws-mods
```

## Options (`/plugin` config)
`takeOverFork`, `takeOverBtw` (off = built-in command), `sideTools`, `sideModel`, `loadMcpServers`, `claudePath`, `chordAction`. Decision tree: `exploreTimeoutSeconds` (default 180: an exploration that has not answered by then is ended and its node marked failed), `treeDumpFile` (default empty; a path: the tree is written there as JSON after every change, for checks and probes). Explorations use `sideModel`, `sideTools`, `loadMcpServers` and `claudePath` like the side chat.

## Claude Code Desktop
Desktop has its own native side chat: `/side` there opens the app's built-in fork beside the conversation, and the mod's command never runs (2026-10-17, Desktop Code tab: the fork was a `claude-desktop` session; no `claude -p` child was started). This mod targets the terminal; it is not supported on Desktop.

## Notes
- The fork sees the main session as last written to disk, so a turn still in flight is seen up to its last saved message.
- Each fork is a real session file (`claude --resume <id>` opens it). It may also appear on the session board.
- Tested on Claude Code 2.1.296, Windows 11, Windows Terminal at 120 columns. By hand (0.1.0): `/btw`, `/fork` and `/side` opening the pane beside another pane and answering from the fork. Automated (0.1.3: 57 tests): commands, focus requests, the row-windowed transcript, scroll steps, Stop killing the child, and the hotkey button (its action, press, and absence when off, headless or on the desktop). The Stop kill command was also run against a real long `claude -p` child. Not checked by hand: the footer button and chord in a live terminal, keyboard focus on open, scroll on a long answer, narrow terminals, the desktop app.
- 0.2.0 (decision tree), Claude Code 2.1.296, Windows 11: static validation; automated tests (118, the 58 earlier ones unchanged): the parser on reply samples, the tree, `/explain` (pane and headless text), Explore with stubbed children (next node, free answer, fork of the parent's fork, two at most, error / exit / timeout), Back, branch, Map, Close, scrolling, Decide's deferred send, the desktop pane in the test engine; a headless `claude -p "/explain ..."` probe (state dump). Not checked by hand: the pane in a live terminal or the desktop app, the focus ring on open, a real Explore fork's reply, Decide in a live session.
- 0.3.0 (model choice, main-thread links), Claude Code 2.1.300, Windows 11: static validation; tsc 5.8.3; the 119 earlier tests unchanged. Live, in a real interactive session driven through a pseudo-terminal at 200 columns: `/side model haiku` then a question (the fork answered on `claude-haiku-5-5` while main stayed on sonnet; main gained only the command's own echo lines), the `main:` status (`1 ahead` after a main turn, `in sync` after Refresh), `/side refresh` (new fork on the same model, holding main's newest turn and a replay of the earlier question), `/side send-back` (the answer arrived in main as a user message, and only then). Also live, same harness plus a screen emulator to find the button: `/side pull` (the fork received main's latest reply as a message and answered from it, on haiku) and a real mouse click on a pane `↩ Send to main` button (the answer arrived in main as one user message; main was unchanged before the click). Not checked live: the Pull button press, clicks on the model buttons, narrow terminals, the desktop app. No tests were added for the new code.
