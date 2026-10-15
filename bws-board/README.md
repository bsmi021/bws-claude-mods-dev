# bws-board: a blackboard for a team of Claude Code sessions

Several Claude Code sessions working in one repository share a board. Each session can:
- post what it works on and its role,
- see the others,
- claim the files it edits so no one clips them,
- take turns at git, so no two commit at once or sweep up each other's files,
- ask the others for what it needs.

They work as peers: no lead session, no subagents.

## What it does
- **Cards.** Every session in the repository has a card: its session id, an optional role (`api`, `tests`, `ui`, ...),
  its task (the first line of your latest prompt, with secrets redacted; a prompt another mod sends as your own words, such as bws-better's Run, counts as yours), busy or idle, its run folder (`runs/<date>-<slug>/`
  once it writes there), and the files it claimed.
- **Claims.** Editing a file with Edit, Write or NotebookEdit claims it. So does a Bash or PowerShell command that plainly
  writes a file inside the repository: a redirect, `tee`, `sed -i`, `cp`/`mv`, or the PowerShell write cmdlets
  (command position only). Another live session's write to that file is refused before it runs. The refusal names the holder and its task, and
  says how to ask for the file. A claim lapses 30 minutes after the holder's last edit of the file. All of a session's
  claims go when it exits or `/clear`s, or when its heartbeat stops for 90 s (a crash).
- **Git lease.** One session at a time runs git that changes the index, the checkout or refs in a working tree:
  `add`, `rm`, `mv`, `commit`, `push`, `pull`, `merge`, `rebase`, `reset`, `checkout`, `switch`, `restore`, `stash`
  (not `list`/`show`), `cherry-pick`, `revert`, `am`. Read-only git (`status`, `diff`, `log`, `show`, `branch`, `fetch`,
  ...) is never touched. Command position only, as for claims; `cd` and `git -C` are followed, and another repository is
  ignored.
  - The first such command takes the session's lease. While a peer live in the same working tree holds it, the command
    is refused: the reason names the holder, what it last ran, and when the lease ends, and tells Claude to do other
    work rather than retry in a loop.
  - The lease ends when the holder's turn ends, 2 minutes after its last git command (`gitLeaseMinutes`), on
    `board_release` with no paths, when it exits, or when its heartbeat stops for 90 s.
  - **No sweeping a peer's files.** A `git commit` is refused when it would include a file a live peer claims: the
    staged files, the modified tracked files for `-a`, and what an earlier `git add` in the same command would stage
    (`add -A`, `add .` and `add -u` count every modified and untracked file). The refusal names the files and gives
    the `git restore --staged` fix. This runs git only when a peer claims a file in the tree.
  - Worktrees are separate: a session in another worktree of the repository never waits for this one.
  - It narrows the race, not removes it: two sessions that start git in the same instant can both go on, as with
    claims.
- **No git overwrites of a peer's work.** A git command that would overwrite or delete a file a live peer claims and
  has changed is refused, lease or no lease:
  - `git stash` (push/save; untracked files too with `-u`/`-a`), `git reset --hard`, `git checkout -f`, `git checkout
    [<ref>] [--] <paths>` (including `.`), `git switch -f`/`--discard-changes`, `git restore <paths>`, `git clean -f`
    and `git rm`.
  - Only files git says would change count: changes against HEAD for stash, hard reset and forced checkout; against
    the index for `checkout -- <paths>` and `restore <paths>`; what `git clean -n` with the same flags lists for
    clean. `git rm`, and a restore from another commit, count any named claimed file. A claim on a file its holder
    already committed never blocks.
  - The refusal names the files and their holder and gives the path-limited form (`git stash push -- <your files>`,
    `git restore -- <your files>`).
  - Not checked, because git itself refuses to overwrite local changes there: `stash pop/apply`, a branch switch
    without `-f`, `reset --merge/--keep`. A command after a `cd` the parser cannot follow (`cd "$WT" && ...`) is not
    judged, since it may run in another worktree. `git clean` is checked but does not take the lease.
  - Known gap: `git checkout <branch> <file>` without `--` is checked against the index, so a peer's claimed file
    that is clean in the index could still be overwritten from that branch.
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
  - `/board pane` opens the Board tab of [bws-cockpit](../bws-cockpit/README.md)'s dashboard, redrawn on every heartbeat, from the `pane` (0.6.0: the board as cards), `lines` and `summary` this mod keeps. Without bws-cockpit it prints the board as `/board` does. (Before 0.5.0 bws-board drew its own pane.)
  - `/board digest [days]` writes the team digest page (below) and prints its path.
- `board_status { task? }` gives Claude the same listing, and can set the task line.
- `board_release { paths? }` gives up claims, all of them and the git lease when no paths are given.

## History and the team digest
Each session also keeps a history of what it did on the board. The history outlives its card, so you can look back at
how the team worked:
- **What is logged:**
  - start and end, busy and idle turns, task changes
  - files claimed and edited, releases
  - refused edits: which file, and who held it
  - asks posted, taken, done, declined or withdrawn
  - messages sent (recipient only, never the text)
  - urgent wakes sent or held back
  - the git lease taken (the subcommand only, never the command line) and every git command refused for it

  Text is only what the card already holds redacted (task, ask text, notes), plus file paths. No message text and no
  commands are logged.
- **`/board digest [days]`** (default 1, up to 60) writes one self-contained page, `<board folder>/digest.html`, and
  prints its path. It covers every session that worked in the window. Sessions that only started and ended, like the
  one running the digest, are left out. The page shows:
  - Totals: agents, summed busy time, **parallel time** (how long two or more agents were busy at once), asks done,
    median time to take and to done, refused edits, wakes.
  - A timeline with one lane per session: busy turns, files held, and markers for asks, takes, dones, refused edits,
    wakes, messages and releases.
  - Tables: files held (a file two sessions held, or one with a refused edit, is flagged *contested*), asks with how
    long they waited, refused edits and git waits (who blocked whom, on which file or git command), and wakes per
    sender and receiver.

  Peer text is HTML-escaped. One small inline script only shows times in your local zone; without it, they read UTC.
  The page does not open by itself.

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
- History goes in `history/<session id>.json` in the same folder. Only its own session writes it, rewriting the whole
  file because `$.fs` has no append, and it holds at most 5000 events. The day-old card sweep never touches it. History
  files untouched for `historyDays` are deleted the same way.
- If the board can't be read or written, it never blocks an edit. You are told once.

## Options (`pluginConfigs["bws-board"].options`)
- `board` (default true): join the board.
- `claimMinutes` (default 30): how long a claim lasts after the last edit of the file.
- `urgentWake` (default true): urgent asks may wake named idle sessions.
- `wakeMinutes` (default 5): the minimum gap between wakes from this session to the same session.
- `historyDays` (default 14): keep history files this many days. `0` writes no history.
- `gitLease` (default true): take turns at git, refuse a commit of a peer's claimed files, and refuse git commands
  that would overwrite or delete a peer's changed files.
- `gitLeaseMinutes` (default 2): the git lease lapses this long after the holder's last git command.

## Capabilities and safety
- It reads and writes its own card folder under the Claude config folder, and deletes day-old card files and
  expired history files in it. It also writes `digest.html` there when asked.
- It reads `CLAUDE_CONFIG_DIR`, `USERPROFILE`, `HOME` and `BWS_AGENT_ROLE`.
- It sends `$.session.send` messages only for urgent asks.
- For the git lease it runs `git rev-parse` (once per folder) and, only when a peer claims a file in the tree, `git diff
  --name-only` / `git ls-files --others` before a commit, and `git diff` / `git clean -n` (a dry run) before a command
  that would overwrite files. It never runs a git command that changes anything.
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

0.2.0, history and digest (`runs/2026-10-10-board-digest/receipts/`), Claude Code 2.1.296 on Windows 11:
- Static validation passed. 61 automated tests, including:
  - the history kept during a two-session run
  - redaction, and no message text logged
  - a failing history write that neither blocks nor warns
  - `historyDays: 0`
  - the history sweep
  - `<script>` in peer text escaped
- **Live, headless:** two sessions in a scratch repository.
  - A claimed `notes.txt` and asked `tests`.
  - B was refused the file, took the ask and finished it, then sent A an urgent ask, which woke A.
  - Both history files recorded it all.
  - `/board digest` gave: 2 agents, 18 s parallel, 1/2 asks done, 1 refused edit, 1 wake.
- **The page:** rendered by headless Edge in light and dark at 1280 px wide, and checked by eye.
- **Not verified:** phone width (headless Edge will not size a window that narrow), and the history sweep live (tests
  only).

0.3.0, git lease (`runs/2026-10-10-board-git-lease/receipts/`), Claude Code 2.1.296 on Windows 11, git 2.54:
- Static validation passed, tsc clean. 75 automated tests, including the detector, the lease and its turn-end, lapse
  and release ends, the sweep check (`add -A`, already staged, `add <dir>`, `commit -a`, an unstage before the commit),
  and no git run when no peer claims a file.
- **Corpus replay:** 79,355 real Bash/PowerShell commands; 4,054 take the lease. No git command at command position was
  missed; the leftovers are verbs inside quoted text.
- **Live, headless, two sessions in a scratch repository** (lease set to 1 minute for the run):
  - A staged its file and held its turn; B's `git add b.txt && git commit` was refused for the lease.
  - After the lease lapsed, with A still live, B's `git add -A && git commit` was refused for A's `a.txt`. B followed
    the fix (`git restore --staged -- a.txt && git add -- b.txt && git commit`) and committed only `b.txt`. A then
    committed `a.txt` itself; each commit held only its own file.
  - The first run found the restore-then-commit command refused (the check ran before the restore); fixed, and the
    second run passed it.
- **Not verified live:** the lease ending at turn end in an interactive session (in `claude -p` a turn end is the
  exit), PowerShell git commands, `-C` into a worktree, and a push (tests only).

0.4.0, git overwrite guard (`runs/2026-10-10-board-git-clobber/receipts/`), Claude Code 2.1.296 on Windows 11:
- Static validation passed, tsc clean, 82 automated tests (the detector's scopes and exclusions; each refused
  command; path-limited commands, a committed claim, an unfollowable `cd` and a variable `git rm` going on; `git clean`
  taking no lease; no git run alone).
- **Corpus replay:** 570 of 79,355 real commands carry an overwriting git op. Two false-refusal patterns it found
  (`cd "$WT" && git checkout main -- ...`, `git rm $VAR`) were fixed before shipping.
- **Live, headless, two sessions, no lease anywhere:** A changed `a.txt` and created `new.txt`. B's `git stash`,
  `git checkout .`, `git reset --hard` and `git clean -fd` were each refused, naming A's file; `git stash push -- b.txt`
  went through. A's `a.txt` and `new.txt` were intact afterwards.
- **Verified live:** `stash`, `checkout .`, `reset --hard` and `clean -fd` refused, `stash push -- <file>` passing.
  Everything else (other verbs, the unfollowable-`cd` and variable-`rm` rules, PowerShell) is tests only.

0.5.0, the board moves into the dashboard (`runs/2026-10-10-bws-dashboard/receipts/`), Claude Code 2.1.296 on Windows 11:
- bws-board's own pane is removed. `/board pane` runs bws-cockpit's `/dashboard board` just after the command returns (a
  command cannot run another from inside its own hook), when `dashboard` is listed; otherwise it prints the board.
- Static validation passed, tsc clean, 83 automated tests (+1: the redirect and the fallback).
- **Live:** in an interactive session with the dashboard, `/board pane` opened its Board tab, and an ask from another
  session raised that tab with `1 for you`.

0.6.0, the Board tab as cards (`runs/2026-10-15-board-cards/`), Claude Code 2.1.296 on Windows 11:
- New state key `pane`: the board pre-worded for bws-cockpit 0.18.0's card layout (one card per session, one per ask). `lines` is kept for older cockpits and headless text.
- Static validation passed, tsc clean, 86 automated tests (+2: the pane view, and an empty board).
- **Not yet verified live:** how the bordered cards look in a real terminal.
