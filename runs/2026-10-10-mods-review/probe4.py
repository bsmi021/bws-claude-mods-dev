"""Inputs of Glob/Grep calls that timed out at 20 s in the window."""
import json, glob, os, collections as C, datetime as dt
ROOT = os.path.expanduser('~/.claude/projects')
cut = dt.datetime(2026, 10, 3, 4, tzinfo=dt.timezone.utc).timestamp()
out = C.Counter()
for f in glob.glob(ROOT + '/**/*.jsonl', recursive=True):
    if os.path.getmtime(f) < cut: continue
    pend = {}
    for line in open(f, encoding='utf-8', errors='replace'):
        if '"Glob"' not in line and '"Grep"' not in line and 'timed out after' not in line: continue
        try: d = json.loads(line)
        except Exception: continue
        if d.get('timestamp', '') < '2026-10-03T04': continue
        c = (d.get('message') or {}).get('content')
        if not isinstance(c, list): continue
        for b in c:
            if not isinstance(b, dict): continue
            if b.get('type') == 'tool_use' and b.get('name') in ('Glob', 'Grep'):
                pend[b['id']] = (b['name'], json.dumps(b.get('input'))[:150], d.get('cwd'))
            if b.get('type') == 'tool_result' and 'timed out after 20' in str(b.get('content')):
                out[str(pend.get(b.get('tool_use_id')))] += 1
for k, v in out.most_common(30): print(v, k)
