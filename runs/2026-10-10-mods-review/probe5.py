"""Lint size of Bash commands that failed with unexpected EOF; the two tms-heim low-VRAM blocks and what followed."""
import json, glob, os, re, datetime as dt
ROOT = os.path.expanduser('~/.claude/projects')
cut = dt.datetime(2026, 10, 3, 4, tzinfo=dt.timezone.utc).timestamp()
for f in glob.glob(ROOT + '/**/*.jsonl', recursive=True):
    if os.path.getmtime(f) < cut: continue
    pend = {}; rows = []
    for line in open(f, encoding='utf-8', errors='replace'):
        if len(line) > 3_000_000: continue
        try: rows.append(json.loads(line))
        except Exception: pass
    for i, d in enumerate(rows):
        if d.get('timestamp', '') < '2026-10-03T04': continue
        c = (d.get('message') or {}).get('content')
        if not isinstance(c, list): continue
        for b in c:
            if not isinstance(b, dict): continue
            if b.get('type') == 'tool_use':
                pend[b['id']] = (b.get('name'), str((b.get('input') or {}).get('command', '')))
            if b.get('type') == 'tool_result':
                n, cmd = pend.get(b.get('tool_use_id'), ('?', ''))
                t = b.get('content'); t = t if isinstance(t, str) else json.dumps(t)
                if n == 'Bash' and 'unexpected EOF while looking for matching' in t:
                    size = len(cmd) + 3 * cmd.count("'")
                    print('EOF-miss size', size, 'len', len(cmd), 'quotes', cmd.count("'"), '|', cmd[:70].replace('\n', ' '))
                if 'other GPU apps are running' in t:
                    print('VRAM block', d['timestamp'], '| -ini SystemSettings in cmd:', '[SystemSettings]' in cmd, '| -unattended:', '-unattended' in cmd, '| -game:', '-game' in cmd)
                    for d2 in rows[i+1:i+6]:
                        for b2 in ((d2.get('message') or {}).get('content') or []):
                            if isinstance(b2, dict) and b2.get('type') == 'tool_use':
                                cm = str((b2.get('input') or {}).get('command', ''))
                                print('   next call: has low-vram ini:', 'MaxFPS' in cm, '|', cm[:0])
                            if isinstance(b2, dict) and b2.get('type') == 'text':
                                print('   next text:', b2['text'][:200].replace('\n', ' '))
