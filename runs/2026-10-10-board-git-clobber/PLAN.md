# bws-board 0.4.0: git commands can't overwrite a peer's claimed files

Shelf idea #9, a gap found while building the git lease (`runs/2026-10-10-board-git-lease`). Some git commands overwrite or delete working-tree files with no write check: `stash`, `reset --hard`, `checkout .`, `restore`, `clean`, `rm`. Once the lease has lapsed, or with no lease at all, one session can wipe another's uncommitted work in a single command.

## Finish line

- [x] **Refused when it would destroy a peer's work.** The command is refused when it would overwrite or delete a file another live session claims and has changed:
  - `git stash` (push/save; untracked files too with `-u`/`-a`)
  - `git reset --hard`
  - `git checkout -f`, `git checkout [<ref>] [--] <paths>`, including `.`
  - `git switch -f` / `--discard-changes`
  - `git restore <paths>` (the worktree; not `--staged` alone)
  - `git clean -f` (untracked)
  - `git rm` (not `--cached`)

  The refusal names the files and their holder, and gives the path-limited form that leaves them alone. Each refused file is logged as a `deny`. Proof: unit and plugin tests.
- [x] **Precise, not blanket.** A peer's claim only counts when git says the file would change:
  - tracked changes vs HEAD for reset, stash, checkout and restore
  - untracked files for `clean` and `stash -u`
  - `git rm` counts on the claim alone, since it deletes the file

  A path-limited command (`restore -- mine.ts`, `stash push -- mine.ts`) passes when it leaves peers' files alone. A branch switch without `-f` is untouched, because git itself refuses to overwrite local changes there. Proof: tests.
- [x] **Costs nothing alone, never blocks on failure.** Git runs only when a live peer claims a file in the tree. A git failure lets the command through. The `gitLease: false` option turns this off too. Proof: tests.
- [x] **Parser replay.** The clobber detector is replayed over the real-command corpus and spot-checked. Receipt: `receipts/corpus-replay-clobber.md`.
- [x] **Live run.** A (api) changes the tracked `a.txt`, creates `new.txt`, and holds its turn without running git. B (tests), with no lease anywhere:
  - `git stash`, `git checkout .`, `git reset --hard` and `git clean -fd` are each refused.
  - `git stash push -- b.txt` goes through.

  Afterwards A's `a.txt` and `new.txt` are intact. Receipts go in `receipts/live/`.
- [x] **Checks and docs.** validate, test and tsc pass. README updated and version 0.4.0. Committed, and shelf #9 closed.

## Design

- `shell.ts`: a git op gains `clobber?: { scope: 'tracked' | 'untracked' | 'both' | 'any'; isAll: boolean; paths: string[] }`, plus `isLease`.
  - `clean` is a clobber but not a lease verb, so the confirmed A17 verb list stays as it is.
  - Paths are joined to the `cd` / `-C` folder, as for add.
  - A `checkout` without `--` treats every named argument as a possible path. A branch name only matters if a peer-claimed file sits under that name, which is harmless.
  - Dry runs (`-n`, `--dry-run`), `stash list/show/pop/apply/drop` and `rm --cached` are not clobbers.
- `register.tsx`: `heldInClobber` checks peer claims in the tree.
  - It needs a live peer with claims in the tree first.
  - Then it reads tracked changes with `git diff HEAD --name-only -z`, falling back to `diff --cached` plus `diff` on an unborn HEAD, and untracked files with `git ls-files --others --exclude-standard -z`.
  - Run inside `gitCheck`, after the lease check and before the commit check.
- History: a `deny {file, holder}` for each file, so the digest already shows it.
- The `gitLease` option description says it also guards against overwrites.

## Tasks

- [x] T1 Clobber parsing in shell.ts and the deny text in board.ts. Unit tests.
- [x] T2 `heldInClobber` and its wiring in register.tsx, the option text, plugin tests.
- [x] T3 Corpus replay.
- [x] T4 validate, test and tsc → receipts.
- [x] T5 Live run.
- [x] T6 README, 0.4.0, RUNLOG, commit, close shelf #9.
