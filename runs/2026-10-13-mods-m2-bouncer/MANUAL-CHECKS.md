# M2 manual checks: prompt bouncer (bws-enhance 0.3.0)

Run these in a real interactive session. The worker could only run headless `claude -p`, so the pane, the keys and the
live feel are unverified until you do them.

**Tested by the worker:** Claude Code 2.1.296, Windows 11. Surface: headless `claude -p` only (receipts
`receipts/m2-probe.json` and `receipts/m2-probe-clear.json`). **Not tested:** interactive Windows Terminal, Desktop app,
Remote Control bridge, narrow terminals.

Setup for every check (from the repo root, Windows Terminal, fullscreen). The settings file sets `bounce` to `block`:

```
claude --plugin-dir ./bws-enhance --settings runs/2026-10-13-mods-m2-bouncer/receipts/probe-block-settings.json
```

Before you start, run `python tools/mods-gate.py --plugin bws-enhance`. It must print `ok   bws-enhance`.

1. **Mode shows.** Type `/bounce` and press Enter.
   Expected: `Bounce: block (the bounce option). A vague prompt is not sent; the draft stays in the box.` Nothing is sent to Claude.

2. **Block holds a vague prompt.** Type `fix the thing on the settings page` and press Enter.
   Expected: no assistant turn starts. The text stays in the prompt box. A pane reads `✦ Held as vague: <one sentence of what is missing>` with buttons **Send anyway**, **Enhance**, **Edit**. The pane has no "Enter in the box" line (that line is for warn).

3. **Send anyway.** After check 2, press `s` (or click **Send anyway**).
   Expected: the prompt appears as your message, Claude replies, and the pane closes. It is not held a second time.

4. **Edit closes the pane.** Type `make the cart work better` and press Enter. When the pane shows, press `x` (or click **Edit**).
   Expected: the pane closes, the draft is still in the box, and nothing was sent. Press Enter in the box to be held again.

5. **Enhance on a held prompt.** Type `fix the thing on the settings page`, Enter, then press `e` (or click **Enhance**).
   Expected: the pane shows `Enhancing…`, then the rewrite replaces the box text. Press Enter to send the rewrite.

6. **Warn: Enter again sends.** Type `/bounce warn` and Enter, then type `fix the thing on the settings page` and Enter.
   Expected: held, with the reason, and the hint `Enter in the box sends it as it is.` Press Enter in the box with no edits.
   Expected: sent, no second hold.

7. **Warn: an edit is checked again.** After `/bounce warn`, get a hold on one vague prompt. Change the text, then press Enter.
   Expected: the changed text is checked again. The earlier hold does not send it.

8. **A clear prompt passes.** Type `/bounce block`, then `Reply with exactly this text and nothing else: bounce check ok` and Enter.
   Expected: sent with no pane, and Claude answers `bounce check ok`.

9. **Skips.** Type `/cost` and Enter. Then answer a question Claude asks with `yes`.
   Expected: both are sent with no hold.

10. **Glossary changes the reason.** In a scratch project, create `docs/GLOSSARY.md` containing `- settings page: the page at /settings`.
    Start `claude --plugin-dir <path to bws-enhance> --settings <a block settings file>` there, then repeat check 2.
    Expected: the reason uses the term from the glossary (for example, it names `/settings`).

11. **Failure fails open.** Turn Wi-Fi off, then type `fix the thing on the settings page` and Enter. Start with `claude --debug`.
    Expected: after about 4 s the prompt is sent unchanged. The debug output has one line
    `bws-enhance: bounce classify failed (...); the prompt was sent unchanged`, and it does not contain the prompt.

12. **No chip by default.** With bws-cockpit loaded, the action bar shows no bws-enhance chip, because cockpit's `modSummaries`
    option does not list bws-enhance (see the README). Expected: nothing extra in the bar; no error.

13. **Narrow terminal.** Shrink the window to about 50 columns and repeat check 2.
    Expected: either the pane is drawn, or a toast says `Enhance: pane not shown (...)`. The held text is still in the box and the reason is still in the transcript.

14. **Headless block.** From the repo root (no window needed):
    ```
    claude -p "fix the thing on the settings page" --plugin-dir ./bws-enhance --settings runs/2026-10-13-mods-m2-bouncer/receipts/probe-block-settings.json --output-format stream-json --verbose
    ```
    Expected: a `system` line `Prompt dropped by a hook: Held by bws-enhance: ... Edit it and send it again.` The worker saw this too (`receipts/m2-probe.json`).

15. **Desktop app (if you use it).** Repeat checks 2 to 5 in the Desktop app. Expected: the same pane and buttons. Report what differs.
