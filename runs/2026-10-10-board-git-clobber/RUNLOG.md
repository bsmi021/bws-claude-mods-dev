# RUNLOG: bws-board 0.4.0, git overwrite guard (shelf #9)

## Brief
Shelf #9, a gap from the git-lease run. Git commands that overwrite or delete working-tree files (`stash`, `reset --hard`, `checkout .`, `restore`, `clean`, `rm`) had no write check, so once the lease had lapsed, or with no lease at all, one session could wipe another's uncommitted work. Plan and finish line: `PLAN.md`.

## Done
- **`shell.ts`:** a git op now carries `clobber {scope, isAll, paths, untracked?, args?}` and `isLease`.
  - Scopes, per the advisor:
    - `head`: changes vs HEAD (`stash`, `reset --hard`, `checkout -f`, `switch -f`, `restore --staged --worktree`)
    - `index`: changes vs the index (`checkout [--] <paths>`, `restore <paths>`)
    - `any`: the claim alone (`rm`, `checkout <ref> -- <paths>`, `restore --source`)
    - `clean`: what `git clean -n` lists
  - `clean` is a clobber but not a lease verb, so the confirmed A17 list is unchanged.
  - Excluded: `stash list/show/pop/apply/drop/clear`, mixed/soft/merge/keep resets, `checkout -b`, a switch without `-f`, `restore --staged`, dry runs, `rm --cached`.
- **`board.ts`:** `clobberDenyText`, with a fix for each verb (`git stash push -- <your files>`, `git restore -- <your files>`, ...).
- **`register.tsx`:**
  - `heldInClobber` runs git only when a peer claims a file in the tree:
    - `diff HEAD --name-only` (falling back to `--cached` plus worktree on an unborn HEAD), or `diff --name-only`
    - `ls-files --others` for `stash -u`
    - `git -c core.quotepath=off clean -n <args less -f/-q>` for clean
  - Shared helpers: `claimersIn`, `heldBy`, `gitNames`.
  - In `gitCheck` the order is lease → overwrite → commit. Only lease verbs take the lease.
  - The toast names the reason.
- **Corpus replay:** 570 of 79,355 commands are flagged. It found two false-refusal patterns, both fixed (A26):
  - `cd "$WT" && git checkout main -- …` (the publish-worktree flow): an unfollowable `cd` is now not judged.
  - `git rm $VAR`: a variable path now counts only changed files.
  - All unflagged samples were the intended exclusions. Receipt: `receipts/corpus-replay-clobber.md`.
- **Tests:** 82/82. Three detector unit tests, plus four plugin tests:
  - everything refused
  - path-limited, committed-claim and unfollowable-`cd` commands going on
  - delete or restore-from-commit refused on a committed claim
  - `clean` never leasing, and alone no git runs
- Version 0.4.0; option and README text updated.

## Live run (`live-clobber.sh`, `receipts/live/`)
Haiku, headless, scratch repo, default options, no lease anywhere.
- A changed `a.txt` and created `new.txt`, then held its turn.
- B was refused for each of these, naming A's file:
  - `git stash` (a.txt)
  - `git checkout .` (a.txt)
  - `git reset --hard` (a.txt)
  - `git clean -fd` (new.txt)
- B's `git stash push -m mine -- b.txt` went through.
- Afterwards: `a.txt` = "from A" and `new.txt` = "new work from A". `git status`: ` M a.txt`, `?? new.txt`. One stash, B's.
- `/board digest`: 2 agents, 4 refused edits.

## Assumptions
- A22: `gitLease` gates this too.
- A23: what is excluded.
- A24: `clean` is checked via `-n` and not leased.
- A25: a checkout's names are read as paths.
- A26: an unfollowable `cd` is not judged; variable `rm`/restore paths count only changed files.

## Also this session
Brian asked to file the remaining shelf ideas as issues on bsmi021/bws-claude-mods-dev (#1–#6, covering shelf #1, #3–#6 and #10) and to clear the shelf. Shelf #10 (plain `rm`/`Remove-Item` of a claimed file) came up here and went straight to issue #6.

## Next
None. Publishing only when Brian asks.
