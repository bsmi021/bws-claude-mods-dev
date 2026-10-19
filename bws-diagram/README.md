# bws-diagram

> Draws a diagram of what Claude just did, after a big turn, in a dashboard tab, and pins the mermaid flowcharts Claude writes.

After a long turn you often have to read the transcript to see which files changed and why. This mod counts what each
turn did. When a turn was big, a small model says so and a background fork of your session draws it: the steps taken,
the files touched, new components and decisions. The drawing opens in the Diagram tab with a legend. Your main session
never does that work and never waits for it.

## Install

```
claude plugin marketplace add bsmi021/bws-claude-mods
claude plugin install bws-diagram@bws-mods
```

Then `/reload-plugins`. Requires Claude Code 2.1.296 or later. It shows its diagrams in a tab of
[bws-cockpit](../bws-cockpit/README.md)'s dashboard (0.21.1 or later). Without bws-cockpit the diagram is written into
the transcript instead.

## Use

| Command | What it does |
| --- | --- |
| `/diagram` | Draws the whole session so far (no classifier). With a screen it runs in the background and brings up the Diagram tab; headless it finishes before the command returns. With nothing to fork (a first command, or right after `/clear`) it asks your session's model with the transcript. |
| `/diagram status` | Shows the option, the drawn diagrams and the pinned ones; `>` marks the one on screen. |
| `/diagram show` | Opens the dashboard on the Diagram tab, at any terminal width. Without bws-cockpit it prints the diagram. |

The Diagram tab shows a heading (title, position such as `2/5`, where it came from), the legend, the drawing, a footer,
and the list of pinned diagrams. Its buttons are `< Prev`, `Next >`, `Draw the session` and, after a failure,
`Dismiss the failure`. A new pin or drawing brings the tab up, unless you are using the dashboard or closed it.

## What it does

### Drawing big turns

- **Which turns.** On each finished turn the mod counts tool calls, files edited, seconds and answer words. A turn with
  no tool calls is skipped without any model call. Otherwise one small-model call answers `yes` or `no` from the
  counts alone (never your prompt or file contents).
- **Also skipped:** headless runs, a subagent's turn, a turn that did not end in an answer, any turn while a diagram is
  being drawn, and every turn when `autoDiagram` is off.
- **The fork.** On `yes`, a fork of your session (it reuses the prompt cache) is asked once for a diagram as JSON: a
  title, up to 24 nodes (`file`, `new`, `step` or `decision`) and the edges between them. An invalid reply is dropped.

### The drawing

Plain text in thin box-drawing characters, top to bottom by dependency, the same on every surface. Each node is a
three-row box whose corner shows what it is:

| Corner | Meaning |
| --- | --- |
| `┌` | file |
| `╭` | new component |
| `╔` | step |
| `╱` | decision |

Edges leave a box's bottom and arrive on the target's top as `▼ label`; a back edge of a cycle ends in `▲`. The node
where things stand can be marked `▶ label`, and the legend then adds `▶ now`. A footer reads `map drawn at turn N` or
`pinned at turn N`. Nodes shrink to 8 columns and labels are cut with `…` to fit. If it is still too wide, the rows are
cut at the edge and the footer says how many columns the drawing wants.

### Pinned mermaid diagrams

When a turn ends, each fenced `mermaid` block in Claude's reply (five at most, each pinned once) is parsed and drawn in
the tab under "Pinned diagrams". Pinning is plain parsing, so it also works headless.

- Supported: `graph` and `flowchart` in any direction (all drawn top to bottom); node shapes `[..]`, `(..)`, `([..])`,
  `[[..]]`, `{..}`, `{{..}}` and `((..))`; edges `-->`, `---`, `==>`, `-.->`, `A -- label --> B` and `A -->|label| B`;
  chains on one line. Styling lines (`style`, `classDef`, `subgraph`) are ignored.
- Anything else (another diagram type, `A & B`, more than 24 nodes) is pinned as its source text.
- Pinning a diagram with the same nodes and edges as one already pinned replaces the earlier pin, however it is written.

### Failure and lifecycle

- **Fails open.** A classifier error or timeout (15 s), a fork error or timeout (90 s) or an invalid diagram leaves the
  session as it was. One line goes to the debug log, never carrying your text. A fork cannot be cancelled, so a timeout
  only stops waiting for it.
- **Reload and `claude --resume`.** The list survives a hot reload and is kept per conversation (the newest 10), so a
  resumed conversation shows its diagrams again.
- **`/clear`.** The conversation's diagrams are cleared; a fork still running has its diagram dropped.
- **`/resume`.** Work stops; the resumed conversation's list comes back on the next turn or command.
- **`/branch`.** The next turn or command notices the new session, drops a fork in flight and carries the list over.

## Options

Set in `/plugin`, or under `pluginConfigs["bws-diagram"].options` in settings.json.

| Option | Default | What it does |
| --- | --- | --- |
| `autoDiagram` | `true` | After a turn, ask the small model whether it was big enough to diagram, and if so draw it. Off: only `/diagram` and pinned mermaid blocks. |
| `model` | `haiku` | Model alias or id that decides whether a turn is big (`haiku`, `sonnet`, `opus` or a full id). The drawing fork uses your session's own model. |
| `dumpFile` | empty | Diagnostic. When set, the diagram list is written to this file as JSON after every change. Empty: nothing is written. |

## Permissions and data

- **Model calls.** One small-model classify call per eligible turn (counts only). One fork of your session per drawn
  diagram, so the fork sees your conversation as your session does and uses its model. `/diagram` with nothing to fork
  sends your transcript to your session's model.
- **Reads.** Your session's id, messages, model and surfaces, and the text of Claude's replies (for mermaid blocks).
- **Writes.** The diagram list in the session's state and in Claude Code's per-conversation store (newest 10). The only
  file written is `dumpFile`, and only when you set it.
- **Does not.** Make network calls of its own, run processes, or touch `~/.claude`.

## Compatibility

Checked on Claude Code 2.1.296 on Windows 11: automated tests (including the exact drawn rows) and headless runs for
pinning. The tab needs a surface that shows bws-cockpit's dashboard; elsewhere the diagram is written into the
transcript. The classifier path after a real turn, Desktop, and `/clear`, `/resume` and `/branch` have had little live
testing.

## License

MIT. Version history: [CHANGELOG.md](CHANGELOG.md).
