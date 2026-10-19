# PLAN: bws-mods 1.7.1 patch bumps (shelf #36)

## Finish line
Every mod's patch version is bumped, with a CHANGELOG entry; marketplace 1.7.1 is on `mods` with tag v1.7.1 and a
GitHub release; `claude plugin update` on this machine moves each installed mod to its new version, and a headless
session loads all 13 at those versions.

## Why
1.7.0 changed READMEs, CHANGELOGs, manifests and three code comments without version bumps. The plugin cache is keyed
by version, so `plugin update` on other machines keeps the old files.

## Steps
1. Branch feat/1.7.1-bumps; bump 13 manifests (patch) and add a CHANGELOG entry each; marketplace 1.7.1.
2. Gate all 13 (validate, test, tsc); commit; merge into main; push private.
3. Refresh `publish` in a scratch worktree from main, verify, gate, commit, tag v1.7.1, push mods, gh release.
4. Update installed mods here with `claude plugin update`; confirm loaded versions; close shelf #36.
