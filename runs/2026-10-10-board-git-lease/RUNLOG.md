# RUNLOG: bws-board 0.3.0, the git lease (shelf #2)

## Brief
Shelf idea #2: a commit/push token on the board, so only one session at a time commits or pushes, and the others wait. Sessions sharing one working tree race on `index.lock`, and one session's `git add -A` / `commit` sweeps up a peer's half-done files. Plan and finish line: `PLAN.md`.

## Done
- **Detector (`shell.ts` `gitOps`).**
  - Finds git at command position. It skips global options and follows `cd` and `-C`.
  - `--git-dir` and `--work-tree` are left alone.
  - It knows `commit -a` (including clusters like `-am`) and `add -A/-u/./globs`.
  - A commit records what earlier adds in the same command would stage. This was the advisor's catch: the check runs before the command, so `git add -A && git commit` would otherwise pass.
- **Lease (board.ts).**
  - New card field `git {since, at, verb, tree}`, holding the verb only and never the command line.
  - `gitHolder` uses the same tie rule as claims.
  - New helpers: `takeLease`, `gitDenyText` (tells the model not to loop), `stagedDenyText` (gives the `git restore --staged` fix), plus lease lines in peer and status output.
- **register.tsx.**
  - `treeOf` runs `git rev-parse --path-format=absolute --show-toplevel --git-common-dir`, cached per folder. An op counts only when its common dir is `<board folder>/.git`. Git 2.54 is installed and the flag needs 2.31.
  - `heldInCommit` runs git only when a live peer claims a file in the tree. It checks the staged files, `diff` for `-a`/add-all, `ls-files --others` for add-all, and the add's paths.
  - `gitCheck` is merged into the existing Bash/PowerShell tool.call hook, after the write check.
  - Turn end drops the lease. `turn.complete` now **awaits** the idle write. Before, it was fire-and-forget, so a late idle write could land after the next prompt's busy write. The tests also need the write done before they read the card.
  - `board_release` with no paths also drops the lease.
- **History and digest.**
  - New history kinds `gitHold {verb}` and `gitWait {verb, holder}`. A staged refusal logs `deny` per peer file.
  - The digest shows git waits in "Refused edits and git waits" and keeps them out of the files table. A new `gitWaits` total appears in the KPI subtext.
- **Options:** `gitLease` (default true) and `gitLeaseMinutes` (default 2). Version 0.3.0.
- **Tests:** 75/75. The new ones:
  - `tests/git.test.ts`: the detector, lease holder and ties, takeLease, card round trip, and texts.
  - 5 plugin tests:
    - the lease and its turn-end release
    - lapse and release
    - the staged sweep: `add -A`, already staged, `add <dir>`, `commit -a`, and own-file-only passes
    - alone, another repo, or a peer without claims: no diff is run
    - `gitLease` off
- **Corpus replay:** 79,355 real commands, 4,054 with lease ops, 12 µs per command. No real git command at command position was missed. All 14 strict-check leftovers are verbs inside quoted text. Receipt: `receipts/corpus-replay-git.md`. Scripts: `corpus_replay_git.mts`, `corpus_misses_git.mts`.

## Live run
Script: `live-git.sh`, run with `live-settings.json` (gitLeaseMinutes 1). Haiku, headless, scratch repo. Receipts: `receipts/live-run1/` (first run) and `receipts/live/` (after the fix).
- **A (api):** wrote `a.txt`, ran `git add a.txt` and took the lease, then held its turn open.
- **B1 (tests), 10–14 s later:** `git add b.txt && git commit` was refused. The refusal names `api`, says it "ran git add 7s ago", and says not to loop. B1 did not retry.
- **B2 (tests), 70 s after A's add:** A's lease had lapsed, but A was still live and still claimed `a.txt`.
  - `git add -A && git commit` was refused: "It would commit a file another live session claims: a.txt (held by api)", with the `git restore --staged` fix.
  - **Run 1 found a false refusal.** B's one-command fix, `git restore --staged -- a.txt && git add -- b.txt && git commit`, was refused again, because the check ran before the restore. B recovered by splitting the command.
  - **Fix:** `gitOps` now tracks `restore --staged` and mixed `reset` before a commit (`staged.dropped` / `isReset`), and `heldInCommit` leaves those files out. There are unit and plugin tests for it.
  - **Run 2:** the same one-command fix went through, and B committed only `b.txt`.
- **A, released:** `git add a.txt && git commit` went through.
- **Final log** (both runs): init → `B: b.txt` (b.txt only) → `A: a.txt` (a.txt only), with a clean tree.
- **`/board digest` (run 1):** 3 agents and 2 refused edits. The table lists the `git add` wait and both refused `a.txt` commits. The summary line now also counts git waits; that was added after the runs.
- Every git command and refusal is in the history files under `receipts/live*/history/`.

## Decisions and assumptions
- A15: the lease lasts 2 min after the last git command, and ends at turn end.
- A16: the lease is per working tree.
- A17: the verb list.
- A18: the staged check is conservative.
- A19: a refusal is a deny, not a wait.
- Shelved #9: protect claimed files from working-tree clobbers (stash, `reset --hard`, `checkout .`, `restore`) once the lease has lapsed. That is a claims gap, not part of shelf #2.

## Next
Nothing open beyond the finish line. Publishing to the `publish` branch happens only when Brian asks.
