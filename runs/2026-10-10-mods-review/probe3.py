"""Quantify candidate signals: Monitor schema errors, sleep blocks, 600 s waits, long-command shapes, python-heredoc edits."""
import json, glob, os, re, collections as C, datetime as dt
ROOT = os.path.expanduser('~/.claude/projects')
CUT = dt.datetime(2026, 10, 3, 4, tzinfo=dt.timezone.utc)
c = C.Counter(); by = C.defaultdict(C.Counter); ex = C.defaultdict(list)
def ts(s): return dt.datetime.fromisoformat(s.replace('Z', '+00:00'))
for f in glob.glob(ROOT + '/**/*.jsonl', recursive=True):
    if os.path.getmtime(f) < CUT.timestamp(): continue
    proj = os.path.relpath(f, ROOT).split(os.sep)[0][11:40]
    pend = {}; entry = None
    for line in open(f, encoding='utf-8', errors='replace'):
        if len(line) > 3_000_000: continue
        try: d = json.loads(line)
        except Exception: continue
        if not d.get('timestamp') or d['timestamp'] < '2026-10-03T04': continue
        entry = entry or d.get('entrypoint')
        hl = 'headless' if entry and 'sdk' in entry else 'interactive'
        m = d.get('message') or {}; cc = m.get('content')
        if d.get('type') == 'assistant' and isinstance(cc, list):
            for b in cc:
                if isinstance(b, dict) and b.get('type') == 'tool_use':
                    inp = b.get('input') or {}; cmd = str(inp.get('command', ''))
                    pend[b['id']] = (b.get('name'), cmd, d['timestamp'])
                    if b.get('name') == 'Bash' and re.match(r"\s*(cd [^;&]+[;&]+\s*)?python3? (-I )?- <<", cmd) and re.search(r'\.replace\(|write_text|open\([^)]*[\'"]w', cmd):
                        c['python-heredoc file edit'] += 1; by['python-heredoc file edit'][hl] += 1
        if d.get('type') == 'user' and isinstance(cc, list):
            for b in cc:
                if not (isinstance(b, dict) and b.get('type') == 'tool_result'): continue
                n, cmd, t0 = pend.get(b.get('tool_use_id'), ('?', '', None))
                t = b.get('content'); t = t if isinstance(t, str) else json.dumps(t)
                if n in ('Bash', 'PowerShell') and t0:
                    dur = (ts(d['timestamp']) - ts(t0)).total_seconds()
                    if dur >= 590:
                        k = 'shell call hit 10-min cap' ; c[k] += 1; by[k][hl] += 1
                        if re.search(r'\buntil\b|while|sleep|Start-Sleep', cmd): c['  ...of which a wait loop'] += 1
                        if len(ex[k]) < 8: ex[k].append((proj, cmd[:140]))
                if not b.get('is_error'): continue
                if n == 'Monitor' and 'InputValidationError' in t:
                    k = 'Monitor InputValidationError'; c[k] += 1; by[k][hl] += 1
                    if len(ex[k]) < 3: ex[k].append((proj, t[:300]))
                elif 'InputValidationError' in t:
                    k = 'other InputValidationError'; c[k] += 1; by[k][hl] += 1; ex[k].append((proj, n, t[:160]))
                if t.startswith('<tool_use_error>Blocked: sleep'):
                    k = 'harness sleep block'; c[k] += 1; by[k][hl] += 1
                if 'bws-shell-lint [long-command]' in t:
                    shape = 'python heredoc' if re.search(r'python3? (-I )?- <<', cmd) else 'cat > file heredoc' if re.search(r'cat\s*>', cmd) else 'other'
                    k = 'long-command: ' + shape; c[k] += 1; by[k][hl] += 1
                if "haven't granted it yet" in t:
                    k = 'headless write-permission ungranted'; c[k] += 1; by[k][hl] += 1
for k, v in c.most_common(): print(f'{v:5} {k}  {dict(by.get(k, {}))}')
for k, v in ex.items():
    print('==', k)
    for e in v[:8]: print('  ', str(e)[:260])
