# AC-DP-01 probe (2026-10-13, Claude Code 2.1.296)

Command (`tools/probe.py` empties CLAUDE_CODE_PLUGIN_DIRS and isolates user mods; prompt from a file because it starts with a slash):

    python tools/probe.py --plugin bws-memory --prompt-file runs/2026-10-13-mods-m6-dreampath/receipts/m6-probe-prompt.txt \
      --settings runs/2026-10-13-mods-m6-dreampath/receipts/m6-probe-settings.json --out runs/2026-10-13-mods-m6-dreampath/receipts/m6-probe.json

Prompt: `/dream apply`. `memoryDir` (settings file) is `receipts/m6-probe-memdir`; `receipts/m6-probe-fixture/` is the untouched
starting folder: three files, two of them near-duplicates (`prefers-tabs.md`, `tabs-not-spaces.md`), plus `MEMORY.md` and
`sources.json` with a different session per file.

Result: exit 0. The command's text: `bws-memory: Dream applied: 1 merged, 0 removed, 0 rewritten. Backup: .dream-backup/20261013-141602-356/ (restore with /dream undo).`
- The model's plan (headless, so `$.model.complete` with the session model, no conversation to fork) was one merge of the two
  near-duplicates into `prefers-tabs.md`; `tabs-not-spaces.md` is now empty (0 bytes; a mod has no delete) and its `MEMORY.md`
  line is gone. `uses-pnpm.md` is untouched.
- `sources.json`: both `aaaa1111` and `bbbb2222` now point at `prefers-tabs.md` (the union); `uses-pnpm.md` keeps `cccc3333`.
- The backup folder `.dream-backup/20261013-141602-356/` holds the originals.
- Only `/dream apply` was probed live (it is the awaited, headless path). Preview, the pane, `/dream undo`, the triggers are
  covered by `tests/dream*.test.ts` and MANUAL-CHECKS.md.
