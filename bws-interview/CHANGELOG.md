# Changelog

## 0.1.0
- First release: records every `AskUserQuestion` round per project, pages through them in an Interview tab of
  bws-cockpit's dashboard, and gives the agreed answers back to Claude with `/qa send` and the `qa_history` tool.
- Optional `pinDigest` keeps a short digest of the session's answers in Claude's context.
