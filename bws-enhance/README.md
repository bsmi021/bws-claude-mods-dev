# bws-enhance

Turns a vague prompt into a specific one Claude Code can act on, then lets you send it.

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

## Load

```
claude --plugin-dir ./bws-enhance
```
or add the folder's absolute path to `CLAUDE_CODE_PLUGIN_DIRS`.

## Tested

Claude Code 2.1.296, Windows. Static: `claude plugin validate` passes. Automated: `claude plugin test`, 18 tests (pane and footer
trees on terminal and desktop, presses, fill/submit/revert, failure path, options). Type-check: tsc 5.6 strict. Live: headless
`claude -p "/enhance ..."` runs return grounded rewrites.

Live in Windows Terminal (fullscreen layout, 2026-10-10): `/enhance` filled the box and docked the pane; `Enter` sent the
rewrite; `ctrl+x ctrl+p` enhanced a typed draft, also while Claude was mid-turn; clicking **Revert** restored the draft and
closed the pane. 0.2.0 (same day): the file tree reached the rewriter live (it named sibling plugin folders). Pane focus on result, and so `s`/`r`/`d`, is not yet confirmed live: the first try showed the pane never got focus, fixed by close-and-reopen; the retest was cut short by outside input in the test window.
Not tried: main-screen (inline) layout, desktop app.
VS Code / mobile / cloud draw no mod UI; use `/enhance` and copy the rewrite.
