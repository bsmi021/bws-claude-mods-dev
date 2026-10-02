# RUNLOG: 2026-10-02 shell-lint mod (mod #3)

## Objective
Build `bws-shell-lint`. It is a Claude Code mod that denies Bash or PowerShell commands that will certainly fail for quoting or path reasons, and the deny gives the exact fix. It never rewrites a command and never denies one that would have worked. The rules come from a replay corpus and are measured on it.

## Finish line (status)
1. `claude plugin validate ./bws-shell-lint` is clean. Done: `receipts/validate.txt`.
2. `claude plugin test` passes, 16/16. Done: `receipts/test.txt`. The tests cover:
   - each rule's denies
   - real OK commands passing through
   - other tools passing through
   - the options
   - TS/Python agreement on 444 corpus commands
3. A precision/recall table per rule. Done: `receipts/corpus-eval.md`.
4. A live headless check. Done: `receipts/live.txt`, with raw streams in `receipts/live-raw.jsonl` and `receipts/live-retry-raw.jsonl`.
   - Run 1: the deny text reached the model.
   - Run 2: the model retried at once with the forward-slash fix, and that call succeeded.
5. README. Done: `bws-shell-lint/README.md`.
6. This RUNLOG. Done.
7. Local commit containing only `bws-shell-lint/` and this run folder. Done (see git log).

## Actions
- `build_corpus.py` builds `corpus.jsonl`:
  - every Bash/PowerShell `tool_use` and `tool_result` from `~/.claude/projects/**/*.jsonl` changed since 2026-09-02
  - 71,287 calls; 66,219 of them Bash
  - the sas-ai-governance project excluded
  - `corpus.jsonl` is about 120 MB and gitignored
- Found the real failure mechanisms. They are not the ones the brief guessed:
  - **Truncation.** Bash commands with `len + 3*count(')` ≥ ~7.7k fail with `unexpected EOF`.
    - The last success is at 7,802. Every command at 7,850 or more failed (167/167).
    - This is 85% of the `unexpected EOF` bucket.
  - **The extra backslash round.** Probed live on 2.1.287:
    - A backslash run not followed by `"` reaches bash halved (rounded up), even inside single quotes and quoted heredocs.
    - A run followed by `"` arrives untouched.
    - This explains the Python `'\\'` → `SyntaxError: unterminated string literal` failures, and why `"\\"` works.
    - It also bit this session three times while writing scripts through heredocs. Rule files were then written with the Write tool.
  - **Trailing backslash before a closing quote**, as in `ls "C:\dir\"`.
- `lint.py` holds the reference rules. `evaluate.py` scores 7 candidates and writes `corpus-eval.md`. It counts failures hidden by `| head` or `|| echo` as failures, and says so.
- Shipped three rules:

  | Rule | Precision | Recall | OK commands denied |
  |---|---|---|---|
  | `long-command` | 100% | 55.7% | 0 |
  | `dq-trailing-backslash` | 94.1% | 5.3% | 1 |
  | `py-backslash` | 91.9% | 19.0% | 2 |

  The 3 OK hits were reviewed by hand. All of them actually failed and were hidden by a pipe or `|| echo`, so there are 0 true false positives in 64.6k OK calls. The shipped set catches 239 of 300 quoting/parse failures (79.7%).
- Dropped four candidates on the data: unbalanced-quotes lexer, unterminated heredoc, unquoted-heredoc expansion, and cd-winpath. The numbers are in `corpus-eval.md`.
- Dropped PowerShell from the hook. There were no PowerShell quoting failures to catch, and long PowerShell commands (up to 9.3k) succeed.
- Ported the rules to `bws-shell-lint/hooks/lint.ts`:
  - `register.ts` hooks `tool.call{tool=Bash}`, denies with the fix, and toasts. The toast is wrapped in try/catch so a surface without a toast still gets the deny.
  - `gen_fixture.py` dumps 444 sampled commands with the Python verdicts into `tests/corpus-fixture.ts`, after a secret filter. `agreement.test.ts` shows zero mismatches.
- Live checks used `claude.exe -p --plugin-dir ./bws-shell-lint --model haiku --allowedTools "Bash(ls:*)" --output-format stream-json --verbose`. Cost: about $0.08 and $0.04.

## Results
- Validate passed. Tests: 16/16. Live: the deny was shown and the model self-corrected.
- Not installed. `~/.claude/settings.json` was not touched. Nothing pushed.

## Next steps / follow-ups (parked)
- Uncaught failures, about 61:
  - 30 Python `SyntaxError`s, mostly real Python bugs (not shell)
  - 16 truncations in the 7,709–7,849 overlap
  - 9 `syntax error near unexpected token` (mostly PowerShell syntax typed into Bash)
- A narrow rule for PowerShell `@(...)` and `$null` typed into Bash could add a few more. It needs its own measurement.
- Re-run `build_corpus.py` + `evaluate.py` after Claude Code updates. The length cut and the backslash round are host behaviour and could change.
- Optional: install through a local marketplace once Brian has run it interactively for a while.
