# Corpus evaluation: bws-shell-lint rules

Corpus: every Bash `tool_use` + `tool_result` in `~/.claude/projects/**/*.jsonl` changed since 2026-09-02 (built by `build_corpus.py`). Bash calls: **66219** = 64599 ok, 300 failed for quoting/parsing (254 with an error exit, 46 where a pipe or `|| echo` hid the exit code), 1320 failed for other reasons.

"Failed for quoting/parsing" = the output holds a bash parse error (`unexpected EOF while looking for matching`, `syntax error near unexpected token`, `here-document ... delimited by end-of-file`), `ENAMETOOLONG`, or a Python `SyntaxError` (unterminated literal, unicode escape, line continuation), with or without an error exit.

Precision = quoting failures / all commands denied. Recall = quoting failures caught / all quoting failures. FP rate = ok commands denied / all ok commands (target <= 0.1%, ideally 0).

| Rule | Shipped | Denied | Quoting fail (error exit) | Quoting fail (exit hidden) | Other fail | **OK (false positive)** | Precision | Recall | FP rate of OK |
|---|---|---|---|---|---|---|---|---|---|
| `long-command` | yes | 167 | 167 | 0 | 0 | 0 | 100.00% | 55.67% | 0.00% |
| `dq-trailing-backslash` | yes | 17 | 16 | 0 | 0 | 1 | 94.12% | 5.33% | 0.00% |
| `py-backslash` | yes | 62 | 37 | 20 | 3 | 2 | 91.94% | 19.00% | 0.00% |
| `unbalanced-quotes` | no | 31 | 19 | 1 | 1 | 10 | 64.52% | 6.67% | 0.02% |
| `heredoc-unterminated` | no | 10 | 1 | 1 | 0 | 8 | 20.00% | 0.67% | 0.01% |
| `unquoted-heredoc-expansion` | no | 54 | 1 | 0 | 2 | 51 | 1.85% | 0.33% | 0.08% |
| `cd-winpath-backslash` | no | 458 | 1 | 0 | 9 | 448 | 0.22% | 0.33% | 0.69% |
| **shipped set (any rule)** | | 245 | 219 | 20 | 3 | 3 | 97.55% | 79.67% | 0.00% |

## Quoting failures the shipped set does not catch

- 30 x `SyntaxError: unterminated`
- 16 x `unexpected EOF while looking for matching`
- 9 x `syntax error near unexpected token`
- 2 x `SyntaxError: unexpected character after line conti`
- 1 x `here-document at line 25 delimited by end-of-file`
- 1 x `SyntaxError: (unicode error)`
- 1 x `ENAMETOOLONG`
- 1 x `here-document at line 23 delimited by end-of-file`

## Reviewed by hand: the 3 "OK" commands the shipped set denies

All three exited 0 only because a later step hid the failure. None would have worked:

- `dq-trailing-backslash`: `ls -la "C:/.../tmsUnreal/" 2>&1 | head -50; ...`. The output reads `ls: cannot access 'C:/Projects/tmsUnreal/Source/tmsUnreal" 2>&1 | head -50; echo ===': No such file`. The quote swallowed the rest of the line.
- `py-backslash`: `python -c "...replace('/','<4 backslashes>')..." 2>/dev/null || echo "(count skipped)"`. The output is the `|| echo` fallback, so Python died.
- `py-backslash`: `cat > list_fk_chars.py <<'PYEOF'` holding `f.split('<2 backslashes>')`. The command only wrote the file; the file it wrote is broken (`'<1 backslash>'`).

Strict false positives (a denied command that would have worked): **0 of 64,561 OK Bash calls.**

## What the data says about the failure modes

- **Most "quoting" failures are truncation.** 167 of the ~195 `unexpected EOF` failures (85%) are commands longer than ~7.7k characters, almost all `python - <<'EOF'` edit scripts. They fail with `unexpected EOF while looking for matching`.
  - Measure each command as `len + 3 * count(')`. The first failure is at 7,709 and the last success at 7,802.
  - Every command at 7,850 or more failed: 167 of 167. Past 32k the spawn itself fails with `ENAMETOOLONG`.
  - The rule fires at 7,850, which leaves margin for the session's cwd length. Failures in the 7,709–7,849 overlap are missed on purpose.
  - Of commands over 5.5k, only 4 lack a heredoc, so the non-heredoc side is barely measured. The rule still applies to them, because the cut is about length, not content.
- **The extra backslash round explains the Python failures.** A run of n backslashes not followed by `"` reaches bash as ceil(n/2). A run followed by `"` arrives untouched. Live probe on 2.1.287: `echo 'A: p<2>q  B: x<2>"y  E: end<2>'` prints `A: p<1>q  B: x<2>"y  E: end<1>`.
  - This is why `.replace('<2>', '/')` in a quoted heredoc fails while `.replace("<2>", "/")` works.
  - The rule flags only code that is valid as written and invalid after the round.
- **Trailing backslash before a closing quote** is the classic `ls "C:<1>dir<1>"` mistake. The backslash escapes the quote.
- **Dropped candidates:**
  - `unbalanced-quotes`, a full quote-state lexer: 10 false positives. Its true hits overlap the shipped rules.
  - `heredoc-unterminated`: bash only warns, so 8 of 10 still ran.
  - `unquoted-heredoc-expansion`: 51 false positives. Expansion is usually intended.
  - `cd-winpath-backslash`: 448 false positives.
- **PowerShell:** no rule is supported.
  - 4 parse errors in 554 PowerShell failures, none of them shell quoting.
  - The longest PowerShell commands (7,778 and 9,297 chars) succeeded, so the length cut does not apply.
  - The mod hooks Bash only.
