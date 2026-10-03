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

---

# PLAN 2 (2026-10-02): latest prompt per peer + other repos section (bws-cockpit 0.7.0)

Brian's ask: "show each peer's latest prompt under its row in the repo-sessions pane. As well add a section to the bottom to show all other sessions in different repos".

## Finish line
1. Each same-repo peer row gets a dim `› <latest prompt>` line: first line of its newest entry in `<config dir>/history.jsonl` (`display`, matched by `sessionId`), cut to the pane width. No line when the session has no prompt there (e.g. `-p` workers).
   - history.jsonl (~5 MB) is read only when its mtime/size changes, scanned from the end; JSON parsed only for wanted ids.
2. A bottom section "Other repos · N" lists every other live session not in this repo, grouped under its repo name: status mark, name, status + time; worker kind marked. No prompts there.
3. Text fallback (`claude -p "/repo-sessions"`) carries both: prompt lines and the other-repos list.
4. Auto-open still triggers only on same-repo interactive peers.
5. Validate clean, tests green (new: prompt parsing, wanted-only scan, other-repos grouping, pane both surfaces, text), tsc strict clean, README + version 0.7.0, live receipts (headless text + Brian's eye on the pane).
