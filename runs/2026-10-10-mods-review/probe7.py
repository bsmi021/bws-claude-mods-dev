"""Try alternative long-command metrics on Bash commands sized 7300-7850 (current metric): which separates EOF fails from passes."""
import json, glob, os, datetime as dt
ROOT = os.path.expanduser('~/.claude/projects')
cut = dt.datetime(2026, 10, 3, 4, tzinfo=dt.timezone.utc).timestamp()
BS, NL = chr(92), chr(10)
rows = []
for f in glob.glob(ROOT + '/**/*.jsonl', recursive=True):
    if os.path.getmtime(f) < cut or 'mods-claude-code' in f: continue
    pend = {}
    for line in open(f, encoding='utf-8', errors='replace'):
        if '"Bash"' not in line and 'tool_result' not in line: continue
        try: d = json.loads(line)
        except Exception: continue
        if d.get('timestamp', '') < '2026-10-03T04': continue
        c = (d.get('message') or {}).get('content')
        if not isinstance(c, list): continue
        for b in c:
            if not isinstance(b, dict): continue
            if b.get('type') == 'tool_use' and b.get('name') == 'Bash':
                pend[b['id']] = str((b.get('input') or {}).get('command', ''))
            if b.get('type') == 'tool_result' and b.get('tool_use_id') in pend:
                cmd = pend.pop(b['tool_use_id']); t = str(b.get('content'))
                q = cmd.count("'")
                cur = len(cmd) + 3 * q
                if 7300 <= cur < 7850:
                    rows.append(('FAIL' if 'unexpected EOF' in t else 'ok', cur, len(cmd.encode('utf-8')) + 3 * q,
                                 cur + cmd.count('"') + cmd.count(BS), cmd.count(NL)))
print('verdict, current, utf8+3q, current+dq+bs, newlines')
for r in sorted(rows, key=lambda r: r[1]): print(r)
