# RUNLOG: bws-mods 1.7.1 patch bumps (shelf #36)

## Brief
Bump every mod's patch version so `claude plugin update` on other machines picks up the 1.7.0 docs and manifests, and
release it as bws-mods 1.7.1.

## Done
- 13 manifests bumped one patch, each with a CHANGELOG entry; marketplace 1.7.1. Commit 001ff7a, merged to main c1c2693, pushed `private`.
- `publish` bfd4c2e (27 files, all manifests and changelogs), tag v1.7.1, pushed `mods`.
  Release: https://github.com/bsmi021/bws-claude-mods/releases/tag/v1.7.1
- Shelf #36 closed as done.

## Evidence
- receipts/gate.txt: validate, tests and tsc 5.8.3 clean for all 13, in the working tree; the same again in the publish worktree.
- The publish worktree matched main exactly for the 13 mod folders and the marketplace.
- receipts/update.txt: plain `claude plugin update` moved all 13 installed mods to the new versions, no reinstall.
- receipts/live-load2.txt: a headless session with `CLAUDE_CODE_PLUGIN_DIRS` emptied loaded all 13 at the new versions; the 4 MCP servers connected; pluginConfigs unchanged by the update.

## Next
- None.
