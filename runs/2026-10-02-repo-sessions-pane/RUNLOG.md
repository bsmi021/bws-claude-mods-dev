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
- `receipts/test.txt`: 110/110.
- `receipts/validate.txt`: passed.
- `receipts/tsc.txt`: tsc 5 strict, exit 0.
- `receipts/live-repo-sessions-p.jsonl`: a headless `/repo-sessions` here listed `bws-mods-claude-code-1d: busy 9m` and excluded itself and the 4 sessions in other repos.
- `receipts/live-peers-p.jsonl`: shows that `/peers` is the built-in.

- Advisor review found two bugs, both fixed with failing-first tests:
  - The pane reopened 5 s after a manual close. Peers shown while it was open are now marked as seen.
  - A crashed session's pid reused by another program read as alive. It now has to run the same image as this session.
- Live, interactive: `launch-peer.ps1` opened `repo-sessions-check` in a new maximized wt window, with no keystrokes sent.
  - `receipts/live-two-peers-p.jsonl`: headless `/repo-sessions` listed both interactive peers.

- Brian confirmed the pane docked on the right in fullscreen.

## Session 2: latest prompt per peer, plus an Other repos section (0.7.0)
- Prompts come from `~/.claude/history.jsonl`, which has one `{display, timestamp, project, sessionId}` line per prompt.
  - `latestPrompts` scans from the end and parses JSON only for the session ids it wants.
  - It is cached by size and mtime.
- The first live run showed no prompt. The cause: `$.fs.read` rejects files over 4 MiB, and the real history.jsonl is 4.99 MB.
  - Fix: `readTail` reads the file whole when it is 4 MiB or less. Otherwise it takes the last 1 MiB through a PowerShell FileStream seek, opened read-shared, with a `tail -c` fallback.
  - A test covers the big-file path and the cut first line.
- Other repos: every other live session not in this repo, grouped under its repo's folder name, sorted by repo then status.
  - Shown in the pane and in the text fallback.
  - These rows have no prompt lines.
- Evidence:
  - `receipts/test.txt`: 114/114.
  - `receipts/validate.txt` and `receipts/tsc.txt`: clean.
  - `receipts/live-prompts-others-p.jsonl`: the real peer with its latest prompt, then 5 sessions in other repos.

## Next
- Brian checks the new prompt lines and the Other repos section in the docked pane.
- Parked: a message button per peer.
- Parked: a last-prompt line per session; a message button per peer.
