"""Corpus replay for the shell-lint long-command metric, before (7850, len + 3*') and after
(7800, len + 3*' + " + backslash). Every Bash tool call in every transcript, all time.

Outcome per command:
  eof   - ran and failed with "unexpected EOF" (the cut-off symptom)
  ok    - ran and did not fail that way
  lint  - refused by bws-shell-lint itself (never ran: no outcome)
Lengths are UTF-16 code units, as JavaScript's String.length counts them.
"""
import json, glob, os, collections as C, sys

ROOT = os.path.expanduser('~/.claude/projects')
OUT = os.path.dirname(os.path.abspath(__file__))
BS = chr(92)


def u16(s):
    return len(s.encode('utf-16-le')) // 2


def old(cmd):
    return u16(cmd) + 3 * cmd.count("'")


def new(cmd):
    return u16(cmd) + 3 * cmd.count("'") + cmd.count('"') + cmd.count(BS)


rows = []  # (outcome, old, new, file)
seen = set()
files = glob.glob(ROOT + '/**/*.jsonl', recursive=True)
for i, f in enumerate(files):
    pend = {}
    try:
        fh = open(f, encoding='utf-8', errors='replace')
    except OSError:
        continue
    for line in fh:
        if len(line) > 3_000_000 or ('"Bash"' not in line and 'tool_result' not in line):
            continue
        try:
            d = json.loads(line)
        except ValueError:
            continue
        c = (d.get('message') or {}).get('content')
        if not isinstance(c, list):
            continue
        for b in c:
            if not isinstance(b, dict):
                continue
            if b.get('type') == 'tool_use' and b.get('name') == 'Bash':
                cmd = (b.get('input') or {}).get('command')
                if isinstance(cmd, str):
                    pend[b.get('id')] = cmd
            elif b.get('type') == 'tool_result' and b.get('tool_use_id') in pend:
                tid = b['tool_use_id']
                cmd = pend.pop(tid)
                if tid in seen:  # a resumed transcript repeats its rows
                    continue
                seen.add(tid)
                t = b.get('content')
                t = t if isinstance(t, str) else json.dumps(t)
                if 'bws-shell-lint [' in t:
                    outcome = 'lint'
                elif b.get('is_error') and 'unexpected EOF' in t:
                    outcome = 'eof'
                else:
                    outcome = 'ok'
                rows.append((outcome, old(cmd), new(cmd), os.path.basename(f)))
    fh.close()
    if i % 500 == 0:
        print(i, len(files), file=sys.stderr)


def score(name, fn_idx, limit):
    flag = lambda r: r[fn_idx] >= limit
    eof_long = [r for r in rows if r[0] == 'eof' and r[1] >= 7000]
    return dict(
        metric=name,
        limit=limit,
        eof_long_total=len(eof_long),
        eof_long_caught=sum(1 for r in eof_long if flag(r)),
        eof_caught_any_length=sum(1 for r in rows if r[0] == 'eof' and flag(r)),
        ok_refused=sum(1 for r in rows if r[0] == 'ok' and flag(r)),
        ok_total=sum(1 for r in rows if r[0] == 'ok'),
        prior_lint_refusals_still_refused=sum(1 for r in rows if r[0] == 'lint' and flag(r)),
        prior_lint_refusals=sum(1 for r in rows if r[0] == 'lint'),
    )


res = dict(
    commands=len(rows),
    outcomes=C.Counter(r[0] for r in rows),
    before=score("len + 3*'", 1, 7850),
    after=score("len + 3*' + \" + backslash", 2, 7800),
    eof_near_limit=sorted([(r[1], r[2]) for r in rows if r[0] == 'eof' and r[1] >= 7000]),
    ok_refused_after=sorted([(r[1], r[2]) for r in rows if r[0] == 'ok' and r[2] >= 7800 and r[1] < 7850]),
)
json.dump(res, open(os.path.join(OUT, 'receipts', 'lint-replay.json'), 'w'), indent=1)
print(json.dumps({k: v for k, v in res.items() if k not in ('eof_near_limit', 'ok_refused_after')}, indent=1))
print('eof >= 7000 (old, new):', res['eof_near_limit'])
print('ok commands newly refused (old, new):', res['ok_refused_after'])
