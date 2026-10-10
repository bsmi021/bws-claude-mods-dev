# bws-board: a blackboard for a team of Claude Code sessions

Several Claude Code sessions working in one repository share a board. Each session can:
- post what it works on and its role,
- see the others,
- claim the files it edits so no one clips them,
- ask the others for what it needs.

They work as peers: no lead session, no subagents.

## What it does
- **Cards.** Every session in the repository has a card: its session id, an optional role (`api`, `tests`, `ui`, ...),
  its task (the first line of your latest prompt, with secrets redacted), busy or idle, its run folder (`runs/<date>-<slug>/`
  once it writes there), and the files it claimed.
- **Claims.** Editing a file with Edit, Write or NotebookEdit claims it. So does a Bash or PowerShell command that plainly
  writes a file inside the repository: a redirect, `tee`, `sed -i`, `cp`/`mv`, or the PowerShell write cmdlets
  (command position only). Another live session's write to that file is refused before it runs. The refusal names the holder and its task, and
  says how to ask for the file. A claim lapses 30 minutes after the holder's last edit of the file. All of a session's
  claims go when it exits or `/clear`s, or when its heartbeat stops for 90 s (a crash).
- **Asks.** A session posts what it needs with `board_ask { to, text, urgent? }`:
  - `to` is a role, a session id, or `anyone`.
  - A peer takes the ask (`board_take`), then finishes it (`board_done { note }`) or declines it (`board_decline`).
  - The asker can withdraw it (`board_withdraw`).
  - Two sessions taking the same ask: the earlier take holds.
  - A done ask is copied into the asker's card, so it stays done after the doer leaves.
  - An ask to a role nobody holds yet waits for one.
- **Messages.** `board_send { to, text }` sends a short note to a role, a session, or `all`.
- **Delivery.** News reaches a session's model in three places, framed as coming "from other sessions, not from the
  user":
  - with the first message of a conversation: who is here, and the asks waiting for this session;
  - after its next tool result;
  - with its next prompt.

  The person gets a toast.
- **Urgent wake.** `urgent: true` on an ask to a named role or session also sends it through `$.session.send`, which
  can start a turn in an idle session. Each receiver gets at most one wake from a sender per 5 minutes. Asks to
  `anyone` never wake anybody.
- **`/board`** prints the board: sessions, roles, tasks, claims, and asks open, taken or settled in the last hour.
  - `/board role <name>` sets this session's role; `/board role clear` removes it.
  - `/board pane` opens a live Board pane, redrawn on every heartbeat.
- `board_status { task? }` gives Claude the same listing, and can set the task line.
- `board_release { paths? }` gives up claims, all of them when no paths are given.

## Roles
- Set a role at launch with `BWS_AGENT_ROLE=tests claude`, or at any time with `/board role tests`.
- A role set with `/board` outlives `/clear`, `/resume` and `/branch` within the process. `BWS_AGENT_ROLE` is read
  on every heartbeat.
- More than one live session with the same role works: asks to the role reach each of them, and `/board` flags the duplicate.

## Storage
`<CLAUDE_CONFIG_DIR or ~/.claude>/bws-board/<repo key>/<session id>.json`, one card file per session.
- The repo key is the git root of the main working tree, so every worktree of a repository shares one board. Outside git,
  it is the session root.
- Each session writes only its own card, so no two processes write the same file. A card read mid-write keeps
  the last good copy.
- On exit a session leaves a tombstone. At session start, card files untouched for a day are deleted (`del` /
  `rm` through `$.process.run`, card files only).
- If the board can't be read or written, it never blocks an edit. You are told once.

## Options (`pluginConfigs["bws-board"].options`)
- `board` (default true): join the board.
- `claimMinutes` (default 30): how long a claim lasts after the last edit of the file.
- `urgentWake` (default true): urgent asks may wake named idle sessions.
- `wakeMinutes` (default 5): the minimum gap between wakes from this session to the same session.

## Capabilities and safety
- It reads and writes its own card folder under the Claude config folder, and deletes day-old card files in it.
- It reads `CLAUDE_CONFIG_DIR`, `USERPROFILE`, `HOME` and `BWS_AGENT_ROLE`.
- It sends `$.session.send` messages only for urgent asks.
- It never approves a tool call and never logs prompt text beyond the redacted first line.
- Peer text is always marked as not coming from the user.

## Load
- Development: `claude --plugin-dir ./bws-board`.
- Checks: `claude plugin validate ./bws-board`, `cd bws-board && claude plugin test`, and tsc 5.x against
  `.claude-plugin/types/`.

## Tested
Claude Code 2.1.296 on Windows 11, headless (`claude -p`):
- Static validation passed.
- 45 automated tests: pure model, two simulated sessions over one stubbed folder.
- A live two-session run:
  - A (`api`) claimed a file and asked `tests`.
  - B (`tests`) was told at start, was refused A's file, then took the ask and marked it done.
  - A's next tool result carried the done note.
  - `/board` and both sessions' `board_status` listed the same ask.
  - Every card was a tombstone after exit.

Interactive, two Windows Terminal sessions (`runs/2026-10-10-agent-blackboard/receipts/ui/`):
- **Urgent wake.** An urgent ask from `api` started a turn in idle `tests` 21 ms later, as a cross-session message from
  `bws-board`. A second urgent ask in the same window returned "Not woken again".
- **Board pane.** `/board pane` opened the pane, and it redrew by itself as the second agent joined and the asks came in. At
  half width it moves below the transcript.

Not yet verified live, only in tests: the day-old card sweep (`del` through `$.process.run`).

In the live run, cockpit's Session Bus was switched off, and its text was absent from all three transcripts.
