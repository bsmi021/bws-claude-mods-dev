# bws-skillgate

> Cuts the skill listing Claude reads down to the skills that fit your prompt.

With many skills installed, their names and descriptions sit in the model's context on every request. This mod asks a
small model which skills fit what you typed, and shows the main model only those (plus any skill you name with
`/name`). It is off by default.

## Install

```
claude plugin marketplace add bsmi021/bws-claude-mods
claude plugin install bws-skillgate@bws-mods
```

Then `/reload-plugins`. Requires Claude Code 2.1.296 or later. It pairs with [bws-cockpit](../bws-cockpit/README.md)
0.21.1 or later, which shows a Skillgate tab in its dashboard. The mod works without it.

## Use

| Command | What it does |
| --- | --- |
| `/skillgate` or `/skillgate status` | Shows the mode and where it came from, `topK`, the model, how many skills the model sees and the tokens saved. |
| `/skillgate on` / `/skillgate off` | Turns the gate on or off for this session. The plugin option stays as it is. If the full listing already went out, "on" takes effect from the next conversation's first prompt. |
| `/skillgate explain` | Shows the last prompt's picks in order, the `/name`s it kept, what was cut or added, and the tokens saved. |

Tokens saved is an estimate: the characters of the listing entries the model was not shown, divided by 4.

**Dashboard tab.** The Skillgate tab in bws-cockpit's dashboard shows the status and the last prompt's picks. Its
button turns the gate on or off for this session, the same as `/skillgate on|off`.

## What it does

- **First prompt of a conversation.** Claude Code sends the skill listing once, with the first request. With the gate
  on, one small-model call gets your prompt and every skill's name and description, and answers with up to `topK` names,
  most relevant first. The listing is cut to those entries, in the listing's own order, plus any skill your prompt names
  as `/name`.
- **Later prompts.** The listing is never rewritten after it went out, because changing the first message would make
  every later request miss the prompt cache. Instead each later prompt gets one small-model call. Picks the model has not
  been shown yet are added as one block beside that prompt ("More skills are available for use with the Skill tool:
  ..."). When every pick is already shown, the prompt goes through untouched. The set the model sees only grows during a
  conversation; `/clear` starts a new one.
- **Same input, same bytes.** The cut is built only from the listing's own lines, so the same picks give identical text.
  The text sent for each listing row is kept in memory and in the plugin's store for the last 20 conversations. A row the
  engine asks about again (a resume, an invalidate) gets the same bytes and no second model call.
- **Fails open.** A classifier error, no answer within 4 seconds, or an answer with no readable JSON array leaves the
  full listing (first prompt) or adds nothing (later prompts). One line goes to the debug log, never carrying your prompt.
- **What it leaves alone.** A subagent's listing, slash commands typed later and prompts other plugins send.
- **Hiding is not disabling.** The cut removes skills from the listing only. A typed `/name` still runs the skill.

## Options

Set in `/plugin`, or under `pluginConfigs["bws-skillgate"].options` in settings.json.

| Option | Default | What it does |
| --- | --- | --- |
| `mode` | `off` | `off`: the model sees the full skill listing. `on`: a small model picks the skills that fit the prompt and the listing is cut to those. `/skillgate` changes it for a session. |
| `topK` | `5` | At most this many skills the classifier picks (1 to 20), plus any the prompt names with `/name`. |
| `model` | `haiku` | Model alias or id that picks the skills (`haiku`, `sonnet`, `opus`, or a full id). |

## Permissions and data

- **Model calls.** While the gate is on, one call per prompt to the model in `model`. It receives your prompt and each
  skill's name and description. With the gate off there are no calls.
- **Stores.** The cut text for each listing row, for the last 20 conversations, in the plugin's store. No prompt text is
  stored. Session state holds the mode, the last picks and the dashboard tab.
- **Never.** It reads no files, runs no processes and makes no network calls of its own.

## Compatibility

- Checked on Claude Code 2.1.296, Windows 11.
- The first-prompt cut and the gate on/off comparison were checked live in headless `claude -p`. Later-prompt blocks,
  `/skillgate` inside a session, resume and the dashboard tab have unit tests but no live check.
- The interactive terminal and Desktop have not been tried. VS Code, mobile and cloud sessions show no mod UI; the gate
  itself does not need one.

## License

MIT. Version history: [CHANGELOG.md](CHANGELOG.md).
