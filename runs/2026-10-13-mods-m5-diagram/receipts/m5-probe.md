# AC-DG-01 probe (2026-10-13, Claude Code 2.1.296, haiku session model, $0.003)

Command (`tools/probe.py` empties CLAUDE_CODE_PLUGIN_DIRS and uses `--setting-sources project,local`):

    python tools/probe.py --plugin bws-diagram --prompt-file runs/2026-10-13-mods-m5-diagram/receipts/m5-probe-prompt.txt \
      --settings runs/2026-10-13-mods-m5-diagram/receipts/m5-probe-settings.json --out runs/2026-10-13-mods-m5-diagram/receipts/m5-probe.json

Prompt (`m5-probe-prompt.txt`): reply with only one fenced mermaid block, `graph LR` with `A[Parse request] --> B{Valid?}`
and two labelled edges `B -- yes --> C[Write file]`, `B -- no --> D[Show error]`.
Settings: `dumpFile` = `receipts/m5-probe-dump.json` (the diagnostic state dump; `/diagram status` cannot run after the
reply in one `claude -p` run).

Result: exit 0, `result/success`. The model replied with the block. `m5-probe-dump.json` holds the board after the turn:
one entry, origin `pinned`, title `Pinned: Parse request`, 4 nodes (`A` file, `B` decision, `C` file, `D` file) and 3
edges (`B -> C: yes`, `B -> D: no`), the source kept. The stream also shows the pane registered: `system/ui_panes` with
`{ id: 'bws-diagram', title: 'Diagram', close_on_escape: true, columns: 100 }` (headless, a registration, not a drawing).
No classifier or fork call ran (headless turns are not classified; pinning is plain parsing).
