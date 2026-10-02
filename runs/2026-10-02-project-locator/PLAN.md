# PLAN: Project Locator (mod #6 from the usage review), inside bws-cockpit

## Pain (runs/2026-10-02-usage-analysis)
- 351 Glob/Grep timeouts (20 s each) in 30 days.
- The top ones are home-folder sessions scanning all of `C:\Projects` or `C:\Users\<user>` for project markers:
  - Glob `*` on C:\Projects: 34
  - `*/*.uproject` on C:\Projects: 32
  - `**/*.uproject`: 14 on cwd, 13 on C:\Projects, 6 on home
  - more like these
- That is about 2 hours of waiting, plus the turns spent recovering.

## What exists on disk (surveyed 2026-10-02)
- 58 top-level folders under C:\Projects.
- `.uproject` files sit 1–3 folders down (e.g. `bws.game.axo/game/Axo/Axo.uproject`).
- Unity projects (`ProjectSettings/ProjectVersion.txt`) sit 1–2 folders down (e.g. `old-drive/RPG Project`).

## Finish line (all true, receipts in this folder)
1. **Project index.** A scan of the configured roots (setting `projectRoots`, default `C:\Projects`), 3 folders deep. It skips build and content folders: node_modules, .git, Content, Library, Intermediate, Saved, DerivedDataCache, Binaries, runs, Plugins, Assets, Packages, Temp, obj, build, .venv, Source.
   - Each project records:
     - name and path
     - kinds: unreal (with the `.uproject` path), unity (with the editor version from ProjectVersion.txt), node (with the package.json name), android (settings.gradle), python (pyproject.toml), git
     - harness loops (`Tools/*/loop.json`) and whether it has `runs/`, AGENTS.md or CLAUDE.md
     - last activity (newest marker or top-level mtime)
   - Kept in `$.store` and rebuilt when older than 6 hours, or on `/projects refresh`.
2. **`find_project` tool** (`mcp__bws-cockpit__find_project`, registered at session start). Input `{ query?, kind? }`. It returns the matching projects with their paths and facts, newest first, fuzzy-matching on the folder, uproject, package and Unity names.
3. **Glob answered from the index.** When a Glob looks only for `*.uproject` or `ProjectVersion.txt` under a configured root, the hook answers at once from the index with Glob's own result shape (`{ filenames, numFiles, durationMs, truncated }`).
   - Patterns made only of `*` and `**` segments plus the marker.
   - A note tells the model the answer came from the index.
4. **Hopeless Globs refused with a hint.** The same marker Globs over the whole home folder or a drive root are refused at once, with a hint (`find_project`, or a Glob under a project root), instead of timing out after 20 s.
   - Any other Glob or Grep passes untouched.
5. **First-message context.** When the session folder is home or a configured root (not inside a project), the first message gets a compact project list: the 40 newest, as name · kinds · key fact · path.
6. **`/projects`** prints the list as text; `/projects refresh` rebuilds the index.
7. **Settings:** `projectLocator` (on), `projectRoots` (`C:\Projects`).
8. **Tests:**
   - index building from a stubbed tree: kinds, the uproject path, the Unity version, the skip list, the depth limit
   - find_project matching and kind filters
   - Glob answered for each marker pattern shape, and passed for non-marker patterns
   - the home-folder refusal
   - context only outside a project
   - `/projects` and refresh
   - off switch
   - Plus: validate clean, tsc strict clean, existing 66 tests green.
9. **Live:**
   - a headless session in the home folder whose Glob `**/*.uproject` on C:\Projects returns the real uprojects in well under a second
   - a `find_project` call that finds the street-war uproject
   - an interactive or headless `/projects` listing
10. README, RUNLOG, local commit. `publish` is not refreshed unless Brian asks.

## Out of scope (parked)
- Grep timeouts: content search can't come from an index.
- Glob for package.json and similar, where the index would be incomplete (nested node_modules, monorepos).
