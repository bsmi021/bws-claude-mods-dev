# RUNLOG: Project Locator

## Objective
Build mod #6 from the usage review inside `bws-cockpit` (version 0.4.0). It stops the Glob timeouts (351 in 30 days, 20 s each) that came mostly from home-folder sessions scanning all of C:\Projects or the home folder for `.uproject` files. The finish line is in [PLAN.md](PLAN.md).

## Actions
- **Surveyed the real tree:** 58 top-level folders. `.uproject` files sit 1–3 folders down (Axo at `bws.game.axo/game/Axo/`); Unity projects sit 1–2 down (`old-drive/RPG Project`). That set the scan depth to 3.
- **Checked the Glob result shape** in the 2.1.287 tool types: `{ durationMs, numFiles, filenames, truncated }`. A `tool.call` hook can answer a Glob in that shape.
- **`hooks/projects.ts`** (pure): the entry type, skip list, Unity version and package parsing, marker-glob detection, glob-to-regex, `splitGlob`, `isTooWide`, `findProjects` and text formatting.
- **`hooks/register.tsx`:**
  - the index (`scanDir`/`scanProjects`, cached 6 h in `$.store`, one shared scan)
  - the `find_project` tool and the `/projects [refresh]` command
  - the Glob hook (answer under a root; refuse over home or a drive; everything else passes)
  - the project list in the first-message context, merged into the existing `prompt.context` hook
- **`plugin.json`:** settings `projectLocator` and `projectRoots`; version 0.4.0.
- **Tests:** 13 new in `tests/projects.test.ts`, on a stubbed tree with a skipped-folder `.uproject` and one too deep. 79 total, all passing first run. Validate clean, tsc strict clean.
- **Live** (`receipts/`):
  - `/projects refresh` from the home folder indexed 65 projects in 9 s, including Claude Code's startup (`live-projects.txt`).
  - Headless from the home folder (`live-glob.txt`):
    - A Glob for `**/*.uproject` over C:\Projects was answered from the index in 4 ms with 7 files. That matches the earlier `find` survey exactly.
    - The same Glob over `C:\Users\bsmi0` was refused at once with the hint.
    - `find_project "street war"` returned the folder, `.uproject`, harness loop, runs/ and AGENTS.md.
  - The `�` in the receipt is the Windows console printing `·`. The raw result holds U+00B7.

## Finish line

| # | Item | Status |
|---|---|---|
| 1 | Index (kinds, uproject, Unity version, package, loops, runs, AGENTS, activity; skip list; depth 3; cached 6 h) | ✅ tests + live (65 projects) |
| 2 | `find_project` tool | ✅ tests + live |
| 3 | Marker Globs under a root answered in Glob form | ✅ tests + live (4 ms, 7 files) |
| 4 | Marker Globs over home or a drive refused; others pass | ✅ tests + live |
| 5 | Project list for home/root sessions only | ✅ tests |
| 6 | `/projects`, `/projects refresh` | ✅ tests + live |
| 7 | Settings | ✅ |
| 8 | Tests, validate, tsc | ✅ 79/79 |
| 9 | Live | ✅ |
| 10 | README, RUNLOG, commit | ✅. `publish` not refreshed |

## Not verified live
- The first-message project list in an interactive home-folder session. It is covered by tests.

## Follow-ups (parked)
- Grep timeouts: content search can't come from an index.
- `package.json` Globs, where the index would be incomplete.
- Refreshing `publish` with 0.4.0 when Brian asks.

## Publish refresh (2026-10-02)
- The pre-scan found real project names in the new test fixture and README: street-war/StreetWar, game.axo/Axo, heim, scribe, greybox-harness.
  - Replaced with arena-game/ArenaGame, game.critter/Critter, castle-unity, notes-app and build-harness. One expected Glob order changed with the names.
  - Committed on main as a82becf. 79/79.
- **`publish` refreshed** from main with bws-cockpit 0.4.0. The top README mentions the Project Locator. Committed on top of 6ab1542; 26 files.
  - Scan: only the already-scrubbed fixture paths, the generator comments and the manifest authors (kept by design).
  - Validate passes for both plugins; bws-cockpit 79/79 and bws-shell-lint 16/16, run from the publish tree.
  - Not pushed; no remote is configured.
