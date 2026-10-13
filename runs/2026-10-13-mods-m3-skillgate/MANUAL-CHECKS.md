# M3 manual checks: skill gating (bws-skillgate 0.1.0)

Run these in a real interactive session. The worker could only run headless `claude -p`, which runs one turn, so later
prompts, `/skillgate` in a session, `/clear`, resume and the cockpit chip are unverified until you do them.

**Tested by the worker:** Claude Code 2.1.296, Windows 11. Surface: headless `claude -p` only (receipts
`receipts/spike-probe-*.json`, `receipts/m3-probe.json`, `receipts/m3-probe-control.json`; summary
`receipts/m3-probe.md`). **Not tested:** interactive Windows Terminal, Desktop app, Remote Control bridge, resume.

Before you start, run `python tools/mods-gate.py --plugin bws-skillgate`. It must print `ok   bws-skillgate`.

Setup for checks 1 to 10 (from the repo root, Windows Terminal). The settings file sets `mode` to `on` (topK stays 5):

```
claude --plugin-dir ./bws-skillgate --settings runs/2026-10-13-mods-m3-skillgate/receipts/manual-on-settings.json
```

Your own `CLAUDE_CODE_PLUGIN_DIRS` stays as it is, so your installed skills and bws-cockpit load too; that is what the
checks want (a big listing, and the chip).

1. **Status before anything.** Type `/skillgate` and press Enter.
   Expected, three lines: `Skill gate: on (from the plugin option). Top 5, model haiku.`, `No prompt gated yet in this
   conversation.`, `The listing is cut on the first prompt of a conversation; later prompts can only add skills.` No turn
   starts.

2. **The first prompt is cut.** Type:
   `I need a bar chart of last month's sales. Do not do it. Reply with one line: the names of every skill you can invoke with the Skill tool, exactly as listed to you, comma-separated.`
   Expected: a short list, at most 5 names, with `dataviz` among them. Type `/skills` to compare: it lists far more.

3. **Explain matches.** Type `/skillgate explain`.
   Expected four lines: `Picks for the last prompt, most relevant first: ...`, `Named with /name: none.`, `The listing
   was cut to: ...` (the same names Claude listed in check 2), `Shown to the model: N of M skills. Tokens saved: about X
   (characters / 4).` with X above 0.

4. **The chip.** Look at bws-cockpit's action bar above the prompt (bws-cockpit must be loaded).
   Expected: a chip `skills N/M -X tok` with the numbers from check 3. (Untested: whether the chip redraws by itself
   after the first prompt or only on the next bar redraw.)

5. **A later prompt adds a skill.** Type:
   `Now I want my uncommitted changes reviewed for bugs. Do not do it. Reply with one line: every skill you can invoke with the Skill tool, from every list you have been given in this conversation, comma-separated.`
   Expected: the list from check 2 plus `code-review` (or another review skill). Then `/skillgate explain` says
   `Added for this prompt: code-review` (or that skill).

6. **Nothing new, nothing added.** Type `Make the bars blue. Do not do it, just reply ok.`
   Then `/skillgate explain`. Expected: `Added for this prompt: none.`

7. **The prompt cache holds.** After check 6, run this in a second shell (it reads the newest transcript of this project
   and prints each request's cache read and cache creation):
   ```
   python -c "import json,glob,os; f=max(glob.glob(os.path.expanduser('~/.claude/projects/C--Projects-bws-mods-claude-code-loop/*.jsonl')),key=os.path.getmtime); [print(u.get('cache_read_input_tokens'),u.get('cache_creation_input_tokens')) for u in (json.loads(l).get('message',{}).get('usage') for l in open(f,encoding='utf-8')) if u]"
   ```
   Expected: from the second request on, the cache read never falls back to roughly the system-prompt size; the turn of
   check 5 (the added block) creates only a few hundred to a few thousand tokens, not the whole conversation again.

8. **`/name` is kept.** Type `/clear`, then:
   `Explain in one sentence what /security-review is for, without running it. Then list every skill you can invoke with the Skill tool, comma-separated.`
   Expected: `security-review` is in the list (it was named), and the list is short again (the new conversation was cut).

9. **Off for the session.** Type `/skillgate off`, then `/clear`, then the prompt from check 2.
   Expected: `/skillgate off` replies `Skill gate: off (set for this session with /skillgate). ...`; Claude lists every
   skill (the same as `/skills`); the chip is gone.

10. **On again mid-conversation.** Without `/clear`, type `/skillgate on`, then the prompt from check 5.
    Expected: nothing is cut (the full listing already went out in this conversation); `/skillgate explain` says no
    prompt was gated yet or `Added for this prompt: none.`. Type `/clear` and the prompt from check 2: cut again.

11. **Resume keeps the same bytes.** Do check 2 in a fresh session, note the list, exit with `/exit`, then:
    ```
    claude --plugin-dir ./bws-skillgate --settings runs/2026-10-13-mods-m3-skillgate/receipts/manual-on-settings.json --continue
    ```
    and ask `List every skill you can invoke with the Skill tool, from every list you have been given, comma-separated.`
    Expected: the same names as before the exit (the stored cut was returned for the re-asked listing), plus at most
    what this prompt added. Unverified by the worker: whether the engine re-asks the listing on resume at all.

12. **Fail open.** Start with a model that does not exist:
    ```
    claude --plugin-dir ./bws-skillgate --settings runs/2026-10-13-mods-m3-skillgate/receipts/manual-badmodel-settings.json --debug
    ```
    and type the prompt from check 2. Expected: Claude lists every skill (the full listing stayed), the turn is not
    blocked, and the debug output has one line `bws-skillgate: listing gate failed (...); the full skill listing stays`
    with no prompt text in it. The chip shows `skills: full list` as a warning.

13. **Subagents are left alone.** In the check 2 session, type:
    `Use a general-purpose subagent to list every skill it can invoke with the Skill tool, and show me its answer.`
    Expected: the subagent's list is not the cut (it is the full list, or none if subagents get no listing).

14. **Desktop.** Repeat checks 2, 3 and 4 in the Claude Desktop app with the same plugin and settings.
    Expected: the same results; the chip shows in Desktop's action bar.
