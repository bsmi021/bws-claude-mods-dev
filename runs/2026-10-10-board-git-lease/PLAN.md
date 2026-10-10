# bws-board 0.3.0: the git lease

Shelf idea #2: a commit/push token on the board, so only one session runs git at a time and the others wait. Sessions sharing one working tree race on `.git/index.lock`. Worse, one session's `git add -A` / `git commit` sweeps up a peer's half-done files.

## Finish line

- [x] **One git at a time.** A Bash or PowerShell command that runs an index- or ref-changing git subcommand at command position takes the session's git lease. While another live session in the same working tree holds the lease, that command is refused with a reason saying who holds it, what it ran, and when the lease lapses.
  - Subcommands that take the lease: add, rm, mv, commit, push, pull, merge, rebase, reset, checkout, switch, restore, stash (not list/show), cherry-pick, revert, am.
  - Read-only git is never touched: status, diff, log, show, branch, fetch, and so on.
  - The lease lapses `gitLeaseMinutes` (default 2) after the holder's last git command. It also ends at the holder's turn end, on `board_release` with no paths, and at session end.
  - Proof: unit and plugin tests.
- [x] **No sweeping a peer's files.** A `git commit` is refused, while a peer is live in the same tree, when it would include a file that peer claims. The check covers the staged files, plus modified tracked files for `-a`/`--all`. The refusal names the files and gives the `git restore --staged` fix. Proof: plugin test with a stubbed `git diff`.
- [x] **Costs nothing alone, never blocks on failure.** A session with no live peer is never refused. A git or board failure lets the command through. `gitLease: false` turns all of it off. Proof: tests.
- [x] **Visible.** board_status, `/board` and the pane show who holds git. History logs the hold and every refusal, and the digest's refused-edits table lists git waits. Proof: tests.
- [x] **Parser replay.** The git detector is replayed over the real-command corpus (session-bus `corpus_build.py`). Spot-check the hits and the misses at command position. Receipt: `receipts/corpus-replay-git.md`.
- [x] **Live run.** Two headless sessions in a scratch repo:
  - A stages its file and holds its turn.
  - B's `git commit` is refused by the lease.
  - Once A's lease lapses, with A still live, B's `git add -A` + commit is refused for A's claimed file, and B commits only its own file.
  - The lease is set to 1 minute for the run: in `claude -p`, A's turn end is its exit, which drops its claims too.
  - Receipts go in `receipts/live/`.
- [x] **Checks and docs.** validate, `claude plugin test` and tsc pass. README updated and version 0.3.0. Committed, and shelf #2 closed.

## Design

- **Detector**, in `shell.ts`: `gitOps(cmd, dialect)` → `{ verb, dir?, isAll }[]`.
  - Uses the command-position invocations and the same `cd` tracking as `writeTargets`.
  - Skips git's global options. `-C`, `-c`, `--git-dir` and `--work-tree` take a value; `-C` sets `dir`.
- **Tree:**
  - `git rev-parse --path-format=absolute --show-toplevel --git-common-dir`, run in the op's directory and cached per directory.
  - The op counts only when its common dir is `<board folder>/.git`, so another repo is ignored.
  - The lease is per working tree (the toplevel). A worktree session never blocks the main tree.
- **Card:** a new optional field `git: { since, at, verb, tree } | null`.
  - It stores only the verb, never the command line (push URLs can carry tokens).
  - The holder is the live peer whose lease is still fresh in the same tree. Ties go to the earlier `since`, then the smaller id, as with claims.
- **Staged check:** only when a live peer is in the same tree.
  - `git -C <top> diff --cached --name-only -z`, plus `git diff --name-only -z` for `-a`.
  - Each path is joined to the top, then checked with `claimHolder`.
  - A pathspec commit (`git commit <paths>`) gets the same staged check, which is conservative.
- **Hook:** merged into the existing Bash/PowerShell `tool.call` hook, after the write check.
- **History:**
  - `gitHold {verb}` is logged when the lease is newly taken.
  - `gitWait {verb, holder, holderRole}` is logged for each lease refusal.
  - `deny {file, holder}` is logged per peer file in a staged refusal. That file is a real file held by the peer, the same signal as today.
  - The digest's blocks table shows a git wait as `git <verb>` in the file column.
- **Options:** `gitLease` (boolean, default true) and `gitLeaseMinutes` (number, default 2).

## Tasks

- [x] T1 `gitOps` in shell.ts, plus lease helpers in board.ts (`gitHolder`, `gitDenyText`, `stagedDenyText`, card parse, peer/status lines). Unit tests.
- [x] T2 register.tsx: tree lookup, lease take and refuse, staged check, release at turn end and on board_release, history, options. Plugin tests. Digest rows.
- [x] T3 Corpus replay → receipt.
- [x] T4 validate, test, tsc → receipts.
- [x] T5 Live two-session run → receipts.
- [x] T6 README, 0.3.0, RUNLOG, commit, close shelf #2.
