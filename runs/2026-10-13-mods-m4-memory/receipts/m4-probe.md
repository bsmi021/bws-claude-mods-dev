# AC-MEM-01 probe (2026-10-13, Claude Code 2.1.296, haiku classifier unused; the writing call is the session model)

Command (`tools/probe.py` empties CLAUDE_CODE_PLUGIN_DIRS and uses `--setting-sources project,local`):

    python tools/probe.py --plugin bws-memory --prompt-file runs/2026-10-13-mods-m4-memory/receipts/m4-probe-prompt.txt \
      --settings runs/2026-10-13-mods-m4-memory/receipts/m4-probe-settings.json --out runs/2026-10-13-mods-m4-memory/receipts/m4-probe.json

Prompt: `/remember that the staging deploy for this project needs the REGION flag set to eu-west-1, and the user prefers short commit messages`.
`memoryDir` in the settings file is `receipts/m4-probe-memdir` (a temp folder under the run folder).

Result: exit 0; the command's text is `bws-memory: Memory updated: staging-deploy-region.md (new) +9 -0; commit-message-length.md (new) +9 -0.`
Files written in `receipts/m4-probe-memdir/`: `staging-deploy-region.md` (type project), `commit-message-length.md` (type feedback),
`MEMORY.md` (two lines) and `sources.json` (both writes with the session id). The stream also shows the pane `bws-memory`
registered (`ui_panes`).

Why `/remember` and not a plain "remember that X": FR-MEM-01 skips headless runs, so the classifier path never runs in
`claude -p`. `/remember` is the forced path and is awaited inline when there is no screen. The classifier path is covered
by `tests/mem.test.ts` and by MANUAL-CHECKS.md.
