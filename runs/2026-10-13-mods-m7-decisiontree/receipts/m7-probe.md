# AC-DT-01 probe: `/explain` over a fixture reply with three options

Command (from the repo root, Claude Code 2.1.296, Windows 11):

```
python tools/probe.py --plugin bws-sidechat --prompt-file runs/2026-10-13-mods-m7-decisiontree/receipts/m7-probe-prompt.txt --settings runs/2026-10-13-mods-m7-decisiontree/receipts/m7-probe-settings.json --out runs/2026-10-13-mods-m7-decisiontree/receipts/m7-probe.json
```

`probe.py` runs `claude -p <prompt> --plugin-dir ./bws-sidechat --output-format stream-json --verbose --model haiku
--setting-sources project,local --settings <file>` with `CLAUDE_CODE_PLUGIN_DIRS` empty.

- Prompt (`m7-probe-prompt.txt`): `/explain ` followed by a reply with three numbered options and a closing question.
  A fresh headless session has no earlier reply, so the fixture is passed as `/explain <text>`.
- Settings (`m7-probe-settings.json`): `treeDumpFile` points at `m7-probe-dump.json`.
- Result (`m7-probe.json`): init lists `bws-sidechat@inline` 0.2.0; `result` success, exit 0, `num_turns` 0,
  `total_cost_usd` 0 (no model call). The command's reply: `Decision tree: 1 node.` then the root question and the
  three options.
- State dump (`m7-probe-dump.json`): one node `n1`, `question` "Which would you like me to go with?", three `options`
  (`1` SQLite, `2` Postgres, `3` Plain JSON files), `currentId` `n1`, `chosen` null, no edges, nothing exploring.

Verdict: the root node opens with three options. Pass.
