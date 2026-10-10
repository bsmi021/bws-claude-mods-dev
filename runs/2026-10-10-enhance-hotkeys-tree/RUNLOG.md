# RUNLOG: bws-enhance 0.2.0 (hotkeys + project tree)

## Brief
Fix the pane's s/r/d hotkeys (keys went into the prompt box) and give the rewriter a project file tree. Mid-task: Brian asked
which model rewrites (Sonnet) and whether it can be Haiku: default switched to `haiku` (option `model` still overrides).

## Root cause (hotkeys)
Types, PaneOpenArgs.focus: "A request, not a grant: the surface focuses the pane only while the prompt has the keys over an
empty composer ... text in the composer ... refuse it". 0.1.0 filled the box and then asked for focus: always refused.
Live retest showed a second cause: the pane was already open from the "Enhancing…" state, and opening an open id only retitles it.
Fix: when the rewrite lands, clear the box, close the pane, open it again with focus (Send has autoFocus), then fill the box.
The pane shows "s send · r revert · d dismiss · Esc to edit in the box" only while focused (e.props.isFocused).

## Tree
lib.ts treeEntries/treeLine (pure: skip .git, node_modules, runs, dist/build/out/bin/obj/target, caches, UE/Unity output,
anything under .claude-plugin; folders first). register.tsx walkTree: $.fs.list, depth 2, 150 entries. Goes in <project_tree>.

## Checks
validate pass (receipts/validate.txt), 16/16 tests (receipts/tests.txt, incl. tree content and "box empty at the focused open"),
tsc 5.6 strict clean. Synced to ~/.claude/dev-mods/408c3d09.../bws-enhance.

## Live (drive-screen, test window launched with --plugin-dir ./bws-enhance)
- 03-ready.png: tree confirmed: for "what does bws-notify do" the rewrite names sibling folders bws-design-picker, bws-enhance,
  bws-shell-lint (only the tree could tell it). Last time it said "find where it lives".
- 03-ready.png also: pane NOT focused (no hotkey hint) -> found the re-open cause above, fixed, plugin hot-reloaded (04-reset.png).
- 05/06: retest corrupted: stray text ("set", then "mo") landed in the test window and the footer showed "REC · tap to send"
  (voice dictation into the window). "mo/enhance ..." went in as a plain prompt and ran a read-only README summary. Stopped
  driving per drive-screen rules; window closed.

## Not verified
- s / r / d after the close-and-reopen fix: needs a clean live retest (no dictation running).

## Next
- Retest: /enhance <x> in a fresh window -> pane shows the hotkey hint -> press r (box gets the rough prompt back), then s.

## Installed for all projects
Appended C:/Projects/bws.mods.claude-code/bws-enhance to CLAUDE_CODE_PLUGIN_DIRS in ~/.claude/settings.json
(backup: ~/.claude/settings.json.bak-enhance). Verified: fresh `claude -p "/enhance ..."` from the home folder lists
bws-enhance among loaded plugins and returns a rewrite.
