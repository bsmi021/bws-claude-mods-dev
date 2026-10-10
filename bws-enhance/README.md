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
| Send the enhanced prompt | `Enter` (pane focused, Send selected), `s`, or `Esc` then `Enter` in the box |
| Revert to your rough prompt | `r` / **Revert** in the pane |
| Dismiss / cancel | `d` / `c`, or `Esc` / `ctrl+x x` on the pane |

The enhanced prompt replaces the prompt box. A small pane opens with **Send / Revert / Dismiss**; it takes keyboard focus
when the result lands with **Send** selected, so `Enter` or `s` sends immediately, and `Esc` hands the keys back to the box to edit first. **Send** sends the
box as it is, edits included, as your own words. If you typed something else while it was working, the box is left alone and
the pane offers **Put in box**.

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

0.1.0: not yet verified in a real interactive terminal: the pane's placement and focus, the hotkeys, and the `ctrl+x ctrl+p` chord.
If the chord does nothing, set `chordAction` to `app:toggleDiffNoiseFilter` or `app:toggleReplTab` (same kind of idle action) and
rebind; `claude --debug` logs a refusal if the engine rejects the action.
VS Code / mobile / cloud draw no mod UI; use `/enhance` and copy the rewrite.
