# bws-board

> A shared board for several Claude Code sessions in one repository: who is doing what, who holds which file, who may use git, and who needs help.

When two or three sessions work in the same repository, they clip each other's edits, commit each other's half-done files, and cannot ask each other for anything. bws-board gives each session a card on a shared board. Sessions claim the files they edit, take turns at git, and post asks that a peer can take and finish. There is no lead session and there are no subagents: they work as peers.

## Install

```bash
claude plugin marketplace add bsmi021/bws-claude-mods
claude plugin install bws-board@bws-mods
```

Then `/reload-plugins`. Requires Claude Code 2.1.296 or later. It works on its own. With [bws-cockpit](../bws-cockpit/README.md) 0.21.1 or later it also shows a Board tab in the dashboard (cards for sessions and asks) and a board chip on the action bar.

## Use

| Command | What it does |
|---|---|
| `/board` | Print the board: sessions, roles, tasks, claims, and asks that are open, taken or settled in the last hour. |
| `/board role <name>` | Set this session's role (`api`, `tests`, `ui`, ...). `/board role clear` removes it. |
| `/board pane` | Open the Board tab in bws-cockpit's dashboard. Without bws-cockpit it prints the board as `/board` does. |
| `/board digest [days]` | Write the team digest page (1 day by default, up to 60) and print its path. |

Claude uses these tools, under `mcp__bws-board__`:

| Tool | What it does |
|---|---|
| `board_status { task? }` | The same listing as `/board`; can set the task line. |
| `board_ask { to, text, urgent? }` | Post an ask to a role, a session id, or `anyone`. |
| `board_take` | Take an ask. |
| `board_done { note }` | Finish a taken ask. |
| `board_decline` | Decline an ask. |
| `board_withdraw` | The asker withdraws its ask. |
| `board_send { to, text }` | Send a short note to a role, a session, or `all`. |
| `board_release { paths? }` | Give up claims; with no paths, all of them and the git lease. |

Set a role at launch with `BWS_AGENT_ROLE=tests claude`, or at any time with `/board role tests`. A role set with `/board` outlives `/clear`, `/resume` and `/branch` within the process. `BWS_AGENT_ROLE` is read on every heartbeat. Several live sessions can share a role: an ask to the role reaches each of them, and `/board` flags the duplicate.

## What it does

### Cards
Every session in the repository has a card: its session id, an optional role, its task (the first line of your latest prompt, with secrets redacted; a prompt another mod sends as your own words, such as bws-better's Run, counts as yours), busy or idle, its run folder (`runs/<date>-<slug>/` once it writes there), and the files it claimed.

### Claims
- Editing a file with Edit, Write or NotebookEdit claims it. So does a Bash or PowerShell command that plainly writes a file inside the repository: a redirect, `tee`, `sed -i`, `cp`, `mv`, or the PowerShell write cmdlets (command position only).
- Another live session's write to that file is refused before it runs. The refusal names the holder and its task and says how to ask for the file.
- A claim lapses `claimMinutes` after the holder's last edit of the file. All of a session's claims go when it exits or `/clear`s, or when its heartbeat stops for 90 seconds (a crash).
- This narrows the race, it does not remove it: two sessions that write in the same instant can both go on.

### Git lease
One session at a time runs git that changes the index, the checkout or refs in a working tree: `add`, `rm`, `mv`, `commit`, `push`, `pull`, `merge`, `rebase`, `reset`, `checkout`, `switch`, `restore`, `stash` (not `list` or `show`), `cherry-pick`, `revert`, `am`. Read-only git (`status`, `diff`, `log`, `show`, `branch`, `fetch`, ...) is never touched. Only commands where git is in command position count; `cd` and `git -C` are followed, and another repository is ignored.

- The first such command takes the session's lease. While a peer in the same working tree holds it, the command is refused. The reason names the holder, what it last ran and when the lease ends, and tells Claude to do other work instead of retrying.
- The lease ends when the holder's turn ends, `gitLeaseMinutes` after its last git command, on `board_release` with no paths, when it exits, or when its heartbeat stops for 90 seconds.
- Worktrees are separate: a session in another worktree of the repository never waits for this one.
- **No sweeping a peer's files.** A `git commit` is refused when it would include a file a live peer claims: the staged files, the modified tracked files for `-a`, and what an earlier `git add` in the same command would stage (`add -A`, `add .` and `add -u` count every modified and untracked file). The refusal names the files and gives the `git restore --staged` fix.

### No git overwrites of a peer's work
A git command that would overwrite or delete a file a live peer claims and has changed is refused, lease or no lease:

- `git stash` (push or save; untracked files too with `-u` or `-a`), `git reset --hard`, `git checkout -f`, `git checkout [<ref>] [--] <paths>` (including `.`), `git switch -f` or `--discard-changes`, `git restore <paths>`, `git clean -f` and `git rm`.
- Only files git says would change count: changes against HEAD for stash, hard reset and forced checkout; against the index for `checkout -- <paths>` and `restore <paths>`; what `git clean -n` with the same flags lists for clean. `git rm`, and a restore from another commit, count any named claimed file. A claim on a file its holder already committed never blocks.
- The refusal names the files and their holder and gives the path-limited form (`git stash push -- <your files>`, `git restore -- <your files>`).
- Not checked, because git itself refuses to overwrite local changes there: `stash pop` and `apply`, a branch switch without `-f`, `reset --merge` and `--keep`. A command after a `cd` the parser cannot follow (`cd "$WT" && ...`) is not judged, since it may run in another worktree. `git clean` is checked but does not take the lease.
- Known gap: `git checkout <branch> <file>` without `--` is checked against the index, so a peer's claimed file that is clean in the index could still be overwritten from that branch.

### Asks and messages
- A session posts what it needs with `board_ask`. A peer takes it (`board_take`), then finishes it (`board_done`) or declines it (`board_decline`). The asker can withdraw it. Two sessions taking the same ask: the earlier take holds.
- A done ask is copied into the asker's card, so it stays done after the doer leaves. An ask to a role nobody holds yet waits for one.
- `board_send` sends a short note to a role, a session or `all`.
- **Delivery.** News reaches a session's model in three places, always framed as coming from other sessions, not from the user: with the first message of a conversation (who is here, and the asks waiting for this session), after its next tool result, and with its next prompt. You get a toast.
- **Urgent wake.** `urgent: true` on an ask to a named role or session also sends it as a message that can start a turn in an idle session. A receiver gets at most one wake from a sender per `wakeMinutes`. Asks to `anyone` never wake anybody.

### History and the team digest
Each session keeps a history of what it did on the board, which outlives its card.

- **What is logged:** start and end, busy and idle turns, task changes; files claimed and edited, releases; refused edits (which file, and who held it); asks posted, taken, done, declined or withdrawn; messages sent (recipient only, never the text); urgent wakes sent or held back; the git lease taken (the subcommand only, never the command line) and every git command refused for it. Text is only what the card already holds redacted (task, ask text, notes), plus file paths.
- **`/board digest [days]`** writes one self-contained page, `digest.html`, in the board folder, and prints its path. It covers every session that worked in the window; sessions that only started and ended, like the one running the digest, are left out. It shows:
  - Totals: agents, summed busy time, parallel time (how long two or more agents were busy at once), asks done, median time to take and to finish, refused edits, wakes.
  - A timeline with one lane per session: busy turns, files held, and markers for asks, takes, dones, refused edits, wakes, messages and releases.
  - Tables: files held (a file two sessions held, or one with a refused edit, is flagged contested), asks with how long they waited, refused edits and git waits (who blocked whom, on which file or git command), and wakes per sender and receiver.
- Peer text is HTML-escaped. One small inline script only shows times in your local zone; without it, they read UTC. The page does not open by itself.

### Storage
Everything lives in `<CLAUDE_CONFIG_DIR or ~/.claude>/bws-board/<repo key>/`, one card file per session: `<session id>.json`.

- The repo key is the git root of the main working tree, so every worktree of a repository shares one board. Outside git it is the session root.
- Each session writes only its own card, so no two processes write the same file. A card read mid-write keeps the last good copy.
- On exit a session leaves a tombstone. At session start, card files untouched for a day are deleted.
- History goes in `history/<session id>.json` in the same folder. Only its own session writes it, rewriting the whole file, and it holds at most 5000 events. History files untouched for `historyDays` are deleted at session start.
- If the board cannot be read or written, it never blocks an edit. You are told once.

## Options

Set these in `/plugin`, or under `pluginConfigs["bws-board"].options` in settings.json.

| Option | Default | What it does |
|---|---|---|
| `board` | `true` | Join the board for this repository: post this session's card, read the others, claim edited files. |
| `claimMinutes` | `30` | A file claim lapses this many minutes after the session's last edit of it. |
| `urgentWake` | `true` | An ask marked urgent to a named role or session is also sent as a message that can start a turn in that session. |
| `wakeMinutes` | `5` | At most one urgent wake from this session to the same session within this many minutes. |
| `historyDays` | `14` | Keep each session's board history for `/board digest` this many days. `0` writes no history. |
| `gitLease` | `true` | Take turns at git, refuse a commit of files a live peer claims, and refuse git commands that would overwrite or delete a peer's changed files. |
| `gitLeaseMinutes` | `2` | The git lease lapses this many minutes after the holder's last git command (it also ends at the holder's turn end). |

## Permissions and data

- **Files:** reads and writes its own card and history folder under the Claude config folder, deletes day-old card files and expired history files in it, and writes `digest.html` there when asked. It reads `CLAUDE_CONFIG_DIR`, `USERPROFILE`, `HOME` and `BWS_AGENT_ROLE`.
- **Processes:** for the git lease it runs `git rev-parse` (once per folder) and, only when a peer claims a file in the tree, `git diff --name-only` and `git ls-files --others` before a commit, and `git diff` or `git clean -n` (a dry run) before a command that would overwrite files. It never runs a git command that changes anything. It deletes old card and history files through the shell (`del` or `rm`, those files only).
- **Messages:** it sends a message to another session only for urgent asks.
- **Network and models:** none.
- It never approves a tool call, and never logs prompt text beyond the redacted first line.
- Peer text is always marked as not coming from the user.

## Compatibility

- Checked on Claude Code 2.1.296 (and 2.1.301 for the Board tab), Windows 11, in headless runs and in Windows Terminal with two or more live sessions.
- The Board tab and chip need bws-cockpit 0.21.1 or later (the cards need 0.18.0 or later); without it, `/board` prints text.
- The git lease and overwrite guard look at commands in Bash and PowerShell. The lease ending at a turn end was checked in tests only, not in an interactive session.

## License

MIT. Version history: [CHANGELOG.md](CHANGELOG.md).
