# Polish the mods for a public GitHub repo (bws-mods 1.7.0)

Brian (2026-10-19): "get all of the mods cleaned up, dressed up, etc, and ready for publishing to github repository".
Clarified mid-task: "publish" means the private repo bsmi021/bws-claude-mods with a new release (publish branch, tag, a
GitHub Release with notes), not a public launch. So: credit `bsmi021`; projectRoots keeps its C:/Projects default (the
"off until set" answer assumed public users); no repo description/topics/visibility changes.

## Finish line
1. The 12 published mods each have a README in the template below, a CHANGELOG.md, and a manifest with
   author {name: bsmi021, url}, homepage, repository, license MIT, keywords. No `runs/` paths, no dev-log "Tested" histories,
   no personal names or machine details anywhere in the publish tree.
2. Root README is a landing page: what this is, the mod table, install, requirements, license.
4. Every mod passes tsc, validate and plugin test in the publish worktree; privacy scan clean.
5. Released as bws-mods 1.7.0: publish branch pushed to the private repo, tag v1.7.0, a GitHub Release with notes.

## README template (every mod)
```
# bws-<name>

> One sentence: what it does for you.

<2-4 sentence intro: the problem, the gist.>

## Install
claude plugin marketplace add bsmi021/bws-claude-mods
claude plugin install bws-<name>@bws-mods
(then /reload-plugins). Requires Claude Code 2.1.296 or later. Note any companion mod (bws-cockpit for the dashboard tab).

## Use
Commands table (| Command | What it does |), hotkeys, the dashboard tab if any.

## What it does
Short sections or bullets, user-facing behaviour only.

## Options
| Option | Default | What it does |   (set through /plugin, or pluginConfigs in settings.json)

## Permissions and data
What it reads, writes, runs, sends; network; model calls; what it never does.

## Compatibility
Claude Code version tested, OS, surfaces (terminal / Desktop / headless), known limits. Concise, no run folders.

## License
MIT. See [CHANGELOG.md](CHANGELOG.md) for versions.
```

## CHANGELOG.md (every mod)
Keep a Changelog style, newest first, one section per version present in the old README/manifest history, user-facing
wording; the verification notes condensed to one line each where useful. No run folder paths.

## Out of scope
bws-interview (another session's, unpublished), any behaviour change, screenshots, repo visibility.
