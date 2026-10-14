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

- Claude Code 2.1.299, `claude plugin validate`, `claude plugin test` (34 tests) and tsc 5.8.3 (strict).
- Live: headless `claude -p "/better ..."` on Windows.
- The pane was checked through the test kit on the terminal and desktop surfaces at 40 and 160 columns.
  - It has not been looked at in a real terminal window.
  - Closing it by hand (Esc or its close mark) mid-upgrade is not covered by a test: the test engine cannot raise that close.
