# AC-SG-01 probe (2026-10-13, Claude Code 2.1.296, haiku)

Command (both runs; `tools/probe.py` empties CLAUDE_CODE_PLUGIN_DIRS and uses `--setting-sources project,local`):

    python tools/probe.py --plugin bws-skillgate --prompt-file runs/2026-10-13-mods-m3-skillgate/receipts/m3-probe-prompt.txt \
      --settings runs/2026-10-13-mods-m3-skillgate/receipts/m3-probe-settings.json --out runs/2026-10-13-mods-m3-skillgate/receipts/m3-probe.json

Fixed prompt (`m3-probe-prompt.txt`): a bar chart of sales, naming `/simplify` mid-sentence; asks for the skills listed.

| Run | Options | Model's answer |
| --- | --- | --- |
| `m3-probe.json` | `mode: on`, `topK: 1` | `AVAILABLE-SKILLS: dataviz, simplify` |
| `m3-probe-control.json` | `mode: off` | all 15 listed skills (mods-harness, dataviz, update-config, keybindings-help, code-review, simplify, fewer-permission-prompts, loop, schedule, claude-api, workflow-authoring, run, plugin-authoring, init, security-review) |

The cut is the classifier's one pick plus the skill the prompt named with `/name`, in the listing's order. The pick itself
is not visible in a headless stream (the plugin logs only failures, and its store lives under the user's config dir,
which the probe does not read). The answer has exactly the cut's shape: one pick (`dataviz`, the only chart skill) and
the named `simplify`, out of 15; with the gate off the same prompt reports all 15. Cost: $0.0026 and $0.0027.
