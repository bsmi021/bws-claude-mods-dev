# bws-skillgate

With many skills installed, their names and descriptions sit in the model's context on every request. This mod lets a
small model pick the skills that fit what you asked, and cuts the skill listing the model reads down to those (plus any
skill you name with `/name`). Off by default.

- **Dashboard tab** (0.2.0): with bws-cockpit 0.21.0+, a Skillgate tab shows the status and the last picks, with a button that turns the gate on or off for this session (the same as `/skillgate on|off`).

## How it works

- **First prompt of a conversation.** The engine sends the skill listing once, with the first request (the `skill_listing`
  attachment). When the gate is on, one small-model call gets your prompt and every skill's name and description and
  answers with up to `topK` names, most relevant first. The listing is answered with only those entries, in the
  listing's own order, plus any skill your prompt names as `/name`.
- **Later prompts.** The listing is never rewritten after it went out: changing the first message would make every later
  request miss the prompt cache. Instead each later prompt gets one small-model call; picks the model has not been shown
  yet are added as one block beside that prompt ("More skills are available for use with the Skill tool: ..."). When
  every pick is already shown, the prompt goes through untouched. So the set the model sees only grows during a
  conversation; `/clear` starts a new one.
- **Same input, same bytes.** The cut is built only from the listing's own lines, so the same picks give identical text.
  The text sent for each listing row is kept (in memory, and in the plugin's store for the last 20 conversations), so a
  row the engine asks about again (a resume, an invalidate) gets the same bytes and no second model call.
- **Fail open.** A classifier error, no answer within 4 s, or an answer with no readable JSON array leaves the full
  listing (first prompt) or adds nothing (later prompts), with one line in the debug log that never carries your prompt.
- A subagent's listing, slash commands typed later, and prompts other plugins send are left alone.
- The cut hides skills from the listing; it does not disable them. A typed `/name` still runs the skill.

Why this design: `runs/2026-10-13-mods-m3-skillgate/DECISIONS.md` (the spike, with probe receipts).

## Use

| Command | What it does |
| --- | --- |
| `/skillgate` or `/skillgate status` | The mode and where it came from, `topK`, the model, how many skills the model sees and the tokens saved |
| `/skillgate on` / `/skillgate off` | Turn the gate on or off for this session (the plugin option stays as it is). On takes effect from the next conversation's first prompt if the listing already went out in full. |
| `/skillgate explain` | The last prompt's picks in order, the `/name`s it kept, what was cut or added, and the tokens saved |

Tokens saved is an estimate: the characters of the listing entries the model was not shown, divided by 4.

The mod publishes a `summary` state atom (`{ plugin: 'bws-skillgate', key: 'summary' }`): nothing when off, `skills 5/40
-1800 tok` while on, `skills: full list` (warning) after a fail-open. bws-cockpit draws it as a chip in its action bar.

## Options (`/plugin` → bws-skillgate)

| Option | Default | Meaning |
| --- | --- | --- |
| `mode` | `off` | `off`: the model sees the full listing. `on`: the listing is gated. `/skillgate` changes it for a session. |
| `topK` | `5` | At most this many picks (1 to 20), plus any `/name` the prompt names. |
| `model` | `haiku` | The model that picks the skills (an alias or a full id). |

## Capabilities used

`prompt.attachment` (type `skill_listing`, main loop only), `prompt.submit` (adds a context block), `command.run`
(`/skillgate`), `$.model.complete` (one call per prompt while on, 4 s timeout with an abort signal, none when off),
`$.session.id`, `$.store` (the cut text per listing row; no prompt text is stored), `$.state` (the session mode, the
last picks, the summary), `$.ui.log` (debug only). It reads no files, runs no processes and makes no network calls of
its own.

## Load

```
claude --plugin-dir ./bws-skillgate
```
or add the folder's absolute path to `CLAUDE_CODE_PLUGIN_DIRS`. The vendored `hooks/kit/` copies come from `bws-kit`
(`kit.json`); refresh them with `python tools/sync-kit.py`.

## Tested

Claude Code 2.1.296, Windows. Static: `claude plugin validate` passes. Automated: `claude plugin test`, 42 tests (the
listing parser and cut, picks parsing, `/name`, `topK`, later-prompt blocks, `/skillgate`, cache safety, every
fail-open branch, explain and the summary shape). Type-check: tsc 5.8.3 strict through `tools/mods-gate.py`.

Live, headless only (`claude -p`, haiku): with `mode: on` and `topK: 1`, a prompt about a sales chart that names
`/simplify` made the model report exactly `dataviz, simplify`; with the gate off it reported all 15 listed skills
(`runs/2026-10-13-mods-m3-skillgate/receipts/m3-probe.md`, plus the spike's three probes).
Headless `claude -p` runs one turn, so the later-prompt block, `/skillgate` in a session, resume, and the cockpit chip
are untested live. Interactive terminal and Desktop: untested. VS Code, mobile and cloud sessions show no mod UI; the
gate itself does not need one.
