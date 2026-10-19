# RUNLOG: publish polish (bws-mods 1.7.0)

## Brief
Clean up and dress up every mod for a new release on the private `mods` repo (bsmi021/bws-claude-mods). Include
bws-interview. Brian clarified that "publish" means a new release on the private repo, not a public launch.

## Done
- Manifests: author bsmi021, homepage, repository, license MIT, keywords, all 13 mods. Marketplace 1.7.0 with bws-interview.
- READMEs in one template, with a CHANGELOG for every mod; stale "Summary chip" sections removed.
- New landing README (ROOT-README.md, published as README.md on `publish`).
- Comments that cited private `runs/` folders reworded (secrets, shell-lint, skillgate): e219cf2.
- main merged (eee22d8) and pushed to `private`.
- `publish` 45a6df8, tag v1.7.0, pushed to `mods`. Release: https://github.com/bsmi021/bws-claude-mods/releases/tag/v1.7.0

## Evidence
- Publish worktree matched main exactly for the 13 mod folders and the marketplace: same file list, `git diff --cached --quiet` clean.
- Gate inside the publish worktree, all 13 mods: validate passed, 0 test failures, tsc 5.8.3 clean.
- Privacy scan: only the bsmi021 handle, the C:/Projects default and generic test fixtures remain.

## Decisions
- projectRoots default kept at `C:/Projects`. The "off until set" answer assumed public users, and the repo stays private.
- Mod versions unchanged (docs and manifests only); bws-interview ships as 0.1.0.

## Next
- None for this run. bws-interview's dashboard tab and a live interview round still need a hand check (see its README).

## Install on this machine (2026-10-19)
- `claude plugin marketplace update bws-mods` pulled 45a6df8 (1.7.0). Installed bws-interview 0.1.0; bws-better 0.2.0 was not installed and was added.
- The installed copies of the other 12 were pre-1.7.0 files (no CHANGELOG, old manifests): the plugin cache is keyed by version, and 1.7.0 bumped none. Fix: uninstall, delete that version's cache folder, reinstall.
- Uninstall drops the plugin's `pluginConfigs["<mod>@bws-mods"]` entry: bws-cockpit's options were restored from a backup.
- Verified: all 13 cache folders match the marketplace clone (only `.in_use` differs); a headless session with `CLAUDE_CODE_PLUGIN_DIRS` emptied loaded all 13 from the cache, with the interview, board, cockpit and secrets MCP servers connected.
