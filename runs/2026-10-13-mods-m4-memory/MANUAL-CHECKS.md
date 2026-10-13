# M4 manual checks: memory (bws-memory 0.1.0)

Run these in a real interactive session. The worker could only run headless `claude -p`, which runs one turn and has no
screen, so the classifier path after a real turn, the pane, the cockpit chip, `/clear`, `/resume` and `/branch` are
unverified until you do them.

**Tested by the worker:** Claude Code 2.1.296, Windows 11. Surface: headless `claude -p` only (`/remember`; receipts
`receipts/m4-probe.json`, `receipts/m4-probe.md`, the files in `receipts/m4-probe-memdir/`). Automated: `claude plugin
test` in `bws-memory/` (stubbed engine). **Not tested:** interactive Windows Terminal, Desktop app, the classifier on a
real turn, resume, branch.

Before you start, run `python tools/mods-gate.py --plugin bws-memory`. It must print `ok   bws-memory`.

Setup (from the repo root, Windows Terminal). The settings file points `memoryDir` at
`runs/2026-10-13-mods-m4-memory/receipts/manual-memdir`, so nothing lands in your real project memory:

```
claude --plugin-dir ./bws-memory --settings runs/2026-10-13-mods-m4-memory/receipts/manual-settings.json
```

Your own `CLAUDE_CODE_PLUGIN_DIRS` stays as it is, so bws-cockpit loads too (it draws the chip). Watch the folder with
`dir runs\2026-10-13-mods-m4-memory\receipts\manual-memdir` in a second terminal.

1. **Nothing yet.** Type `/memories`. Expected: `No memories written yet.` Type `/memory-undo`: `Nothing to undo.` Type
   `/remember` with no text: `Usage: /remember <what to remember>`. No turn starts for any of them.

2. **The classifier path.** Type: `From now on always use tabs, never spaces, in every file you write in this repo. I also prefer terse answers.`
   Expected: the turn answers normally and is not held up. Right after it ends, the cockpit action bar shows a chip
   `memory updating`, then a pane titled Memory opens: `Memory updated: N files`, one line per file (`new  <name>.md +9 -0`)
   and a Close button. The folder holds the file(s) and a `MEMORY.md` with one line each. The chip now reads `memory: N files`.

3. **Close the pane.** Press `c` (or click Close). Expected: the pane and the chip go away. Reopen nothing by hand.

4. **Chatter is skipped.** Type `ok thanks`. Expected: no chip, no pane, nothing new in the folder.

5. **A repeat updates, never duplicates.** Type the same preference again in other words: `Reminder: tabs, not spaces, always.`
   Expected: either nothing happens (the classifier says no, or the fork's entry is identical) or the pane lists the
   existing file as `edit`, with no second file for the same fact and no second `MEMORY.md` line for it.

6. **/remember.** Type `/remember that the release branch is called stable`. Expected at once: `Remembering... the pane lists what changed.`
   A moment later the pane opens with the new file.

7. **/memories.** Type `/memories`. Expected: the writes newest first, each `file: new|update, session <8 chars>, <date time>`. The
   session matches the id in `sources.json`.

8. **/memory-undo.** Type `/memory-undo`. Expected: `Undid the last memory write: ...`. Files the write changed are back
   to their previous text; a file it created is now empty and gone from `MEMORY.md`. Type `/memory-undo` again: `Nothing to undo.`

9. **A secret is never written.** Type `Remember that our deploy token is sk-ant-FAKEKEY1234567890abcdefghij and the region is eu-west-1.`
   Expected: whatever is written has `[redacted]` where the token was. Search the folder: `findstr /s "sk-ant-FAKEKEY" runs\2026-10-13-mods-m4-memory\receipts\manual-memdir\*` finds nothing.

10. **/clear during a run.** Type a message the classifier will keep (like check 2), and as soon as its answer ends type
    `/clear` before the pane opens. Expected: no pane opens afterwards, nothing new is written, and the next remembered
    statement works normally (the guard reset).

11. **/clear itself.** Type `/clear` with nothing running. Expected: no chip, no pane, no model call.

12. **/resume.** Exit, run `claude --continue` with the same flags, and repeat check 2. Expected: it works; `/memories` still lists the earlier writes.

13. **/branch.** In a conversation, run `/branch`, then make a memorable statement. Expected: it works (the session id changed; the guard reset).

14. **Desktop.** Open the same plugin in the Desktop app and repeat checks 2, 3 and 8. Expected: the pane and Close behave the same.

15. **Narrow terminal.** Shrink the window below about 60 columns and repeat check 2. Expected: the pane may not show; you get a toast `Memory: pane not shown (...)` and `/memories` still lists the write.

If any fails, note the check number and what you saw; the fix goes in bws-memory and `python tools/mods-gate.py --plugin bws-memory` must pass again.
