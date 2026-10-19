# RUNLOG: tools/publish.py (release automation)

## Finish line
- Dry run on current main reports no diff vs the publish tip (1.7.1).
- Tests pass (`tools/test_publish.py`).
- AGENTS.md release bullet points at the script.

## Brief
Releases kept re-deriving the ritual from AGENTS.md prose. `tools/publish.py <mods...> --version X` now does it:
version + CHANGELOG checks vs the publish tip, scratch worktree on `publish`, `git restore --source=<main>` of the named
mods and the marketplace, file-list and content checks vs main, privacy scan of added lines, types copy, gate,
then prints (or with `--push` runs) push private main if behind, commit, push `publish:main` to mods, tag, `gh release create`.
No mods = verify mode ("is publish current?").

## Done
- Branch `feat/publish-script`, worktree `C:/Projects/bws.mods.claude-code.publish-script` (the shared checkout stays on main).
- `tools/publish.py`, `tools/test_publish.py` (12 tests: verify, refusals, dry run, `--push` to bare remotes incl. a
  file main deleted disappearing from publish, privacy stop + `--allow`, failing gate, scan patterns).
- `tools/mods-gate.py --root DIR` so the main tree's gate can gate the publish worktree.
- AGENTS.md "Never push main" / "Release steps" bullets now point at the script.

## Evidence
- receipts/verify-dry-run.txt: `python tools/publish.py` on main 59aa007 → no diff vs publish tip (1.7.1), exit 0.
- receipts/tests.txt: 12 tests OK.
- receipts/gate-publish-worktree.txt: real gate with `--root` on a scratch publish worktree with copied types.
- Privacy patterns over the whole current publish tree: 0 hits (no false positives on the published content).

## Notes / follow-ups
- Peer branch `fix/gate-restore-mcp-types` also edits mods-gate.py (lean MCP types restore); different hunks, should merge cleanly.
  publish.py does its own lean-types swap too, harmless if both land.
- The gate does not run `tools/test_publish.py`; add it next to the kit sync tests after the peer gate branch merges.
