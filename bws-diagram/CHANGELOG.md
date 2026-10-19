# Changelog

## 0.3.1
- No behaviour change. Ships the 1.7.0 README, this CHANGELOG and the full manifest (author, homepage,
  repository, license, keywords) to installed copies: `claude plugin update` keeps files by version.

## 0.3.0
- Diagrams now show in a Diagram tab of bws-cockpit's dashboard (0.21.0 or later) instead of a side pane. The tab has `< Prev`, `Next >`, `Draw the session` and `Dismiss the failure` buttons.
- `/diagram show` opens the dashboard on the Diagram tab at any width.

## 0.2.1
- Pinning a mermaid diagram that is already pinned (the same nodes and edges, however it is written) replaces the earlier pin, so `/diagram status` counts it once.

## 0.2.0
- The pane draws box-drawing text rows top to bottom (it drew filled blocks left to right before).
- The pane opens whenever a pin or a drawing lands.
- When the pane cannot be placed, the diagram is written into the transcript.

## 0.1.0
- First release: after a big turn a small model decides whether to diagram it, and a fork of the session draws the steps, files, new components and decisions with a legend.
- Mermaid flowcharts in Claude's replies are pinned and drawn.
- `/diagram` draws the whole session; `/diagram status` lists the diagrams.
- Diagrams survive a reload, `/clear`, `/resume` and `/branch` as described in the README.
