# bws-diagram

0.2.1: pinning a mermaid diagram that is already pinned (the same nodes and edges, however it is written) replaces the earlier pin, so `/diagram status` counts it once.

0.2.0: the pane draws box-drawing text rows top to bottom (it drew filled blocks left to right before), opens whenever a pin or a drawing lands, and writes the diagram into the transcript when the pane cannot be placed.

After a big turn, a small model decides whether it is worth a diagram. If yes, a fork of the session draws what
happened (the steps taken, the files touched, new components, decisions) and a side pane shows it with a legend. The
main session never does that work and never waits for it. Mermaid flowcharts Claude writes in a reply are pinned in the
same pane ("Pinned diagrams"), drawn instead of being left as text.

## How it works

- **Which turns.** On each finished turn the mod counts the turn: tool calls, files edited, seconds, answer words. A
  turn with no tool calls is skipped without any call. Otherwise one small-model classify call (`yes` / `no`) sees the
  counts alone (never your prompt or file contents) and decides whether the turn was big. Also skipped: headless runs, a
  subagent's turn, a turn that did not end in an answer, any turn while a diagram is being drawn, and every turn when
  `autoDiagram` is off.
- **The fork.** On `yes`, `$.model.fork` (the same prompt cache as your session) is asked once for a diagram spec as
  JSON: a title, nodes `{ id, label, kind }` with kind `file`, `new`, `step` or `decision`, and edges
  `{ from, to, label? }`; at most 24 nodes. The reply is validated (known kinds, unique ids, edges between known nodes);
  an invalid reply is dropped.
- **The drawing.** Plain text rows in thin box-drawing characters, top to bottom by dependency (cycles broken, long
  edges routed down beside the middle layers), the same on every surface. Each node is a three-row box whose corners
  say what it is: `┌` file, `╭` new component, `╔` step, `╱` decision. Edges leave a node's bottom, run along a bus and
  arrive on the target's top as `▼ label` (a back edge of a cycle gets `▲` at its upper end). A fork can mark the node
  where things stand with `now`; it is drawn `▶ label` and the legend adds `▶ now`. Under the drawing a footer says
  `map drawn at turn N` or `pinned at turn N`. Nodes shrink to 8 columns and labels are cut with `…` to fit the pane; if
  even that is too wide the rows are still drawn, cut at the edge, and the footer says how many columns they want.
- **Pinned diagrams.** When a turn ends, each fenced ` ```mermaid ` block in the reply (five at most, each pinned once)
  is parsed: `graph` / `flowchart` (LR, TD, TB, RL, BT; all drawn top to bottom), node shapes `[..]` square, `(..)` and
  `([..])` rounded, `[[..]]` double, `{..}`, `{{..}}` and `((..))` decision, edges `-->`, `---`, `==>`, `-.->`,
  `A -- label --> B` and `A -->|label| B`, chains on one line. Styling lines (`style`, `classDef`, `subgraph`, ...) are
  ignored. Anything else (another diagram type, `A & B`, over 24 nodes) is pinned as its source text. Pinning is plain
  parsing, so it also runs headless.
- **The pane.** A heading (title, `2/5`, where it came from), the legend, the drawing, its footer, the
  "Pinned diagrams" list, and buttons `< Prev` (`p`), `Next >` (`n`) and `Close` (`c`); Esc closes it too. It is drawn
  again for every width change. In the terminal's fullscreen layout from 110 columns it docks right of the transcript;
  otherwise it sits above the prompt. A pin or a drawn diagram opens the pane, but an open the mod makes on its own
  is not drawn below 144 columns (110 once you have opened the pane yourself): the engine decides that, not the mod.
  Then the mod shows a toast and writes the diagram into the transcript, drawn at 100 columns, so it is seen anyway;
  `/diagram show` opens the pane at any width.
- **Fail open.** A classifier error or unreadable answer (15 s timeout), a fork error or timeout (90 s) or an invalid
  spec leaves the session as it was and writes one debug-log line that never carries your text. A fork cannot be
  cancelled, so a timeout only stops waiting for it.

## Commands

| Command | What it does |
| --- | --- |
| `/diagram` | Draws the whole session so far (no classifier). With a screen it runs behind and opens the pane; headless it runs before the command returns. With nothing to fork (a first command, or right after `/clear`) it asks your session's model with the transcript. |
| `/diagram status` | The option, the drawn diagrams and the pinned ones, `>` marking the one shown. |
| `/diagram show` | Opens the pane (an open you ask for is placed at any width). |

## After reload, `/clear`, `/resume`, `/branch`

- **Reload:** the list lives in a `$.state` atom, which outlives a hot reload. It is also kept in `$.store` per
  conversation (the newest 10), so a new process for the same conversation (`claude --resume`) shows it again.
- **`/clear`:** the conversation's diagrams go with it and the pane closes; a fork still running is not cancelled, but
  its diagram is dropped. The cleared conversation's list stays kept for a later resume.
- **`/resume`:** work stops and the pane closes; on the next turn or command the resumed conversation's list comes back
  (empty if it had none).
- **`/branch`:** no event of its own. The mod sees a changed session id on the next turn or command, drops a fork in
  flight and carries the list over to the branch (the branch has the same transcript).

## Options (`/plugin` → bws-diagram)

| Option | Default | Meaning |
| --- | --- | --- |
| `autoDiagram` | `true` | Look at finished turns and draw the big ones. Off: only `/diagram` and pinned mermaid blocks. |
| `model` | `haiku` | The model that decides whether a turn is big. The drawing fork uses your session's own model. |
| `dumpFile` | empty | Diagnostic: when set, the diagram list is written to this file as JSON after every change. |

## Summary atom

`{ plugin: 'bws-diagram', key: 'summary' }`: nothing with an empty list, `diagram drawing` (busy) while a fork draws,
`N diagrams, M pinned` (ok), `diagram failed` (warn) after a failure, until the next drawing or until you close the pane. bws-cockpit lists
`bws-diagram` in its default `modSummaries`.

## Capabilities used

`turn.complete` (pins inline; the classify-then-fork work starts after it returns, through `$.clock.after`),
`session.start`, `session.end`, `command.run` (`/diagram`), `ui.render` and `ui.close` for the pane,
`$.model.classify`, `$.model.fork`, `$.model.complete` (only as the fork's fallback), `$.session.*` (id, messages,
surfaces, model), `$.state`, `$.store` (its own key `boards`), `$.fs.write` (only the `dumpFile`, when set), `$.ui.log`
(debug only, and the diagram into the transcript when its pane is not placed), `$.ui.toast`. It makes no network calls of its own, runs no processes and never touches `~/.claude`.

## Load

```
claude --plugin-dir ./bws-diagram
```

## Tested (Claude Code 2.1.296)

- **Static:** `claude plugin validate ./bws-diagram` passes (hook and API-call inventory reviewed); tsc strict passes.
- **Automated:** `claude plugin test` in `bws-diagram/`: see `runs/2026-10-13-mods-m5-diagram/HANDOFF.md` for the
  count and the test names per requirement.
- **Headless probe:** `claude -p` with a reply holding a mermaid block pins it (`receipts/m5-probe.json` and the
  `dumpFile` receipt).
- **Drawing:** `tests/render.test.ts` asserts the exact rows for a chain, a fan-out, a fan-in, a skipped layer, a cycle, narrow widths and a single node. The pane tests read the same rows back through a stubbed engine.
- **Not tested live:** the pane in a real terminal (dock, inline, keys, resize), Desktop, the classifier path after a
  real turn, the cockpit chip, `/clear`, `/resume`, `/branch`. `runs/2026-10-13-mods-m5-diagram/MANUAL-CHECKS.md`
  lists them.
