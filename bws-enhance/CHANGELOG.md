# Changelog

## 0.4.3
- The footer `✦ enhance` button is drawn in the Claude Desktop app too (it was terminal-only). There it is a click; the chord stays a terminal feature.
- The idle Enhance tab has an **Enhance draft** button (`e`, or `/enhance --draft`): it enhances the draft in the prompt box, so the dashboard no longer points only at the footer.

## 0.4.2
- No behaviour change. Ships the 1.7.0 README, this CHANGELOG and the full manifest (author, homepage,
  repository, license, keywords) to installed copies: `claude plugin update` keeps files by version.

## 0.4.1
- When you start `/enhance` in the dashboard, the rewrite waits in the Enhance tab and the keyboard stays there: `s` sends it, `p` puts it in the box to edit, `d` dismisses. Filling the box would have taken the keyboard away.
- Needs bws-cockpit 0.21.1 or later, which opens the dashboard on the Enhance tab with the keyboard.

## 0.4.0
- The review moved from a pane of its own into the Enhance tab of bws-cockpit's dashboard (0.21.0 or later). The buttons are Send, Revert, Put in box and Dismiss, plus Send anyway, Enhance and Edit for a held prompt.
- Every button has a command twin: `/enhance --send`, `--revert`, `--put`, `--dismiss`, `--cancel`, `--sendanyway`, `--enhance`, `--edit`.
- Buttons have letter hotkeys while the dashboard has the keyboard.

## 0.3.1
- The prompt bouncer stands aside while bws-better's automatic mode is on, so only one mod takes a typed prompt.

## 0.3.0
- New: the prompt bouncer. It holds a vague prompt before it is sent and says what is missing.
- Three modes: `off` (default), `warn` (Enter again sends) and `block` (the draft stays in the box; Send anyway, Enhance or Edit).
- `/bounce [off|warn|block|status]` sets the mode for the session.
- Uses a project glossary: the `glossaryFile` option, else `docs/GLOSSARY.md`, else the `## Glossary` section of `AGENTS.md` or `CLAUDE.md`.
- New options: `bounce`, `bounceModel`, `glossaryFile`.
- Fails open: any classifier error or timeout sends the prompt unchanged and writes one debug line.
- Publishes a summary chip for the bws-cockpit action bar.

## 0.2.1
- The footer is shared with other mods: the `✦ enhance` button now sits beside other mods' footer buttons instead of replacing them.

## 0.2.0
- The rewriter also sees a file tree of the project (2 levels, at most 150 entries).
- The review pane takes the keyboard when the result arrives, so `s`, `r` and `d` work.
- The default model is now `haiku`.

## 0.1.0
- First release: `/enhance <rough prompt>` and a chord on the draft rewrite a vague prompt using the project's instruction files, installed skills and commands, MCP servers, the recent conversation and Anthropic's prompting guidance for the session's model.
- The rewrite goes in the prompt box, with Send and Revert.
- Checked live in Windows Terminal.
