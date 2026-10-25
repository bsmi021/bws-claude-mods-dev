# bws-better

> Turns a rough prompt into a clear one before it is sent, by asking you a few quick questions first.

A vague prompt gets a vague answer. `/better` asks up to three multiple-choice questions about the outcome you want,
rewrites your prompt as a goal-and-outcome request, and shows the upgrade above your original. Nothing runs
until you press **Run it**.

The upgrade says what should be true when the work is done and how to tell, and leaves the way there to Claude: no
steps, no order of work, no files or tools you did not name. Your answers settle what is vague; anything they do not
settle stays in your words for Claude to work out, rather than a guess written as a requirement. A question stays a
question. The questions ask about the outcome (what done looks like, what a vague word means, what must not change),
never how to do it.

## Install

```sh
claude plugin marketplace add bsmi021/bws-claude-mods
claude plugin install bws-better@bws-mods
```

Then `/reload-plugins`. Requires Claude Code 2.1.296 or later. The mod shows its steps in the **Better** tab of
[bws-cockpit](../bws-cockpit/README.md)'s dashboard, so install bws-cockpit 0.21.1 or later too. It pairs with
[bws-enhance](../bws-enhance/README.md): `/better` asks you questions and needs no project context, while `/enhance`
asks nothing and grounds its rewrite in the project's instruction files, file tree and skills.

## Use

| Command | What it does |
| --- | --- |
| `/better <rough prompt>` | Upgrades that prompt in the Better tab. |
| `/better` | Opens the Better tab with a box to type one. |
| `/better on` / `/better off` | Turns automatic mode on or off. It is remembered across sessions and is off by default. |
| `/better history` | Your last 20 upgrades; pick one to reopen its review. |
| `/better --<id> [text]` | The command twin of any button or box in the tab (see below). |

### The Better tab

A gold banner tops the tab: the title, **AUTO ON** while automatic mode is on, and four step pills (**Prompt, Questions,
Rewrite, Review**): done in green, the current step in gold, a failed one in red. It is a 56-column picture on the
terminal and an SVG on Desktop.

- **Questions.** Pick a chip, press **Other…** to type your own answer, or press **Skip**. Answered questions turn green. When every question is answered or skipped, the rewrite starts. **Upgrade now** starts it at once. When no question would help, the tab goes straight to the rewrite.
- **Review.** The banner's pills show the word counts, the details added and that it is ready to run. Below them: your upgraded prompt, the buttons, what changed, and your original, dimmed, last.

| Button | Key | What it does |
| --- | --- | --- |
| **Run it** | `r` | Sends the upgrade as your own words. |
| **Edit** | `e` | Puts the upgrade in the prompt box. Enter there runs it as it is. |
| **Copy** | `y` | Copies the upgrade. |
| **Cancel** | `c` | Puts your original prompt back in the box. (Esc does the same.) |

- **If a model call fails**, a card says your prompt is safe and nothing was sent. It offers **Try again** (`t`), **Send my original** and **Cancel**.

Every button and box has a twin `/better --<id> [text]`. The ids are `run`, `edit`, `copy`, `cancel`, `close`, `retry`,
`original`, `upgrade`, `o-<question>-<option>`, `other-<question>`, `skip-<question>`, `other-input-<question> <text>`,
`compose <text>`, `history` and `auto-on` / `auto-off`.

## What it does

### Automatic mode

While it is on, a prompt you type goes to the Better tab first instead of being sent. The box is cleared so Enter cannot
send the same prompt again, and Cancel puts it back. These go straight through untouched:

- slash commands;
- prompts with images or files attached;
- anything typed while Claude is working;
- short replies (three words or fewer, or an acknowledgement such as "yes", "ok do it" or "keep going" of up to six words);
- anything starting with `>`, which is sent without the `>`.

The upgrade the mod sends is never taken again. While automatic mode is on, the bws-enhance prompt bouncer stands aside.

### Headless

Headless (`claude -p "/better ..."`) has no dashboard. The questions are skipped and the upgrade is printed with what it
added.

### After reload, `/clear`, `/resume`, `/branch`

- Automatic mode and the last 20 upgrades are kept in the mod's own store, so they come back in every new session.
- A reload in the middle of a step sends the pending model call again and shows the tab again.
- What `/clear`, `/resume` and `/branch` do to an upgrade in progress has not been checked.

## Options

Set in `/plugin`, or under `pluginConfigs["bws-better"].options` in `settings.json`.

| Option | Default | What it does |
| --- | --- | --- |
| `model` | `haiku` | Model alias or id that writes the questions and the rewrite (`haiku`, `sonnet`, `opus` or a full id). |

Each upgrade makes two model calls: one for the questions and one for the rewrite. When the session already has a
conversation, the last six turns go with both calls as background, so "fix it" or "that bug" can be named in the
upgrade. Slash commands and your request itself are left out, and nothing else from those turns is carried over.

## Permissions and data

- **Reads** the prompt box, the session's surfaces (to tell a terminal from a headless run) and the last six turns of the conversation.
- **Writes** no files. Automatic mode and the last 20 upgrades (your original prompts and their upgrades) are kept in the mod's own store, which lives on your machine.
- **Runs** no processes and opens no network connections of its own.
- **Model calls** go through the session's own client, to the configured model only. Your prompt, your answers and the recent conversation are sent there, and to no one else. The conversation is never logged or kept in the history.
- **Sends** a prompt to Claude only when you press **Run it**, **Send my original** or Enter on an edited upgrade, or send an untouched prompt through in the cases listed under automatic mode. When a model call fails, it writes one debug line with no prompt text in it.

## Compatibility

Checked on Claude Code 2.1.299 and 2.1.300 on Windows 11: headless runs and Windows Terminal, inline at 72 columns and
fullscreen at 160. Questions, chips, the rewrite, the review and its cards, automatic mode and Cancel were used live.
**Run it**, **Edit** and **Copy** are covered by automated tests but were not pressed live.

- In a short window the inline view is about 10 rows tall, so later questions and the cards need a scroll.
- The Desktop app, VS Code, mobile and cloud sessions have not been tried.

## License

MIT. Version history: [CHANGELOG.md](CHANGELOG.md).
