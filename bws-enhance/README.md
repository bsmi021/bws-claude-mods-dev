# bws-enhance

Turns a vague prompt into a specific one Claude Code can act on, then lets you send it.

The rewrite is grounded in what this session actually has:
- the instruction files the session loaded (user and project `CLAUDE.md`), plus the project's `AGENTS.md` / `CLAUDE.md` / `.claude/CLAUDE.md`
- installed skills and slash commands (names + one-line descriptions), connected MCP servers
- the project root and the last few messages, so "it" / "that bug" resolve
- Anthropic's prompting best practices, plus per-family notes for the model that will run the prompt
  (Opus: explicit minimal scope; Sonnet: keep going until the checks pass, no extra tests/docs; Haiku: run the check before reporting done).
  Source summary: `runs/2026-10-10-prompt-enhancer/receipts/anthropic-prompting-guidance.md`.

## Use

| Action | Keys |
| --- | --- |
| Enhance a rough prompt | `/enhance <rough prompt>` (works while Claude is busy) |
| Enhance the draft already in the box | `ctrl+x ctrl+p` (needs the keybinding below) |
| Send the enhanced prompt | `Enter` in the box (it holds the rewrite), or click **Send** |
| Revert to your rough prompt | click **Revert** |
| Dismiss / cancel | click **Dismiss** / **Cancel**, or `ctrl+x x` on the pane |

The enhanced prompt replaces the prompt box; edit it there and press `Enter` to send it as your own words. A small pane
shows **Send / Revert / Dismiss**. **Send** sends the box as it is, edits included. If you typed something else while it was
working, the box is left alone and the pane offers **Put in box**. The buttons also have hotkeys (`s` `r` `p` `d` `c`) for when the
pane holds the keyboard, but focusing it with `ctrl+x tab` did not reach them in the live check.

Headless (`claude -p "/enhance ..."`) prints the rewrite as the command's output.

## The chord

Mods can't define new keybinding actions. Instead, the footer shows a small `✦ enhance` button that borrows an engine
action; whatever chord you bind to that action presses the button from the prompt. Default action:
`app:toggleDiffPreSession` (only Claude Code's old diff panel handles it, which isn't used while the built-in `cc-plugin-diff` mod is on).
In `~/.claude/keybindings.json`:

```json
{ "bindings": [ { "context": "Global", "bindings": { "ctrl+x ctrl+p": "app:toggleDiffPreSession" } } ] }
```

## Options (`/plugin` → bws-enhance)

- `model`: model that rewrites the prompt (default `sonnet`).
- `chordAction`: the engine action the footer button borrows; empty hides the button.

## Load

```
claude --plugin-dir ./bws-enhance
```
or add `C:/Projects/bws.mods.claude-code/bws-enhance` to `CLAUDE_CODE_PLUGIN_DIRS`.

## Tested

Claude Code 2.1.296, Windows. Static: `claude plugin validate` passes. Automated: `claude plugin test`, 16 tests (pane and footer
trees on terminal and desktop, presses, fill/submit/revert, failure path, options). Type-check: tsc 5.6 strict. Live: headless
`claude -p "/enhance ..."` runs return grounded rewrites.

Live in Windows Terminal (fullscreen layout, 2026-10-10): `/enhance` filled the box and docked the pane; `Enter` sent the
rewrite; `ctrl+x ctrl+p` enhanced a typed draft, also while Claude was mid-turn; clicking **Revert** restored the draft and
closed the pane. Not working yet: pane hotkeys (keys went to the prompt box, even after `ctrl+x tab`).
Not tried: main-screen (inline) layout, desktop app.
VS Code / mobile / cloud draw no mod UI; use `/enhance` and copy the rewrite.
