# M7 manual checks: decision tree (bws-sidechat 0.2.0)

Run these in a real interactive session. The worker could only run headless `claude -p` (one command, no screen), so
the tree pane as drawn, its buttons and focus, a real Explore fork's reply, Decide in a live session and Desktop are
unverified until you do them.

**Tested by the worker:** Claude Code 2.1.296, Windows 11. Surface: headless `claude -p` only (`/explain <fixture>`;
receipts `receipts/m7-probe.json`, `receipts/m7-probe-dump.json`, `receipts/m7-probe.md`). Automated: `claude plugin test`
in `bws-sidechat/` (118 tests; stubbed engine and stubbed `claude -p` children). **Not tested:** interactive Windows
Terminal, Desktop app, a real Explore fork, the focus ring, narrow terminals.

Before you start, run `python tools/mods-gate.py --plugin bws-sidechat`. It must print `ok   bws-sidechat`.

Setup (from the repo root, Windows Terminal, maximised):

```
claude --plugin-dir ./bws-sidechat
```

If an installed bws-sidechat (0.1.5) also loads, `/plugin` shows which copy is active: the source copy must be 0.2.0.
Then send this prompt, so the last reply lists options:

```
Give me three numbered options for where a small plugin should keep its cache (one line each), then ask which I want. Do not use any tools.
```

1. **Open.** Type `/explain`. Expected: a pane titled Decision tree opens docked right of the transcript. Header:
   `Decision tree 1/30 Map Close` (no Back, no Decide). Under it a dim line `the question of the last reply`, then the
   reply's question in bold and one button per option (`1. ...`, `2. ...`, `3. ...`), then an `Or ›` box.

2. **Focus.** With the prompt box empty when you ran `/explain`, the pane should take the keyboard and the ring should sit
   on the first option. Arrow/Tab moves between the buttons; Enter presses one. Run `/explain` again with text typed in
   the prompt box first: the pane opens but the keys stay with the prompt box (as the side chat does).

3. **Explore.** Press option 1. Expected: the pane moves to a new node at once, shows `exploring…`, and the header shows
   `2/30 Map Back Close` plus Decide. Within about a minute the fork's answer appears: a few paragraphs about option 1,
   then, if the model asked one, the next question in bold with numbered option buttons. The main transcript is
   untouched (no new message in it).

4. **Two at most.** Press Back, then options 2 and 3 quickly (Back between them). Expected: two explorations run at once;
   a third while two run shows the toast `Decision tree: 2 explorations are running. Wait for one to finish.`

5. **Back and branch.** Press Back until the root. Expected: each explored option is tagged `→ <its next question>`,
   `→ answered`, `exploring…` or `failed`; the unexplored ones have no tag. Pressing an explored option shows its node
   again without a new fork (no `exploring…`).

6. **A deeper Explore.** On a node with options, press one. Expected: a fork of that node's fork answers (its reply may
   refer to what the earlier exploration said). The line under the header reads the path, e.g. `1. SQLite › 2. ...`.

7. **Your own answer.** At the root, type `keep it in the plugin's $.store` in the `Or ›` box and press Enter. Expected: the
   box clears, a new node is explored for it, and on the root a new option `your answer: keep it in the plugin's $.store`.

8. **Map.** Press Map. Expected: the whole tree as indented rows, the current node marked `>`, explored rows as buttons;
   the header button reads Node. Press a node row: the pane shows that node. Press Map then Node: back to the node view.

9. **Scroll.** Make the terminal short (about 20 rows) and open a node with a long answer. Expected: `↑ N rows above`
   appears; pressing it scrolls up half a pane; `↓ N rows below` scrolls back. The header and the option buttons stay in
   view at the bottom.

10. **Decide.** On a node you explored, press Decide. Expected: the pane closes and, a moment later, one paragraph is sent
    into the main conversation as your message, starting `Decision from the /explain tree: for "..." I chose ...`, with
    what exploring found and any question still open. Claude answers it as a normal turn.

11. **/explain decide.** Run `/explain`, explore one option, then type `/explain decide`. Expected: as check 10, with no
    hang (the paragraph is sent after the command returns). At the root with nothing explored, `/explain decide` answers
    `Nothing to decide yet: explore an option first.`

12. **Close.** Start an Explore and press Close while it is still `exploring…`. Expected: the pane closes at once and the
    child `claude -p` process ends (Task Manager: no leftover `claude.exe` with `--fork-session` after a few seconds).
    `/explain close` does the same from the prompt.

13. **Not a choice.** Ask Claude for `three numbered steps to install a package, no question`, then `/explain`. Expected:
    `No options found in the last reply. ...` and no pane.

14. **Side chat still works.** With the tree open and an Explore running, type `/btw what is this plugin?`. Expected: the
    side chat pane opens and answers; the Explore keeps running and finishes in the tree pane (neither stops the other).

15. **Timeout.** Exit, then start with a 5-second limit:
    `claude --plugin-dir ./bws-sidechat --settings runs/2026-10-13-mods-m7-decisiontree/receipts/manual-timeout-settings.json`
    (create that file with `{ "pluginConfigs": { "bws-sidechat": { "options": { "exploreTimeoutSeconds": 5 } } } }`).
    Repeat the setup prompt, `/explain`, explore an option. Expected: after 5 s the node reads
    `Explore failed: no answer within 5 s`; `claude --debug` shows one line `bws-sidechat explain: explore failed (timeout)`.

16. **Desktop.** In the Claude desktop app with this plugin loaded, repeat checks 1, 3 and 10. Expected: the same pane
    and buttons; the `Or ›` box is present.
