# DECISIONS: M6 DreamPath (extends bws-memory)

## D1. Is there a compaction event? (FR-DP-03)
Yes. The generated types (`bws-memory/.claude-plugin/types/claude-code/index.d.ts`) declare the event
`session.compact` (`SessionCompactInput`: `trigger` = `manual | auto | plugin | precompute`, `agentId?`, `instructions?`,
`messages`). So the "before a compaction" trigger is built, not skipped.
- The hook is observe-only: it returns `next(e)` at once and defers the work with `$.clock.after`, so a compaction is
  never held up and no fork is awaited inside it.
- Acts on `manual`, `auto` and `plugin` compactions of the main conversation (`dreamOnCompact`).
- Ignores `precompute` (installs nothing, may never become a compaction) and any `agentId` (a subagent's or fork's own
  transcript).
- Headless runs are ignored (no pane to preview in).
- Test note: the test `$.session.compact(input)` forwards `trigger` and `messages` as given (a non-empty `messages` list
  is required, or the engine skips the hook), so `manual` is exercised directly.

## D2. No file delete: "removed" means emptied
`$.fs` offers read, write, list and exists only. A removed or merged-away memory file is written as an empty file; its
MEMORY.md line is dropped; its sources.json rows are dropped (remove) or re-pointed to the surviving file (merge). The
dream's own reader ignores empty files, so a dreamed folder does not feed dead files back into the next plan. M4's
`loadExisting` is unchanged (FR-ALL-08), so an emptied file still appears in M4's "existing files" list for the memory
fork (it is listed with its file name as name and no description). The backup holds the original text, and
`/dream undo` writes it back.

## D3. The 40% rule counts only `remove` actions
"A plan that deletes more than 40% of the files": a merge keeps its facts in the target, so merged-away files are not
counted. Otherwise the two-file near-duplicate merge in AC-DP-01 (1 of 2 = 50%) would always be rejected. Exactly 40%
passes; the base is the number of live files shown to the fork.

## D4. What the fork may touch
Only non-empty `.md` files (not `MEMORY.md`), at most 40 of them, each at most 4,000 characters. A longer or later file is
left alone and reported as skipped, because the fork is shown whole texts only (it could otherwise "rewrite" a
cut-short text and lose facts). A plan naming any other file is rejected as unknown.

## D5. Preview, apply, undo
- `/dream` previews (pane on a screen; the plan as text headless). `/dream apply` (or `--apply`) applies the waiting
  preview, or plans and applies in one command when none waits. Automatic runs only preview.
- Apply refuses when a file the plan touches changed after the preview (a fingerprint per file in the dream atom).
- Backup: every `.md` file, `MEMORY.md` and `sources.json` are copied to `<memoryDir>/.dream-backup/<UTC yyyymmdd-hhmmss-mmm>/`
  before anything is written. `/dream undo` restores the newest backup once (a `restored.json` marker is written into it).
- Apply and undo clear M4's `.undo/last.json` record: it describes the folder before the dream and would restore into a
  state that no longer exists.

## D6. Sessions (FR-DP-04)
A file's sessions are its rows in sources.json (per write: file, session, at, kind). The frontmatter is not changed (M4's
tests pin `memoryFile` byte for byte). The plan prompt lists each file's sessions; a merge moves the merged-away files'
rows to the target so the target's sessions are the union; the pane shows the union per action.

## D7. Trigger state is temporary
The turn counter and the pending flag are module variables: they reset on a reload, `/clear`, `/resume` and `/branch` (a
changed session id). The `dream` atom (a waiting plan, `due`) survives a reload; a plan that was still being planned is
shown as idle after one.
