# RUNLOG: Repo Sessions pane

## Objective
Show the other Claude Code sessions open in the same repo in a pane to the right of the console. See PLAN.md for the finish line.

## Done
- Data source: Claude Code's own registry, `~/.claude/sessions/<pid>.json`, which holds cwd, name, status, kind and updatedAt. No heartbeat of our own was needed.
- `bws-cockpit/hooks/peers.ts` (pure): record parse, repo key (the common git dir, so worktrees match), `whereIn`, tasklist parse, sort, text.
- `register.tsx`:
  - `/repo-sessions` toggles the pane, and replies as text when headless.
  - The `repo-sessions` Pane renders the list.
  - A 5 s poll runs in the existing `session.start` and auto-opens the pane once per new interactive peer, in fullscreen only.
  - The fullscreen state is recorded from the band and pane renders.
- `/peers` is a Claude Code built-in. The first live run showed it shadowing ours, so the command was renamed `/repo-sessions`.
- Types: `PeerView`, `PeersView`, and the `peers` and `peersAnnounced` state.
- userConfig `peersPane` and `peersAutoOpen`. Version 0.6.0. README updated.

## Evidence
- `receipts/test.txt`: 108/108.
- `receipts/validate.txt`: passed.
- `receipts/tsc.txt`: tsc 5 strict, exit 0.
- `receipts/live-repo-sessions-p.jsonl`: a headless `/repo-sessions` here listed `bws-mods-claude-code-1d: busy 9m` and excluded itself and the 4 sessions in other repos.
- `receipts/live-peers-p.jsonl`: shows that `/peers` is the built-in.

## Next
- Visual receipt: a second interactive session in this repo (wt.exe), with a screenshot of the docked pane. This needs Brian's OK for a screen handover.
- Parked: a last-prompt line per session; a message button per peer.
