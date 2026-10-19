# bws-enhance

> Turns a vague prompt into a specific one Claude Code can act on, then lets you send it.

A rough prompt makes Claude guess. `/enhance` rewrites it using what this session already knows: the project's
instruction files, a file tree, installed skills and commands, connected MCP servers and the recent conversation. The
rewrite lands in your prompt box, and you decide whether to send it. An optional prompt bouncer can also hold a vague
prompt before it is sent and say what is missing.

## Install

```sh
claude plugin marketplace add bsmi021/bws-claude-mods
claude plugin install bws-enhance@bws-mods
```

Then `/reload-plugins`. Requires Claude Code 2.1.296 or later. The review buttons live in the **Enhance** tab of
[bws-cockpit](../bws-cockpit/README.md)'s dashboard, so install bws-cockpit 0.21.1 or later too. It pairs with
[bws-better](../bws-better/README.md), which upgrades prompts by asking you questions instead.

## Use

| Command | What it does |
| --- | --- |
| `/enhance <rough prompt>` | Rewrites the prompt and puts the result in the prompt box. Works while Claude is busy. |
| `/enhance --send` | Sends the box as it is, edits included. |
| `/enhance --revert` | Puts your rough prompt back in the box. |
| `/enhance --put` | Puts the rewrite in the box so you can edit it. |
| `/enhance --dismiss`, `--cancel` | Closes the review, or cancels a rewrite in progress. |
| `/enhance --sendanyway`, `--enhance`, `--edit` | The bouncer's three buttons (see below). |
| `/bounce [off\|warn\|block\|status]` | Sets the prompt bouncer for this session. With no argument it shows the mode and where it came from. |

Every button in the tab has a `/enhance --<id>` twin: `send`, `revert`, `put`, `dismiss`, `cancel`, `sendanyway`,
`enhance`, `edit`.

### The Enhance tab

`/enhance` opens the dashboard on the Enhance tab with the keyboard. While you stay there, the rewrite waits in the
tab and the keys are letters:

| Key | Button |
| --- | --- |
| `s` | **Send** (or **Send anyway** on a held prompt) |
| `r` | **Revert** (when the rewrite is in the box) |
| `p` | **Put in box** |
| `d` | **Dismiss** |
| `c` | **Cancel** (while it is working) |
| `e`, `x` | **Enhance** and **Edit** on a held prompt |

### Enhance the draft in the box

The footer shows a small `✦ enhance` button. Bind a chord to its action and you can enhance a draft you have already
typed, also while Claude is working. The rewrite replaces the draft in the box, and the keys stay with the box.
Add this to `~/.claude/keybindings.json`:

```json
{ "bindings": [ { "context": "Global", "bindings": { "ctrl+x ctrl+p": "app:toggleDiffPreSession" } } ] }
```

Mods cannot define keybinding actions, so the button borrows one of Claude Code's own (the `chordAction` option). The
default, `app:toggleDiffPreSession`, is handled only by Claude Code's old diff panel, which is not used while the
built-in `cc-plugin-diff` mod is on. The footer is shared: other mods' buttons, such as bws-sidechat's `◨ side`, are
drawn beside `✦ enhance`.

## What it does

### The rewrite

The rewriter sees:

- the instruction files the session loaded (user and project `CLAUDE.md`), plus the project's `AGENTS.md`, `CLAUDE.md` and `.claude/CLAUDE.md`;
- installed skills and slash commands (names and one-line descriptions) and connected MCP servers;
- the project root, a file tree of it (2 levels, at most 150 entries; it skips `.git`, `node_modules`, `runs`, build and output folders and engine caches), and the last few messages, so "it" and "that bug" resolve;
- Anthropic's prompting best practices, plus notes for the model that will run the prompt (Opus: explicit, minimal scope; Sonnet: keep going until the checks pass, no extra tests or docs; Haiku: run the check before reporting done). Sources: the [prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices), the per-model prompting pages and [Claude Code best practices](https://code.claude.com/docs/en/best-practices).

Each source is optional: if one cannot be read, that part is left out and the rewrite continues.

The rewrite replaces the prompt box. Edit it there and press Enter to send it as your own words, or use **Send**. If you
typed something else while it was working, the box is left alone and the tab offers **Put in box**. If the rewrite
fails, the tab shows the reason with **Dismiss**.

Headless (`claude -p "/enhance ..."`) prints the rewrite as the command's output. If it fails, the output says why and
the exit code is 1.

### The prompt bouncer

Holds a prompt you type when it is too vague for Claude Code to act on without asking, and says what is missing. It is
off by default. Set it with the `bounce` option, or for one session with `/bounce`.

| `bounce` | A vague prompt |
| --- | --- |
| `off` (default) | Sent as typed. Nothing is checked and no model is called. |
| `warn` | Held with the reason; the draft stays in the box. Enter again sends it as it is. |
| `block` | Not sent; the draft stays in the box. The Enhance tab offers **Send anyway**, **Enhance** (the rewrite, run on the held text) and **Edit** (back to the box). A headless `claude -p` prompt is refused, and the reason is its output. |

How it decides: one small-model call answers "vague" or "clear" (4 second timeout). A vague prompt gets a second call that
writes one sentence, at most 40 words, on what is missing. That is at most two small-model calls per prompt.

What is checked: prompts you type, prompts from the Remote Control bridge and prompts from the SDK host (`claude -p`).

What is not checked:

- slash commands;
- short answers (under 4 words, such as yes, no, continue, ok, a number or an option letter);
- prompts with an attachment or a leftover paste placeholder (pastes arrive expanded, so a long pasted log is checked as ordinary text);
- anything a plugin, another session, a schedule or a task sends, including the bouncer's own **Send anyway**;
- every prompt, while bws-better's automatic mode is on (only one mod takes a typed prompt);
- a headless run in `warn` mode, which has no dashboard to send anyway from.

It fails open: a classifier error, a timeout, an unreadable answer or a failed reason call sends the prompt unchanged and
writes one debug line, such as `bws-enhance: bounce classify failed (timeout); the prompt was sent unchanged`. The line
never contains the prompt.

**Glossary.** The bouncer and its reason use your project's terms: the file named by `glossaryFile`; else
`docs/GLOSSARY.md`; else the `## Glossary` section of `AGENTS.md`, then of `CLAUDE.md`. Only the first 4,000 characters
are used. If none is found, the calls run without one.

## Options

Set in `/plugin`, or under `pluginConfigs["bws-enhance"].options` in `settings.json`.

| Option | Default | What it does |
| --- | --- | --- |
| `model` | `haiku` | Model alias or id that rewrites the prompt (`sonnet`, `opus`, `haiku` or a full id). Use `sonnet` or `opus` for heavier rewrites. |
| `chordAction` | `app:toggleDiffPreSession` | The engine keybinding action the footer's enhance button borrows. Bind a chord to it in `~/.claude/keybindings.json` (Global). Empty hides the button. |
| `bounce` | `off` | `off`: prompts are sent as typed. `warn`: a vague prompt is held with the reason; Enter again sends it. `block`: a vague prompt is not sent and the draft stays in the box. `/bounce` changes it for one session. |
| `bounceModel` | `haiku` | Model alias or id that classifies a prompt as vague and writes the reason. |
| `glossaryFile` | empty | Markdown file of project terms for the bouncer (first 4,000 characters). Empty: `docs/GLOSSARY.md`, else the `## Glossary` section of `AGENTS.md` or `CLAUDE.md`. |

## Permissions and data

- **Reads** the project's instruction files, the project's directory listing (2 levels), the glossary file, and the session's recent messages, model, command list, tool list and loaded-memory list.
- **Writes** nothing to disk. `/bounce` is held in memory for the session and is not written to your settings.
- **Runs** no processes and opens no network connections of its own.
- **Model calls** go through the session's own client: one call per rewrite (on the `model` option), and with the bouncer on, up to two small calls per typed prompt (on `bounceModel`). The prompt text and the context above are sent to that model, and to no one else.
- **Never** sends a prompt on your behalf unless you press **Send**, **Send anyway** or Enter, and never changes your settings.

## Compatibility

Checked on Claude Code 2.1.296 on Windows 11, in Windows Terminal and headless (`claude -p`). Needs bws-cockpit 0.21.1 or later for the tab.

- The Desktop app and the Remote Control bridge have not been tried. VS Code, mobile and cloud sessions draw no mod UI: use `/enhance` and copy the rewrite.
- The chord binding lives in `~/.claude/keybindings.json`, so set it on each computer.
- The bouncer's prompt hold has not been checked live in an interactive terminal; it is covered by automated tests and headless runs.

## License

MIT. Version history: [CHANGELOG.md](CHANGELOG.md).
