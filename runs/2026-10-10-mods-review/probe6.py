"""tms-heim 10-06 low-VRAM blocks: the commands and what came after. Plus successful Bash sizes near the lint limit."""
import json, glob, os, datetime as dt, re
ROOT = os.path.expanduser('~/.claude/projects')
cut = dt.datetime(2026, 10, 3, 4, tzinfo=dt.timezone.utc).timestamp()
near_ok = []; near_fail = []
for f in glob.glob(ROOT + '/**/*.jsonl', recursive=True):
    if os.path.getmtime(f) < cut: continue
    rows = []
    for line in open(f, encoding='utf-8', errors='replace'):
        if len(line) > 3_000_000: continue
        try: rows.append(json.loads(line))
        except Exception: pass
    pend = {}
    show = None
    for d in rows:
        if d.get('timestamp', '') < '2026-10-03T04': continue
        c = (d.get('message') or {}).get('content')
        if not isinstance(c, list): continue
        for b in c:
            if not isinstance(b, dict): continue
            if b.get('type') == 'tool_use':
                pend[b['id']] = (b.get('name'), str((b.get('input') or {}).get('command', '')), d['timestamp'])
                if show is not None and show < 4:
                    show += 1; print('  CALL', d['timestamp'][11:19], b.get('name'), str((b.get('input') or {}).get('command', ''))[-400:].replace('\n', ' '))
            if b.get('type') == 'tool_result':
                n, cmd, t0 = pend.get(b.get('tool_use_id'), ('?', '', ''))
                t = b.get('content'); t = t if isinstance(t, str) else json.dumps(t)
                if t0.startswith('2026-10-06T13:5') and 'GPU apps' in t:
                    print('BLOCK', t0[11:19], n, '\n  CMD tail:', cmd[-500:].replace('\n', ' '), '\n  MSG:', t[:500]); show = 0
                elif show is not None and show <= 4:
                    print('  RESULT', 'err' if b.get('is_error') else 'ok', t[:200].replace('\n', ' '))
                if n == 'Bash':
                    size = len(cmd) + 3 * cmd.count("'")
                    if 7400 <= size < 7850:
                        (near_fail if b.get('is_error') and 'unexpected EOF' in t else near_ok).append(size)
print('Bash sizes 7400-7849: ok/other', sorted(near_ok), 'EOF fail', sorted(near_fail))
