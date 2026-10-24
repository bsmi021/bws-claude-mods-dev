# Changelog

## 0.1.2
- No behaviour change. Ships the shared tab module with the new markdown and picture nodes (bws-cockpit 0.27.0).

## 0.1.1
- No code change. Version bumped with bws-mods 1.7.1 so every mod updates together.

## 0.1.0
- First release: records every `AskUserQuestion` round per project, pages through them in an Interview tab of
  bws-cockpit's dashboard, and gives the agreed answers back to Claude with `/qa send` and the `qa_history` tool.
- Optional `pinDigest` keeps a short digest of the session's answers in Claude's context.
