# M8 secret box (bws-secrets 0.1.0): manual checks

The worker ran only headless (`claude -p`, Claude Code 2.1.296, Windows 11, Git Bash). Nothing below was seen on a
screen. Run these in Windows Terminal (checks 1 to 12) and the desktop app (check 13).

Setup for every check: from the repo root, use a scratch secrets folder so nothing real is touched:

    mkdir -p C:/Users/bsmi0/AppData/Local/Temp/bws-m8-manual
    printf '{ "pluginConfigs": { "bws-secrets": { "options": { "secretsDir": "C:/Users/bsmi0/AppData/Local/Temp/bws-m8-manual" } } } }' > C:/Users/bsmi0/AppData/Local/Temp/bws-m8-manual.json
    CLAUDE_CODE_PLUGIN_DIRS= claude --plugin-dir ./bws-secrets --settings C:/Users/bsmi0/AppData/Local/Temp/bws-m8-manual.json

1. **The masked entry gets the keyboard (most important).** Prompt: `Call request_secret with name DEMO_TOKEN and purpose
   "manual check", then stop.` Expected: the **Secret DEMO_TOKEN** pane opens and shows "Claude asks for the secret
   DEMO_TOKEN" and "For: manual check". Click inside the rounded box and type `abcd1234`. Expected: 8 dots, never the
   letters. If typing does nothing after the click, the Client never got the keys: record it. That is a question for
   the design (DECISIONS.md D7), not something to work around.
2. **Enter saves.** Press Enter in the box. Expected: the pane closes, and the tool result in the transcript is exactly
   `saved as DEMO_TOKEN; use {{secret:DEMO_TOKEN}}`. `C:/Users/bsmi0/AppData/Local/Temp/bws-m8-manual/C--Projects-bws-mods-claude-code-loop.env`
   holds `DEMO_TOKEN=abcd1234`.
3. **Too short.** Ask again for `SHORT_ONE`, type `abc`, Enter. Expected: a yellow line "A value must be at least 4
   characters ... Type it again." and the pane stays. Type `abcd`, Enter: saved.
4. **Backspace and Ctrl+U.** Ask for `EDIT_ME`, type `abcdef`, Backspace twice (4 dots), Ctrl+U (no dots), type
   `wxyz1`, Enter. Expected: the file holds `EDIT_ME=wxyz1`.
5. **Cancel and Escape.** Ask for `NOPE_KEY`, press Cancel (or `x`). Expected: the tool result is "The user cancelled
   request_secret for NOPE_KEY; nothing was saved." Repeat and close the pane with Escape: same result.
6. **Keep the saved value.** Ask for `DEMO_TOKEN` again. Expected: a "Keep the saved value" button. Press it (or `k`):
   the result is `saved as DEMO_TOKEN; ...` and the file is unchanged.
7. **Use and scrub.** Prompt: `Run: echo "t=[{{secret:DEMO_TOKEN}}]"; printf %s "{{secret:DEMO_TOKEN}}" | base64`.
   Expected: the transcript row shows the command as Claude wrote it, with the placeholder. The output reads
   `t=[{{secret:DEMO_TOKEN}}]` and `{{secret:DEMO_TOKEN}}`. Then
   `grep -c abcd1234 ~/.claude/projects/C--Projects-bws-mods-claude-code-loop/<this session id>.jsonl` prints 0.
8. **The permission prompt for a rewritten command.** Start without `--settings` permissions (default mode) and repeat
   check 7. Expected: the prompt shows a command that begins `export DEMO_TOKEN="$(sed -n ...` with the secrets file
   path, and never `abcd1234`. Record exactly what it shows.
9. **The read guard.** Prompt: `Read the file C:/Users/bsmi0/AppData/Local/Temp/bws-m8-manual/C--Projects-bws-mods-claude-code-loop.env`.
   Expected: refused with "Read refused: it would read the secrets folder", and Claude does not get the value. Also try
   `Run: cat C:/Users/bsmi0/AppData/Local/Temp/bws-m8-manual/*.env`: refused.
10. **/secrets.** Type `/secrets`. Expected: the names with their placeholders, "values not shown", and no value. Type
    `/secrets remove SHORT_ONE`, then `/secrets`: it is gone.
11. **The cockpit chip.** Load bws-cockpit too (`--plugin-dir ./bws-cockpit --plugin-dir ./bws-secrets`). Expected:
    with names saved, the action bar shows a `secrets N` chip; while a request pane is open it reads
    `secret: asking for NAME`.
12. **Interrupt while asking.** Ask for `WAIT_KEY` and interrupt the turn with Ctrl+C without typing.
    Expected: the pane closes within about a second, and the result says the request was interrupted. Leave one open
    for 10 minutes once: it ends with "no answer within 10 minutes".
13. **Desktop app.** In the desktop app, repeat checks 1 and 2. Expected: the same pane; clicking the box and typing
    shows dots only.

Clean up: `rm -rf C:/Users/bsmi0/AppData/Local/Temp/bws-m8-manual C:/Users/bsmi0/AppData/Local/Temp/bws-m8-manual.json`.
