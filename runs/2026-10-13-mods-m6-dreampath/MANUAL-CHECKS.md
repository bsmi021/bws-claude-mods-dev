# M6 manual checks: DreamPath (bws-memory 0.2.0)

Run these in a real interactive session. The worker could only run headless `claude -p` (one turn, no screen), so the
dream pane as drawn, its keys, the cockpit chip, the automatic trigger on real turns, a real compaction, `/clear`,
`/resume`, `/branch` and Desktop are unverified until you do them.

**Tested by the worker:** Claude Code 2.1.296, Windows 11. Surface: headless `claude -p` only (`/dream apply` on a fixture
folder; receipts `receipts/m6-probe.json`, `receipts/m6-probe.md`). Automated: `claude plugin test` in `bws-memory/`
(stubbed engine; the pane, the keys and the triggers are driven through the test `$`). **Not tested:** interactive Windows
Terminal, Desktop app, a real compaction, the trigger on real turns, resume, branch.

Before you start, run `python tools/mods-gate.py --plugin bws-memory`. It must print `ok   bws-memory`.

Setup (from the repo root, Windows Terminal, maximised, the default fullscreen layout). The settings file points
`memoryDir` at a scratch copy of the probe's fixture (`receipts/manual-memdir`: `prefers-tabs.md` and `tabs-not-spaces.md`
are near-duplicates, `uses-pnpm.md` stands alone, three different sessions in `sources.json`) and sets `dreamEveryTurns`
to 2 so the trigger is quick to see:

```
claude --plugin-dir ./bws-memory --settings runs/2026-10-13-mods-m6-dreampath/receipts/manual-settings.json
```

Your own `CLAUDE_CODE_PLUGIN_DIRS` stays as it is, so bws-cockpit loads too (it draws the chip). To start a check over, put
the scratch folder back: `rm -rf runs/2026-10-13-mods-m6-dreampath/receipts/manual-memdir && cp -r runs/2026-10-13-mods-m6-dreampath/receipts/m6-probe-fixture runs/2026-10-13-mods-m6-dreampath/receipts/manual-memdir`.

1. **Status.** Type `/dream status`. Expected: `Dream: nothing waiting. Automatic: every 2 turns (0 so far) and before a compaction.`

2. **Preview.** Type `/dream`. Expected: the command answers `Dreaming... the pane shows the plan.`; after a few seconds a
   pane titled Dream opens, docked right of the transcript, reading `Dream plan: 1 action` (maybe 2: a model may also
   propose a rewrite), buttons Apply and Dismiss, then for the merge `merge prefers-tabs.md + tabs-not-spaces.md -> prefers-tabs.md`
   (or the other way round), a dim reason line and `from: aaaa1111, bbbb2222`. While it plans, the cockpit chip should read `dreaming`;
   with the plan showing it reads `dream preview`. The files in `receipts/manual-memdir/` must be unchanged.

3. **Dismiss.** Press `d` (or click Dismiss). Expected: the pane closes, the chip goes away, the folder is unchanged.
   Run `/dream` again and press Esc instead: same result (closing the pane is a Dismiss).

4. **Apply.** Run `/dream`, then press `a`. Expected: the pane shows `Dream applied: 1 merged, 0 removed, 0 rewritten`, a
   `Backup: .dream-backup/<yyyymmdd-hhmmss-mmm>/` line, the action with its sessions and a Close button (`c`). On disk:
   one near-duplicate holds the merged text, the other is an empty file, `MEMORY.md` has two lines, `sources.json` lists
   both sessions for the surviving file, and `.dream-backup/<stamp>/` holds all the originals.

5. **Undo.** Type `/dream undo`. Expected: `Dream undone: 3 files restored from .dream-backup/<stamp>/.` The empty file has its
   text again, `MEMORY.md` and `sources.json` are as before. Type it again: `The latest dream backup (<stamp>) was already restored.`

6. **Apply refuses a stale plan.** Reset the folder. `/dream`, and while the pane shows the plan open `tabs-not-spaces.md`
   in an editor, add a line and save. Press `a`. Expected: the pane changes to `Dream: memory changed since the preview (tabs-not-spaces.md); run /dream again`
   with a Close button, and nothing is written (no new backup folder).

7. **`/dream apply` in one go.** Reset. Type `/dream apply`. Expected: `Dreaming... the pane shows the result.`, then the pane
   shows the applied result as in check 4. With a preview already waiting, `/dream apply` applies that preview with no new
   model call.

8. **Automatic, every 2 turns.** Reset. Send two ordinary prompts (for example `say hi` twice, each answered normally).
   Expected: after the second answer the chip reads `dream due`, then a preview starts by itself, the Dream pane opens
   with the header `Dream plan: 1 action (due)`, and the files are unchanged until you press Apply. Dismiss it. Two more
   answered turns bring another one. A turn answered by a subagent, or interrupted with Esc, does not count.

9. **Before a compaction.** Reset and dismiss any pane. Type `/compact`. Expected: the compaction runs as usual and is not
   delayed; around the same time the Dream pane opens with a plan marked `(due)`. (Automatic compaction at the threshold does
   the same; it is long to provoke by hand, so `/compact` stands in.)

10. **`dreamEveryTurns` 0.** In `/plugin` set bws-memory's `dreamEveryTurns` to 0 (or edit `receipts/manual-settings.json` and restart).
    Expected: `/dream status` ends with `Automatic: off.`; four ordinary turns and a `/compact` open no dream pane. `/dream` still works.

11. **`/clear` with a plan waiting.** Reset, send two ordinary prompts so the trigger opens the pane (check 8), then type
    `/clear`. Expected: the pane closes and the chip reads `dream due` (the trigger stays due; the plan itself is gone).
    `/dream status` says `due: run /dream`. A plan you asked for with `/dream` is gone after `/clear` with nothing due.

12. **Chips together.** With a plan waiting, type `/remember the user prefers short commit messages`. Expected: the memory
    chip (`memory updating`, then `memory: 1 file`) takes the chip's place while the memory pane is open; after you close it
    the dream chip shows again.

13. **Headless text.** In another shell:
    `claude -p "/dream" --plugin-dir ./bws-memory --settings runs/2026-10-13-mods-m6-dreampath/receipts/manual-settings.json`
    (start with `MSYS_NO_PATHCONV=1` in Git Bash). Expected: the plan as text starting `bws-memory: Dream plan:` and ending
    `(A preview: nothing changed. ...)`; no file changes.

14. **Desktop.** Open the same folder in the Claude Code Desktop app with the plugin loaded and repeat checks 2 and 4. Expected:
    the pane draws the same text, Apply and Dismiss are clickable.

15. **A long plan.** Put ten or more small near-duplicate pairs in `receipts/manual-memdir/` (any text with the memory
    frontmatter), run `/dream`. Expected: the pane lists the first 8 actions and `+N more (all are applied)`; the pane scrolls with
    the mouse wheel or keys without breaking the layout.
