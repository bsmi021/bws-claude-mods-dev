"""Write a small, scrubbed bws-shell-lint/tests/corpus-fixture.ts that is safe to push.

Replaces the 444-command sample from gen_fixture.py (512 KB of Brian's real commands).

- dq-trailing-backslash and py-backslash: real commands from the replay corpus, short ones only, scrubbed.
- long-command: synthetic. A real 8k-character command is mostly private content and can't be scrubbed down.
- clean commands: short real look-alikes (backslashes, heredocs, python -c) plus plain ones, scrubbed.

Scrubbing replaces the username, home and temp paths, project folder names, session ids, emails and
tool-use ids. The verdict is then recomputed with the Python reference (lint.py) on the scrubbed text,
and an entry is kept only if scrubbing did not change which rule fires. Every kept entry is printed for
a human read-through; DROP_IDS lists the ones that read-through removed.
"""
import json
import random
import re
import sys
from pathlib import Path

import lint

HERE = Path(__file__).resolve().parent
OUT = HERE.parents[1] / 'bws-shell-lint' / 'tests' / 'corpus-fixture.ts'
rng = random.Random(20261002)

SECRET = re.compile(r'(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_|AKIA[0-9A-Z]{16}|xox[bap]-|AIza[0-9A-Za-z_-]{30,}'
                    r'|-----BEGIN [A-Z ]*PRIVATE KEY|(?i:api[_-]?key|secret|password|passwd|bearer|token)\s*[=:]\s*\S{8,})')
EMAIL = re.compile(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}')
UUID = re.compile(r'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}')
PROJECT = re.compile(r'(?i)(projects[\\/]+)([A-Za-z0-9._-]+)')
TEMP_SESSION = re.compile(r'(?i)(Temp[\\/]+claude[\\/]+)([^\\/\s"\']+)')
# Words that name Brian, his games or their content; an entry still holding one after scrubbing is dropped.
PERSONAL = re.compile(r'(?i)bsmi|brian|monastery|heim|warden|alrec|garran|anselm|barrit|goul|synty|inkwell|pinkgill|'
                      r'axo|frisbee|street-?war|iron-?canopy|scribe|tms|xwing|canopy|portfolio|animation\.?station|gaoler|moca|'
                      r'elric|ski-?ball')
# Hardware serials (adb device ids): 12-16 upper-case letters and digits with both kinds present.
SERIAL = re.compile(r'\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{12,16}\b')

# The read-through dropped commands that carry design text or product internals rather than shell shape.
DROP_SUBSTRINGS = ['GDD', 'waystation', 'FORTY-MOVES', 'electric', 'forelegs', 'SPEC-', 'placeholder name', 'API_KEY']
DROP_PREFIXES: list[str] = []


RUN_FOLDER = re.compile(r'runs([\\/]+)\d{4}-\d{2}-\d{2}-[A-Za-z0-9._-]+')


def scrub(cmd: str) -> str:
    s = cmd.replace('bsmi021', 'user').replace('bsmi0', 'dev')
    s = EMAIL.sub('user@example.com', s)
    s = UUID.sub('00000000-0000-0000-0000-000000000000', s)
    s = TEMP_SESSION.sub(lambda m: m.group(1) + 'session', s)
    s = PROJECT.sub(lambda m: m.group(1) + 'demo', s)
    s = RUN_FOLDER.sub(lambda m: 'runs' + m.group(1) + '2026-01-01-task', s)
    s = SERIAL.sub('DEVICE0SERIAL01', s)
    # Names of Brian's games and their content become neutral words; none of them carry backslashes.
    s = PERSONAL.sub('demo', s)
    return s


def verdict(cmd: str):
    f = lint.lint(cmd)
    return (f['rule'], str(f['detail'])) if f else (None, None)


rows = [json.loads(line) for line in open(HERE / 'corpus.jsonl', encoding='utf-8')]
bash = [r for r in rows if r['tool'] == 'Bash' and not SECRET.search(r['command'])]

def candidates(rule, max_len, pred=lambda r: True):
    out = []
    for r in bash:
        if len(r['command']) > max_len or not pred(r):
            continue
        before = verdict(r['command'])[0]
        if before != rule:
            continue
        s = scrub(r['command'])
        if PERSONAL.search(s) or any(s.startswith(p) for p in DROP_PREFIXES) or any(d in r['command'] for d in DROP_SUBSTRINGS):
            continue
        after = verdict(s)
        if after[0] != rule:
            continue
        out.append({'ok': not r['is_error'], 'command': s, 'rule': after[0], 'detail': after[1]})
    # unique by command
    seen, uniq = set(), []
    for e in out:
        if e['command'] not in seen:
            seen.add(e['command'])
            uniq.append(e)
    return uniq


dq = candidates('dq-trailing-backslash', 300)
py = candidates('py-backslash', 700)
tricky_clean = candidates(None, 220, lambda r: not r['is_error'] and (chr(92) in r['command'] or '<<' in r['command'] or ' -c ' in r['command']))
plain_clean = candidates(None, 120, lambda r: not r['is_error'] and chr(92) not in r['command'] and '<<' not in r['command'])

picked = []
picked += rng.sample(dq, min(8, len(dq)))
picked += rng.sample(py, min(10, len(py)))
picked += rng.sample(tricky_clean, min(40, len(tricky_clean)))
picked += rng.sample(plain_clean, min(20, len(plain_clean)))

# Synthetic long commands around the length limit: lint.LONG_LIMIT counts len + 3 per single quote.
def synth(cmd: str, ok: bool):
    v = verdict(cmd)
    return {'ok': ok, 'command': cmd, 'rule': v[0], 'detail': v[1]}

body_line = 'total = total + 1\n'
heredoc_over = "python - <<'PY'\ntotal = 0\n" + body_line * 440 + 'print(total)\nPY'
quotes_over = 'echo ' + "'a' " * 1980
plain_over = 'printf "%s\\n" ' + ' '.join(f'item{i:05d}' for i in range(800))
heredoc_under = "python - <<'PY'\ntotal = 0\n" + body_line * 400 + 'print(total)\nPY'
long_entries = [synth(heredoc_over, False), synth(quotes_over, False), synth(plain_over, False), synth(heredoc_under, True)]
assert [e['rule'] for e in long_entries] == ['long-command', 'long-command', 'long-command', None], [e['rule'] for e in long_entries]
picked += long_entries

entries = [{'id': f'c{i:03d}', **e} for i, e in enumerate(picked, 1)]

if '--print' in sys.argv:
    for e in entries:
        c = e['command'] if len(e['command']) < 1000 else e['command'][:160] + f' ... [{len(e["command"])} chars]'
        print(f"--- {e['id']} ok={e['ok']} rule={e['rule']}\n{c}")

body = json.dumps(entries, ensure_ascii=True, indent=0)
OUT.write_text(
    '// Generated by runs/2026-10-02-shell-lint-mod/shrink_fixture.py. Do not edit.\n'
    '// Each entry: a Bash command and the Python reference verdict (rule name or null, and its detail).\n'
    '// dq-trailing-backslash, py-backslash and the clean entries are real commands from the 30-day replay,\n'
    '// short ones only, with names and paths scrubbed and reviewed by hand. The long-command entries are synthetic.\n'
    'export type FixtureEntry = { id: string; ok: boolean; command: string; rule: string | null; detail: string | null }\n'
    'export const FIXTURE: FixtureEntry[] = ' + body + '\n', encoding='utf-8')
from collections import Counter
print('entries', len(entries), dict(Counter(e['rule'] for e in entries)), 'ok-flagged',
      sum(1 for e in entries if e['ok'] and e['rule']), 'bytes', OUT.stat().st_size,
      'pools', {'dq': len(dq), 'py': len(py), 'tricky': len(tricky_clean), 'plain': len(plain_clean)})
