# Brief: rewrite the README and write a CHANGELOG for your assigned mods

Repo: C:/Projects/bws.mods.claude-code (Claude Code mods). The mods are released through the private GitHub repo
bsmi021/bws-claude-mods as the `bws-mods` marketplace. The goal is polished, consistent, accurate docs. You touch ONLY
`<mod>/README.md` and a new `<mod>/CHANGELOG.md` for each mod assigned to you. Do not edit code, manifests, tests or any
other file. Another live session works in this checkout on `bws-interview`: never touch it, never run git add/commit.

## Sources of truth (read before writing)
- The current `<mod>/README.md` (facts, behaviour, options, commands; much of it is a dev log to be condensed).
- `<mod>/.claude-plugin/plugin.json` (version, description, userConfig options with defaults: the Options table must
  match it exactly).
- `<mod>/hooks/*.ts*` for anything you are unsure of: registered commands (`$.command.register`), tools
  (`$.tool.register`), what is read/written/run. Accuracy beats polish: never invent a feature or option.
- `git log --oneline -- <mod>` for the version history (commit subjects name versions).

## README: use this structure, in this order
```
# bws-<name>

> One sentence: what it does for you.

<2-4 sentences: the problem it solves and how, in plain words.>

## Install
    claude plugin marketplace add bsmi021/bws-claude-mods
    claude plugin install bws-<name>@bws-mods
Then `/reload-plugins`. Requires Claude Code 2.1.296 or later. Say if it pairs with another mod (most show a tab in
bws-cockpit's dashboard, 0.21.1 or later).

## Use
Commands as a table (| Command | What it does |), then keys/buttons/the dashboard tab if it has one.

## What it does
User-facing behaviour: short sub-sections or bullets. Keep the important details (limits, what happens on failure).

## Options
| Option | Default | What it does |  — every userConfig key from plugin.json, defaults exact. Say they are set in `/plugin`
or under `pluginConfigs["bws-<name>"].options` in settings.json. If none: "No options."

## Permissions and data
What it reads, writes, runs, sends over the network, which model calls it makes, what it never does. Be concrete.

## Compatibility
One short paragraph or 3-5 bullets: Claude Code version(s) checked, Windows 11, terminal / Desktop / headless support,
known limits. No run folders, no per-version test logs.

## License
MIT. Version history: [CHANGELOG.md](CHANGELOG.md).
```

## CHANGELOG.md
```
# Changelog

## 0.4.1
- <user-facing change, one line each>

## 0.4.0
...
```
Newest first, one section per version you can find (README history sections, git log subjects). User-facing wording.
Where the old README recorded how a version was verified, keep at most one short line ("Checked live in Windows
Terminal.") without paths.

## Rules
- Plain, direct English; short sentences; no marketing fluff; no emoji except glyphs the mod itself draws.
- Remove: every `runs/...` path, receipt names, "Tested" logs, personal names (Brian), machine specs, other projects or
  game names, absolute paths (use `~/.claude/...` style where a location matters). Keep the C:/Projects default of
  bws-cockpit's projectRoots option as the documented default.
- Links between mods: relative, e.g. `[bws-cockpit](../bws-cockpit/README.md)`.
- Fenced code blocks for commands. Tables for commands and options.
- Keep length proportional: a small mod's README can be short; do not drop real behaviour to make it short.

## When done
Reply with, per mod: the README's section list, the CHANGELOG's versions, and anything in the old README you dropped
or could not verify.
