# Changelog

## 0.3.0
- A Shell lint tab in the bws-cockpit dashboard lists the active rules and the last five refused commands.

## 0.2.0
- A new size metric for `long-command`: length plus 3 per `'` and 1 per `"` and `\`, with a limit of 7,800. In a replay of 73,857 real commands it catches 152 of 154 cut-off failures (was 142) and refuses 10 commands that ran (was 4).
- Checked on Claude Code 2.1.296.

## 0.1.0
- First release. Refuses Bash commands that will fail on Windows Git Bash, with the exact fix, under three rules: `long-command`, `dq-trailing-backslash` and `py-backslash`.
- Options `enabled` and `disabledRules`.
- Checked live in headless `claude -p`: the model's refused command was retried with the fix and ran.
