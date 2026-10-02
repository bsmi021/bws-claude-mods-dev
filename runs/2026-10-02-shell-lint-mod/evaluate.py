"""Score every candidate rule against corpus.jsonl and write receipts/corpus-eval.md + eval-detail.json."""
import json, re, collections as C
from pathlib import Path
import lint

HERE = Path(__file__).resolve().parent
rows = [json.loads(l) for l in open(HERE / 'corpus.jsonl', encoding='utf-8')]
bash = [r for r in rows if r['tool'] == 'Bash']

QFAIL = re.compile(
    r"unexpected EOF while looking for matching|syntax error near unexpected token|syntax error: unexpected end of file"
    r"|here-document at line \d+ delimited by end-of-file|ENAMETOOLONG"
    r"|SyntaxError: (unterminated|\(unicode error\)|unexpected character after line continuation|EOL while)")


def label(r):
    if QFAIL.search(r['text']):
        # a pipe or `|| echo` can hide the failing step's exit code: count it, but say so
        return 'qfail' if r['is_error'] else 'qfail0'
    return 'otherfail' if r['is_error'] else 'ok'


for r in bash:
    r['label'] = label(r)


# ------------------------------------------------ dropped candidates (measured, not shipped)

def cand_unbalanced_quotes(cmd):
    """Bash quote state at end of the command, heredoc bodies removed, after the backslash collapse."""
    shell, _ = lint.split_heredocs(cmd)
    s = lint.collapse(shell)
    state = None
    i = 0
    while i < len(s):
        c = s[i]
        if state is None:
            if c == lint.BS:
                i += 2
                continue
            if c == '#' and (i == 0 or s[i - 1] in ' \t\n;&|('):
                j = s.find('\n', i)
                i = len(s) if j < 0 else j
                continue
            if c == "'":
                state = "'"
            elif c == '"':
                state = '"'
        elif state == "'":
            if c == "'":
                state = None
        elif state == '"':
            if c == lint.BS:
                i += 2
                continue
            if c == '"':
                state = None
            if c == '$' and s.startswith('$(', i) or c == '`':
                return None  # nested substitution: out of scope
        i += 1
    return {'rule': 'unbalanced-quotes'} if state else None


def cand_heredoc_unterminated(cmd):
    _, bodies = lint.split_heredocs(cmd)
    return {'rule': 'heredoc-unterminated'} if any(not b['terminated'] for b in bodies) else None


def cand_unquoted_heredoc_expansion(cmd):
    _, bodies = lint.split_heredocs(cmd)
    for b in bodies:
        if not b['quoted'] and re.search(r'\$[A-Za-z_{(]|`', b['body']):
            return {'rule': 'unquoted-heredoc-expansion'}
    return None


def cand_cd_winpath_then_backslash(cmd):
    if re.search(r'cd[ \t]+"[A-Za-z]:\\', cmd) and re.search(r'"[^"\n]*[^\\]\\[^\\"\n][^"\n]*"', cmd.split('\n', 1)[-1]):
        return {'rule': 'cd-winpath-backslash'}
    return None


CANDIDATES = [
    ('long-command', lint.rule_long_command, True),
    ('dq-trailing-backslash', lint.rule_dq_trailing_backslash, True),
    ('py-backslash', lint.rule_py_backslash, True),
    ('unbalanced-quotes', cand_unbalanced_quotes, False),
    ('heredoc-unterminated', cand_heredoc_unterminated, False),
    ('unquoted-heredoc-expansion', cand_unquoted_heredoc_expansion, False),
    ('cd-winpath-backslash', cand_cd_winpath_then_backslash, False),
]

tot = C.Counter(r['label'] for r in bash)
n_ok = tot['ok']
n_q = tot['qfail'] + tot['qfail0']
results = {}
for name, fn, shipped in CANDIDATES:
    hits = C.Counter()
    ex = C.defaultdict(list)
    for r in bash:
        if fn(r['command']):
            hits[r['label']] += 1
            if len(ex[r['label']]) < 5:
                ex[r['label']].append(r['id'])
    results[name] = (hits, ex, shipped)

# combined shipped set
comb = C.Counter()
qcaught = set()
for r in bash:
    if lint.lint(r['command']):
        comb[r['label']] += 1
        if r['label'] in ('qfail', 'qfail0'):
            qcaught.add(r['id'])

missed = [r for r in bash if r['label'] in ('qfail', 'qfail0') and r['id'] not in qcaught]
miss_kinds = C.Counter()
for r in missed:
    m = QFAIL.search(r['text'])
    miss_kinds[m.group(0)[:50]] += 1


def pct(a, b):
    return f'{100.0 * a / b:.2f}%' if b else '-'


out = []
out.append('# Corpus evaluation: bws-shell-lint rules\n')
out.append(f'Corpus: every Bash `tool_use` + `tool_result` in `~/.claude/projects/**/*.jsonl` changed since 2026-09-02 '
           f'(built by `build_corpus.py`). Bash calls: **{len(bash)}** = {n_ok} ok, {n_q} failed for quoting/parsing '
           f'({tot["qfail"]} with an error exit, {tot["qfail0"]} where a pipe or `|| echo` hid the exit code), '
           f'{tot["otherfail"]} failed for other reasons.\n')
out.append('"Failed for quoting/parsing" = the output holds a bash parse error (`unexpected EOF while looking for matching`, '
           '`syntax error near unexpected token`, `here-document ... delimited by end-of-file`), `ENAMETOOLONG`, or a Python '
           '`SyntaxError` (unterminated literal, unicode escape, line continuation), with or without an error exit.\n')
out.append('Precision = quoting failures / all commands denied. Recall = quoting failures caught / all quoting failures. '
           'FP rate = ok commands denied / all ok commands (target <= 0.1%, ideally 0).\n')
out.append('| Rule | Shipped | Denied | Quoting fail (error exit) | Quoting fail (exit hidden) | Other fail | **OK (false positive)** | Precision | Recall | FP rate of OK |')
out.append('|---|---|---|---|---|---|---|---|---|---|')
for name, (hits, ex, shipped) in results.items():
    d = sum(hits.values())
    out.append(f'| `{name}` | {"yes" if shipped else "no"} | {d} | {hits["qfail"]} | {hits["qfail0"]} | {hits["otherfail"]} | {hits["ok"]} | '
               f'{pct(hits["qfail"] + hits["qfail0"], d)} | {pct(hits["qfail"] + hits["qfail0"], n_q)} | {pct(hits["ok"], n_ok)} |')
d = sum(comb.values())
out.append(f'| **shipped set (any rule)** | | {d} | {comb["qfail"]} | {comb["qfail0"]} | {comb["otherfail"]} | {comb["ok"]} | '
           f'{pct(comb["qfail"] + comb["qfail0"], d)} | {pct(comb["qfail"] + comb["qfail0"], n_q)} | {pct(comb["ok"], n_ok)} |')
out.append('')
out.append('## Quoting failures the shipped set does not catch\n')
for k, v in miss_kinds.most_common():
    out.append(f'- {v} x `{k}`')
(HERE / 'receipts' / 'corpus-eval.md').write_text('\n'.join(out) + '\n', encoding='utf-8')
json.dump({k: {'hits': dict(h), 'examples': dict(e)} for k, (h, e, s) in results.items()} | {'missed_ids': [r['id'] for r in missed]},
          open(HERE / 'eval-detail.json', 'w', encoding='utf-8'), indent=1)
print('\n'.join(out))

NOTES = """
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
"""
with open(HERE / 'receipts' / 'corpus-eval.md', 'a', encoding='utf-8') as f:
    f.write(NOTES)
