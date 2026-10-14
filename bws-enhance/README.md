# bws-enhance

Turns a vague prompt into a specific one Claude Code can act on, then lets you send it. Optionally, it also holds a vague
prompt before it is sent and says what is missing (the prompt bouncer, below).

It differs from `/better` (bws-better): `/enhance` asks nothing and grounds its rewrite in this project's instruction
files, file tree, skills and the recent conversation, while `/better` asks you a few multiple-choice questions and
needs no project context. While `/better on` (its automatic mode) is set, the bouncer stands aside, so only one of
them takes a typed prompt.

The rewrite is grounded in what this session actually has:
- the instruction files the session loaded (user and project `CLAUDE.md`), plus the project's `AGENTS.md` / `CLAUDE.md` / `.claude/CLAUDE.md`
- installed skills and slash commands (names + one-line descriptions), connected MCP servers
- the project root, a file tree of it (2 levels, at most 150 entries; skips .git, node_modules, runs, build/output and engine cache folders), and the last few messages, so "it" / "that bug" resolve
- Anthropic's prompting best practices, plus per-family notes for the model that will run the prompt
  (Opus: explicit minimal scope; Sonnet: keep going until the checks pass, no extra tests/docs; Haiku: run the check before reporting done).
  Sources: the [prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices), the per-model prompting pages, and [Claude Code best practices](https://code.claude.com/docs/en/best-practices).

## Use

| Action | Keys |
| --- | --- |
| Enhance a rough prompt | `/enhance <rough prompt>` (works while Claude is busy) |
| Enhance the draft already in the box | `ctrl+x ctrl+p` (needs the keybinding below) |
| Send the enhanced prompt | `s` or `Enter` while the pane has the keys, `Enter` in the box, or click **Send** |
| Revert to your rough prompt | `r`, or click **Revert** |
| Dismiss / cancel | `d` / `c`, click **Dismiss** / **Cancel**, or `ctrl+x x` on the pane |

The enhanced prompt replaces the prompt box; edit it there and press `Enter` to send it as your own words. A small pane
shows **Send / Revert / Dismiss**. **Send** sends the box as it is, edits included. If you typed something else while it was
working, the box is left alone and the pane offers **Put in box**. When the rewrite lands, the pane is closed and reopened with keyboard
focus (the engine grants focus only to a fresh open over an empty box), so `s` / `r` / `d` act at once and `Esc` hands the keys
back to the box for editing.

Headless (`claude -p "/enhance ..."`) prints the rewrite as the command's output.

## The prompt bouncer (`bounce`, off by default)

Holds a prompt you type when it is too vague for Claude Code to act on without asking, and says what is missing.

| `bounce` | A vague prompt |
| --- | --- |
| `off` (default) | Sent as typed. Nothing is checked and no model is called. |
| `warn` | Held with the reason; the draft stays in the box. Enter again sends it as it is. |
| `block` | Not sent; the draft stays in the box. The pane offers **Send anyway** (`s`), **Enhance** (`e`, the enhance pipeline on the held text) and **Edit** (`x`, closes the pane). A headless `claude -p` prompt is refused, and the reason is its output. |

How it decides: one small-model call answers vague or clear for the prompt (4 s timeout). A vague prompt gets a second call
that writes one sentence, at most 40 words, on what is missing, with the glossary. At most two small-model calls per prompt.

What is checked: prompts you type (Enter), prompts from the Remote Control bridge, and prompts from the SDK host (`claude -p`).
What is not: slash commands; short answers (under 4 words such as yes, no, continue, ok, a number or an option letter);
prompts with an attachment or a leftover paste placeholder; and anything a plugin, another session, a schedule or a task
sends, including the bouncer's own **Send anyway**. In `warn` mode a headless run is not checked, because it has no pane
to send anyway from.

Pastes arrive expanded, so the paste skip only sees leftover placeholders. A long pasted log is checked as ordinary text.

Fails open: a classifier error, a 4 s timeout, an unreadable answer or a failed reason call sends the prompt unchanged and
writes one debug line, such as `bws-enhance: bounce classify failed (timeout); the prompt was sent unchanged`. The line never
contains the prompt.

Glossary: the `glossaryFile` option if set (the whole file); else `docs/GLOSSARY.md`; else the `## Glossary` section of
`AGENTS.md`, then of `CLAUDE.md`. Capped at 4,000 characters and given to both calls. None found: the calls run without one.

`/bounce [off|warn|block|status]` sets the mode for the current session; it is not written to your settings. With no
argument it shows the mode and where it came from.

Summary: the mod publishes the `summary` state atom (no chip when off, `bounce <mode>` when on, `prompt held` with the
reason while a prompt is held). bws-cockpit draws only the mods in its `modSummaries` option, whose default is four other
names, so no chip shows for this mod unless that option lists it.

## The chord

Mods can't define new keybinding actions. Instead, the footer shows a small `✦ enhance` button that borrows an engine
action; whatever chord you bind to that action presses the button from the prompt. Default action:
`app:toggleDiffPreSession` (only Claude Code's old diff panel handles it, which isn't used while the built-in `cc-plugin-diff` mod is on).
The footer holds one tree, and the hook shares it: another mod's footer (bws-sidechat's `◨ side` button, say) is drawn beside `✦ enhance` whichever mod comes first (0.2.1; before that, bws-enhance drew its own and hid every footer below it).
In `~/.claude/keybindings.json`:

```json
{ "bindings": [ { "context": "Global", "bindings": { "ctrl+x ctrl+p": "app:toggleDiffPreSession" } } ] }
```

## Options (`/plugin` → bws-enhance)

- `model`: model that rewrites the prompt (default `haiku`; `sonnet` or `opus` for heavier rewrites).
- `chordAction`: the engine action the footer button borrows; empty hides the button.
- `bounce`: `off` (default), `warn` or `block`, as above. `/bounce` changes it for the session.
- `bounceModel`: model that classifies the prompt and writes the reason (default `haiku`).
- `glossaryFile`: markdown file of project terms for the bouncer (empty: the defaults above).

## Load

```
claude --plugin-dir ./bws-enhance
```
or add the folder's absolute path to `CLAUDE_CODE_PLUGIN_DIRS`.

## Tested

Claude Code 2.1.296, Windows. Static: `claude plugin validate` passes (receipt `runs/2026-10-13-mods-m2-bouncer/receipts/t06-validate.txt`).
Automated: `claude plugin test`, 48 tests: the enhance tests, the bouncer's table tests (skips, glossary, reason cut,
summary shape, status text) and its mod tests (block, warn, Send anyway, Enhance, the failure branches, the 4 s timeout,
the headless cases, `/bounce`). Type-check: tsc 5.8.3 strict through the gate. Live: headless `claude -p` runs return
grounded rewrites (0.2.x).

Live in Windows Terminal (fullscreen layout, 2026-10-10): `/enhance` filled the box and docked the pane; `Enter` sent the
rewrite; `ctrl+x ctrl+p` enhanced a typed draft, also while Claude was mid-turn; clicking **Revert** restored the draft and
closed the pane. 0.2.0 (same day): the file tree reached the rewriter live (it named sibling plugin folders). Pane focus on result, and so `s`/`r`/`d`, is not yet confirmed live: the first try showed the pane never got focus, fixed by close-and-reopen; the retest was cut short by outside input in the test window.
Not tried: main-screen (inline) layout, desktop app.

Not tested live yet: the bouncer in an interactive terminal (the pane's buttons and keys, the warn hint, the draft going
back into the box after a hold). The headless probe for the bouncer is recorded in
`runs/2026-10-13-mods-m2-bouncer/receipts/`. Desktop, the Remote Control bridge and the main-screen layout are untested.
VS Code / mobile / cloud draw no mod UI; use `/enhance` and copy the rewrite.
