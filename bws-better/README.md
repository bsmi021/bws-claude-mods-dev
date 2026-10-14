# bws-better: Prompt Upgrade

Turns a rough prompt into a great one before it is sent. A pane asks up to three quick multiple-choice questions,
rewrites the prompt, and shows your prompt and the upgrade side by side. Nothing runs until you press **Run it**.

## Use

| Command | What it does |
| --- | --- |
| `/better <rough prompt>` | Upgrades that prompt in the pane |
| `/better` | Opens the pane with a box to type one |
| `/better on` / `/better off` | Turns automatic mode on or off (remembered across sessions; off by default) |
| `/better history` | Your last 20 upgrades; pick one to reopen its review |

The pane has four steps, shown across the top: **Your prompt → Questions → Rewrite → Review**.

- **Questions**: pick a chip, press **Other (type it)** to type your own answer, or **Skip**. When every question is answered or skipped, the rewrite starts. **Skip the rest, upgrade now** starts it at once. When no question would help, the pane goes straight to the rewrite.
- **Review**: three tiles show words before, words after and details added. Under them are **Run it**, **Edit**, **Copy** and **Cancel**, then what was added, then the two prompts side by side.
  - **Run it** sends the upgrade as your own words.
  - **Edit** puts it in the prompt box; Enter there runs it as is.
  - **Cancel** (or Esc) puts your original prompt back in the box.
- **If a model call fails**, a card says your prompt is safe, with **Try again**, **Send my original** and **Cancel**.

### Automatic mode

While it is on, a prompt you type goes to the pane first instead of being sent. These go straight through untouched:
- slash commands
- prompts with images or files attached
- anything typed while Claude is working
- short replies (three words or fewer, or an acknowledgement such as "yes", "ok do it" or "keep going" of up to six words)
- anything starting with `>`, sent without the `>`

The upgrade the mod sends is never taken again.

## Configuration

| Option | Default | Meaning |
| --- | --- | --- |
| `model` | `haiku` | Model alias or id that writes the questions and the rewrite |

Each upgrade makes two model calls: one for the questions and one for the rewrite.

Headless (`claude -p "/better ..."`), there is no pane: the questions are skipped and the upgrade is printed with what it added.

## Load

```sh
claude --plugin-dir ./bws-better
```

Or install it from the marketplace, at the prompt of a terminal session:

```
/plugin install bws-better --marketplace bsmi021/bws-claude-mods
```

## Data

- Auto mode and the last 20 upgrades are kept in the mod's own store (`$.store`).
- No files are written.
- Prompts go only to the configured model, through the session's own client.

## Tested

- Claude Code 2.1.299 and 2.1.300 on Windows: `claude plugin validate`, `claude plugin test` (37 tests) and tsc 5.8.3 (strict).
- Live headless: `claude -p "/better ..."`.
- Live in Windows Terminal, at 72 columns (pane inline above the prompt) and 160 columns (fullscreen, pane docked):
  - questions, chips, answering by click and by Enter, the rewrite, the review tiles and cards;
  - automatic mode taking a typed prompt;
  - Cancel and the pane's close mark putting the prompt back.
- Not pressed live: Run it, Edit and Copy. The tests cover them.
- In a short window the inline pane is about 10 rows tall, so later questions and the cards need a scroll.

## Changes

- 0.1.1:
  - `/better <prompt>` now opens its pane at any width; it no longer falls back to "too narrow" below 144 columns.
  - A prompt taken by automatic mode is cleared from the box, so the box is free and Enter cannot send the same prompt to the pane again. Cancel still puts it back.
