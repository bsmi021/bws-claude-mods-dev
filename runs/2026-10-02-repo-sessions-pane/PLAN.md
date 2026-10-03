# PLAN: Repo Sessions pane (bws-cockpit 0.6.0)

Brian's ask: "show me any other claude code sessions open in the same repository in a window on the right of the claude code console".

## Finish line (all true, with receipts in this folder)
1. A docked pane (right of the transcript in the fullscreen layout, which Brian runs: `tui: fullscreen`) lists every *other* live Claude Code session whose cwd is in the same git repo as this one (same common git dir, so worktrees count; outside git, the same folder).
   - per session: name, status (busy / idle / shell / as given), how long in that status, kind when not interactive, where it runs when not the repo root, when it started
   - interactive sessions first; `claude -p` workers listed after, marked
   - empty state: "No other sessions in this repo"
2. `/repo-sessions` (`/peers` is a built-in: it lists every session on the machine) toggles the pane; without a surface (`-p`) it replies with the same list as text.
3. Auto-open: when a new interactive peer appears, open the pane unasked (fullscreen only; the engine seats it from 144 columns). Closing it keeps it closed until another new peer appears. userConfig `peersAutoOpen` (default on), `peersPane` (feature on/off).
4. Source: `~/.claude/sessions/<pid>.json` (honors CLAUDE_CONFIG_DIR). Dead pids filtered with one `tasklist` call, cached per pid+procStart for 45 s; a failed check keeps the session. `.key` files never read.
5. Validate clean, `claude plugin test` green, tsc strict clean, README updated, version 0.6.0.
6. Live receipt: a second interactive session in this repo launched via wt.exe, screenshot of the docked pane; `claude -p "/repo-sessions"` text receipt.

## Parked follow-ups
- Last prompt / current activity per session (read the peer transcript tail).
- Message button per peer ($.session.send to its sessionId).
